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
export type MonsterVisualKind =
  | "zombie" | "skeleton" | "slime" | "orc" | "ghost" | "demon"
  // Neue Arten: Steingolem (tankig, glühende Risse), Riesenspinne (8 Beine,
  // schnell, Augen-Cluster), Kobold/Imp (klein, schnell, Feuerball-Werfer).
  | "golem" | "spider" | "imp";

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
  /** Renders a held weapon prop (components/world/monster.tsx) on the
   * sword-arm — purely visual, no separate stat. Optional/code-only for
   * now (not yet surfaced in the admin editor — `enabled` and the numeric
   * stats are the only fields the panel can currently touch on this). */
  hasWeapon?: boolean;
  /** Whether this variant can also throw a ranged projectile instead of
   * always closing to melee — gives every variant *some* way to threaten a
   * player who just stands at the edge of `aggroRange`, not only the ones
   * within `attackRange`. `throwRange` must sit strictly between
   * `attackRange` (below it, melee already works and takes over) and
   * `aggroRange` (above it, the variant hasn't noticed the player at all).
   * All four throw-related fields are required together when `canThrow` is
   * true — components/world/monster.tsx reads them as a group. */
  canThrow?: boolean;
  throwDamage?: number;
  throwCooldown?: number;
  throwRange?: number;
}

/**
 * Re-balanced upward (health *and* attackDamage) after lib/combat.ts'
 * weapon-damage fix — every weapon's `damage` column had been NULL/unset
 * since launch, so every fight had actually been running on `FIST_DAMAGE`
 * (8) the entire time regardless of equipped weapon/rarity. Once weapons
 * started dealing their real 15/30/55/100, the *old* HP numbers (tuned,
 * unknowingly, around an 8-damage attacker) made even a common weapon
 * one-shot the weakest variants outright.
 *
 * That first pass over-corrected: real weapon damage *and* the full
 * roster being individually tougher, stacked together, made fights feel
 * harder/faster-paced than intended for several variants. Health/damage
 * here are trimmed back down roughly 10-12% from that pass (still much
 * tougher than the original pre-weapon-fix numbers, just not as brutal as
 * the full correction), and the Mittel/Krass variants with the most
 * speed headroom (Zombie-Brute, Skelett-Krieger, Ork, Geist, Dämonenfürst)
 * had `moveSpeed` trimmed a few percent too — Niedrig variants are left
 * untouched there since they were already close to the 4.5 floor (see
 * the `moveSpeed` paragraph below) with no real room to trim further.
 * Three clear tiers, not a flat list of recolors: Niedrig (Zombie/
 * Skelett/Slime, common, cheap), Mittel (Zombie-Brute/Skelett-Krieger/
 * Ork, tankier and harder-hitting, rarer), Krass (Geist/Dämonenfürst, the
 * rarest and most dangerous — Geist trades health for speed/evasiveness,
 * Dämonenfürst is the straightforward "biggest number" boss-tier
 * endpoint). Rewards scale with how dangerous/tanky a variant is, not
 * flat per kill, so hunting the rarer tiers is worth the risk.
 *
 * Every variant keeps `attackRange` comfortably under the player's own
 * `ATTACK_RANGE` (2.7, lib/combat.ts), so a player who lands a hit right at
 * max melee reach is never simultaneously in *their* strike range — "hit
 * first" stays the rewarded, skillful side of every fight.
 *
 * `moveSpeed` is faster than the player's unsprinted walk (4.5) and slower
 * than sprinting (8.1, stamina-gated, lib/combat.ts'
 * STAMINA_SPRINT_DRAIN_PER_SEC) for every variant — simply holding S to
 * back away must never be a free, zero-risk escape; sprinting (a
 * deliberate, resource-gated choice) is the only real one. Don't drop any
 * of these back under 4.5.
 *
 * `canThrow` variants (every Mittel/Krass one, plus Skelett at Niedrig)
 * lob a ranged projectile (components/world/monster.tsx's ThrownProjectile)
 * at a player sitting between `attackRange` and `throwRange` instead of
 * just standing there waiting for them to close the distance — a player
 * can no longer camp just outside melee reach indefinitely and take zero
 * risk. `hasWeapon` variants render a held weapon prop on the attack arm,
 * purely cosmetic, no separate stat.
 */
// Another small, deliberate tick down (~8-10% off health/attackDamage
// across the whole roster, moveSpeed untouched) — feedback was "monsters
// feel a bit too wild already at the very start of a session", i.e. even
// before any kill-streak mob-scaling kicks in. Admin-tunable regardless
// (components/admin/monster-type-editor.tsx); this is just a saner
// out-of-the-box baseline.
export const DEFAULT_MONSTER_TYPES: MonsterTypeConfig[] = [
  // --- Niedrig (low tier): common, but noticeably dangerous now ----------
  {
    id: "zombie_weak",
    name: "Zombie",
    visualKind: "zombie",
    health: 80,
    attackDamage: 10,
    moveSpeed: 4.8,
    aggroRange: 10,
    attackRange: 1.6,
    attackCooldown: 1.0,
    rewardMin: 18,
    rewardMax: 28,
    spawnWeight: 22,
    colorHex: "#3a6b3a",
    scale: 1,
    enabled: true,
  },
  {
    id: "skeleton_weak",
    name: "Skelett",
    visualKind: "skeleton",
    health: 62,
    attackDamage: 13,
    moveSpeed: 5.0,
    aggroRange: 11,
    attackRange: 1.6,
    attackCooldown: 0.85,
    rewardMin: 15,
    rewardMax: 24,
    spawnWeight: 20,
    colorHex: "#d8d3c4",
    scale: 0.95,
    enabled: true,
    hasWeapon: true,
    canThrow: true,
    throwDamage: 8,
    throwCooldown: 2.7,
    throwRange: 7,
  },
  {
    id: "slime_weak",
    name: "Slime",
    visualKind: "slime",
    health: 38,
    attackDamage: 8,
    moveSpeed: 4.6,
    aggroRange: 7,
    attackRange: 1.3,
    attackCooldown: 1.0,
    rewardMin: 10,
    rewardMax: 16,
    spawnWeight: 16,
    colorHex: "#4ade80",
    scale: 0.85,
    enabled: true,
  },

  // --- Mittel (mid tier): tankier and harder-hitting, appear more often --
  {
    id: "zombie_strong",
    name: "Zombie-Brute",
    visualKind: "zombie",
    health: 160,
    attackDamage: 21,
    moveSpeed: 5.0,
    aggroRange: 11,
    attackRange: 1.8,
    attackCooldown: 1.2,
    rewardMin: 50,
    rewardMax: 80,
    spawnWeight: 18,
    colorHex: "#234a23",
    scale: 1.3,
    enabled: true,
    hasWeapon: true,
    canThrow: true,
    throwDamage: 14,
    throwCooldown: 3.0,
    throwRange: 7,
  },
  {
    id: "skeleton_strong",
    name: "Skelett-Krieger",
    visualKind: "skeleton",
    health: 122,
    attackDamage: 24,
    moveSpeed: 5.3,
    aggroRange: 12,
    attackRange: 1.8,
    attackCooldown: 0.9,
    rewardMin: 45,
    rewardMax: 70,
    spawnWeight: 13,
    colorHex: "#9c958a",
    scale: 1.15,
    enabled: true,
    hasWeapon: true,
    canThrow: true,
    throwDamage: 15,
    throwCooldown: 2.4,
    throwRange: 8,
  },
  {
    id: "orc_brute",
    name: "Ork",
    visualKind: "orc",
    health: 220,
    attackDamage: 28,
    moveSpeed: 4.9,
    aggroRange: 11,
    attackRange: 1.9,
    attackCooldown: 1.3,
    rewardMin: 55,
    rewardMax: 88,
    spawnWeight: 11,
    colorHex: "#5a6b35",
    scale: 1.4,
    enabled: true,
    hasWeapon: true,
    canThrow: true,
    throwDamage: 18,
    throwCooldown: 3.0,
    throwRange: 7,
  },

  // --- Krass (high tier): dangerous threats, appear more visibly now -----
  {
    id: "ghost_wraith",
    name: "Geist",
    visualKind: "ghost",
    health: 160,
    attackDamage: 26,
    moveSpeed: 6.3,
    aggroRange: 14,
    attackRange: 1.7,
    attackCooldown: 0.75,
    rewardMin: 55,
    rewardMax: 80,
    spawnWeight: 8,
    colorHex: "#b9d6ff",
    scale: 1.05,
    enabled: true,
    canThrow: true,
    throwDamage: 14,
    throwCooldown: 2.0,
    throwRange: 10,
  },
  {
    id: "demon_boss",
    name: "Dämonenfürst",
    visualKind: "demon",
    health: 480,
    attackDamage: 42,
    moveSpeed: 5.5,
    aggroRange: 13,
    attackRange: 2,
    attackCooldown: 1.0,
    rewardMin: 115,
    rewardMax: 175,
    spawnWeight: 5,
    colorHex: "#7a1020",
    scale: 1.6,
    enabled: true,
    hasWeapon: true,
    canThrow: true,
    throwDamage: 24,
    throwCooldown: 2.5,
    throwRange: 9,
  },

  // --- Neue Arten -------------------------------------------------------------
  {
    // Klein, flink, lobt Feuerbälle — nervt aus der Distanz.
    id: "imp_scout",
    name: "Kobold",
    visualKind: "imp",
    health: 64,
    attackDamage: 11,
    moveSpeed: 6.4,
    aggroRange: 12,
    attackRange: 1.4,
    attackCooldown: 0.8,
    rewardMin: 20,
    rewardMax: 32,
    spawnWeight: 16,
    colorHex: "#b91c1c",
    scale: 0.8,
    enabled: true,
    canThrow: true,
    throwDamage: 9,
    throwCooldown: 2.2,
    throwRange: 9,
  },
  {
    // Schnell, aggressiv, 8 Beine — kommt aus der Distanz mit Netz-Schuss.
    id: "spider_giant",
    name: "Riesenspinne",
    visualKind: "spider",
    health: 130,
    attackDamage: 19,
    moveSpeed: 6.8,
    aggroRange: 13,
    attackRange: 1.7,
    attackCooldown: 0.7,
    rewardMin: 48,
    rewardMax: 74,
    spawnWeight: 12,
    colorHex: "#3b2f4a",
    scale: 1.15,
    enabled: true,
    canThrow: true,
    throwDamage: 12,
    throwCooldown: 2.4,
    throwRange: 9,
  },
  {
    // Brocken-Tank: extrem zäh, langsam, glühende Risse — fette Belohnung.
    id: "golem_stone",
    name: "Steingolem",
    visualKind: "golem",
    health: 360,
    attackDamage: 33,
    moveSpeed: 4.7,
    aggroRange: 11,
    attackRange: 2.1,
    attackCooldown: 1.3,
    rewardMin: 95,
    rewardMax: 150,
    spawnWeight: 7,
    colorHex: "#6b7280",
    scale: 1.45,
    enabled: true,
    hasWeapon: false,
  },
  {
    // Stärkerer Imp — Höllenbrut, schneller Feuerball-Sturm.
    id: "imp_hellfire",
    name: "Höllen-Imp",
    visualKind: "imp",
    health: 120,
    attackDamage: 20,
    moveSpeed: 6.9,
    aggroRange: 14,
    attackRange: 1.5,
    attackCooldown: 0.7,
    rewardMin: 55,
    rewardMax: 85,
    spawnWeight: 8,
    colorHex: "#ea580c",
    scale: 0.95,
    enabled: true,
    canThrow: true,
    throwDamage: 15,
    throwCooldown: 1.9,
    throwRange: 10,
  },
];

export const MONSTER_TYPE_IDS = DEFAULT_MONSTER_TYPES.map((m) => m.id);

// --- Spawn/world tuning -------------------------------------------------

/** How many monsters can be alive (incl. mid-death-animation corpses) at
 * once, for a single player alone in the World — see
 * `monstersAliveCapForPlayers` below for how this scales up once others
 * join the same room. */
export const MAX_ALIVE_MONSTERS = 14;
export const SPAWN_INTERVAL_MIN_SEC = 1.5;
export const SPAWN_INTERVAL_MAX_SEC = 3.5;
/** No spawns within this radius of the world origin — matches the
 * decorative spawn-area glow circles in scene.tsx, so monsters never pop
 * in right on top of where the player actually starts. */
export const SPAWN_SAFE_RADIUS = 12;

/** Each additional player in the same World room (components/world/scene.tsx
 * reads the live room roster via lib/world-realtime.ts' subscribeToWorldRoster)
 * raises *this client's own* alive-monster ceiling by this much. Monsters
 * have no server-authoritative shared state at all (lib/kill-streak.ts'
 * doc comment on `mobScalePerKill` explains why) — every player simulates
 * their own independent monster pool — so "the World feels busier with more
 * people in it" has to mean "everyone's own pool gets bigger", not "there's
 * one shared pool everyone draws from". */
const ALIVE_CAP_PER_EXTRA_PLAYER = 5;
/** Hard ceiling regardless of how many players are in the room — without
 * this, a packed room would eventually spawn enough concurrent monsters to
 * tank everyone's own framerate for no further gameplay benefit. */
const ALIVE_CAP_MAX = 35;
/** Multiplicative spawn-interval shrink per additional player, compounding
 * (0.85² for 2 extra players, not 2×0.85) — a busier room doesn't just
 * allow more monsters at once, it actually fills that higher ceiling
 * faster too, so joining a populated World immediately feels more
 * eventful, not just "a higher number that takes just as long to reach". */
const SPAWN_INTERVAL_SHRINK_PER_EXTRA_PLAYER = 0.85;
/** Floor on the cumulative shrink above — even a packed room keeps *some*
 * pacing between spawns instead of degenerating into a dead-on-arrival
 * instant-spawn firehose. */
const SPAWN_INTERVAL_SHRINK_FLOOR = 0.4;

/** `playerCount` is "how many players currently share this World room",
 * always >= 1 (yourself). Returns this client's own alive-monster ceiling —
 * see `ALIVE_CAP_PER_EXTRA_PLAYER`'s doc comment for why this is a per-
 * client number, not a shared world total. */
export function monstersAliveCapForPlayers(playerCount: number): number {
  const extra = Math.max(0, playerCount - 1);
  return Math.min(ALIVE_CAP_MAX, MAX_ALIVE_MONSTERS + extra * ALIVE_CAP_PER_EXTRA_PLAYER);
}

/** Multiplier applied to both `SPAWN_INTERVAL_MIN_SEC`/`MAX_SEC` — below 1
 * (faster) the more players share the room, floored so it never degenerates
 * into a spawn firehose. */
export function spawnIntervalScaleForPlayers(playerCount: number): number {
  const extra = Math.max(0, playerCount - 1);
  return Math.max(SPAWN_INTERVAL_SHRINK_FLOOR, Math.pow(SPAWN_INTERVAL_SHRINK_PER_EXTRA_PLAYER, extra));
}

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
