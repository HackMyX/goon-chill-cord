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
    const { data } = await admin
      .from("user_abilities")
      .select("*, ability_definitions(*)")
      .eq("user_id", user.id)
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

export async function getUserAbilities(userId: string): Promise<UserAbility[]> {
  try {
    const admin = createAdminClient();
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

  if (abilityKey !== null) {
    // Verify the user actually owns this ability
    const { data: owned } = await admin
      .from("user_abilities")
      .select("id")
      .eq("user_id", user.id)
      .eq("ability_key", abilityKey)
      .limit(1);

    if (!owned || owned.length === 0) {
      return { success: false, error: "Du besitzt diese Fähigkeit nicht." };
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
  source = "admin_grant"
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  const { error } = await admin.from("user_abilities").insert({
    user_id: targetUserId,
    ability_key: abilityKey,
    source,
    source_detail: `Vergeben von Admin ${(profile as Record<string, unknown>).username ?? user.id}`,
  });

  if (error) return { success: false, error: error.message };

  await admin.from("audit_logs").insert({
    user_id: user.id,
    action: "admin_grant_ability",
    payload: { target_user_id: targetUserId, ability_key: abilityKey },
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
