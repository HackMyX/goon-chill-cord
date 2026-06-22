"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { DEFAULT_PET_TYPES, PET_TYPE_IDS, type PetTypeConfig } from "@/lib/pets";

interface PetConfigRow {
  id: string;
  damage: number;
  aggro_radius: number;
  attack_speed: number;
  move_speed: number;
  enabled: boolean;
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
 * lib/actions/monsters.ts' getMonsterTypes(). */
export async function getPetConfigs(): Promise<PetTypeConfig[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pet_configs")
    .select("id, damage, aggro_radius, attack_speed, move_speed, enabled");

  if (error || !data) return DEFAULT_PET_TYPES;

  const rowById = new Map((data as PetConfigRow[]).map((row) => [row.id, row]));
  return DEFAULT_PET_TYPES.map((fallback) => {
    const row = rowById.get(fallback.id);
    return row ? rowToConfig(row, fallback) : fallback;
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

export interface PetActionResult {
  success: boolean;
  error?: string;
}

/** Edits one of the fixed pet species — same "cannot create/delete, only
 * tune one of the known ids" shape as updateMonsterType(). */
export async function updatePetConfig(input: UpdatePetConfigInput): Promise<PetActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, role")
    .eq("id", user.id)
    .single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

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

  try {
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "admin_pet_config_update",
      payload: input,
    });
  } catch {
    // best-effort
  }

  revalidatePath("/admin");
  revalidatePath("/world");
  return { success: true };
}
