/**
 * The 3D World's fixed monster roster — code defaults, DB overrides (same
 * pattern as lib/cases-config.ts / lib/streak.ts). There are deliberately
 * only ever these 4 ids: the admin panel can fully tune every stat on each
 * one (lib/actions/monsters.ts' updateMonsterType rejects any other id),
 * but never add a 5th or remove one — that's intentionally a separate,
 * later piece of work.
 */
export type MonsterVisualKind = "zombie" | "skeleton";

export interface MonsterTypeConfig {
  id: string;
  name: string;
  visualKind: MonsterVisualKind;
  health: number;
  /** Damage dealt to the player per hit — see lib/combat.ts for the
   * player's side (PLAYER_MAX_HP, regen) this is balanced against. */
  attackDamage: number;
  moveSpeed: number;
  /** Distance at which it notices and starts chasing the player. */
  aggroRange: number;
  /** Distance at which it can actually land a hit — should be roughly
   * "melee reach", clearly smaller than aggroRange. */
  attackRange: number;
  /** Seconds between attacks once in range. */
  attackCooldown: number;
  rewardMin: number;
  rewardMax: number;
  /** Relative spawn frequency — see lib/world-config.ts' weighted pick. */
  spawnWeight: number;
  colorHex: string;
  scale: number;
  /** Admin kill-switch for one variant without touching the other three. */
  enabled: boolean;
}

/**
 * Balanced against lib/combat.ts: a bare-fisted player (8 dmg, ~2.2
 * hits/sec) kills the weakest Skelett in 4 hits (~1.8s) and the toughest
 * Zombie-Brute in 12 (~5.4s) — clearly harder, not "the same fight with a
 * bigger number". Rewards scale with how dangerous/tanky a variant is,
 * not flat per kill, so hunting the strong variants is worth the risk.
 */
export const DEFAULT_MONSTER_TYPES: MonsterTypeConfig[] = [
  {
    id: "zombie_weak",
    name: "Zombie",
    visualKind: "zombie",
    health: 40,
    attackDamage: 6,
    moveSpeed: 1.6,
    aggroRange: 9,
    attackRange: 1.6,
    attackCooldown: 1.1,
    rewardMin: 15,
    rewardMax: 25,
    spawnWeight: 40,
    colorHex: "#3a6b3a",
    scale: 1,
    enabled: true,
  },
  {
    id: "zombie_strong",
    name: "Zombie-Brute",
    visualKind: "zombie",
    health: 90,
    attackDamage: 14,
    moveSpeed: 1.9,
    aggroRange: 10,
    attackRange: 1.8,
    attackCooldown: 1.3,
    rewardMin: 40,
    rewardMax: 65,
    spawnWeight: 15,
    colorHex: "#234a23",
    scale: 1.3,
    enabled: true,
  },
  {
    id: "skeleton_weak",
    name: "Skelett",
    visualKind: "skeleton",
    health: 28,
    attackDamage: 8,
    moveSpeed: 2.1,
    aggroRange: 10,
    attackRange: 1.6,
    attackCooldown: 0.9,
    rewardMin: 12,
    rewardMax: 20,
    spawnWeight: 35,
    colorHex: "#d8d3c4",
    scale: 0.95,
    enabled: true,
  },
  {
    id: "skeleton_strong",
    name: "Skelett-Krieger",
    visualKind: "skeleton",
    health: 65,
    attackDamage: 16,
    moveSpeed: 2.5,
    aggroRange: 11,
    attackRange: 1.8,
    attackCooldown: 1,
    rewardMin: 35,
    rewardMax: 55,
    spawnWeight: 10,
    colorHex: "#9c958a",
    scale: 1.15,
    enabled: true,
  },
];

export const MONSTER_TYPE_IDS = DEFAULT_MONSTER_TYPES.map((m) => m.id);

// --- Spawn/world tuning -------------------------------------------------

/** How many monsters can be alive (incl. mid-death-animation corpses) at
 * once — a handful, not a horde, so each encounter still reads as a
 * deliberate fight rather than background noise. */
export const MAX_ALIVE_MONSTERS = 6;
export const SPAWN_INTERVAL_MIN_SEC = 5;
export const SPAWN_INTERVAL_MAX_SEC = 11;
/** No spawns within this radius of the world origin — matches the
 * decorative spawn-area glow circles in scene.tsx, so monsters never pop
 * in right on top of where the player actually starts. */
export const SPAWN_SAFE_RADIUS = 12;

export function pickWeightedMonsterType(types: MonsterTypeConfig[]): MonsterTypeConfig | null {
  const enabled = types.filter((t) => t.enabled && t.spawnWeight > 0);
  const total = enabled.reduce((sum, t) => sum + t.spawnWeight, 0);
  if (total <= 0) return null;
  let roll = Math.random() * total;
  for (const t of enabled) {
    roll -= t.spawnWeight;
    if (roll <= 0) return t;
  }
  return enabled[enabled.length - 1] ?? null;
}
