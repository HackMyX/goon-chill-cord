"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { broadcastLive } from "@/lib/realtime-broadcast";
import { DEFAULT_CHARACTER_CONFIG, type CharacterConfig } from "@/lib/character-config";

interface CharacterConfigRow {
  fist_damage: number;
  player_max_hp: number;
  player_max_stamina: number;
  stamina_sprint_drain_per_sec: number;
  stamina_regen_per_sec: number;
  stamina_min_to_start_sprint: number;
  jump_cooldown_sec: number;
  hp_regen_per_sec: number;
  hp_regen_delay_after_hit_sec: number;
  respawn_invulnerable_sec: number;
  attack_range: number;
  attack_cone_half_angle: number;
  attack_cooldown: number;
  attack_hit_radius: number;
  sprint_damage_multiplier: number;
  airborne_damage_multiplier: number;
  pvp_damage_multiplier: number;
  perk_multiplier_cap: number;
  move_speed: number;
  sprint_multiplier: number;
}

function rowToConfig(row: CharacterConfigRow): CharacterConfig {
  return {
    fistDamage: row.fist_damage,
    playerMaxHp: row.player_max_hp,
    playerMaxStamina: row.player_max_stamina,
    staminaSprintDrainPerSec: row.stamina_sprint_drain_per_sec,
    staminaRegenPerSec: row.stamina_regen_per_sec,
    staminaMinToStartSprint: row.stamina_min_to_start_sprint,
    jumpCooldownSec: row.jump_cooldown_sec,
    hpRegenPerSec: row.hp_regen_per_sec,
    hpRegenDelayAfterHitSec: row.hp_regen_delay_after_hit_sec,
    respawnInvulnerableSec: row.respawn_invulnerable_sec,
    attackRange: row.attack_range,
    attackConeHalfAngle: row.attack_cone_half_angle,
    attackCooldown: row.attack_cooldown,
    attackHitRadius: row.attack_hit_radius,
    sprintDamageMultiplier: row.sprint_damage_multiplier,
    airborneDamageMultiplier: row.airborne_damage_multiplier,
    pvpDamageMultiplier: row.pvp_damage_multiplier,
    perkMultiplierCap: row.perk_multiplier_cap,
    moveSpeed: row.move_speed,
    sprintMultiplier: row.sprint_multiplier,
  };
}

/** Falls back to the code defaults whenever the table doesn't exist yet or
 * is empty — same defensive pattern as every other config getter in this
 * project (brand-new tables here are RLS-enabled with no policies, so only
 * this admin-client read ever sees the row at all). */
export async function getCharacterConfig(): Promise<CharacterConfig> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("character_config")
    .select(
      "fist_damage, player_max_hp, player_max_stamina, stamina_sprint_drain_per_sec, stamina_regen_per_sec, stamina_min_to_start_sprint, jump_cooldown_sec, hp_regen_per_sec, hp_regen_delay_after_hit_sec, respawn_invulnerable_sec, attack_range, attack_cone_half_angle, attack_cooldown, attack_hit_radius, sprint_damage_multiplier, airborne_damage_multiplier, pvp_damage_multiplier, perk_multiplier_cap, move_speed, sprint_multiplier"
    )
    .eq("id", "default")
    .maybeSingle();

  if (error || !data) return DEFAULT_CHARACTER_CONFIG;
  return rowToConfig(data as CharacterConfigRow);
}

export interface CharacterConfigActionResult {
  success: boolean;
  error?: string;
}

const POSITIVE_FIELDS: (keyof CharacterConfig)[] = [
  "playerMaxHp",
  "playerMaxStamina",
  "attackRange",
  "attackCooldown",
  "attackHitRadius",
  "moveSpeed",
];

export async function updateCharacterConfig(input: CharacterConfig): Promise<CharacterConfigActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const { data: profile } = await supabase.from("profiles").select("username, role").eq("id", user.id).single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  for (const [key, value] of Object.entries(input) as [keyof CharacterConfig, number][]) {
    if (!Number.isFinite(value)) return { success: false, error: `Ungültiger Wert für ${key}.` };
    if (POSITIVE_FIELDS.includes(key) && value <= 0) {
      return { success: false, error: `${key} muss größer als 0 sein.` };
    }
    if (value < 0) return { success: false, error: `${key} darf nicht negativ sein.` };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("character_config").upsert({
    id: "default",
    fist_damage: input.fistDamage,
    player_max_hp: input.playerMaxHp,
    player_max_stamina: input.playerMaxStamina,
    stamina_sprint_drain_per_sec: input.staminaSprintDrainPerSec,
    stamina_regen_per_sec: input.staminaRegenPerSec,
    stamina_min_to_start_sprint: input.staminaMinToStartSprint,
    jump_cooldown_sec: input.jumpCooldownSec,
    hp_regen_per_sec: input.hpRegenPerSec,
    hp_regen_delay_after_hit_sec: input.hpRegenDelayAfterHitSec,
    respawn_invulnerable_sec: input.respawnInvulnerableSec,
    attack_range: input.attackRange,
    attack_cone_half_angle: input.attackConeHalfAngle,
    attack_cooldown: input.attackCooldown,
    attack_hit_radius: input.attackHitRadius,
    sprint_damage_multiplier: input.sprintDamageMultiplier,
    airborne_damage_multiplier: input.airborneDamageMultiplier,
    pvp_damage_multiplier: input.pvpDamageMultiplier,
    perk_multiplier_cap: input.perkMultiplierCap,
    move_speed: input.moveSpeed,
    sprint_multiplier: input.sprintMultiplier,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return { success: false, error: "Speichern fehlgeschlagen — ist die character_config-Migration eingespielt?" };
  }

  await broadcastLive("character-live");
  revalidatePath("/admin");
  revalidatePath("/world");
  return { success: true };
}
