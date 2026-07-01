/**
 * PARKOUR — client-safe data model, physics config, and the 4 built-in maps.
 *
 * This module is intentionally free of any `import "server-only"` code (no
 * rewards-grant, no supabase) so it can be imported by BOTH the R3F client
 * engine (components/parkour/*) AND the server actions (lib/actions/parkour.ts).
 * Same "code default, DB override" shape the rest of the site uses
 * (lib/world-session-config.ts, lib/character-config.ts): the built-in maps +
 * DEFAULT_PARKOUR_CONFIG here are the source of truth; the admin can override
 * per-map physics/rewards in `parkour_config` (see lib/actions/parkour.ts).
 *
 * Reward VALUES live here as plain numbers (credits/xp per map) so the module
 * stays client-safe; the actual granting maps them onto RewardSpec and calls
 * the central grantReward() dispatcher server-side (AGENTS §9).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Geometry primitives
// ─────────────────────────────────────────────────────────────────────────────

/** A solid, axis-aligned box platform. `pos` = center, `size` = full extents
 * (width X, height Y, depth Z). The engine lands the player on the TOP face
 * (pos.y + size.y/2) and blocks the four side faces. */
export interface ParkourPlatform {
  pos: [number, number, number];
  size: [number, number, number];
  /** Hex color. Falls back to the map theme's platform color when omitted. */
  color?: string;
  /** Optional emissive accent (finish pads, checkpoints, hazard glow). */
  glow?: string;
  /** true → touching the top face kills/void-respawns the player (lava/spikes).
   * Deliberately a normal platform you can still stand ON only for a killbrick
   * you must avoid — used sparingly for hazard tiles. */
  kill?: boolean;
  /** true → slippery: horizontal damping is much lower on this surface (ice). */
  ice?: boolean;
  /** true → bounce pad: landing launches the player up by `bounce` units/s. */
  bounce?: number;
}

/** A platform that moves. Two modes:
 *  - "path": ping-pongs between `pos` and `to` over `period` seconds.
 *  - "orbit": circles around `pos` at `radius` in the XZ plane over `period`.
 * The player standing on a mover inherits its per-frame delta (rides it). */
export interface ParkourMover extends ParkourPlatform {
  mode: "path" | "orbit";
  /** Target position for "path" mode (world center of the far end). */
  to?: [number, number, number];
  /** Radius for "orbit" mode. */
  radius?: number;
  /** Full cycle length in seconds. */
  period: number;
  /** Phase offset 0..1 so a group of movers can be desynced. */
  phase?: number;
}

/** A checkpoint ring. Crossing its radius (XZ) at roughly its height arms it as
 * the player's respawn point and lights it up. Ordered by `index`. */
export interface ParkourCheckpoint {
  index: number;
  pos: [number, number, number];
  radius: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Map + theme
// ─────────────────────────────────────────────────────────────────────────────

export interface ParkourTheme {
  /** drei <Sky>/fog + light preset — reuses the same knobs as the farm world. */
  fog: string;
  ambient: string;
  ground: string;
  platform: string;
  accent: string;
  sunPosition: [number, number, number];
  /** Star count (night maps sparkle, day maps 0). */
  stars: number;
}

/** Bronze/Silver/Gold/Diamond target times (ms) — pure cosmetic medals shown
 * on the leaderboard + finish screen. Ordered fastest-last. */
export interface ParkourMedals {
  diamond: number;
  gold: number;
  silver: number;
  bronze: number;
}

export interface ParkourMap {
  id: string;
  name: string;
  /** One-line pitch shown in the map picker. */
  tagline: string;
  difficulty: "Leicht" | "Mittel" | "Schwer" | "Extrem";
  theme: ParkourTheme;
  // ── Per-map physics (admin-overridable) ──
  gravity: number;
  jumpVelocity: number;
  /** Number of mid-air jumps allowed (0 = only ground jump, 1 = double-jump). */
  airJumps: number;
  moveSpeed: number;
  sprintMultiplier: number;
  /** Y below which the player has fallen into the void → respawn at checkpoint. */
  voidY: number;
  // ── Geometry ──
  start: [number, number, number];
  finish: [number, number, number];
  /** Size of the finish pad (full extents). */
  finishSize: [number, number, number];
  platforms: ParkourPlatform[];
  movers: ParkourMover[];
  checkpoints: ParkourCheckpoint[];
  // ── Economy (admin-overridable) — see AGENTS §8/§9 ──
  /** Credits granted the first time a player finishes this map, per day. */
  rewardCredits: number;
  /** XP granted on finish. */
  rewardXp: number;
  /** Extra credits granted when a run sets a NEW personal best. */
  bestBonusCredits: number;
  medals: ParkourMedals;
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme presets
// ─────────────────────────────────────────────────────────────────────────────

const THEME_NEON_NIGHT: ParkourTheme = {
  fog: "#0a0712", ambient: "#3b2d55", ground: "#140b24", platform: "#7c3aed",
  accent: "#22d3ee", sunPosition: [-40, 12, -30], stars: 2600,
};
const THEME_SKY_DAWN: ParkourTheme = {
  fog: "#cbb9e6", ambient: "#9a86c4", ground: "#6d5a94", platform: "#f0abfc",
  accent: "#fbbf24", sunPosition: [30, 40, 20], stars: 0,
};
const THEME_MAGMA: ParkourTheme = {
  fog: "#1a0806", ambient: "#5a2418", ground: "#2a0d08", platform: "#f97316",
  accent: "#ef4444", sunPosition: [10, 8, -20], stars: 400,
};
const THEME_VOID: ParkourTheme = {
  fog: "#020208", ambient: "#1e2540", ground: "#05060f", platform: "#38bdf8",
  accent: "#a855f7", sunPosition: [0, 30, -50], stars: 4200,
};

// ─────────────────────────────────────────────────────────────────────────────
// Small geometry helpers (keep the map literals readable)
// ─────────────────────────────────────────────────────────────────────────────

const p = (
  x: number, y: number, z: number,
  sx = 4, sy = 1, sz = 4,
  extra: Partial<ParkourPlatform> = {},
): ParkourPlatform => ({ pos: [x, y, z], size: [sx, sy, sz], ...extra });

// ─────────────────────────────────────────────────────────────────────────────
// MAP 1 — "Neon Ascent" (Leicht): a clean vertical climb, gentle gaps,
// a couple of moving lifts. Teaches jump/double-jump/checkpoints.
// ─────────────────────────────────────────────────────────────────────────────

// Every jump below is proven makeable (with margin, at a player-controllable
// speed) by scripts/validate-parkour-maps.mjs, which simulates the real engine
// trajectory. No two platforms overlap into a "double floor"/head-trap. Movers
// are placed OFF the critical path (bonus flair), so the static route always
// works on its own.
const MAP_NEON: ParkourMap = {
  id: "neon_ascent",
  name: "Neon Ascent",
  tagline: "Der Aufstieg durch die leuchtende Skyline — perfekt zum Reinkommen.",
  difficulty: "Leicht",
  theme: THEME_NEON_NIGHT,
  gravity: -20, jumpVelocity: 8.2, airJumps: 1, moveSpeed: 6.5, sprintMultiplier: 1.5,
  voidY: -14,
  start: [0, 1, 0],
  finish: [0, 13.5, -48],
  finishSize: [6, 1, 6],
  platforms: [
    p(0, 0.5, 0, 6, 1, 6),                         // spawn top 1.0
    p(2.2, 1.7, -5.2, 3.5, 1, 3.5),                // top 2.2
    p(-2.2, 2.9, -9.4, 3.5, 1, 3.5),               // top 3.4
    p(2.2, 4.1, -13.6, 3.5, 1, 3.5),               // top 4.6
    p(-2.2, 5.3, -17.8, 3.5, 1, 3.5),              // top 5.8  · CP0
    p(2.2, 6.5, -22, 3.2, 1, 3.2),                 // top 7.0
    p(-2.2, 7.7, -26.2, 3.2, 1, 3.2),              // top 8.2
    p(2.2, 8.9, -30.4, 3.2, 1, 3.2),               // top 9.4  · CP1
    p(-2.2, 10.1, -34.6, 3.2, 1, 3.2),             // top 10.6
    p(2.2, 11.3, -38.8, 3.2, 1, 3.2),              // top 11.8
    p(0, 12.3, -43, 4, 1, 4),                      // top 12.8 · pre-finish
  ],
  movers: [ // side flair, off the route (route lives in x∈[-4,4])
    { mode: "orbit", pos: [8, 6.0, -18], radius: 3, size: [3, 0.6, 3], period: 6, color: "#22d3ee", glow: "#22d3ee" },
    { mode: "path", pos: [-8, 9.5, -30], to: [-8, 9.5, -36], size: [3, 0.6, 3], period: 5, color: "#22d3ee", glow: "#22d3ee" },
  ],
  checkpoints: [
    { index: 0, pos: [-2.2, 5.9, -17.8], radius: 2.6 },
    { index: 1, pos: [2.2, 9.5, -30.4], radius: 2.6 },
  ],
  rewardCredits: 120, rewardXp: 60, bestBonusCredits: 80,
  medals: { diamond: 22000, gold: 30000, silver: 42000, bronze: 62000 },
};

// ─────────────────────────────────────────────────────────────────────────────
// MAP 2 — "Sky Gardens" (Mittel): long horizontal leaps between floating
// gardens with gentle height changes and orbiting discs alongside.
// ─────────────────────────────────────────────────────────────────────────────

const MAP_SKY: ParkourMap = {
  id: "sky_gardens",
  name: "Sky Gardens",
  tagline: "Weite Sprünge über schwebende Gärten und kreisende Scheiben.",
  difficulty: "Mittel",
  theme: THEME_SKY_DAWN,
  gravity: -18, jumpVelocity: 8.6, airJumps: 1, moveSpeed: 7, sprintMultiplier: 1.6,
  voidY: -20,
  start: [0, 1, 0],
  finish: [60, 6.6, 3],
  finishSize: [6, 1, 6],
  platforms: [
    p(0, 0.5, 0, 7, 1, 7),                         // spawn top 1.0
    p(7, 1.0, 1, 3.4, 1, 3.4),                     // top 1.5
    p(13, 1.6, -3, 3.2, 1, 3.2),                   // top 2.1
    p(19, 2.4, 2, 3.4, 1, 3.4),                    // top 2.9 · CP0
    p(25, 2.0, 6, 3.2, 1, 3.2),                    // top 2.5
    p(31, 3.0, 2, 3.2, 1, 3.2),                    // top 3.5
    p(37, 4.0, -3, 3.4, 1, 3.4),                   // top 4.5 · CP1
    p(43, 4.6, 2, 3.2, 1, 3.2),                    // top 5.1
    p(49, 5.4, 5, 3.2, 1, 3.2),                    // top 5.9
    p(54, 6.0, 3, 4, 1, 4),                        // top 6.5 · pre-finish
  ],
  movers: [ // side flair, off the route (route lives in z∈[-3,6])
    { mode: "orbit", pos: [13, 1.6, -12], radius: 3.5, size: [3, 0.6, 3], period: 6, color: "#f0abfc", glow: "#f0abfc" },
    { mode: "path", pos: [31, 3.0, -12], to: [37, 4.0, -12], size: [3, 0.6, 3], period: 5, color: "#f0abfc", glow: "#f0abfc" },
    { mode: "orbit", pos: [46, 5.2, 12], radius: 3.5, size: [3, 0.6, 3], period: 5.5, phase: 0.4, color: "#f0abfc", glow: "#f0abfc" },
  ],
  checkpoints: [
    { index: 0, pos: [19, 3.0, 2], radius: 2.6 },
    { index: 1, pos: [37, 4.6, -3], radius: 2.6 },
  ],
  rewardCredits: 200, rewardXp: 110, bestBonusCredits: 130,
  medals: { diamond: 26000, gold: 36000, silver: 50000, bronze: 74000 },
};

// ─────────────────────────────────────────────────────────────────────────────
// MAP 3 — "Magma Rush" (Schwer): narrow beams + tiny pads over the lava abyss
// (fall = death). No double jump — every landing must be precise.
// ─────────────────────────────────────────────────────────────────────────────

const MAP_MAGMA: ParkourMap = {
  id: "magma_rush",
  name: "Magma Rush",
  tagline: "Präzision über glühender Lava — ein Fehltritt und du fällst.",
  difficulty: "Schwer",
  theme: THEME_MAGMA,
  gravity: -24, jumpVelocity: 8.8, airJumps: 0, moveSpeed: 7, sprintMultiplier: 1.7,
  voidY: -6,
  start: [0, 1, 0],
  finish: [0, 2.0, -50],
  finishSize: [5, 1, 5],
  platforms: [
    p(0, 0.5, 0, 6, 1, 6),                         // spawn top 1.0
    p(0, 0.7, -5, 2.8, 1, 2.8),                    // top 1.2
    p(0, 0.9, -9.5, 5, 1, 1.4),                    // top 1.4 · beam (long X)
    p(-3.2, 1.1, -14, 2.4, 1, 2.4),               // top 1.6
    p(0, 1.3, -18.5, 2.8, 1, 2.8),                 // top 1.8 · CP0
    p(3.2, 1.1, -23, 2.4, 1, 2.4),                 // top 1.6
    p(0, 0.9, -27.5, 1.4, 1, 5),                   // top 1.4 · beam (long Z)
    p(-3.2, 1.1, -32, 2.4, 1, 2.4),               // top 1.6
    p(0, 1.3, -36.5, 2.8, 1, 2.8),                 // top 1.8 · CP1
    p(3.2, 1.5, -41, 2.4, 1, 2.4),                 // top 2.0
    p(0, 1.7, -45.5, 3, 1, 3),                     // top 2.2 · pre-finish
  ],
  movers: [ // cross-movers in the gaps between pads (never overlap a static pad)
    { mode: "path", pos: [-4, 1.1, -20.75], to: [4, 1.1, -20.75], size: [2.4, 0.6, 2.4], period: 3, color: "#f97316", glow: "#f97316" },
    { mode: "path", pos: [-4, 1.1, -29.75], to: [4, 1.1, -29.75], size: [2.4, 0.6, 2.4], period: 2.8, phase: 0.5, color: "#f97316", glow: "#f97316" },
  ],
  checkpoints: [
    { index: 0, pos: [0, 1.9, -18.5], radius: 2.6 },
    { index: 1, pos: [0, 1.9, -36.5], radius: 2.6 },
  ],
  rewardCredits: 320, rewardXp: 180, bestBonusCredits: 220,
  medals: { diamond: 30000, gold: 42000, silver: 60000, bronze: 90000 },
};

// ─────────────────────────────────────────────────────────────────────────────
// MAP 4 — "Void Spire" (Extrem): a spiral tower into the void — small landings,
// ice tiles, orbiting rings inside the spiral. Double jump available.
// ─────────────────────────────────────────────────────────────────────────────

const MAP_VOID: ParkourMap = {
  id: "void_spire",
  name: "Void Spire",
  tagline: "Der Spiralturm ins Nichts — Eis, kleine Landungen, kreisende Ringe.",
  difficulty: "Extrem",
  theme: THEME_VOID,
  gravity: -21, jumpVelocity: 8.9, airJumps: 1, moveSpeed: 7.2, sprintMultiplier: 1.6,
  voidY: -6,
  start: [0, 1, 0],
  finish: [0, 30.2, 0],
  finishSize: [5, 1, 5],
  platforms: [
    p(0, 0.5, 0, 6, 1, 6),                         // spawn top 1.0
    p(7, 1.7, 0, 2.2, 1, 2.2),                     // top 2.2
    p(4.35, 3.5, 5.48, 2.2, 1, 2.2),               // top 4.0
    p(-1.59, 5.3, 6.82, 2.2, 1, 2.2, { ice: true, color: "#38bdf8", glow: "#38bdf8" }), // top 5.8
    p(-6.33, 7.1, 2.99, 2.2, 1, 2.2),              // top 7.6
    p(-6.28, 8.9, -3.1, 2.4, 1, 2.4),              // top 9.4 · CP0
    p(-1.48, 10.7, -6.84, 2.2, 1, 2.2),            // top 11.2
    p(4.44, 12.5, -5.41, 2.2, 1, 2.2),             // top 13.0
    p(7.0, 14.3, 0.12, 2.4, 1, 2.4),               // top 14.8 · CP1
    p(4.26, 16.1, 5.55, 2.2, 1, 2.2, { ice: true, color: "#38bdf8", glow: "#38bdf8" }), // top 16.6
    p(-1.7, 17.9, 6.79, 2.2, 1, 2.2),              // top 18.4
    p(-6.38, 19.7, 2.88, 2.2, 1, 2.2),             // top 20.2
    p(-6.24, 21.5, -3.18, 2.4, 1, 2.4),            // top 22.0 · CP2
    p(-1.37, 23.3, -6.87, 2.2, 1, 2.2),            // top 23.8
    p(4.54, 25.1, -5.33, 2.2, 1, 2.2, { ice: true, color: "#38bdf8", glow: "#38bdf8" }), // top 25.6
    p(7.0, 26.9, 0.235, 2.2, 1, 2.2),              // top 27.4
    p(4.16, 28.7, 5.63, 2.4, 1, 2.4),              // top 29.2 · pre-finish
  ],
  movers: [ // orbiting rings INSIDE the spiral (radius 3 vs platforms at radius 7)
    { mode: "orbit", pos: [0, 7, 0], radius: 3, size: [2, 0.5, 2], period: 4, color: "#a855f7", glow: "#a855f7" },
    { mode: "orbit", pos: [0, 16, 0], radius: 3, size: [2, 0.5, 2], period: 3.6, phase: 0.4, color: "#a855f7", glow: "#a855f7" },
    { mode: "orbit", pos: [0, 25, 0], radius: 3, size: [2, 0.5, 2], period: 3.2, phase: 0.7, color: "#a855f7", glow: "#a855f7" },
  ],
  checkpoints: [
    { index: 0, pos: [-6.28, 9.5, -3.1], radius: 2.6 },
    { index: 1, pos: [7.0, 14.9, 0.12], radius: 2.6 },
    { index: 2, pos: [-6.24, 22.1, -3.18], radius: 2.6 },
  ],
  rewardCredits: 500, rewardXp: 300, bestBonusCredits: 400,
  medals: { diamond: 40000, gold: 58000, silver: 82000, bronze: 120000 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Registry + config
// ─────────────────────────────────────────────────────────────────────────────

/** The built-in maps, in display order. Admin overrides (physics/rewards/enabled)
 * are merged on top of these by lib/actions/parkour.ts — the geometry itself is
 * always code-defined (deterministic + versioned in git), never in the DB. */
export const PARKOUR_MAPS: ParkourMap[] = [MAP_NEON, MAP_SKY, MAP_MAGMA, MAP_VOID];

export const PARKOUR_MAP_IDS = PARKOUR_MAPS.map((m) => m.id);

export function getParkourMap(id: string): ParkourMap | undefined {
  return PARKOUR_MAPS.find((m) => m.id === id);
}

/** Per-map admin-tunable overrides (physics + economy + enabled flag). Applied
 * over the code default by `resolveMap()`. Only the fields an admin can change
 * live here; geometry never does. */
export interface ParkourMapOverride {
  enabled?: boolean;
  gravity?: number;
  jumpVelocity?: number;
  airJumps?: number;
  moveSpeed?: number;
  sprintMultiplier?: number;
  rewardCredits?: number;
  rewardXp?: number;
  bestBonusCredits?: number;
}

export interface ParkourConfig {
  /** Master on/off for the whole game (mirrors world-session's worldEnabled). */
  enabled: boolean;
  /** When true, non-admins are blocked (soft-launch / maintenance). */
  adminOnly: boolean;
  /** Max players per multiplayer lobby (host + guests). */
  maxLobbySize: number;
  /** Daily cap on reward-granting finishes per map (anti-farm). 0 = unlimited. */
  dailyRewardedFinishes: number;
  /** Per-map overrides keyed by map id. */
  maps: Record<string, ParkourMapOverride>;
}

export const DEFAULT_PARKOUR_CONFIG: ParkourConfig = {
  enabled: true,
  adminOnly: false,
  maxLobbySize: 6,
  dailyRewardedFinishes: 3,
  maps: {},
};

/** Merge the admin override for a map onto its code default → the effective map
 * the engine + rewards use. Geometry always comes from code. */
export function resolveMap(map: ParkourMap, cfg: ParkourConfig): ParkourMap {
  const o = cfg.maps[map.id];
  if (!o) return map;
  return {
    ...map,
    gravity: o.gravity ?? map.gravity,
    jumpVelocity: o.jumpVelocity ?? map.jumpVelocity,
    airJumps: o.airJumps ?? map.airJumps,
    moveSpeed: o.moveSpeed ?? map.moveSpeed,
    sprintMultiplier: o.sprintMultiplier ?? map.sprintMultiplier,
    rewardCredits: o.rewardCredits ?? map.rewardCredits,
    rewardXp: o.rewardXp ?? map.rewardXp,
    bestBonusCredits: o.bestBonusCredits ?? map.bestBonusCredits,
  };
}

/** Is the map enabled (admin can disable individual maps)? Default: enabled. */
export function isMapEnabled(mapId: string, cfg: ParkourConfig): boolean {
  return cfg.maps[mapId]?.enabled ?? true;
}

/** ms → "1:23.456" for HUD/leaderboard display. */
export function formatParkourTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalMs = Math.round(ms);
  const m = Math.floor(totalMs / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const cs = totalMs % 1000;
  return `${m}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(3, "0")}`;
}

/** Which medal a time earns (or null). */
export function medalFor(ms: number, medals: ParkourMedals): "diamond" | "gold" | "silver" | "bronze" | null {
  if (ms <= medals.diamond) return "diamond";
  if (ms <= medals.gold) return "gold";
  if (ms <= medals.silver) return "silver";
  if (ms <= medals.bronze) return "bronze";
  return null;
}

/**
 * Deterministic center of a moving platform at run-time `t` (seconds). Pure —
 * BOTH the physics (components/parkour/parkour-player) AND the render
 * (parkour-geometry) call this every frame, and since every client shares the
 * lobby's run-start seed, all clients + all ghosts see identical mover positions
 * without ever streaming platform state. "path" ping-pongs pos↔to; "orbit"
 * circles `radius` around pos in the XZ plane. */
export function moverCenterAt(m: ParkourMover, t: number): [number, number, number] {
  const phase = m.phase ?? 0;
  if (m.mode === "orbit") {
    const r = m.radius ?? 4;
    const ang = ((t / m.period + phase) % 1) * Math.PI * 2;
    return [m.pos[0] + Math.cos(ang) * r, m.pos[1], m.pos[2] + Math.sin(ang) * r];
  }
  // path: triangle wave 0→1→0 so it ping-pongs smoothly between the two ends.
  const to = m.to ?? m.pos;
  const u = ((t / m.period + phase) % 1 + 1) % 1;
  const tri = u < 0.5 ? u * 2 : 2 - u * 2;
  return [
    m.pos[0] + (to[0] - m.pos[0]) * tri,
    m.pos[1] + (to[1] - m.pos[1]) * tri,
    m.pos[2] + (to[2] - m.pos[2]) * tri,
  ];
}
