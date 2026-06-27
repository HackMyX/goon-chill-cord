"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity, logDebugEvent } from "@/lib/debug-log-server";
import { isAdmin } from "@/lib/admin";
import { resolveDisplayBadges } from "@/lib/badges";

/** Clamp helper mirroring site-config's 1–4 bound on max prio slots. */
function clampMaxSlots(raw: number | null | undefined): number {
  return Math.min(4, Math.max(1, raw ?? 2));
}

/** Returns the current admin user (auth user), or null if not an admin. */
async function requireAdminUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  return isAdmin(profile) ? user : null;
}

async function fetchMaxSlots(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data } = await admin.from("site_config").select("max_prio_badges").limit(1).maybeSingle();
  return clampMaxSlots(data?.max_prio_badges as number | null);
}

/**
 * Keep `profiles.prio_badges` (the EFFECTIVE list every display surface
 * reads) in sync with the user's current badge ownership + choice. Call this
 * after ANY change to a user's `user_badges` rows, so an auto-equip user's
 * nametag picks up a freshly-earned badge and a custom user's pins drop a
 * revoked one — without touching a single display query.
 *
 * Never throws. Before the `prio_badges_custom` migration has run the select
 * errors and this becomes a safe no-op, so deploy order doesn't matter.
 */
export async function recomputeAutoPrioBadges(userId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const [{ data: profile, error: pErr }, { data: ownedRows }, { data: cfgRow }] =
      await Promise.all([
        admin.from("profiles").select("prio_badges, prio_badges_custom").eq("id", userId).single(),
        admin.from("user_badges").select("badge_key").eq("user_id", userId),
        admin.from("site_config").select("max_prio_badges").limit(1).maybeSingle(),
      ]);
    if (pErr || !profile) return;

    const owned = (ownedRows ?? []).map((r) => (r as { badge_key: string }).badge_key);
    const custom = (profile.prio_badges_custom as boolean | null) ?? false;
    const chosen = (profile.prio_badges as string[] | null) ?? [];
    const max = clampMaxSlots(cfgRow?.max_prio_badges as number | null);

    const effective = resolveDisplayBadges(chosen, owned, custom, max);
    // Skip the write (and its revalidation) when nothing actually changed.
    const unchanged =
      effective.length === chosen.length && effective.every((k, i) => k === chosen[i]);
    if (unchanged) return;

    await admin.from("profiles").update({ prio_badges: effective }).eq("id", userId);
  } catch {
    // Display-only sync — must never block or fail the calling action.
  }
}

export async function getMyPrioBadges(): Promise<string[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("prio_badges")
    .eq("id", user.id)
    .single();

  return (data?.prio_badges as string[] | null) ?? [];
}

/**
 * Current prio-badge state for the wardrobe UI: the effective keys plus
 * whether the user has explicitly pinned them (`custom`) or is on auto-equip.
 * `custom` reads false if the column doesn't exist yet (pre-migration).
 */
export async function getMyPrioBadgeState(): Promise<{ keys: string[]; custom: boolean; locked: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { keys: [], custom: false, locked: false };

  const admin = createAdminClient();
  // Try with the new flags; fall back gracefully if the columns are missing.
  type Row = { prio_badges?: string[] | null; prio_badges_custom?: boolean | null; prio_badges_locked?: boolean | null };
  let row: Row | null = null;
  const withFlags = await admin
    .from("profiles")
    .select("prio_badges, prio_badges_custom, prio_badges_locked")
    .eq("id", user.id)
    .single();
  if (withFlags.error) {
    const fallback = await admin.from("profiles").select("prio_badges").eq("id", user.id).single();
    row = (fallback.data as unknown as Row | null) ?? null;
  } else {
    row = (withFlags.data as unknown as Row | null) ?? null;
  }

  return {
    keys: (row?.prio_badges as string[] | null) ?? [],
    custom: (row?.prio_badges_custom as boolean | null) ?? false,
    locked: (row?.prio_badges_locked as boolean | null) ?? false,
  };
}

export async function setMyPrioBadges(
  keys: string[]
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();

  // Respect an admin lock — a locked user cannot change their own selection.
  const { data: lockRow } = await admin
    .from("profiles")
    .select("prio_badges_locked")
    .eq("id", user.id)
    .maybeSingle();
  if ((lockRow?.prio_badges_locked as boolean | null) ?? false) {
    return { success: false, error: "Deine Badge-Anzeige wurde von einem Admin festgelegt und ist gesperrt." };
  }

  // Fetch max_prio_badges from site_config
  const { data: cfgRow } = await admin
    .from("site_config")
    .select("max_prio_badges")
    .limit(1)
    .maybeSingle();
  const maxSlots = clampMaxSlots(cfgRow?.max_prio_badges as number | null);

  // Validate count
  if (keys.length > maxSlots) {
    return { success: false, error: `Maximal ${maxSlots} Prio-Badges erlaubt.` };
  }

  // Validate that user actually owns all selected badges
  const { data: ownedRows } = await admin
    .from("user_badges")
    .select("badge_key")
    .eq("user_id", user.id);

  const owned = new Set((ownedRows ?? []).map((r) => (r as { badge_key: string }).badge_key));
  const invalid = keys.filter((k) => !owned.has(k));
  if (invalid.length > 0) {
    void logDebugEvent({ level: "warn", scope: "prio-badges:set", message: "Ungültige Badge-Keys", context: { userId: user.id, invalid } });
    return { success: false, error: `Du besitzt diese Badges nicht: ${invalid.join(", ")}` };
  }

  // An empty selection means "back to auto-equip" — clear the custom flag and
  // let recompute fill prio_badges with the user's top owned badges. A
  // non-empty selection pins exactly those (custom = strict).
  const custom = keys.length > 0;
  const { error } = await admin
    .from("profiles")
    .update({ prio_badges: keys, prio_badges_custom: custom })
    .eq("id", user.id);

  if (error) {
    void logDebugEvent({ level: "error", scope: "prio-badges:set", message: "DB-Fehler beim Speichern", context: { userId: user.id, error: error.message } });
    return { success: false, error: "Speichern fehlgeschlagen." };
  }

  // Auto mode: derive the effective display badges now so every surface
  // updates immediately, not only after the next badge grant.
  if (!custom) await recomputeAutoPrioBadges(user.id);

  void logActivity("wardrobe:prio-badges:set", `Prio-Badges gesetzt für ${user.id}`, { userId: user.id, keys, custom });
  revalidatePath("/garderobe");
  revalidatePath("/");
  return { success: true };
}

// ── Admin omnipotence over badge display ─────────────────────────────────────

/** Admin read: a user's current prio-badge display state + the slot cap. */
export async function adminGetPrioState(
  userId: string
): Promise<{ keys: string[]; custom: boolean; locked: boolean; max: number } | null> {
  const adminUser = await requireAdminUser();
  if (!adminUser) return null;
  const admin = createAdminClient();
  const [{ data: row }, max] = await Promise.all([
    admin
      .from("profiles")
      .select("prio_badges, prio_badges_custom, prio_badges_locked")
      .eq("id", userId)
      .maybeSingle(),
    fetchMaxSlots(admin),
  ]);
  return {
    keys: (row?.prio_badges as string[] | null) ?? [],
    custom: (row?.prio_badges_custom as boolean | null) ?? false,
    locked: (row?.prio_badges_locked as boolean | null) ?? false,
    max,
  };
}

/**
 * Admin omnipotence: force EXACTLY which badges show next to a user's name,
 * auto-granting any the user doesn't own yet (so the admin can display
 * anything), and optionally locking the user out of changing it themselves.
 * An empty `keys` with locked=false hands control back to auto mode.
 */
export async function adminForceDisplayBadges(
  userId: string,
  keys: string[],
  locked: boolean
): Promise<{ success: boolean; error?: string }> {
  const adminUser = await requireAdminUser();
  if (!adminUser) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const max = await fetchMaxSlots(admin);
  const capped = keys.slice(0, max);

  // Auto-grant any forced badge the user doesn't already own — true omnipotence.
  if (capped.length > 0) {
    const rows = capped.map((badge_key) => ({ user_id: userId, badge_key, granted_by: adminUser.id }));
    const { error: grantErr } = await admin
      .from("user_badges")
      .upsert(rows, { onConflict: "user_id,badge_key", ignoreDuplicates: true });
    if (grantErr) return { success: false, error: grantErr.message };
  }

  // Empty selection = hand back to auto mode (custom=false → recompute fills it).
  const custom = capped.length > 0;
  const { error } = await admin
    .from("profiles")
    .update({ prio_badges: capped, prio_badges_custom: custom, prio_badges_locked: locked })
    .eq("id", userId);
  if (error) return { success: false, error: error.message };

  if (!custom) await recomputeAutoPrioBadges(userId);

  void logActivity("admin:badges:force-display", `Anzeige-Badges erzwungen für ${userId}`, { userId, keys: capped, locked, adminId: adminUser.id });
  revalidatePath("/");
  revalidatePath("/garderobe");
  return { success: true };
}

/** Admin: toggle only the lock (keeps the user's current displayed badges). */
export async function adminSetPrioBadgeLock(
  userId: string,
  locked: boolean
): Promise<{ success: boolean; error?: string }> {
  const adminUser = await requireAdminUser();
  if (!adminUser) return { success: false, error: "Kein Zugriff." };
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ prio_badges_locked: locked }).eq("id", userId);
  if (error) return { success: false, error: error.message };
  void logActivity("admin:badges:lock", `Badge-Anzeige ${locked ? "gesperrt" : "entsperrt"} für ${userId}`, { userId, locked, adminId: adminUser.id });
  revalidatePath("/");
  return { success: true };
}
