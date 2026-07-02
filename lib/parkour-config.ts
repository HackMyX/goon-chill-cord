/**
 * PARKOUR — client-safe data model, physics config, and the 4 built-in maps.
 *
 * Free of any `import "server-only"` code so it can be imported by BOTH the R3F
 * client engine (components/parkour/*) AND the server actions (lib/actions/
 * parkour.ts). Same "code default, DB override" shape as the rest of the site.
 *
 * The 4 courses are built by a DETERMINISTIC, seeded generator (`buildCourse`)
 * so they are long, wild and varied WITHOUT hand-placing hundreds of platforms —
 * and every client + ghost sees byte-identical geometry. Every jump is proven
 * makeable and every course proven trap-free by scripts/validate-parkour-maps.mjs.
 *
 * Reward VALUES live here as plain numbers; the actual granting maps them onto
 * RewardSpec and calls the central grantReward() dispatcher server-side.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Geometry primitives
// ─────────────────────────────────────────────────────────────────────────────

export interface ParkourPlatform {
  pos: [number, number, number];
  size: [number, number, number];
  color?: string;
  glow?: string;
  kill?: boolean;
  ice?: boolean;
  bounce?: number;
}

export interface ParkourMover extends ParkourPlatform {
  mode: "path" | "orbit";
  to?: [number, number, number];
  radius?: number;
  period: number;
  phase?: number;
}

export interface ParkourCheckpoint {
  index: number;
  pos: [number, number, number];
  radius: number;
}

/** Ordered landing sequence, for the validator only (the engine just lands on
 * whatever collider is under the player). Each node is a static platform or a
 * moving one. */
export interface RouteNode {
  kind: "platform" | "mover";
  index: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Map + theme
// ─────────────────────────────────────────────────────────────────────────────

export interface ParkourTheme {
  fog: string;
  ambient: string;
  ground: string;
  platform: string;
  accent: string;
  sunPosition: [number, number, number];
  stars: number;
}

export interface ParkourMedals {
  diamond: number;
  gold: number;
  silver: number;
  bronze: number;
}

export interface ParkourMap {
  id: string;
  name: string;
  tagline: string;
  difficulty: "Leicht" | "Mittel" | "Schwer" | "Extrem";
  theme: ParkourTheme;
  // Per-map physics (admin-overridable)
  gravity: number;
  jumpVelocity: number;
  airJumps: number;
  moveSpeed: number;
  sprintMultiplier: number;
  voidY: number;
  // Geometry (code-generated)
  start: [number, number, number];
  finish: [number, number, number];
  finishSize: [number, number, number];
  platforms: ParkourPlatform[];
  movers: ParkourMover[];
  checkpoints: ParkourCheckpoint[];
  /** Validator-only intended route. */
  routeHint?: RouteNode[];
  // Economy (admin-overridable)
  rewardCredits: number;
  rewardXp: number;
  bestBonusCredits: number;
  /** Credits per checkpoint reached (granted at finish, within the daily cap). */
  checkpointCredits: number;
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
  fog: "#cbb9e6", ambient: "#9a86c4", ground: "#6d5a94", platform: "#e879f9",
  accent: "#f0abfc", sunPosition: [30, 40, 20], stars: 0,
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
// Deterministic course generator
// ─────────────────────────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Air time (s) until a jump launched at `vJ` descends back through height
 * `rise` above launch, using an optimal apex double-jump if available. Horizontal
 * reach = maxSpeed × this. */
function reachAirtime(gravity: number, vJ: number, airJumps: number, rise: number): number {
  const g = gravity;
  let y = 0, vv = vJ, t = 0, used = 0, prev = 0;
  const dt = 1 / 240;
  while (t < 8) {
    if (airJumps > 0 && used < airJumps && vv <= 0) { vv = vJ * 0.92; used++; }
    prev = y; vv += g * dt; y += vv * dt; t += dt;
    if (vv < 0 && prev > rise && y <= rise) return t;
  }
  return t;
}

interface CourseParams {
  seed: number;
  steps: number;
  gravity: number;
  jumpVelocity: number;
  airJumps: number;
  moveSpeed: number;
  sprintMultiplier: number;
  platMin: number;
  platMax: number;
  riseMin: number;
  riseMax: number;
  gapFrac: number;
  descendChance: number;
  iceChance: number;
  beamChance: number;
  moverChance: number;
  checkpointEvery: number;
  startTop: number;
  accent: string;
}

interface CourseGeometry {
  platforms: ParkourPlatform[];
  movers: ParkourMover[];
  checkpoints: ParkourCheckpoint[];
  routeHint: RouteNode[];
  start: [number, number, number];
  finish: [number, number, number];
  finishSize: [number, number, number];
}

function buildCourse(pr: CourseParams): CourseGeometry {
  const rnd = mulberry32(pr.seed);
  const g = pr.gravity, vJ = pr.jumpVelocity;
  const singleH = (vJ * vJ) / (2 * Math.abs(g));
  const vXmax = pr.moveSpeed * pr.sprintMultiplier;

  const platforms: ParkourPlatform[] = [];
  const movers: ParkourMover[] = [];
  const checkpoints: ParkourCheckpoint[] = [];
  const routeHint: RouteNode[] = [];

  // Spawn pad
  platforms.push({ pos: [0, pr.startTop - 0.5, 0], size: [6, 1, 6] });
  routeHint.push({ kind: "platform", index: 0 });

  let hx = 0, hz = -1;        // heading (unit), starts moving -Z
  let cur = { x: 0, y: pr.startTop, z: 0 };
  let cpIndex = 0;
  let sinceBigTurn = 0;
  let lastWasMover = false;

  for (let i = 0; i < pr.steps; i++) {
    // Gentle heading turn, occasional (non-consecutive) switchback.
    let turn = (rnd() * 2 - 1) * 0.35;
    if (rnd() < 0.09 && sinceBigTurn > 3) {
      turn += (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.35);
      sinceBigTurn = 0;
    } else sinceBigTurn++;
    const ca = Math.cos(turn), sa = Math.sin(turn);
    const nhx = hx * ca - hz * sa, nhz = hx * sa + hz * ca;
    hx = nhx; hz = nhz;

    const isCheckpoint = i % pr.checkpointEvery === pr.checkpointEvery - 1;

    // Rise (never require a double-jump — single jump always clears; double is
    // just insurance, so a player can never get permanently stuck "not up").
    let rise: number;
    if (!isCheckpoint && rnd() < pr.descendChance) rise = -(0.5 + rnd() * 1.4);
    else rise = pr.riseMin + rnd() * (pr.riseMax - pr.riseMin);
    rise = Math.min(rise, singleH * 0.82);

    const airtime = reachAirtime(g, vJ, pr.airJumps, Math.max(rise, 0));
    const maxReach = vXmax * airtime;
    const gap = Math.max(2.4, maxReach * pr.gapFrac);

    // Feature selection (never on a checkpoint pad, never on the final step —
    // the last node must be a solid platform so the finish jump is clean).
    let ice = false, beam = false, moverThis = false;
    if (!isCheckpoint && i < pr.steps - 1) {
      if (rnd() < pr.beamChance) beam = true;
      else if (!lastWasMover && rnd() < pr.moverChance) moverThis = true;
      if (!beam && rnd() < pr.iceChance) ice = true;
    }

    let sx = pr.platMin + rnd() * (pr.platMax - pr.platMin);
    let sz = sx;
    if (isCheckpoint) { sx = Math.max(sx, 2.8); sz = sx; }
    if (beam) {
      if (Math.abs(hx) > Math.abs(hz)) { sx = 6.5; sz = 1.3; }
      else { sx = 1.3; sz = 6.5; }
    }

    const dist = gap + sx / 2 + 1.4;
    const nx = cur.x + hx * dist;
    const nz = cur.z + hz * dist;
    const ny = cur.y + rise;

    if (moverThis) {
      const px = -hz, pz = hx;      // perpendicular oscillation
      const amp = 1.6;
      movers.push({
        mode: "path",
        pos: [nx - px * amp, ny - 0.7, nz - pz * amp],
        to: [nx + px * amp, ny - 0.7, nz + pz * amp],
        size: [Math.max(2.3, sx * 0.95), 0.6, Math.max(2.3, sz * 0.95)],
        period: 3 + rnd() * 2,
        phase: rnd(),
        color: pr.accent, glow: pr.accent,
      });
      routeHint.push({ kind: "mover", index: movers.length - 1 });
      lastWasMover = true;
      cur = { x: nx, y: ny, z: nz };
      continue;
    }
    lastWasMover = false;

    const plat: ParkourPlatform = { pos: [nx, ny - 0.5, nz], size: [sx, 1, sz] };
    if (ice) { plat.ice = true; plat.color = "#7dd3fc"; plat.glow = "#38bdf8"; }
    platforms.push(plat);
    routeHint.push({ kind: "platform", index: platforms.length - 1 });
    if (isCheckpoint) {
      checkpoints.push({ index: cpIndex++, pos: [nx, ny, nz], radius: Math.max(sx, sz) / 2 + 0.3 });
    }
    cur = { x: nx, y: ny, z: nz };
  }

  // Finish pad — a clean, modest jump up from the last (solid) platform.
  const fRise = 0.8;
  const fAir = reachAirtime(g, vJ, pr.airJumps, fRise);
  const fdist = vXmax * fAir * pr.gapFrac + 3;
  const fx = cur.x + hx * fdist, fz = cur.z + hz * fdist, fy = cur.y + fRise;

  return {
    platforms, movers, checkpoints, routeHint,
    start: [0, pr.startTop, 0],
    finish: [fx, fy, fz],
    finishSize: [6, 1, 6],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The 4 maps — long, escalating, feature-rich. Seeds chosen so the validator is
// 100% green (all jumps makeable, no traps/overlaps).
// ─────────────────────────────────────────────────────────────────────────────

const NEON_PARAMS: CourseParams = {
  seed: 10014, steps: 68,
  gravity: -20, jumpVelocity: 8.4, airJumps: 1, moveSpeed: 6.5, sprintMultiplier: 1.5,
  platMin: 2.7, platMax: 3.3, riseMin: 0.5, riseMax: 1.15, gapFrac: 0.5,
  descendChance: 0.12, iceChance: 0.0, beamChance: 0.1, moverChance: 0.12,
  checkpointEvery: 7, startTop: 1, accent: THEME_NEON_NIGHT.accent,
};
const MAP_NEON: ParkourMap = {
  id: "neon_ascent",
  name: "Neon Ascent",
  tagline: "Der lange leuchtende Aufstieg — 8 Checkpoints, kein Zuckerschlecken mehr.",
  difficulty: "Leicht",
  theme: THEME_NEON_NIGHT,
  gravity: -20, jumpVelocity: 8.4, airJumps: 1, moveSpeed: 6.5, sprintMultiplier: 1.5,
  voidY: -16,
  ...buildCourse(NEON_PARAMS),
  rewardCredits: 150, rewardXp: 120, bestBonusCredits: 100, checkpointCredits: 12,
  medals: { diamond: 72000, gold: 95000, silver: 125000, bronze: 170000 },
};

const SKY_PARAMS: CourseParams = {
  seed: 20028, steps: 82,
  gravity: -18, jumpVelocity: 8.6, airJumps: 1, moveSpeed: 7, sprintMultiplier: 1.6,
  platMin: 2.3, platMax: 3.0, riseMin: 0.6, riseMax: 1.25, gapFrac: 0.58,
  descendChance: 0.14, iceChance: 0.05, beamChance: 0.13, moverChance: 0.16,
  checkpointEvery: 7, startTop: 1, accent: THEME_SKY_DAWN.accent,
};
const MAP_SKY: ParkourMap = {
  id: "sky_gardens",
  name: "Sky Gardens",
  tagline: "Endlose schwebende Gärten, kreisende Scheiben, wackelige Stege.",
  difficulty: "Mittel",
  theme: THEME_SKY_DAWN,
  gravity: -18, jumpVelocity: 8.6, airJumps: 1, moveSpeed: 7, sprintMultiplier: 1.6,
  voidY: -22,
  ...buildCourse(SKY_PARAMS),
  rewardCredits: 280, rewardXp: 220, bestBonusCredits: 180, checkpointCredits: 20,
  medals: { diamond: 100000, gold: 130000, silver: 172000, bronze: 230000 },
};

const MAGMA_PARAMS: CourseParams = {
  seed: 30033, steps: 96,
  gravity: -24, jumpVelocity: 8.9, airJumps: 0, moveSpeed: 7, sprintMultiplier: 1.7,
  platMin: 1.9, platMax: 2.5, riseMin: 0.4, riseMax: 1.0, gapFrac: 0.6,
  descendChance: 0.13, iceChance: 0.06, beamChance: 0.24, moverChance: 0.14,
  checkpointEvery: 8, startTop: 1, accent: THEME_MAGMA.accent,
};
const MAP_MAGMA: ParkourMap = {
  id: "magma_rush",
  name: "Magma Rush",
  tagline: "Schmale Stege & winzige Pads über dem Lava-Abgrund — kein Doppelsprung.",
  difficulty: "Schwer",
  theme: THEME_MAGMA,
  gravity: -24, jumpVelocity: 8.9, airJumps: 0, moveSpeed: 7, sprintMultiplier: 1.7,
  voidY: -6,
  ...buildCourse(MAGMA_PARAMS),
  rewardCredits: 460, rewardXp: 340, bestBonusCredits: 320, checkpointCredits: 30,
  medals: { diamond: 135000, gold: 175000, silver: 235000, bronze: 320000 },
};

const VOID_PARAMS: CourseParams = {
  seed: 40041, steps: 116,
  gravity: -21, jumpVelocity: 8.9, airJumps: 1, moveSpeed: 7.2, sprintMultiplier: 1.6,
  platMin: 1.6, platMax: 2.1, riseMin: 0.6, riseMax: 1.35, gapFrac: 0.66,
  descendChance: 0.12, iceChance: 0.22, beamChance: 0.16, moverChance: 0.2,
  checkpointEvery: 8, startTop: 1, accent: THEME_VOID.accent,
};
const MAP_VOID: ParkourMap = {
  id: "void_spire",
  name: "Void Spire",
  tagline: "Der endlose Turm ins Nichts — Eis überall, winzige Landungen, rasende Ringe.",
  difficulty: "Extrem",
  theme: THEME_VOID,
  gravity: -21, jumpVelocity: 8.9, airJumps: 1, moveSpeed: 7.2, sprintMultiplier: 1.6,
  voidY: -8,
  ...buildCourse(VOID_PARAMS),
  rewardCredits: 700, rewardXp: 520, bestBonusCredits: 500, checkpointCredits: 45,
  medals: { diamond: 185000, gold: 240000, silver: 320000, bronze: 430000 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Registry + config
// ─────────────────────────────────────────────────────────────────────────────

export const PARKOUR_MAPS: ParkourMap[] = [MAP_NEON, MAP_SKY, MAP_MAGMA, MAP_VOID];

export const PARKOUR_MAP_IDS = PARKOUR_MAPS.map((m) => m.id);

export function getParkourMap(id: string): ParkourMap | undefined {
  return PARKOUR_MAPS.find((m) => m.id === id);
}

export interface ParkourMapOverride {
  enabled?: boolean;
  gravity?: number;
  jumpVelocity?: number;
  airJumps?: number;
  moveSpeed?: number;
  sprintMultiplier?: number;
  voidY?: number;
  rewardCredits?: number;
  rewardXp?: number;
  bestBonusCredits?: number;
  checkpointCredits?: number;
}

export interface ParkourConfig {
  enabled: boolean;
  adminOnly: boolean;
  maxLobbySize: number;
  dailyRewardedFinishes: number;
  /** Milliseconds each death adds to the combined T/D score (rankings are by T/D
   * by default: less time AND fewer deaths = better). Admin-tunable. */
  deathPenaltyMs: number;
  maps: Record<string, ParkourMapOverride>;
}

export const DEFAULT_PARKOUR_CONFIG: ParkourConfig = {
  enabled: true,
  adminOnly: false,
  maxLobbySize: 6,
  dailyRewardedFinishes: 3,
  deathPenaltyMs: 2500,
  maps: {},
};

/** Combined T/D score: an "effective time" = run time + a fixed penalty per death.
 * Lower is better. This is what every parkour leaderboard ranks by (with Zeit /
 * Tode as alternative sorts). */
export function parkourTd(timeMs: number, deaths: number, penaltyMs: number): number {
  return timeMs + Math.max(0, deaths) * Math.max(0, penaltyMs);
}

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
    voidY: o.voidY ?? map.voidY,
    rewardCredits: o.rewardCredits ?? map.rewardCredits,
    rewardXp: o.rewardXp ?? map.rewardXp,
    bestBonusCredits: o.bestBonusCredits ?? map.bestBonusCredits,
    checkpointCredits: o.checkpointCredits ?? map.checkpointCredits,
  };
}

export function isMapEnabled(mapId: string, cfg: ParkourConfig): boolean {
  return cfg.maps[mapId]?.enabled ?? true;
}

export function formatParkourTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalMs = Math.round(ms);
  const m = Math.floor(totalMs / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const cs = totalMs % 1000;
  return `${m}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(3, "0")}`;
}

export function medalFor(ms: number, medals: ParkourMedals): "diamond" | "gold" | "silver" | "bronze" | null {
  if (ms <= medals.diamond) return "diamond";
  if (ms <= medals.gold) return "gold";
  if (ms <= medals.silver) return "silver";
  if (ms <= medals.bronze) return "bronze";
  return null;
}

/** Deterministic center of a moving platform at run-time `t` (seconds). Pure —
 * BOTH the physics AND the render call this every frame; every client shares the
 * same clock so all movers + ghosts stay in lockstep. */
export function moverCenterAt(m: ParkourMover, t: number): [number, number, number] {
  const phase = m.phase ?? 0;
  if (m.mode === "orbit") {
    const r = m.radius ?? 4;
    const ang = ((t / m.period + phase) % 1) * Math.PI * 2;
    return [m.pos[0] + Math.cos(ang) * r, m.pos[1], m.pos[2] + Math.sin(ang) * r];
  }
  const to = m.to ?? m.pos;
  const u = (((t / m.period + phase) % 1) + 1) % 1;
  const tri = u < 0.5 ? u * 2 : 2 - u * 2;
  return [
    m.pos[0] + (to[0] - m.pos[0]) * tri,
    m.pos[1] + (to[1] - m.pos[1]) * tri,
    m.pos[2] + (to[2] - m.pos[2]) * tri,
  ];
}
