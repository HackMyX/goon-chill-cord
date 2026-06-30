import {
  FIST_DAMAGE,
  PLAYER_MAX_HP,
  PLAYER_MAX_STAMINA,
  STAMINA_SPRINT_DRAIN_PER_SEC,
  STAMINA_REGEN_PER_SEC,
  STAMINA_MIN_TO_START_SPRINT,
  JUMP_COOLDOWN_SEC,
  HP_REGEN_PER_SEC,
  HP_REGEN_DELAY_AFTER_HIT_SEC,
  RESPAWN_INVULNERABLE_SEC,
  ATTACK_RANGE,
  ATTACK_CONE_HALF_ANGLE,
  ATTACK_COOLDOWN,
  ATTACK_HIT_RADIUS,
  SPRINT_DAMAGE_MULTIPLIER,
  AIRBORNE_DAMAGE_MULTIPLIER,
  PVP_DAMAGE_MULTIPLIER,
  PERK_MULTIPLIER_CAP,
} from "@/lib/combat";
import { PLAYER_WALK_SPEED, PLAYER_SPRINT_MULTIPLIER } from "@/lib/player-movement-config";

/**
 * Every player/combat base stat the admin Games tab can tune, in one
 * place — same "code defaults, DB override" shape as lib/kill-streak.ts/
 * lib/world-session-config.ts. The *default* value for each field is the
 * existing lib/combat.ts (or lib/player-movement-config.ts) constant
 * itself, imported here rather than re-typed, so there is exactly one
 * place that ever states "8" is the bare-fist damage or "100" is max HP —
 * this file only adds an admin-editable layer on top, it never becomes a
 * second source of truth for what the number *is* by default.
 *
 * Every consumer (components/world/player.tsx, monster.tsx, world-
 * shell.tsx, lib/actions/pvp.ts, lib/actions/monsters.ts) reads from a
 * loaded `CharacterConfig` now instead of importing the bare lib/combat.ts
 * constant directly — see lib/actions/character-config.ts's doc comment
 * for the fetch-and-fallback pattern that makes this safe even before the
 * admin ever saves anything.
 */
export interface CharacterConfig {
  /** Bare-fist damage — the floor every weapon must beat to be worth
   * equipping. */
  fistDamage: number;
  playerMaxHp: number;
  playerMaxStamina: number;
  staminaSprintDrainPerSec: number;
  staminaRegenPerSec: number;
  /** Stamina must regen back above this floor before sprint can be
   * re-engaged once it's been drained to 0. */
  staminaMinToStartSprint: number;
  /** Minimum seconds between jumps. */
  jumpCooldownSec: number;
  hpRegenPerSec: number;
  /** Seconds since the last hit taken before HP regen starts again. */
  hpRegenDelayAfterHitSec: number;
  /** Spawn-Schutz-Fenster (Sekunden) nach Join UND Respawn: der Spieler kann
   * nicht getroffen werden, Monster sehen/verfolgen/attackieren ihn nicht, und
   * der Spieler kann selbst nicht angreifen (0 = aus). Siehe player.tsx /
   * monster.tsx. */
  respawnInvulnerableSec: number;
  /** Melee range, world units. */
  attackRange: number;
  /** Half-angle of the forward hit cone, radians. */
  attackConeHalfAngle: number;
  /** Seconds between attacks, every weapon (and bare fists) alike. */
  attackCooldown: number;
  /** Flat minimum hit-test half-width near the player. */
  attackHitRadius: number;
  /** Damage multiplier while sprinting on a landed hit. */
  sprintDamageMultiplier: number;
  /** Damage multiplier while airborne on a landed hit. */
  airborneDamageMultiplier: number;
  /** PvP-only damage dampener (never applied to monster damage). */
  pvpDamageMultiplier: number;
  /** Hard cap on stacked speed/jump/regen perk multipliers. */
  perkMultiplierCap: number;
  /** Unsprinted walk speed, world units/sec. */
  moveSpeed: number;
  /** Multiplier on `moveSpeed` while sprinting. */
  sprintMultiplier: number;
}

export const DEFAULT_CHARACTER_CONFIG: CharacterConfig = {
  fistDamage: FIST_DAMAGE,
  playerMaxHp: PLAYER_MAX_HP,
  playerMaxStamina: PLAYER_MAX_STAMINA,
  staminaSprintDrainPerSec: STAMINA_SPRINT_DRAIN_PER_SEC,
  staminaRegenPerSec: STAMINA_REGEN_PER_SEC,
  staminaMinToStartSprint: STAMINA_MIN_TO_START_SPRINT,
  jumpCooldownSec: JUMP_COOLDOWN_SEC,
  hpRegenPerSec: HP_REGEN_PER_SEC,
  hpRegenDelayAfterHitSec: HP_REGEN_DELAY_AFTER_HIT_SEC,
  respawnInvulnerableSec: RESPAWN_INVULNERABLE_SEC,
  attackRange: ATTACK_RANGE,
  attackConeHalfAngle: ATTACK_CONE_HALF_ANGLE,
  attackCooldown: ATTACK_COOLDOWN,
  attackHitRadius: ATTACK_HIT_RADIUS,
  sprintDamageMultiplier: SPRINT_DAMAGE_MULTIPLIER,
  airborneDamageMultiplier: AIRBORNE_DAMAGE_MULTIPLIER,
  pvpDamageMultiplier: PVP_DAMAGE_MULTIPLIER,
  perkMultiplierCap: PERK_MULTIPLIER_CAP,
  moveSpeed: PLAYER_WALK_SPEED,
  sprintMultiplier: PLAYER_SPRINT_MULTIPLIER,
};
