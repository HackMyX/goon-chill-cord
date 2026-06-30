import { WORLD_RADIUS } from "@/lib/world-config";
import type { Obstacle } from "@/lib/world-obstacles";

// ─────────────────────────────────────────────────────────────────────────────
// Navigations-Gitter + A*-Wegfindung für SCHLAUE Boden-Monster. buildNavGrid()
// markiert alle Zellen, die von einer NICHT überspringbaren Struktur (Wand, Baum,
// Ruine, Hecke; blockH > 1.2) belegt sind. findPath() läuft A* auf dem 8er-Gitter
// → die Monster gehen automatisch AUSSEN HERUM oder durch den Labyrinth-Eingang
// zum Spieler, statt blöd an der Wand zu warten. Niedrige Steine/Kisten (blockH
// ≤ 1.2) sind frei begehbar (Monster springen drüber).
// ─────────────────────────────────────────────────────────────────────────────

export const NAV_CELL = 1.4;

export interface NavGrid {
  size: number;
  cell: number;
  origin: number; // Weltkoordinate der Zelle (0,0)-Mitte minus halbe Zelle
  blocked: Uint8Array;
}

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function buildNavGrid(obstacles: Obstacle[] | null | undefined): NavGrid {
  const cell = NAV_CELL;
  const origin = -WORLD_RADIUS - cell;
  const span = WORLD_RADIUS * 2 + cell * 2;
  const size = Math.ceil(span / cell);
  const blocked = new Uint8Array(size * size);
  const worldToCell = (w: number) => clampInt(Math.floor((w - origin) / cell), 0, size - 1);
  if (obstacles) {
    const margin = 0.5; // Monster-Radius-Puffer
    for (const o of obstacles) {
      if (o.blockH <= 1.2) continue; // überspringbar/niedrig → frei
      if (o.shape === "box") {
        const hx = (o.hx ?? o.r) + margin;
        const hz = (o.hz ?? o.r) + margin;
        const x0 = worldToCell(o.x - hx), x1 = worldToCell(o.x + hx);
        const z0 = worldToCell(o.z - hz), z1 = worldToCell(o.z + hz);
        for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) blocked[gz * size + gx] = 1;
      } else {
        const r = o.r + margin;
        const x0 = worldToCell(o.x - r), x1 = worldToCell(o.x + r);
        const z0 = worldToCell(o.z - r), z1 = worldToCell(o.z + r);
        const r2 = r * r;
        for (let gz = z0; gz <= z1; gz++) {
          for (let gx = x0; gx <= x1; gx++) {
            const cx = origin + (gx + 0.5) * cell;
            const cz = origin + (gz + 0.5) * cell;
            if ((cx - o.x) ** 2 + (cz - o.z) ** 2 <= r2) blocked[gz * size + gx] = 1;
          }
        }
      }
    }
  }
  return { size, cell, origin, blocked };
}

function cellOf(grid: NavGrid, w: number): number {
  return clampInt(Math.floor((w - grid.origin) / grid.cell), 0, grid.size - 1);
}
function centerOf(grid: NavGrid, g: number): number {
  return grid.origin + (g + 0.5) * grid.cell;
}
function isFree(grid: NavGrid, gx: number, gz: number): boolean {
  if (gx < 0 || gz < 0 || gx >= grid.size || gz >= grid.size) return false;
  return grid.blocked[gz * grid.size + gx] === 0;
}

/** Nächste freie Zelle in wachsenden Ringen (für Start/Ziel, die in/an einer
 * Wand liegen). */
function nearestFree(grid: NavGrid, gx: number, gz: number): [number, number] | null {
  if (isFree(grid, gx, gz)) return [gx, gz];
  for (let rad = 1; rad <= 8; rad++) {
    for (let dz = -rad; dz <= rad; dz++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== rad) continue;
        if (isFree(grid, gx + dx, gz + dz)) return [gx + dx, gz + dz];
      }
    }
  }
  return null;
}

const NEI = [
  [1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10],
  [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14],
];

/**
 * A* von (sx,sz) nach (gx,gz) in Weltkoordinaten. Gibt geglättete Weltwegpunkte
 * zurück (oder null, wenn unerreichbar). Iterations-Limit verhindert Lags.
 */
export function findPath(
  grid: NavGrid,
  sx: number, sz: number,
  gxw: number, gzw: number,
  maxIter = 6000,
): { x: number; z: number }[] | null {
  const start = nearestFree(grid, cellOf(grid, sx), cellOf(grid, sz));
  const goal = nearestFree(grid, cellOf(grid, gxw), cellOf(grid, gzw));
  if (!start || !goal) return null;
  const size = grid.size;
  const startI = start[1] * size + start[0];
  const goalI = goal[1] * size + goal[0];
  if (startI === goalI) return [{ x: gxw, z: gzw }];

  const g = new Float32Array(size * size).fill(Infinity);
  const f = new Float32Array(size * size).fill(Infinity);
  const came = new Int32Array(size * size).fill(-1);
  const closed = new Uint8Array(size * size);
  const open: number[] = [startI]; // einfache Liste (kleiner Suchraum, throttled)
  g[startI] = 0;
  const h = (i: number) => {
    const cx = i % size, cz = (i / size) | 0;
    return (Math.abs(cx - goal[0]) + Math.abs(cz - goal[1])) * 10;
  };
  f[startI] = h(startI);

  let iter = 0;
  while (open.length && iter++ < maxIter) {
    // billigstes f finden
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;
    const cur = open[bi];
    if (cur === goalI) break;
    open[bi] = open[open.length - 1];
    open.pop();
    closed[cur] = 1;
    const cx = cur % size, cz = (cur / size) | 0;
    for (const [dx, dz, cost] of NEI) {
      const nx = cx + dx, nz = cz + dz;
      if (!isFree(grid, nx, nz)) continue;
      // Diagonale nur, wenn beide Seiten frei (kein Ecken-Durchschneiden).
      if (dx !== 0 && dz !== 0 && (!isFree(grid, cx + dx, cz) || !isFree(grid, cx, cz + dz))) continue;
      const ni = nz * size + nx;
      if (closed[ni]) continue;
      const tentative = g[cur] + cost;
      if (tentative < g[ni]) {
        came[ni] = cur;
        g[ni] = tentative;
        f[ni] = tentative + h(ni);
        if (!open.includes(ni)) open.push(ni);
      }
    }
  }

  if (came[goalI] === -1 && startI !== goalI) {
    // Ziel nicht erreicht → bestes erreichtes Feld Richtung Ziel nehmen.
    let best = -1, bestH = Infinity;
    for (let i = 0; i < closed.length; i++) {
      if (!closed[i]) continue;
      const hv = h(i);
      if (hv < bestH) { bestH = hv; best = i; }
    }
    if (best < 0) return null;
    return rebuild(grid, came, best, sx, sz);
  }
  return rebuild(grid, came, goalI, sx, sz, gxw, gzw);
}

function rebuild(
  grid: NavGrid, came: Int32Array, endI: number,
  sx: number, sz: number, goalX?: number, goalZ?: number,
): { x: number; z: number }[] {
  const size = grid.size;
  const cells: number[] = [];
  let i = endI;
  while (i !== -1) { cells.push(i); i = came[i]; }
  cells.reverse();
  const pts: { x: number; z: number }[] = [];
  for (const c of cells) pts.push({ x: centerOf(grid, c % size), z: centerOf(grid, (c / size) | 0) });
  if (goalX !== undefined && goalZ !== undefined) pts.push({ x: goalX, z: goalZ });
  // Glätten: kollineare Zwischenpunkte entfernen.
  const out: { x: number; z: number }[] = [];
  for (let k = 0; k < pts.length; k++) {
    if (k === 0 || k === pts.length - 1) { out.push(pts[k]); continue; }
    const a = pts[k - 1], b = pts[k], c = pts[k + 1];
    const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    if (Math.abs(cross) > 0.01) out.push(b);
  }
  // ersten Wegpunkt überspringen, wenn er praktisch die Startposition ist.
  if (out.length > 1 && Math.hypot(out[0].x - sx, out[0].z - sz) < grid.cell) out.shift();
  return out;
}
