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
  // Optional, not required — getMonsterTypes() retries without these 5
  // columns at all if the migration (scripts/migrate-monster-weapon-
  // throw.mjs) hasn't run yet, so a row built from that retry simply
  // won't have them. `rowToConfig` below falls back to the code default
  // for each one individually with `??` rather than assuming presence.
  has_weapon?: boolean;
  can_throw?: boolean;
  throw_damage?: number;
  throw_cooldown?: number;
  throw_range?: number;
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
    hasWeapon: row.has_weapon ?? fallback.hasWeapon,
    canThrow: row.can_throw ?? fallback.canThrow,
    throwDamage: row.throw_damage ?? fallback.throwDamage,
    throwCooldown: row.throw_cooldown ?? fallback.throwCooldown,
    throwRange: row.throw_range ?? fallback.throwRange,
  };
}

/** Falls back to the code defaults whenever the table doesn't exist yet —
 * same defensive "code defaults, DB overrides" pattern as
 * lib/actions/streak.ts' getStreakConfig(). DB rows are merged in *by id*
 * over the defaults rather than replacing the list outright, so a
 * not-yet-seeded or partially-edited table still returns all 8 variants
 * (the ones with no row just keep their code defaults) instead of
 * silently hiding monsters nobody happened to save yet.
 *
 * Tries the full column set (including the weapon/throw columns added by
 * scripts/migrate-monster-weapon-throw.mjs) first, and falls back to the
 * original column set if that errors — PostgREST rejects a `select`
 * naming a column that doesn't exist outright, so without this retry, a
 * deploy that shipped this code before that migration ran would lose
 * *every* admin-tuned override (health/damage/etc. too, not just the new
 * fields) over 5 missing columns. Same "retry without the maybe-missing
 * columns" shape as app/world/page.tsx's own equipped-item fetch. */
export async function getMonsterTypes(): Promise<MonsterTypeConfig[]> {
  const admin = createAdminClient();
  const withWeaponThrow = await admin
    .from("monster_types")
    .select(
      "id, name, health, attack_damage, move_speed, aggro_range, attack_range, attack_cooldown, reward_min, reward_max, spawn_weight, color_hex, enabled, has_weapon, can_throw, throw_damage, throw_cooldown, throw_range"
    );
  let data: MonsterTypeRow[] | null = withWeaponThrow.data;
  if (withWeaponThrow.error) {
    const base = await admin
      .from("monster_types")
      .select(
        "id, name, health, attack_damage, move_speed, aggro_range, attack_range, attack_cooldown, reward_min, reward_max, spawn_weight, color_hex, enabled"
      );
    data = base.data;
    if (base.error || !data) return DEFAULT_MONSTER_TYPES;
  }
  if (!data) return DEFAULT_MONSTER_TYPES;

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
  hasWeapon: boolean;
  canThrow: boolean;
  throwDamage: number;
  throwCooldown: number;
  throwRange: number;
}

export interface MonsterActionResult {
  success: boolean;
  error?: string;
}

/**
 * Edits one of the 8 existing monster variants — deliberately cannot
 * create a 9th or delete one of the 8: `id` must be one of
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
  // Throw fields are only meaningful (and only validated) when canThrow is
  // actually on — a non-throwing variant's throwDamage/Cooldown/Range are
  // simply ignored by components/world/monster.tsx's `if (... && type.
  // canThrow && ...)` gate, so there's nothing to enforce on them.
  if (input.canThrow) {
    if (!Number.isFinite(input.throwDamage) || input.throwDamage < 0) {
      return { success: false, error: "Ungültiger Wert für throwDamage." };
    }
    if (!Number.isFinite(input.throwCooldown) || input.throwCooldown < 0.2) {
      return { success: false, error: "Wurf-Cooldown zu schnell." };
    }
    if (!Number.isFinite(input.throwRange) || input.throwRange <= input.attackRange) {
      return { success: false, error: "Wurfreichweite muss größer als die Angriffsreichweite sein." };
    }
    if (input.throwRange > input.aggroRange) {
      return { success: false, error: "Wurfreichweite darf nicht über der Aggro-Reichweite liegen." };
    }
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
    has_weapon: input.hasWeapon,
    can_throw: input.canThrow,
    throw_damage: Math.floor(input.throwDamage),
    throw_cooldown: input.throwCooldown,
    throw_range: input.throwRange,
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

