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
}

export const DEFAULT_WORLD_SPAWN_CONFIG: WorldSpawnConfig = {
  maxAliveMonsters: MAX_ALIVE_MONSTERS,
  spawnIntervalMinSec: SPAWN_INTERVAL_MIN_SEC,
  spawnIntervalMaxSec: SPAWN_INTERVAL_MAX_SEC,
  spawnSafeRadius: SPAWN_SAFE_RADIUS,
  aliveCapPerExtraPlayer: 5,
  aliveCapMax: 35,
  spawnIntervalFloor: 0.4,
};
