import {
  MAX_ALIVE_MONSTERS,
  SPAWN_INTERVAL_MIN_SEC,
  SPAWN_INTERVAL_MAX_SEC,
  SPAWN_SAFE_RADIUS,
} from "@/lib/monsters";

/**
 * Monster-spawn tuning — same "code defaults, DB overrides" shape as
 * lib/world-session-config.ts. Stored alongside the other world settings in
 * the `world_config` table under new columns. Defaults mirror the constants
 * previously hardcoded in lib/monsters.ts so nothing changes for a fresh
 * install that hasn't run the migration yet.
 */
export interface WorldSpawnConfig {
  maxAliveMonsters: number;
  spawnIntervalMinSec: number;
  spawnIntervalMaxSec: number;
  spawnSafeRadius: number;
  /** Per extra player added to the single-player alive cap. */
  aliveCapPerExtraPlayer: number;
  /** Hard ceiling on the alive cap regardless of player count. */
  aliveCapMax: number;
  /** Minimum spawn-interval scale — prevents degenerate instant-spawn. */
  spawnIntervalFloor: number;
  /** Seconds all monsters of an owner aggro onto an attacker after that
   * attacker hits any one of the owner's monsters. 0 = feature disabled.
   * Admin-configurable; requires the cross_player_aggro_duration_sec column
   * in world_config (scripts/add-cross-player-aggro.mjs). */
  crossPlayerAggroDurationSec: number;
  /** Boss-Spawn (eigener Track): Min/Max Sekunden zwischen Boss-Erscheinen.
   * Max. 1 Boss gleichzeitig. 0/0 = Bosse aus. */
  bossSpawnIntervalMinSec: number;
  bossSpawnIntervalMaxSec: number;
  /** Während ein Boss lebt, wird die Normalo-Obergrenze mit diesem Faktor
   * multipliziert (0–1) → nicht 40 Mobs + Boss zugleich. */
  bossActiveAliveCapFactor: number;
  /** Mindestanzahl Monster, die IMMER aktiv auf den Spieler zugehen — die N
   * nächsten jagen ihn unabhängig von der Aggro-Reichweite, damit man nicht
   * passiv rumstehen kann. 0 = aus (nur normale Aggro-Reichweite). */
  minAggressors: number;
  /** Globaler Schadens-Multiplikator für ALLE Monster (Nah- + Fernkampf) —
   * zentrale Schwierigkeits-Stellschraube. 1 = wie eingestellt, <1 = leichter. */
  monsterDamageMultiplier: number;
  /** Anteil der Spawns, die ortsgewichtet IN/UM die Orte (v.a. Ruinen) erscheinen
   * statt gleichverteilt. 0 = wie früher (rein zufällig), 1 = immer an einer Zone.
   * Spawns werden zusätzlich auf Erreichbarkeit geprüft (kein Mob in versiegelter
   * Ruine). Erfordert die Spalte ruin_spawn_bias (scripts/add-ruin-spawn-bias.cjs). */
  ruinSpawnBias: number;
}

export const DEFAULT_WORLD_SPAWN_CONFIG: WorldSpawnConfig = {
  maxAliveMonsters: MAX_ALIVE_MONSTERS,
  spawnIntervalMinSec: SPAWN_INTERVAL_MIN_SEC,
  spawnIntervalMaxSec: SPAWN_INTERVAL_MAX_SEC,
  spawnSafeRadius: SPAWN_SAFE_RADIUS,
  aliveCapPerExtraPlayer: 5,
  aliveCapMax: 35,
  spawnIntervalFloor: 0.4,
  crossPlayerAggroDurationSec: 8,
  bossSpawnIntervalMinSec: 90,
  bossSpawnIntervalMaxSec: 180,
  bossActiveAliveCapFactor: 0.5,
  minAggressors: 2,
  monsterDamageMultiplier: 0.8,
  ruinSpawnBias: 0.5,
};
