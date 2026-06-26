"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { logDebugEvent, logActivity } from "@/lib/debug-log-server";
import {
  DEFAULT_PET_TYPES,
  PET_TYPE_IDS,
  PET_RARITIES,
  defaultRarityStats,
  type PetTypeConfig,
  type PetRarity,
  type PetRarityStats,
} from "@/lib/pets";

interface PetConfigRow {
  id: string;
  damage: number;
  aggro_radius: number;
  attack_speed: number;
  move_speed: number;
  enabled: boolean;
}

interface PetRarityOverrideRow {
  pet_type_id: string;
  rarity: string;
  damage: number;
  aggro_radius: number;
  attack_speed: number;
  move_speed: number;
}

function rowToConfig(row: PetConfigRow, fallback: PetTypeConfig): PetTypeConfig {
  return {
    ...fallback,
    damage: row.damage,
    aggroRadius: row.aggro_radius,
    attackSpeed: row.attack_speed,
    moveSpeed: row.move_speed,
    enabled: row.enabled,
  };
}

/** Same defensive "code defaults, DB overrides, merged by id" pattern as
 * lib/actions/monsters.ts' getMonsterTypes(). Also merges per-rarity
 * overrides from pet_rarity_overrides. */
export async function getPetConfigs(): Promise<PetTypeConfig[]> {
  const admin = createAdminClient();

  const [baseResult, rarityResult] = await Promise.all([
    admin.from("pet_configs").select("id, damage, aggro_radius, attack_speed, move_speed, enabled"),
    admin.from("pet_rarity_overrides").select("pet_type_id, rarity, damage, aggro_radius, attack_speed, move_speed"),
  ]);

  // Build base configs
  const rowById = new Map(
    ((baseResult.data ?? []) as PetConfigRow[]).map((row) => [row.id, row])
  );
  const baseConfigs: PetTypeConfig[] = DEFAULT_PET_TYPES.map((fallback) => {
    const row = rowById.get(fallback.id);
    return row ? rowToConfig(row, fallback) : fallback;
  });

  // Merge per-rarity overrides
  const rarityRows = (rarityResult.data ?? []) as PetRarityOverrideRow[];
  const rarityMap = new Map<string, Map<string, PetRarityStats>>();
  for (const r of rarityRows) {
    if (!rarityMap.has(r.pet_type_id)) rarityMap.set(r.pet_type_id, new Map());
    rarityMap.get(r.pet_type_id)!.set(r.rarity, {
      damage: r.damage,
      aggroRadius: r.aggro_radius,
      attackSpeed: r.attack_speed,
      moveSpeed: r.move_speed,
    });
  }

  return baseConfigs.map((config) => {
    const overrides = rarityMap.get(config.id);
    if (!overrides) return config;
    const rarityStats = { ...config.rarityStats };
    for (const rarity of PET_RARITIES) {
      const override = overrides.get(rarity);
      if (override) rarityStats[rarity] = override;
    }
    return { ...config, rarityStats };
  });
}

export interface UpdatePetConfigInput {
  id: string;
  damage: number;
  aggroRadius: number;
  attackSpeed: number;
  moveSpeed: number;
  enabled: boolean;
}

export interface UpdatePetRarityOverrideInput {
  petTypeId: string;
  rarity: PetRarity;
  damage: number;
  aggroRadius: number;
  attackSpeed: number;
  moveSpeed: number;
}

export interface PetActionResult {
  success: boolean;
  error?: string;
}

async function getAdminUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("username, role").eq("id", user.id).single();
  if (!isAdmin(profile)) return null;
  return { user, profile };
}

/** Edits one of the fixed pet species — same "cannot create/delete, only
 * tune one of the known ids" shape as updateMonsterType(). */
export async function updatePetConfig(input: UpdatePetConfigInput): Promise<PetActionResult> {
  const auth = await getAdminUser();
  if (!auth) return { success: false, error: "Kein Zugriff." };

  if (!PET_TYPE_IDS.includes(input.id)) {
    return { success: false, error: "Unbekannter Pet-Typ." };
  }
  const numericFields: [string, number][] = [
    ["damage", input.damage],
    ["aggroRadius", input.aggroRadius],
    ["attackSpeed", input.attackSpeed],
    ["moveSpeed", input.moveSpeed],
  ];
  for (const [field, value] of numericFields) {
    if (!Number.isFinite(value) || value < 0) {
      return { success: false, error: `Ungültiger Wert für ${field}.` };
    }
  }
  if (input.attackSpeed < 0.1) return { success: false, error: "Angriffstempo zu schnell." };

  const admin = createAdminClient();
  const { error } = await admin.from("pet_configs").upsert({
    id: input.id,
    damage: Math.floor(input.damage),
    aggro_radius: input.aggroRadius,
    attack_speed: input.attackSpeed,
    move_speed: input.moveSpeed,
    enabled: input.enabled,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return { success: false, error: "Speichern fehlgeschlagen — ist die Pet-Migration eingespielt?" };
  }

  await logDebugEvent({
    level: "info",
    scope: "pets",
    message: `Admin ${auth.profile?.username ?? auth.user.id} aktualisierte Basis-Stats für Pet-Typ "${input.id}": DMG=${input.damage}, Aggro=${input.aggroRadius}, AtkSpd=${input.attackSpeed}, MoveSpd=${input.moveSpeed}, Enabled=${input.enabled}`,
  }).catch(() => {});

  try {
    await admin.from("audit_logs").insert({
      user_id: auth.user.id,
      action: "admin_pet_config_update",
      payload: input,
    });
  } catch {
    // best-effort
  }

  await broadcastPetChange();
  revalidatePath("/admin");
  revalidatePath("/world");
  return { success: true };
}

/** Live-broadcast to all connected clients (no reload) — AGENTS §3.
 * PetConfigProvider re-fetches so pet display stats update everywhere. */
async function broadcastPetChange() {
  try {
    const admin = createAdminClient();
    const ch = admin.channel("pets-live");
    await ch.send({ type: "broadcast", event: "pets_changed", payload: { updatedAt: new Date().toISOString() } });
    await admin.removeChannel(ch);
  } catch { /* best-effort */ }
}

/** Upserts per-rarity stat overrides for one pet species × rarity combination.
 * If the row doesn't exist yet it's created; if it does, it's replaced. */
export async function updatePetRarityOverride(input: UpdatePetRarityOverrideInput): Promise<PetActionResult> {
  const auth = await getAdminUser();
  if (!auth) return { success: false, error: "Kein Zugriff." };

  if (!PET_TYPE_IDS.includes(input.petTypeId)) {
    return { success: false, error: "Unbekannter Pet-Typ." };
  }
  if (!(PET_RARITIES as string[]).includes(input.rarity)) {
    return { success: false, error: "Unbekannte Rarität." };
  }
  const numericFields: [string, number][] = [
    ["damage", input.damage],
    ["aggroRadius", input.aggroRadius],
    ["attackSpeed", input.attackSpeed],
    ["moveSpeed", input.moveSpeed],
  ];
  for (const [field, value] of numericFields) {
    if (!Number.isFinite(value) || value < 0) {
      return { success: false, error: `Ungültiger Wert für ${field}.` };
    }
  }
  if (input.attackSpeed < 0.05) return { success: false, error: "Angriffstempo zu schnell." };

  const admin = createAdminClient();
  const { error } = await admin.from("pet_rarity_overrides").upsert({
    pet_type_id: input.petTypeId,
    rarity: input.rarity,
    damage: Math.floor(input.damage),
    aggro_radius: input.aggroRadius,
    attack_speed: input.attackSpeed,
    move_speed: input.moveSpeed,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return {
      success: false,
      error: "Speichern fehlgeschlagen — ist die pet_rarity_overrides-Migration eingespielt?",
    };
  }

  await logDebugEvent({
    level: "info",
    scope: "pets",
    message: `Admin ${auth.profile?.username ?? auth.user.id} setzte Rarität-Override für "${input.petTypeId}" / "${input.rarity}": DMG=${input.damage}, Aggro=${input.aggroRadius}, AtkSpd=${input.attackSpeed}, MoveSpd=${input.moveSpeed}`,
  }).catch(() => {});

  try {
    await admin.from("audit_logs").insert({
      user_id: auth.user.id,
      action: "admin_pet_rarity_override",
      payload: input,
    });
  } catch {
    // best-effort
  }

  await broadcastPetChange();
  revalidatePath("/admin");
  revalidatePath("/world");
  return { success: true };
}

/** Deletes a per-rarity override so the species falls back to the computed
 * default (base stats × PET_RARITY_MULTIPLIERS). */
export async function deletePetRarityOverride(petTypeId: string, rarity: PetRarity): Promise<PetActionResult> {
  const auth = await getAdminUser();
  if (!auth) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("pet_rarity_overrides")
    .delete()
    .eq("pet_type_id", petTypeId)
    .eq("rarity", rarity);

  if (error) return { success: false, error: error.message };

  await logDebugEvent({
    level: "info",
    scope: "pets",
    message: `Admin ${auth.profile?.username ?? auth.user.id} löschte Rarität-Override für "${petTypeId}" / "${rarity}" → zurück zu Standardwerten`,
  }).catch(() => {});

  await broadcastPetChange();
  revalidatePath("/admin");
  revalidatePath("/world");
  return { success: true };
}
