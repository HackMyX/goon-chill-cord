/**
 * PARKOUR — client-safe data model, physics config, and the 4 built-in maps.
 *
 * Free of any `import "server-only"` code so it can be imported by BOTH the R3F
 * client engine (components/parkour/*) AND the server actions (lib/actions/
 * parkour.ts). Same "code default, DB override" shape as the rest of the site.
 *
 * The 4 courses are built by a DETERMINISTIC, seeded generator (`buildCourse`)
 * so every client + ghost sees byte-identical geometry. Courses are LONG and
 * MEAN: crumbling platforms, rotating spinner bars + moving saws (touch = death),
 * ice, narrow beams, and lots of required moving platforms. Reachability of the
 * static/mover path is proven by scripts/validate-parkour-maps.mjs (hazards are
 * avoidable skill-checks, so they don't affect reachability).
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
  /** Falls away shortly after you step on it — keep moving! */
  crumble?: boolean;
  /** Index into the run's crumble-state array (set by the generator). */
  crumbleIndex?: number;
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

/** A moving KILL obstacle. "spinner" = a bar rotating around a pivot (touch the
 * bar and you die); "slider" = a saw sliding along a path. */
export interface ParkourHazard {
  kind: "spinner" | "slider";
  pos: [number, number, number];
  to?: [number, number, number];
  length?: number;
  period: number;
  phase?: number;
  killR: number;
  color?: string;
}

/** Ordered landing sequence, for the validator only. */
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
  gravity: number;
  jumpVelocity: number;
  airJumps: number;
  moveSpeed: number;
  sprintMultiplier: number;
  voidY: number;
  start: [number, number, number];
  finish: [number, number, number];
  finishSize: [number, number, number];
  platforms: ParkourPlatform[];
  movers: ParkourMover[];
  hazards: ParkourHazard[];
  checkpoints: ParkourCheckpoint[];
  routeHint?: RouteNode[];
  /** Number of crumble platforms (size of the run's crumble-state array). */
  crumbleCount: number;
  rewardCredits: number;
  rewardXp: number;
  bestBonusCredits: number;
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
  crumbleChance: number;
  spinnerChance: number;
  sliderChance: number;
  hazPeriodMin: number;
  hazPeriodMax: number;
  hazardCap: number;
  checkpointEvery: number;
  startTop: number;
  accent: string;
}

interface CourseGeometry {
  platforms: ParkourPlatform[];
  movers: ParkourMover[];
  hazards: ParkourHazard[];
  checkpoints: ParkourCheckpoint[];
  routeHint: RouteNode[];
  crumbleCount: number;
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
  const hazards: ParkourHazard[] = [];
  const checkpoints: ParkourCheckpoint[] = [];
  const routeHint: RouteNode[] = [];
  let crumbleCount = 0;

  platforms.push({ pos: [0, pr.startTop - 0.5, 0], size: [7, 1, 7] });
  routeHint.push({ kind: "platform", index: 0 });

  let hx = 0, hz = -1;
  let cur = { x: 0, y: pr.startTop, z: 0 };
  let cpIndex = 0;
  let sinceBigTurn = 0;
  let lastWasMover = false;

  const hazPeriod = () => pr.hazPeriodMin + rnd() * (pr.hazPeriodMax - pr.hazPeriodMin);

  for (let i = 0; i < pr.steps; i++) {
    // Heading turn (+ occasional switchback).
    let turn = (rnd() * 2 - 1) * 0.4;
    if (rnd() < 0.1 && sinceBigTurn > 3) {
      turn += (rnd() < 0.5 ? -1 : 1) * (0.55 + rnd() * 0.4);
      sinceBigTurn = 0;
    } else sinceBigTurn++;
    const ca = Math.cos(turn), sa = Math.sin(turn);
    const nhx = hx * ca - hz * sa, nhz = hx * sa + hz * ca;
    hx = nhx; hz = nhz;

    const isCheckpoint = i % pr.checkpointEvery === pr.checkpointEvery - 1;
    const isLast = i >= pr.steps - 1;

    // Rise — never more than a single jump clears (double is only insurance).
    let rise: number;
    if (!isCheckpoint && rnd() < pr.descendChance) rise = -(0.5 + rnd() * 1.5);
    else rise = pr.riseMin + rnd() * (pr.riseMax - pr.riseMin);
    rise = Math.min(rise, singleH * 0.82);

    const airtime = reachAirtime(g, vJ, pr.airJumps, Math.max(rise, 0));
    const gap = Math.max(2.6, vXmax * airtime * pr.gapFrac);

    // Feature selection.
    let ice = false, beam = false, moverThis = false, crumble = false;
    if (!isCheckpoint && !isLast) {
      if (rnd() < pr.beamChance) beam = true;
      else if (!lastWasMover && rnd() < pr.moverChance) moverThis = true;
      else if (rnd() < pr.crumbleChance) crumble = true;
      if (!beam && !crumble && rnd() < pr.iceChance) ice = true;
    }

    let sx = pr.platMin + rnd() * (pr.platMax - pr.platMin);
    let sz = sx;
    if (isCheckpoint) { sx = Math.max(sx, 2.9); sz = sx; } // checkpoint pads a bit safer
    if (beam) { if (Math.abs(hx) > Math.abs(hz)) { sx = 7; sz = 1.3; } else { sx = 1.3; sz = 7; } }

    const dist = gap + sx / 2 + 1.4;
    const nx = cur.x + hx * dist;
    const nz = cur.z + hz * dist;
    const ny = cur.y + rise;

    if (moverThis) {
      const px = -hz, pz = hx;
      const amp = 2.7; // big, fast swing → wild timing challenge
      movers.push({
        mode: "path",
        pos: [nx - px * amp, ny - 0.7, nz - pz * amp],
        to: [nx + px * amp, ny - 0.7, nz + pz * amp],
        size: [Math.max(2.0, sx * 0.85), 0.6, Math.max(2.0, sz * 0.85)],
        period: 1.3 + rnd() * 1.3, // much faster back-and-forth
        phase: rnd(),
        color: pr.accent, glow: pr.accent,
      });
      routeHint.push({ kind: "mover", index: movers.length - 1 });
      lastWasMover = true;
    } else {
      lastWasMover = false;
      const plat: ParkourPlatform = { pos: [nx, ny - 0.5, nz], size: [sx, 1, sz] };
      if (crumble) { plat.crumble = true; plat.crumbleIndex = crumbleCount++; plat.color = "#f59e0b"; plat.glow = "#f59e0b"; }
      else if (ice) { plat.ice = true; plat.color = "#7dd3fc"; plat.glow = "#38bdf8"; }
      platforms.push(plat);
      routeHint.push({ kind: "platform", index: platforms.length - 1 });
      if (isCheckpoint) checkpoints.push({ index: cpIndex++, pos: [nx, ny, nz], radius: Math.max(sx, sz) / 2 + 0.3 });
    }

    // ── Hazards (avoidable skill-checks; capped for perf) ──
    if (!isCheckpoint && !isLast && hazards.length < pr.hazardCap) {
      const spinRoll = rnd() < pr.spinnerChance;
      // Spinner only on a SOLID square platform (proper footing). That platform
      // gets a touch bigger so you have a fair chance to time the jump over the bar.
      if (spinRoll && !moverThis && !beam) {
        const sp = platforms[platforms.length - 1];
        sp.size[0] += 0.5; sp.size[2] += 0.5;
        hazards.push({
          kind: "spinner",
          // LOW bar (just above the platform) → you jump over it as it sweeps.
          pos: [nx, ny + 0.4, nz],
          length: Math.max(1.7, sp.size[0] * 0.55 + 1.3),
          period: hazPeriod() * (rnd() < 0.5 ? 1 : -1), // some spin the other way
          phase: rnd(),
          killR: 0.5,
          color: pr.accent,
        });
      } else if (rnd() < pr.sliderChance) {
        const mx = (cur.x + nx) / 2, mz = (cur.z + nz) / 2, my = (cur.y + ny) / 2 + 0.9;
        const px = -hz, pz = hx, amp = 2.6;
        hazards.push({
          kind: "slider",
          pos: [mx - px * amp, my, mz - pz * amp],
          to: [mx + px * amp, my, mz + pz * amp],
          period: hazPeriod(),
          phase: rnd(),
          killR: 0.6,
          color: "#ef4444",
        });
      }
    }

    cur = { x: nx, y: ny, z: nz };
  }

  const fRise = 0.8;
  const fAir = reachAirtime(g, vJ, pr.airJumps, fRise);
  const fdist = vXmax * fAir * pr.gapFrac + 3;
  const fx = cur.x + hx * fdist, fz = cur.z + hz * fdist, fy = cur.y + fRise;

  return {
    platforms, movers, hazards, checkpoints, routeHint, crumbleCount,
    start: [0, pr.startTop, 0],
    finish: [fx, fy, fz],
    finishSize: [6, 1, 6],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The 4 maps — long, mean, mechanic-heavy. Seeds chosen so the validator is 100%
// green (all jumps makeable; hazards are avoidable and not part of the check).
// ─────────────────────────────────────────────────────────────────────────────

const NEON_PARAMS: CourseParams = {
  seed: 51014, steps: 68,
  gravity: -20, jumpVelocity: 8.4, airJumps: 1, moveSpeed: 6.5, sprintMultiplier: 1.5,
  platMin: 2.2, platMax: 2.7, riseMin: 0.6, riseMax: 1.25, gapFrac: 0.66,
  descendChance: 0.14, iceChance: 0.08, beamChance: 0.14, moverChance: 0.26, crumbleChance: 0.12,
  spinnerChance: 0.16, sliderChance: 0.12, hazPeriodMin: 1.5, hazPeriodMax: 2.3, hazardCap: 24,
  checkpointEvery: 6, startTop: 1, accent: THEME_NEON_NIGHT.accent,
};
const MAP_NEON: ParkourMap = {
  id: "neon_ascent", name: "Neon Ascent",
  tagline: "Kein Spaziergang mehr: brechende Plattformen, rotierende Balken, wackelige Lifte.",
  difficulty: "Leicht", theme: THEME_NEON_NIGHT,
  gravity: -20, jumpVelocity: 8.4, airJumps: 1, moveSpeed: 6.5, sprintMultiplier: 1.5, voidY: -16,
  ...buildCourse(NEON_PARAMS),
  rewardCredits: 160, rewardXp: 130, bestBonusCredits: 110, checkpointCredits: 14,
  medals: { diamond: 78000, gold: 105000, silver: 140000, bronze: 190000 },
};

const SKY_PARAMS: CourseParams = {
  seed: 52028, steps: 84,
  gravity: -18, jumpVelocity: 8.6, airJumps: 1, moveSpeed: 7, sprintMultiplier: 1.6,
  platMin: 2.0, platMax: 2.5, riseMin: 0.7, riseMax: 1.35, gapFrac: 0.72,
  descendChance: 0.16, iceChance: 0.12, beamChance: 0.16, moverChance: 0.3, crumbleChance: 0.15,
  spinnerChance: 0.2, sliderChance: 0.16, hazPeriodMin: 1.2, hazPeriodMax: 2.0, hazardCap: 32,
  checkpointEvery: 6, startTop: 1, accent: THEME_SKY_DAWN.accent,
};
const MAP_SKY: ParkourMap = {
  id: "sky_gardens", name: "Sky Gardens",
  tagline: "Timing-Hölle über den Wolken: kreisende Sägen, brechende Beete, viele bewegliche Stege.",
  difficulty: "Mittel", theme: THEME_SKY_DAWN,
  gravity: -18, jumpVelocity: 8.6, airJumps: 1, moveSpeed: 7, sprintMultiplier: 1.6, voidY: -22,
  ...buildCourse(SKY_PARAMS),
  rewardCredits: 300, rewardXp: 240, bestBonusCredits: 200, checkpointCredits: 22,
  medals: { diamond: 100000, gold: 135000, silver: 180000, bronze: 245000 },
};

const MAGMA_PARAMS: CourseParams = {
  seed: 53033, steps: 98,
  gravity: -24, jumpVelocity: 8.9, airJumps: 0, moveSpeed: 7, sprintMultiplier: 1.7,
  platMin: 1.7, platMax: 2.2, riseMin: 0.4, riseMax: 1.0, gapFrac: 0.74,
  descendChance: 0.14, iceChance: 0.1, beamChance: 0.24, moverChance: 0.26, crumbleChance: 0.18,
  spinnerChance: 0.24, sliderChance: 0.2, hazPeriodMin: 1.0, hazPeriodMax: 1.7, hazardCap: 38,
  checkpointEvery: 7, startTop: 1, accent: THEME_MAGMA.accent,
};
const MAP_MAGMA: ParkourMap = {
  id: "magma_rush", name: "Magma Rush",
  tagline: "Kein Doppelsprung, winzige brechende Stege, rasende Sägeblätter über der Lava. Gnadenlos.",
  difficulty: "Schwer", theme: THEME_MAGMA,
  gravity: -24, jumpVelocity: 8.9, airJumps: 0, moveSpeed: 7, sprintMultiplier: 1.7, voidY: -6,
  ...buildCourse(MAGMA_PARAMS),
  rewardCredits: 500, rewardXp: 380, bestBonusCredits: 360, checkpointCredits: 32,
  medals: { diamond: 130000, gold: 175000, silver: 235000, bronze: 320000 },
};

const VOID_PARAMS: CourseParams = {
  seed: 54041, steps: 118,
  gravity: -21, jumpVelocity: 8.9, airJumps: 1, moveSpeed: 7.2, sprintMultiplier: 1.6,
  platMin: 1.4, platMax: 1.9, riseMin: 0.7, riseMax: 1.4, gapFrac: 0.8,
  descendChance: 0.14, iceChance: 0.3, beamChance: 0.16, moverChance: 0.34, crumbleChance: 0.2,
  spinnerChance: 0.28, sliderChance: 0.22, hazPeriodMin: 0.9, hazPeriodMax: 1.5, hazardCap: 44,
  checkpointEvery: 7, startTop: 1, accent: THEME_VOID.accent,
};
const MAP_VOID: ParkourMap = {
  id: "void_spire", name: "Void Spire",
  tagline: "Der Albtraum-Turm: Eis überall, winzige brechende Landungen, ein Wald aus rotierenden Klingen.",
  difficulty: "Extrem", theme: THEME_VOID,
  gravity: -21, jumpVelocity: 8.9, airJumps: 1, moveSpeed: 7.2, sprintMultiplier: 1.6, voidY: -8,
  ...buildCourse(VOID_PARAMS),
  rewardCredits: 750, rewardXp: 560, bestBonusCredits: 540, checkpointCredits: 48,
  medals: { diamond: 165000, gold: 215000, silver: 290000, bronze: 390000 },
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

/** Deterministic center of a moving platform at run-time `t`, written INTO `out`
 * (no allocation — call this from per-frame code). */
export function moverCenterInto(m: ParkourMover, t: number, out: [number, number, number]): void {
  const phase = m.phase ?? 0;
  if (m.mode === "orbit") {
    const r = m.radius ?? 4;
    const ang = ((t / m.period + phase) % 1) * Math.PI * 2;
    out[0] = m.pos[0] + Math.cos(ang) * r; out[1] = m.pos[1]; out[2] = m.pos[2] + Math.sin(ang) * r;
    return;
  }
  const to = m.to ?? m.pos;
  const u = (((t / m.period + phase) % 1) + 1) % 1;
  const tri = u < 0.5 ? u * 2 : 2 - u * 2;
  out[0] = m.pos[0] + (to[0] - m.pos[0]) * tri;
  out[1] = m.pos[1] + (to[1] - m.pos[1]) * tri;
  out[2] = m.pos[2] + (to[2] - m.pos[2]) * tri;
}
/** Allocating convenience wrapper (do NOT use in per-frame hot paths). */
export function moverCenterAt(m: ParkourMover, t: number): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  moverCenterInto(m, t, out);
  return out;
}

// ── Hazard math (deterministic; shared by physics + render) ──
export function spinnerAngleAt(h: ParkourHazard, t: number): number {
  return (((t / h.period + (h.phase ?? 0)) % 1) + 1) % 1 * Math.PI * 2;
}
/** Slider (saw) position at `t`, written INTO `out` (no allocation). */
export function sliderPosInto(h: ParkourHazard, t: number, out: [number, number, number]): void {
  const to = h.to ?? h.pos;
  const u = (((t / h.period + (h.phase ?? 0)) % 1) + 1) % 1;
  const tri = u < 0.5 ? u * 2 : 2 - u * 2;
  out[0] = h.pos[0] + (to[0] - h.pos[0]) * tri;
  out[1] = h.pos[1] + (to[1] - h.pos[1]) * tri;
  out[2] = h.pos[2] + (to[2] - h.pos[2]) * tri;
}
export function sliderPosAt(h: ParkourHazard, t: number): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  sliderPosInto(h, t, out);
  return out;
}
/** Does the hazard touch the player's body right now? `feetY` = the player's
 * feet; the body cylinder spans [feetY-0.1 .. feetY+1.7]. Allocation-free (safe
 * to call every frame for every hazard). */
export function hazardHit(h: ParkourHazard, t: number, px: number, feetY: number, pz: number): boolean {
  const killR = h.killR;
  const bodyBot = feetY - 0.1, bodyTop = feetY + 1.7;
  if (h.kind === "slider") {
    // Inline slider position (NO array allocation).
    const to = h.to ?? h.pos;
    const u = (((t / h.period + (h.phase ?? 0)) % 1) + 1) % 1;
    const tri = u < 0.5 ? u * 2 : 2 - u * 2;
    const x = h.pos[0] + (to[0] - h.pos[0]) * tri;
    const y = h.pos[1] + (to[1] - h.pos[1]) * tri;
    const z = h.pos[2] + (to[2] - h.pos[2]) * tri;
    const dyBand = y < bodyBot ? bodyBot - y : y > bodyTop ? y - bodyTop : 0;
    const dx = px - x, dz = pz - z;
    return dx * dx + dyBand * dyBand + dz * dz < killR * killR;
  }
  // spinner: horizontal bar at height h.pos[1].
  const barY = h.pos[1];
  if (barY < bodyBot - killR || barY > bodyTop + killR) return false;
  const a = spinnerAngleAt(h, t);
  const len = h.length ?? 2.4;
  const ax = h.pos[0], az = h.pos[2];
  const abx = Math.cos(a) * len, abz = Math.sin(a) * len;
  const denom = abx * abx + abz * abz || 1;
  const tt = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / denom));
  const cxp = ax + abx * tt, czp = az + abz * tt;
  const dx = px - cxp, dz = pz - czp;
  const dyBand = barY < bodyBot ? bodyBot - barY : barY > bodyTop ? barY - bodyTop : 0;
  return dx * dx + dyBand * dyBand + dz * dz < killR * killR;
}
