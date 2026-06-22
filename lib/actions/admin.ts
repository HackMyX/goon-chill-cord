"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, type ProfileRole } from "@/lib/admin";
import type { Rarity } from "@/lib/cases";

export interface AdminActionResult {
  success: boolean;
  error?: string;
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, role")
    .eq("id", user.id)
    .single();

  if (!isAdmin(profile)) return null;
  return user;
}

async function logAdminAction(userId: string, action: string, payload: unknown) {
  try {
    await createAdminClient().from("audit_logs").insert({ user_id: userId, action, payload });
  } catch {
    // Logging must never block the actual admin action.
  }
}

// ---------------------------------------------------------------------------
// Economy / case tiers
// ---------------------------------------------------------------------------

export interface UpdateCaseTierInput {
  tierId: string;
  price: number;
  rarityWeights: Partial<Record<Rarity, number>>;
  enabled: boolean;
  itemTypes: string[];
}

export async function updateCaseTier(input: UpdateCaseTierInput): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  let { data, error } = await admin
    .from("case_tiers")
    .update({
      price: input.price,
      rarity_weights: input.rarityWeights,
      enabled: input.enabled,
      item_types: input.itemTypes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.tierId)
    .select("id");

  // `item_types` column may not exist yet (one-time SQL not run) — retry
  // without it rather than failing price/weights/enabled saves entirely.
  if (error?.message?.includes("item_types")) {
    const retry = await admin
      .from("case_tiers")
      .update({
        price: input.price,
        rarity_weights: input.rarityWeights,
        enabled: input.enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.tierId)
      .select("id");
    data = retry.data;
    error = retry.error;
  }

  if (error || !data || data.length === 0) {
    return {
      success: false,
      error: "Tier nicht gefunden — wurde scripts/seed-case-tiers.mjs schon ausgeführt?",
    };
  }

  await logAdminAction(user.id, "admin_economy_update", input);
  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

export async function updateUserCredits(
  targetUserId: string,
  credits: number
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  if (!Number.isFinite(credits) || credits < 0) {
    return { success: false, error: "Ungültiger Wert." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ credits: Math.floor(credits) })
    .eq("id", targetUserId);

  if (error) return { success: false, error: "Update fehlgeschlagen." };

  await logAdminAction(user.id, "admin_set_credits", { targetUserId, credits });
  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

/**
 * Manual gender override for moderation/support — bypasses the player-
 * facing one-way lock entirely (lib/actions/wardrobe.ts updateGender),
 * since this exists specifically for "they misclicked and it's now
 * permanently wrong" support requests where the normal lock is exactly
 * the thing standing in the way.
 */
export async function setUserGender(
  targetUserId: string,
  gender: "m" | "w"
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ gender }).eq("id", targetUserId);

  if (error) return { success: false, error: "Update fehlgeschlagen." };

  await logAdminAction(user.id, "admin_set_gender", { targetUserId, gender });
  revalidatePath("/admin");
  revalidatePath("/garderobe");
  revalidatePath("/world");
  return { success: true };
}

export async function updateUserRole(
  targetUserId: string,
  role: ProfileRole
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ role }).eq("id", targetUserId);

  if (error) return { success: false, error: "Update fehlgeschlagen." };

  await logAdminAction(user.id, "admin_set_role", { targetUserId, role });
  revalidatePath("/admin");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Item catalogue CRUD
// ---------------------------------------------------------------------------

/** Matches lib/combat.ts's `PerkType` — duplicated as a plain string union
 * here rather than imported, since lib/combat.ts has no "use server"
 * marker and importing a server action file into a type-only spot is fine,
 * but keeping the admin input type self-contained avoids any risk of
 * pulling client-side combat constants into this server module's bundle. */
export type ItemPerkType = "none" | "speed_boost" | "jump_boost" | "hp_regen_boost";

export interface ItemInput {
  id?: string;
  name: string;
  rarity: Rarity;
  type: string;
  price_cr: number;
  /** Weapon power (see lib/combat.ts) — `null`/`undefined` clears it, only
   * meaningful for weapon-ish types but accepted for any type since the
   * admin types `type` as free text and there's no hard enum to gate on. */
  damage?: number | null;
  /** Flat damage-reduction points — meaningful for jacket/pants/hat/shoes,
   * see lib/combat.ts's `applyArmorReduction`. */
  armor?: number;
  /** Amulet/ring perk — `"none"` (the default) means no perk at all. */
  perk_type?: ItemPerkType;
  /** Perk strength as a multiplier added on top of 1.0 (e.g. 0.15 = +15%
   * speed/jump/regen) — only meaningful when `perk_type` isn't `"none"`. */
  perk_magnitude?: number;
  /** Shield HP this item's aura absorbs before it breaks and damage starts
   * reaching the player's real HP — 0 means a shield_cosmetic row that's
   * purely decorative, not a functioning shield. */
  shield_hp?: number;
  /** Seconds after breaking before the shield can absorb again. */
  shield_regen_cooldown_sec?: number;
}

export interface UpsertItemResult extends AdminActionResult {
  item?: {
    id: string;
    name: string;
    rarity: Rarity;
    type: string;
    price_cr: number;
    damage: number | null;
    armor: number;
    perk_type: ItemPerkType;
    perk_magnitude: number;
    shield_hp: number;
    shield_regen_cooldown_sec: number;
  };
}

const VALID_PERK_TYPES: ItemPerkType[] = ["none", "speed_boost", "jump_boost", "hp_regen_boost"];

export async function upsertItem(input: ItemInput): Promise<UpsertItemResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  if (!input.name.trim() || !input.type.trim()) {
    return { success: false, error: "Name und Typ sind erforderlich." };
  }
  if (input.damage !== undefined && input.damage !== null && (!Number.isFinite(input.damage) || input.damage < 0)) {
    return { success: false, error: "Ungültiger Schaden." };
  }
  if (input.armor !== undefined && (!Number.isFinite(input.armor) || input.armor < 0)) {
    return { success: false, error: "Ungültige Rüstung." };
  }
  if (input.perk_type !== undefined && !VALID_PERK_TYPES.includes(input.perk_type)) {
    return { success: false, error: "Ungültiger Perk-Typ." };
  }
  if (input.perk_magnitude !== undefined && (!Number.isFinite(input.perk_magnitude) || input.perk_magnitude < 0)) {
    return { success: false, error: "Ungültige Perk-Stärke." };
  }
  if (input.shield_hp !== undefined && (!Number.isFinite(input.shield_hp) || input.shield_hp < 0)) {
    return { success: false, error: "Ungültige Schild-HP." };
  }
  if (
    input.shield_regen_cooldown_sec !== undefined &&
    (!Number.isFinite(input.shield_regen_cooldown_sec) || input.shield_regen_cooldown_sec < 0)
  ) {
    return { success: false, error: "Ungültiger Schild-Cooldown." };
  }

  const admin = createAdminClient();
  const payload = {
    name: input.name.trim(),
    rarity: input.rarity,
    type: input.type.trim(),
    price_cr: Math.max(0, Math.floor(input.price_cr) || 0),
  };
  // Only sent when explicitly provided — same reasoning as the auctions
  // buyout_price field: omitting the key entirely means every item that
  // doesn't set a damage value keeps working even if this migration
  // hasn't run yet, and only an explicit damage value surfaces the
  // column-missing error instead of silently dropping it.
  const damagePayload =
    input.damage === undefined ? {} : { damage: input.damage === null ? null : Math.floor(input.damage) };
  const statsPayload: Record<string, unknown> = {};
  if (input.armor !== undefined) statsPayload.armor = Math.floor(input.armor);
  if (input.perk_type !== undefined) statsPayload.perk_type = input.perk_type;
  if (input.perk_magnitude !== undefined) statsPayload.perk_magnitude = input.perk_magnitude;
  if (input.shield_hp !== undefined) statsPayload.shield_hp = Math.floor(input.shield_hp);
  if (input.shield_regen_cooldown_sec !== undefined) {
    statsPayload.shield_regen_cooldown_sec = Math.floor(input.shield_regen_cooldown_sec);
  }

  const { data, error } = input.id
    ? await admin
        .from("items")
        .update({ ...payload, ...damagePayload, ...statsPayload })
        .eq("id", input.id)
        .select()
        .single()
    : await admin
        .from("items")
        .insert({ ...payload, ...damagePayload, ...statsPayload })
        .select()
        .single();

  if (error || !data) {
    return {
      success: false,
      error:
        Object.keys(damagePayload).length > 0 || Object.keys(statsPayload).length > 0
          ? "Speichern fehlgeschlagen — sind die Item-Stat-Migrationen eingespielt?"
          : "Speichern fehlgeschlagen.",
    };
  }

  await logAdminAction(user.id, input.id ? "admin_item_update" : "admin_item_create", data);
  revalidatePath("/admin");
  revalidatePath("/");
  return {
    success: true,
    item: {
      ...data,
      damage: data.damage ?? null,
      armor: data.armor ?? 0,
      perk_type: (data.perk_type as ItemPerkType) ?? "none",
      perk_magnitude: data.perk_magnitude ?? 0,
      shield_hp: data.shield_hp ?? 0,
      shield_regen_cooldown_sec: data.shield_regen_cooldown_sec ?? 0,
    },
  };
}

export async function deleteItem(itemId: string): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin.from("items").delete().eq("id", itemId);

  if (error) {
    return {
      success: false,
      error: "Löschen fehlgeschlagen — Item evtl. noch im Inventar eines Users.",
    };
  }

  await logAdminAction(user.id, "admin_item_delete", { itemId });
  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Per-user detail (inventory management + personal log)
// ---------------------------------------------------------------------------

export interface UserInventoryRow {
  id: string;
  equipped: boolean;
  item: { id: string; name: string; rarity: Rarity; type: string };
}

export interface UserDetail {
  inventory: UserInventoryRow[];
  logs: { id: string; action: string; payload: unknown; created_at: string }[];
  banned: boolean;
  gender: "m" | "w";
}

export interface GetUserDetailResult extends AdminActionResult {
  detail?: UserDetail;
}

export async function getUserDetail(targetUserId: string): Promise<GetUserDetailResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();

  const [{ data: inventory }, { data: logs }, { data: authUser }, { data: profile }] =
    await Promise.all([
      admin
        .from("inventory")
        .select("id, equipped, item:items(id, name, rarity, type)")
        .eq("user_id", targetUserId)
        .order("obtained_at", { ascending: false }),
      // Personal log: actions this user performed themselves (user_id match)
      // OR admin actions targeting them (payload.targetUserId match) — admin
      // actions are logged under the *admin's* user_id, not the target's.
      admin
        .from("audit_logs")
        .select("id, action, payload, created_at")
        .or(`user_id.eq.${targetUserId},payload->>targetUserId.eq.${targetUserId}`)
        .order("created_at", { ascending: false })
        .limit(50),
      admin.auth.admin.getUserById(targetUserId),
      admin.from("profiles").select("gender").eq("id", targetUserId).single(),
    ]);

  const bannedUntil = authUser?.user?.banned_until;
  const banned = !!bannedUntil && new Date(bannedUntil).getTime() > Date.now();

  return {
    success: true,
    detail: {
      inventory: (inventory ?? []) as unknown as UserInventoryRow[],
      logs: logs ?? [],
      banned,
      gender: (profile?.gender as "m" | "w") ?? "m",
    },
  };
}

export async function searchItems(
  query: string
): Promise<{ id: string; name: string; rarity: Rarity; type: string }[]> {
  const user = await requireAdmin();
  if (!user || !query.trim()) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("items")
    .select("id, name, rarity, type")
    .ilike("name", `%${query.trim()}%`)
    .limit(20);

  return data ?? [];
}

export async function grantItemToUser(
  targetUserId: string,
  itemId: string
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("inventory")
    .insert({ user_id: targetUserId, item_id: itemId });

  if (error) return { success: false, error: "Vergeben fehlgeschlagen." };

  await logAdminAction(user.id, "admin_grant_item", { targetUserId, itemId });
  revalidatePath("/admin");
  return { success: true };
}

/**
 * Grants the user every item in the catalogue they don't already own, in
 * one click — built for testing/QA so an admin can equip-check the entire
 * item set on a real account instead of rolling cases hundreds of times.
 * Skips items already in the user's inventory (no duplicates) and inserts
 * in batches since the catalogue is 900+ rows.
 */
export async function grantAllItemsToUser(targetUserId: string): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();

  const [{ data: allItems, error: itemsError }, { data: owned, error: ownedError }] =
    await Promise.all([
      admin.from("items").select("id"),
      admin.from("inventory").select("item_id").eq("user_id", targetUserId),
    ]);

  if (itemsError || ownedError) {
    return { success: false, error: "Katalog konnte nicht geladen werden." };
  }

  const ownedIds = new Set((owned ?? []).map((row) => row.item_id));
  const missing = (allItems ?? []).filter((item) => !ownedIds.has(item.id));

  if (missing.length === 0) {
    return { success: true };
  }

  const BATCH_SIZE = 500;
  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing
      .slice(i, i + BATCH_SIZE)
      .map((item) => ({ user_id: targetUserId, item_id: item.id }));
    const { error } = await admin.from("inventory").insert(batch);
    if (error) return { success: false, error: "Vergeben fehlgeschlagen." };
  }

  await logAdminAction(user.id, "admin_grant_all_items", {
    targetUserId,
    count: missing.length,
  });
  revalidatePath("/admin");
  return { success: true };
}

export async function removeUserItem(inventoryId: string): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin.from("inventory").delete().eq("id", inventoryId);

  if (error) return { success: false, error: "Entfernen fehlgeschlagen." };

  await logAdminAction(user.id, "admin_remove_item", { inventoryId });
  revalidatePath("/admin");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

/**
 * Real ban via Supabase's own auth.admin API (`ban_duration`), not a custom
 * DB flag — GoTrue rejects sign-ins/refreshes for banned users itself, and
 * our server code already treats "no user" as logged-out everywhere.
 */
export async function setUserBanned(
  targetUserId: string,
  banned: boolean
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(targetUserId, {
    ban_duration: banned ? "876000h" : "none",
  });

  if (error) return { success: false, error: "Aktion fehlgeschlagen." };

  await logAdminAction(user.id, "admin_ban_user", { targetUserId, banned });
  revalidatePath("/admin");
  return { success: true };
}

/**
 * "Force Logout" / "Kick": there's no direct "kill all sessions for this
 * user id" call in the Supabase JS admin API (`auth.signOut` only revokes a
 * session by its own JWT). A short, self-expiring ban achieves the same
 * practical effect: `supabase.auth.getUser()` revalidates against the Auth
 * server on every request (that's why our server code uses it instead of
 * the locally-decoded `getSession()`), so the user is rejected on their very
 * next request and automatically usable again once the 30s window passes.
 */
export async function kickUser(targetUserId: string): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(targetUserId, {
    ban_duration: "30s",
  });

  if (error) return { success: false, error: "Aktion fehlgeschlagen." };

  await logAdminAction(user.id, "admin_kick_user", { targetUserId });
  revalidatePath("/admin");
  return { success: true };
}

export async function wipeUserInventory(targetUserId: string): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("inventory")
    .delete()
    .eq("user_id", targetUserId)
    .select("id");

  if (error) return { success: false, error: "Aktion fehlgeschlagen." };

  await logAdminAction(user.id, "admin_wipe_inventory", {
    targetUserId,
    count: data?.length ?? 0,
  });
  revalidatePath("/admin");
  return { success: true };
}

/**
 * Resets a user to their "first login" state — zeroes credits, streak_days,
 * cases_opened, streak_kill_count, and pending_streak_cr, then deletes all
 * inventory rows. The auth account itself is left intact.
 */
export async function resetUser(targetUserId: string): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  if (user.id === targetUserId) {
    return { success: false, error: "Eigenes Konto kann nicht zurückgesetzt werden." };
  }

  const admin = createAdminClient();

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      credits: 0,
      streak_days: 0,
      cases_opened: 0,
      streak_kill_count: 0,
      pending_streak_cr: 0,
    })
    .eq("id", targetUserId);

  if (profileError) return { success: false, error: "Profil-Reset fehlgeschlagen." };

  const { data: invData, error: invError } = await admin
    .from("inventory")
    .delete()
    .eq("user_id", targetUserId)
    .select("id");

  if (invError) return { success: false, error: "Inventar-Reset fehlgeschlagen." };

  await logAdminAction(user.id, "admin_full_reset", {
    targetUserId,
    deletedInventoryCount: invData?.length ?? 0,
  });
  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}
