"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { DEFAULT_MONSTER_TYPES, MONSTER_TYPE_IDS, type MonsterTypeConfig } from "@/lib/monsters";

interface MonsterTypeRow {
  id: string;
  name: string;
  health: number;
  attack_damage: number;
  move_speed: number;
  aggro_range: number;
  attack_range: number;
  attack_cooldown: number;
  reward_min: number;
  reward_max: number;
  spawn_weight: number;
  color_hex: string;
  enabled: boolean;
}

function rowToConfig(row: MonsterTypeRow, fallback: MonsterTypeConfig): MonsterTypeConfig {
  return {
    ...fallback,
    name: row.name,
    health: row.health,
    attackDamage: row.attack_damage,
    moveSpeed: row.move_speed,
    aggroRange: row.aggro_range,
    attackRange: row.attack_range,
    attackCooldown: row.attack_cooldown,
    rewardMin: row.reward_min,
    rewardMax: row.reward_max,
    spawnWeight: row.spawn_weight,
    colorHex: row.color_hex,
    enabled: row.enabled,
  };
}

/** Falls back to the code defaults whenever the table doesn't exist yet —
 * same defensive "code defaults, DB overrides" pattern as
 * lib/actions/streak.ts' getStreakConfig(). DB rows are merged in *by id*
 * over the defaults rather than replacing the list outright, so a
 * not-yet-seeded or partially-edited table still returns all 4 variants
 * (the ones with no row just keep their code defaults) instead of
 * silently hiding monsters nobody happened to save yet. */
export async function getMonsterTypes(): Promise<MonsterTypeConfig[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("monster_types")
    .select(
      "id, name, health, attack_damage, move_speed, aggro_range, attack_range, attack_cooldown, reward_min, reward_max, spawn_weight, color_hex, enabled"
    );

  if (error || !data) return DEFAULT_MONSTER_TYPES;

  const rowById = new Map((data as MonsterTypeRow[]).map((row) => [row.id, row]));
  return DEFAULT_MONSTER_TYPES.map((fallback) => {
    const row = rowById.get(fallback.id);
    return row ? rowToConfig(row, fallback) : fallback;
  });
}

export interface UpdateMonsterTypeInput {
  id: string;
  name: string;
  health: number;
  attackDamage: number;
  moveSpeed: number;
  aggroRange: number;
  attackRange: number;
  attackCooldown: number;
  rewardMin: number;
  rewardMax: number;
  spawnWeight: number;
  colorHex: string;
  enabled: boolean;
}

export interface MonsterActionResult {
  success: boolean;
  error?: string;
}

/**
 * Edits one of the 4 existing monster variants — deliberately cannot
 * create a 5th or delete one of the 4: `id` must be one of
 * lib/monsters.ts' MONSTER_TYPE_IDS, full stop. A later "add new monster
 * types" feature is explicitly out of scope here and would need its own
 * pass (different UI: a real create form, not just editing fixed rows).
 */
export async function updateMonsterType(input: UpdateMonsterTypeInput): Promise<MonsterActionResult> {
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

  if (!MONSTER_TYPE_IDS.includes(input.id)) {
    return { success: false, error: "Unbekannter Monster-Typ." };
  }
  if (!input.name.trim()) {
    return { success: false, error: "Name ist erforderlich." };
  }
  const numericFields: [string, number][] = [
    ["health", input.health],
    ["attackDamage", input.attackDamage],
    ["moveSpeed", input.moveSpeed],
    ["aggroRange", input.aggroRange],
    ["attackRange", input.attackRange],
    ["attackCooldown", input.attackCooldown],
    ["rewardMin", input.rewardMin],
    ["rewardMax", input.rewardMax],
    ["spawnWeight", input.spawnWeight],
  ];
  for (const [field, value] of numericFields) {
    if (!Number.isFinite(value) || value < 0) {
      return { success: false, error: `Ungültiger Wert für ${field}.` };
    }
  }
  if (input.health < 1) return { success: false, error: "Leben muss mindestens 1 sein." };
  if (input.attackCooldown < 0.1) return { success: false, error: "Angriffstempo zu schnell." };
  if (input.rewardMin > input.rewardMax) {
    return { success: false, error: "Min-Belohnung darf nicht über der Max-Belohnung liegen." };
  }
  if (input.attackRange > input.aggroRange) {
    return { success: false, error: "Angriffsreichweite darf nicht über der Aggro-Reichweite liegen." };
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(input.colorHex)) {
    return { success: false, error: "Farbe muss ein Hex-Code sein, z.B. #3a6b3a." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("monster_types").upsert({
    id: input.id,
    name: input.name.trim(),
    health: Math.floor(input.health),
    attack_damage: Math.floor(input.attackDamage),
    move_speed: input.moveSpeed,
    aggro_range: input.aggroRange,
    attack_range: input.attackRange,
    attack_cooldown: input.attackCooldown,
    reward_min: Math.floor(input.rewardMin),
    reward_max: Math.floor(input.rewardMax),
    spawn_weight: Math.floor(input.spawnWeight),
    color_hex: input.colorHex,
    enabled: input.enabled,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return { success: false, error: "Speichern fehlgeschlagen — ist die Monster-Migration eingespielt?" };
  }

  try {
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "admin_monster_type_update",
      payload: input,
    });
  } catch {
    // best-effort
  }

  revalidatePath("/admin");
  revalidatePath("/world");
  return { success: true };
}

