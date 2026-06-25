"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, isModerator } from "@/lib/admin";
import { logDebugEvent } from "@/lib/debug-log-server";
import { NAME_STYLES, type NameStyleDef } from "@/lib/name-styles";

export interface UserNameStyleRow {
  id: string;
  styleKey: string;
  source: "gifted" | "won" | "purchased" | "achievement";
  unlockedAt: string;
  style: NameStyleDef;
}

// ── Public ─────────────────────────────────────────────────────────────────────

/** All available styles (from DB, falls back to local catalog) */
export async function getNameStyleCatalog(): Promise<NameStyleDef[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("name_styles")
    .select("*")
    .order("sort_order", { ascending: true });

  if (!data?.length) return Object.values(NAME_STYLES);

  return data.map(r => ({
    key:              r.key as string,
    label:            r.label as string,
    description:      (r.description as string) ?? "",
    rarity:           (r.rarity as NameStyleDef["rarity"]) ?? "normal",
    category:      (r.category as NameStyleDef["category"]) ?? "solid",
    color1:           (r.color1 as string) ?? "#f4f4f5",
    color2:           (r.color2 as string | undefined) ?? undefined,
    color3:           (r.color3 as string | undefined) ?? undefined,
    color4:           (r.color4 as string | undefined) ?? undefined,
    animation_type:   (r.animation_type as NameStyleDef["animation_type"]) ?? "none",
    animation_speed:  Number(r.animation_speed) ?? 1,
    glow_color:       (r.glow_color as string | undefined) ?? undefined,
    glow_radius:      Number(r.glow_radius) ?? 0,
    prefix_icon:      (r.prefix_icon as string | undefined) ?? undefined,
    suffix_icon:      (r.suffix_icon as string | undefined) ?? undefined,
    unlock_price_cr:  Number(r.unlock_price_cr) ?? 0,
    can_win_from_case: Boolean(r.can_win_from_case),
    is_special:       Boolean(r.is_special),
  }));
}

/** Styles owned by current user */
export async function getMyNameStyles(): Promise<{ owned: UserNameStyleRow[]; activeKey: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { owned: [], activeKey: null };

  const [{ data: rows }, { data: profile }] = await Promise.all([
    supabase
      .from("user_name_styles")
      .select("id, style_key, source, unlocked_at")
      .eq("user_id", user.id),
    supabase
      .from("profiles")
      .select("active_name_style_key")
      .eq("id", user.id)
      .single(),
  ]);

  const owned: UserNameStyleRow[] = (rows ?? []).map(r => ({
    id:         r.id as string,
    styleKey:   r.style_key as string,
    source:     (r.source as UserNameStyleRow["source"]) ?? "gifted",
    unlockedAt: r.unlocked_at as string,
    style:      NAME_STYLES[r.style_key as string] ?? NAME_STYLES["default"],
  }));

  return {
    owned,
    activeKey: (profile?.active_name_style_key as string | null) ?? null,
  };
}

/** Get another user's style for display (used in chat/world/leaderboard) */
export async function getUserActiveStyle(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("active_name_style_key")
    .eq("id", userId)
    .single();
  return (data?.active_name_style_key as string | null) ?? null;
}

/** Equip a style (must own it or it's the default) */
export async function equipNameStyle(styleKey: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  if (styleKey !== "default") {
    const { count } = await supabase
      .from("user_name_styles")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("style_key", styleKey);
    if (!count) return { ok: false, error: "Du besitzt diesen Style nicht." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ active_name_style_key: styleKey === "default" ? null : styleKey })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Buy a style with credits */
export async function purchaseNameStyle(styleKey: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const style = NAME_STYLES[styleKey];
  if (!style || style.is_special || style.unlock_price_cr <= 0)
    return { ok: false, error: "Dieser Style kann nicht gekauft werden." };

  const admin = createAdminClient();

  // Check already owned
  const { count: owned } = await admin
    .from("user_name_styles")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("style_key", styleKey);
  if (owned) return { ok: false, error: "Du besitzt diesen Style bereits." };

  // Check credits
  const { data: profile } = await admin
    .from("profiles")
    .select("credits")
    .eq("id", user.id)
    .single();
  const credits = Number(profile?.credits ?? 0);
  if (credits < style.unlock_price_cr)
    return { ok: false, error: `Zu wenig Credits. Benötigt: ${style.unlock_price_cr.toLocaleString("de-DE")} CR.` };

  // Deduct + grant
  const { error: deductErr } = await admin
    .from("profiles")
    .update({ credits: credits - style.unlock_price_cr })
    .eq("id", user.id);
  if (deductErr) return { ok: false, error: deductErr.message };

  const { error: grantErr } = await admin
    .from("user_name_styles")
    .insert({ user_id: user.id, style_key: styleKey, source: "purchased" });
  if (grantErr) return { ok: false, error: grantErr.message };

  await logDebugEvent({ level: "info", scope: "name-style", message: `User ${user.id} purchased name style "${styleKey}" for ${style.unlock_price_cr} CR` });
  return { ok: true };
}

// ── Admin ──────────────────────────────────────────────────────────────────────

async function requireAdminUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht eingeloggt.");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) throw new Error("Keine Admin-Rechte.");
  return user;
}

/** Grant a name style to a user (admin only) */
export async function adminGrantNameStyle(
  userId: string,
  styleKey: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireAdminUser();
    const admin = createAdminClient();
    const { error } = await admin
      .from("user_name_styles")
      .upsert({ user_id: userId, style_key: styleKey, source: "gifted" }, { onConflict: "user_id,style_key" });
    if (error) return { ok: false, error: error.message };
    await logDebugEvent({ level: "info", scope: "admin", message: `Admin ${actor.id} granted name style "${styleKey}" to user ${userId}` });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Revoke a name style from a user (admin only) */
export async function adminRevokeNameStyle(
  userId: string,
  styleKey: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireAdminUser();
    const admin = createAdminClient();
    // Also unequip if currently equipped
    await admin
      .from("profiles")
      .update({ active_name_style_key: null })
      .eq("id", userId)
      .eq("active_name_style_key", styleKey);
    const { error } = await admin
      .from("user_name_styles")
      .delete()
      .eq("user_id", userId)
      .eq("style_key", styleKey);
    if (error) return { ok: false, error: error.message };
    await logDebugEvent({ level: "info", scope: "admin", message: `Admin ${actor.id} revoked name style "${styleKey}" from user ${userId}` });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Get all users with their owned styles */
export async function adminGetAllUserStyles(): Promise<Record<string, string[]>> {
  try {
    await requireAdminUser();
    const admin = createAdminClient();
    const { data } = await admin.from("user_name_styles").select("user_id, style_key");
    const map: Record<string, string[]> = {};
    for (const r of data ?? []) {
      const uid = r.user_id as string;
      const key = r.style_key as string;
      if (!map[uid]) map[uid] = [];
      map[uid].push(key);
    }
    return map;
  } catch {
    return {};
  }
}

/** Force-equip a style on a user (or clear) */
export async function adminForceEquipStyle(
  userId: string,
  styleKey: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireAdminUser();
    const admin = createAdminClient();

    if (styleKey && styleKey !== "default") {
      // Ensure they own it first
      await admin
        .from("user_name_styles")
        .upsert({ user_id: userId, style_key: styleKey, source: "gifted" }, { onConflict: "user_id,style_key" });
    }

    const { error } = await admin
      .from("profiles")
      .update({ active_name_style_key: styleKey === "default" || !styleKey ? null : styleKey })
      .eq("id", userId);
    if (error) return { ok: false, error: error.message };
    await logDebugEvent({ level: "warn", scope: "admin", message: `Admin ${actor.id} force-equipped style "${styleKey ?? "default"}" on user ${userId}` });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Warn a user (add warning name style + increment strikes) */
export async function adminWarnUser(
  userId: string,
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireAdminUser();
    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("warning_strikes")
      .eq("id", userId)
      .single();

    const strikes = Number(profile?.warning_strikes ?? 0) + 1;

    const { error } = await admin
      .from("profiles")
      .update({
        warning_strikes: strikes,
        warning_note: note,
      })
      .eq("id", userId);
    if (error) return { ok: false, error: error.message };

    // Optionally force the "warned" name style
    await admin
      .from("user_name_styles")
      .upsert({ user_id: userId, style_key: "warned", source: "gifted" }, { onConflict: "user_id,style_key" });

    await logDebugEvent({
      level: "warn",
      scope: "admin",
      message: `Admin ${actor.id} warned user ${userId} (strike ${strikes}): ${note}`,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Clear warnings from a user */
export async function adminClearWarnings(userId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireAdminUser();
    const admin = createAdminClient();
    const { error } = await admin
      .from("profiles")
      .update({ warning_strikes: 0, warning_note: null })
      .eq("id", userId);
    if (error) return { ok: false, error: error.message };

    // Remove warned style
    await admin
      .from("user_name_styles")
      .delete()
      .eq("user_id", userId)
      .eq("style_key", "warned");

    // Unequip if active
    await admin
      .from("profiles")
      .update({ active_name_style_key: null })
      .eq("id", userId)
      .eq("active_name_style_key", "warned");

    await logDebugEvent({ level: "info", scope: "admin", message: `Admin ${actor.id} cleared warnings for user ${userId}` });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Upsert a custom name style definition */
export async function adminUpsertNameStyle(
  data: Partial<NameStyleDef> & { key: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireAdminUser();
    const admin = createAdminClient();
    const { error } = await admin.from("name_styles").upsert({
      key:              data.key,
      label:            data.label ?? data.key,
      description:      data.description,
      rarity:           data.rarity ?? "normal",
      scope:         data.category ?? "solid",
      color1:           data.color1 ?? "#f4f4f5",
      color2:           data.color2 ?? null,
      color3:           data.color3 ?? null,
      animation_type:   data.animation_type ?? "none",
      animation_speed:  data.animation_speed ?? 1,
      glow_color:       data.glow_color ?? null,
      glow_radius:      data.glow_radius ?? 0,
      prefix_icon:      data.prefix_icon ?? null,
      suffix_icon:      data.suffix_icon ?? null,
      unlock_price_cr:  data.unlock_price_cr ?? 0,
      can_win_from_case: data.can_win_from_case ?? false,
      is_special:       data.is_special ?? false,
    }, { onConflict: "key" });
    if (error) return { ok: false, error: error.message };
    await logDebugEvent({ level: "info", scope: "admin", message: `Admin ${actor.id} upserted name style "${data.key}"` });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Delete a custom name style */
export async function adminDeleteNameStyle(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireAdminUser();
    if (NAME_STYLES[key]) return { ok: false, error: "System-Styles können nicht gelöscht werden." };
    const admin = createAdminClient();
    const { error } = await admin.from("name_styles").delete().eq("key", key);
    if (error) return { ok: false, error: error.message };
    await logDebugEvent({ level: "warn", scope: "admin", message: `Admin ${actor.id} deleted name style "${key}"` });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
