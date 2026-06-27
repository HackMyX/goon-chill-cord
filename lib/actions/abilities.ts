"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import type { AbilityDefinition, AbilityCategory, AbilityEffectType, AbilityEffectConfig, AbilityRarity, UserAbility } from "@/lib/abilities";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function rowToDefinition(r: Record<string, unknown>): AbilityDefinition {
  return {
    key: r.key as string,
    name: r.name as string,
    description: (r.description as string) ?? "",
    category: r.category as AbilityCategory,
    effectType: r.effect_type as AbilityEffectType,
    effectValue: Number(r.effect_value) ?? 0,
    effectConfig: ((r.effect_config as AbilityEffectConfig) ?? {}),
    rarity: (r.rarity as AbilityRarity) ?? "selten",
    icon: (r.icon as string) ?? "Zap",
    shopPriceCr: (r.shop_price_cr as number) ?? 0,
    availableInShop: (r.available_in_shop as boolean) ?? false,
    canDropFromCases: (r.can_drop_from_cases as boolean) ?? true,
    enabled: (r.enabled as boolean) ?? true,
    sortOrder: (r.sort_order as number) ?? 0,
  };
}

function rowToUserAbility(r: Record<string, unknown>, def?: AbilityDefinition): UserAbility {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    abilityKey: r.ability_key as string,
    source: (r.source as string) ?? "unknown",
    sourceDetail: (r.source_detail as string) ?? null,
    acquiredAt: r.acquired_at as string,
    expiresAt: (r.expires_at as string) ?? null,
    definition: def,
  };
}

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Lazy expiry sweep for time-limited abilities (user_abilities.expires_at).
 * Deletes any grants whose time has run out, and — if the user's equipped
 * ability no longer has a live grant backing it — unequips it. Called from
 * every read/equip entry point, so expired abilities disappear the moment a
 * user touches their loadout. Never throws.
 */
async function expireUserAbilities(admin: Admin, userId: string): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    await admin
      .from("user_abilities")
      .delete()
      .eq("user_id", userId)
      .not("expires_at", "is", null)
      .lt("expires_at", nowIso);

    const { data: profile } = await admin
      .from("profiles")
      .select("equipped_ability_key")
      .eq("id", userId)
      .single();
    const key = (profile?.equipped_ability_key as string | null) ?? null;
    if (key) {
      const { data: still } = await admin
        .from("user_abilities")
        .select("id")
        .eq("user_id", userId)
        .eq("ability_key", key)
        .limit(1)
        .maybeSingle();
      if (!still) {
        await admin.from("profiles").update({ equipped_ability_key: null }).eq("id", userId);
      }
    }
  } catch {
    /* sweep is best-effort */
  }
}

/**
 * True if the user currently holds a LIVE (non-expired) grant of an ability.
 * Effect sites (mine/xp/pvp) call this so a time-limited ability stops working
 * the instant it expires — even before the next loadout sweep unequips it.
 */
export async function isAbilityActive(
  admin: Admin,
  userId: string,
  abilityKey: string
): Promise<boolean> {
  try {
    const nowIso = new Date().toISOString();
    const { data } = await admin
      .from("user_abilities")
      .select("id")
      .eq("user_id", userId)
      .eq("ability_key", abilityKey)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .limit(1)
      .maybeSingle();
    return !!data;
  } catch {
    // On error, fail open (don't punish the player for an infra hiccup).
    return true;
  }
}

/**
 * Load the player's currently-equipped ability effect, but ONLY if it's a live
 * (non-expired) grant and enabled. The single primitive every game uses to
 * apply an ability effect — read profile → gate expiry → fetch effect. Returns
 * null when nothing relevant is equipped. Never throws.
 */
export async function getActiveEquippedAbilityEffect(
  admin: Admin,
  userId: string
): Promise<{ effectType: string; effectValue: number; effectConfig: Record<string, number> } | null> {
  try {
    const { data: profile } = await admin.from("profiles").select("equipped_ability_key").eq("id", userId).single();
    const key = (profile?.equipped_ability_key as string | null) ?? null;
    if (!key) return null;
    if (!(await isAbilityActive(admin, userId, key))) return null;
    const { data: def } = await admin
      .from("ability_definitions")
      .select("effect_type, effect_value, effect_config")
      .eq("key", key)
      .eq("enabled", true)
      .maybeSingle();
    if (!def) return null;
    return {
      effectType: def.effect_type as string,
      effectValue: Number(def.effect_value) || 0,
      effectConfig: (def.effect_config ?? {}) as Record<string, number>,
    };
  } catch {
    return null;
  }
}

/**
 * Apply the global `credit_bonus` ability to a freshly-earned amount, if that's
 * the equipped+active ability. Call at every GAME/ACTIVITY earning site right
 * before crediting (mine/snake/plinko/DON/kill-streak/streak/case drops) — NOT
 * on admin grants, trades, vouchers or pre-tuned rewards. Returns the (possibly
 * boosted) integer. Only one ability is equipped at a time, so this never
 * double-stacks with a game-specific ability.
 */
export async function applyCreditBonus(admin: Admin, userId: string, baseAmount: number): Promise<number> {
  if (!(baseAmount > 0)) return baseAmount;
  const eff = await getActiveEquippedAbilityEffect(admin, userId);
  if (eff?.effectType === "credit_bonus" && eff.effectValue > 0) {
    return Math.floor(baseAmount * (1 + eff.effectValue));
  }
  return baseAmount;
}

// ─── Public queries ────────────────────────────────────────────────────────────

export async function getAbilityDefinitions(): Promise<AbilityDefinition[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("ability_definitions")
      .select("*")
      .eq("enabled", true)
      .order("sort_order", { ascending: true });
    return (data ?? []).map((r) => rowToDefinition(r as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function getAllAbilityDefinitions(): Promise<AbilityDefinition[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("ability_definitions")
      .select("*")
      .order("sort_order", { ascending: true });
    return (data ?? []).map((r) => rowToDefinition(r as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function getMyAbilities(): Promise<UserAbility[]> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const admin = createAdminClient();
    await expireUserAbilities(admin, user.id);
    const { data } = await admin
      .from("user_abilities")
      .select("*, ability_definitions(*)")
      .eq("user_id", user.id)
      .order("acquired_at", { ascending: false });

    const mapped = (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const defRow = row.ability_definitions as Record<string, unknown> | null;
      const def = defRow ? rowToDefinition(defRow) : undefined;
      return rowToUserAbility(row, def);
    });
    // Collapse duplicate grants of the same ability (e.g. permanent + a later
    // timed voucher) so the loadout lists each ability once. Permanent (no
    // expiry) wins; otherwise the one expiring latest.
    const byKey = new Map<string, UserAbility>();
    for (const ua of mapped) {
      const prev = byKey.get(ua.abilityKey);
      if (!prev) { byKey.set(ua.abilityKey, ua); continue; }
      const uaBetter = !ua.expiresAt || (!!prev.expiresAt && ua.expiresAt > prev.expiresAt);
      if (uaBetter) byKey.set(ua.abilityKey, ua);
    }
    return [...byKey.values()];
  } catch {
    return [];
  }
}

export async function getUserAbilities(userId: string): Promise<UserAbility[]> {
  try {
    const admin = createAdminClient();
    await expireUserAbilities(admin, userId);
    const { data } = await admin
      .from("user_abilities")
      .select("*, ability_definitions(*)")
      .eq("user_id", userId)
      .order("acquired_at", { ascending: false });

    return (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const defRow = row.ability_definitions as Record<string, unknown> | null;
      const def = defRow ? rowToDefinition(defRow) : undefined;
      return rowToUserAbility(row, def);
    });
  } catch {
    return [];
  }
}

export async function getMyEquippedAbility(): Promise<AbilityDefinition | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const admin = createAdminClient();
    await expireUserAbilities(admin, user.id);
    const { data: profile } = await admin
      .from("profiles")
      .select("equipped_ability_key")
      .eq("id", user.id)
      .single();

    const key = profile?.equipped_ability_key as string | null;
    if (!key) return null;

    const { data: def } = await admin
      .from("ability_definitions")
      .select("*")
      .eq("key", key)
      .eq("enabled", true)
      .maybeSingle();

    if (!def) return null;
    return rowToDefinition(def as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function getEquippedAbility(userId: string): Promise<AbilityDefinition | null> {
  try {
    const admin = createAdminClient();
    await expireUserAbilities(admin, userId);
    const { data: profile } = await admin
      .from("profiles")
      .select("equipped_ability_key")
      .eq("id", userId)
      .single();

    const key = profile?.equipped_ability_key as string | null;
    if (!key) return null;

    const { data: def } = await admin
      .from("ability_definitions")
      .select("*")
      .eq("key", key)
      .eq("enabled", true)
      .maybeSingle();

    if (!def) return null;
    return rowToDefinition(def as Record<string, unknown>);
  } catch {
    return null;
  }
}

// ─── Equip / Unequip ──────────────────────────────────────────────────────────

export async function equipAbility(
  abilityKey: string | null
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();
  // Clear out any just-expired grants first so they can't be equipped.
  await expireUserAbilities(admin, user.id);

  if (abilityKey !== null) {
    // Verify the user actually owns this ability with a still-live grant
    const { data: owned } = await admin
      .from("user_abilities")
      .select("id")
      .eq("user_id", user.id)
      .eq("ability_key", abilityKey)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .limit(1);

    if (!owned || owned.length === 0) {
      return { success: false, error: "Du besitzt diese Fähigkeit nicht (oder sie ist abgelaufen)." };
    }

    // Verify the ability is enabled
    const { data: def } = await admin
      .from("ability_definitions")
      .select("enabled")
      .eq("key", abilityKey)
      .single();

    if (!def?.enabled) {
      return { success: false, error: "Diese Fähigkeit ist nicht verfügbar." };
    }
  }

  const { error } = await admin
    .from("profiles")
    .update({ equipped_ability_key: abilityKey })
    .eq("id", user.id);

  if (error) return { success: false, error: "Fehler beim Ausrüsten." };

  revalidatePath("/garderobe");
  revalidatePath("/mine");
  return { success: true };
}

// ─── Admin CRUD ────────────────────────────────────────────────────────────────

export async function adminUpsertAbilityDefinition(
  data: Partial<AbilityDefinition> & { key: string }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  const { error } = await admin.from("ability_definitions").upsert({
    key: data.key,
    name: data.name ?? "Unbenannte Fähigkeit",
    description: data.description ?? "",
    category: data.category ?? "global",
    effect_type: data.effectType ?? "xp_boost",
    effect_value: data.effectValue ?? 0,
    effect_config: data.effectConfig ?? {},
    rarity: data.rarity ?? "selten",
    icon: data.icon ?? "Zap",
    shop_price_cr: data.shopPriceCr ?? 0,
    available_in_shop: data.availableInShop ?? false,
    can_drop_from_cases: data.canDropFromCases ?? true,
    enabled: data.enabled ?? true,
    sort_order: data.sortOrder ?? 0,
  });

  if (error) return { success: false, error: error.message };

  await admin.from("audit_logs").insert({
    user_id: user.id,
    action: "admin_upsert_ability",
    payload: { key: data.key, name: data.name },
  });

  revalidatePath("/admin");
  return { success: true };
}

export async function adminDeleteAbilityDefinition(
  key: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  // Unequip from all users first
  await admin.from("profiles").update({ equipped_ability_key: null }).eq("equipped_ability_key", key);

  const { error } = await admin.from("ability_definitions").delete().eq("key", key);
  if (error) return { success: false, error: error.message };

  await admin.from("audit_logs").insert({
    user_id: user.id,
    action: "admin_delete_ability",
    payload: { key },
  });

  revalidatePath("/admin");
  return { success: true };
}

export async function adminGrantAbility(
  targetUserId: string,
  abilityKey: string,
  source = "admin_grant",
  durationHours = 0
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  // durationHours > 0 → time-limited grant; 0 → permanent.
  const expiresAt = durationHours > 0
    ? new Date(Date.now() + durationHours * 3_600_000).toISOString()
    : null;

  const { error } = await admin.from("user_abilities").insert({
    user_id: targetUserId,
    ability_key: abilityKey,
    source,
    source_detail: durationHours > 0
      ? `Admin-Grant (${durationHours}h)`
      : `Vergeben von Admin ${(profile as Record<string, unknown>).username ?? user.id}`,
    expires_at: expiresAt,
  });

  if (error) return { success: false, error: error.message };

  await admin.from("audit_logs").insert({
    user_id: user.id,
    action: "admin_grant_ability",
    payload: { target_user_id: targetUserId, ability_key: abilityKey, durationHours },
  });

  revalidatePath("/admin");
  return { success: true };
}

export async function adminRevokeAbility(
  userAbilityId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  const { error } = await admin.from("user_abilities").delete().eq("id", userAbilityId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin");
  return { success: true };
}
