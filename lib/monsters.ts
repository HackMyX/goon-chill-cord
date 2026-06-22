/**
 * The 3D World's fixed monster roster — code defaults, DB overrides (same
 * pattern as lib/cases-config.ts / lib/streak.ts). The roster's *ids* are
 * fixed at deploy time (lib/actions/monsters.ts' updateMonsterType rejects
 * any id not in `MONSTER_TYPE_IDS`, which is derived from this very array)
 * — the admin panel can fully tune every stat on every one of them, but
 * can't create or delete a row through the UI. Adding a genuinely new
 * variant is still possible, just only by adding an entry here (plus a
 * matching `MonsterVisualKind`/render branch in components/world/
 * monster.tsx) and shipping that, not from the admin panel itself.
 */
export type MonsterVisualKind = "zombie" | "skeleton" | "slime" | "orc" | "ghost" | "demon";

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
 * hits/sec) kills the weakest variant (Slime, 20 HP) in 3 hits (~1.4s) and
 * the toughest (Dämonenfürst, 160 HP) in 20 (~9s) — three clear tiers, not
 * a flat list of recolors: Niedrig (Zombie/Skelett/Slime, common, cheap),
 * Mittel (Zombie-Brute/Skelett-Krieger/Ork, tankier and harder-hitting,
 * rarer), Krass (Geist/Dämonenfürst, the rarest and most dangerous —
 * Geist trades health for speed/evasiveness, Dämonenfürst is the
 * straightforward "biggest number" boss-tier endpoint). Rewards scale with
 * how dangerous/tanky a variant is, not flat per kill, so hunting the
 * rarer tiers is worth the risk.
 *
 * Every variant keeps `attackRange` comfortably under the player's own
 * `ATTACK_RANGE` (2.7, lib/combat.ts), so a player who lands a hit right at
 * max melee reach is never simultaneously in *their* strike range — "hit
 * first" stays the rewarded, skillful side of every fight.
 *
 * `moveSpeed`, deliberately, is the opposite of what an earlier version of
 * this file did: every variant is now *faster* than the player's unsprinted
 * walk (4.5) and *slower* than sprinting (8.1, stamina-gated, lib/combat.ts'
 * STAMINA_SPRINT_DRAIN_PER_SEC). The old numbers (every variant under 2.5)
 * meant simply holding S to back away — free, no stamina cost, no skill —
 * out-walked *any* monster forever, turning every fight into a zero-risk
 * "hit it, take exactly zero steps back, repeat" farm with no way to ever
 * actually get caught. Sprinting away is still the real, intended escape
 * (and still reliably outruns every variant), it just now has to be a
 * deliberate, resource-gated choice instead of the default state of
 * walking normally. Don't drop any of these back under 4.5.
 */
export const DEFAULT_MONSTER_TYPES: MonsterTypeConfig[] = [
  // --- Niedrig (low tier): common, cheap, low-risk -----------------------
  {
    id: "zombie_weak",
    name: "Zombie",
    visualKind: "zombie",
    health: 40,
    attackDamage: 6,
    moveSpeed: 4.6,
    aggroRange: 9,
    attackRange: 1.6,
    attackCooldown: 1.1,
    rewardMin: 15,
    rewardMax: 25,
    spawnWeight: 32,
    colorHex: "#3a6b3a",
    scale: 1,
    enabled: true,
  },
  {
    id: "skeleton_weak",
    name: "Skelett",
    visualKind: "skeleton",
    health: 28,
    attackDamage: 8,
    moveSpeed: 4.8,
    aggroRange: 10,
    attackRange: 1.6,
    attackCooldown: 0.9,
    rewardMin: 12,
    rewardMax: 20,
    spawnWeight: 28,
    colorHex: "#d8d3c4",
    scale: 0.95,
    enabled: true,
  },
  {
    id: "slime_weak",
    name: "Slime",
    visualKind: "slime",
    health: 20,
    attackDamage: 4,
    moveSpeed: 4.55,
    aggroRange: 7,
    attackRange: 1.3,
    attackCooldown: 1.2,
    rewardMin: 8,
    rewardMax: 14,
    spawnWeight: 24,
    colorHex: "#4ade80",
    scale: 0.85,
    enabled: true,
  },

  // --- Mittel (mid tier): tankier and harder-hitting, rarer --------------
  {
    id: "zombie_strong",
    name: "Zombie-Brute",
    visualKind: "zombie",
    health: 90,
    attackDamage: 14,
    moveSpeed: 5,
    aggroRange: 10,
    attackRange: 1.8,
    attackCooldown: 1.3,
    rewardMin: 40,
    rewardMax: 65,
    spawnWeight: 13,
    colorHex: "#234a23",
    scale: 1.3,
    enabled: true,
  },
  {
    id: "skeleton_strong",
    name: "Skelett-Krieger",
    visualKind: "skeleton",
    health: 65,
    attackDamage: 16,
    moveSpeed: 5.4,
    aggroRange: 11,
    attackRange: 1.8,
    attackCooldown: 1,
    rewardMin: 35,
    rewardMax: 55,
    spawnWeight: 9,
    colorHex: "#9c958a",
    scale: 1.15,
    enabled: true,
  },
  {
    id: "orc_brute",
    name: "Ork",
    visualKind: "orc",
    health: 100,
    attackDamage: 18,
    moveSpeed: 5,
    aggroRange: 10,
    attackRange: 1.9,
    attackCooldown: 1.4,
    rewardMin: 45,
    rewardMax: 70,
    spawnWeight: 8,
    colorHex: "#5a6b35",
    scale: 1.4,
    enabled: true,
  },

  // --- Krass (high tier): rarest, most dangerous, biggest reward ---------
  {
    id: "ghost_wraith",
    name: "Geist",
    visualKind: "ghost",
    health: 55,
    attackDamage: 12,
    moveSpeed: 6.4,
    aggroRange: 13,
    attackRange: 1.7,
    attackCooldown: 0.8,
    rewardMin: 40,
    rewardMax: 60,
    spawnWeight: 5,
    colorHex: "#b9d6ff",
    scale: 1.05,
    enabled: true,
  },
  {
    id: "demon_boss",
    name: "Dämonenfürst",
    visualKind: "demon",
    health: 160,
    attackDamage: 26,
    moveSpeed: 5.6,
    aggroRange: 12,
    attackRange: 2,
    attackCooldown: 1.1,
    rewardMin: 90,
    rewardMax: 140,
    spawnWeight: 3,
    colorHex: "#7a1020",
    scale: 1.6,
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
