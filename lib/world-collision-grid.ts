// ─────────────────────────────────────────────────────────────────────────────
// Räumliche Hash-Broadphase für die Kollision/Sichtlinien-Abfragen
// (lib/world-obstacles.ts). Bucketed die Hindernisse in ~4er-Zellen; eine Abfrage
// holt nur die Hindernisse aus den nahen Zellen statt ALLE linear zu scannen
// (O(Entitäten × Hindernisse) → O(Entitäten × wenige)). Bei der dichten Post-
// Apokalypse-Geometrie (Supermarkt-Regale, großes Labyrinth, Ruinen, viele Mobs)
// ist das der eigentliche Frame-Cost-Gewinn.
//
// PARITÄT (multiplayer-kritisch!): Der Aufrufer iteriert die Kandidaten in
// AUFSTEIGENDER Index-Reihenfolge (= Array-Reihenfolge) und führt EXAKT dieselbe
// Pro-Hindernis-Mathematik aus wie der frühere Linear-Scan. Nicht-eingesammelte
// Hindernisse wären im Linear-Scan No-Ops (zu weit weg) → das Ergebnis ist
// bitgleich. So kann die Kollision NICHT zwischen Clients divergieren.
// ─────────────────────────────────────────────────────────────────────────────

import { WORLD_RADIUS } from "@/lib/world-config";

export const COLLISION_CELL = 4;

/** Minimal-Form, die zum Bucketen reicht (Obstacle erfüllt sie strukturell —
 * vermeidet einen zirkulären Laufzeit-Import). */
interface BoxLike {
  x: number;
  z: number;
  shape?: "circle" | "box";
  r: number;
  hx?: number;
  hz?: number;
}

export interface CollisionGrid {
  cell: number;
  origin: number;
  size: number;
  /** Pro Zelle die Liste der Hindernis-Indizes (lazy alloziert). */
  buckets: (number[] | undefined)[];
}

export function buildCollisionGrid(obstacles: BoxLike[]): CollisionGrid {
  const cell = COLLISION_CELL;
  const origin = -WORLD_RADIUS - cell;
  const span = WORLD_RADIUS * 2 + cell * 2;
  const size = Math.ceil(span / cell);
  const buckets: (number[] | undefined)[] = new Array(size * size);
  const toCell = (w: number) => {
    const c = Math.floor((w - origin) / cell);
    return c < 0 ? 0 : c >= size ? size - 1 : c;
  };
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    const hx = o.shape === "box" ? (o.hx ?? o.r) : o.r;
    const hz = o.shape === "box" ? (o.hz ?? o.r) : o.r;
    const x0 = toCell(o.x - hx), x1 = toCell(o.x + hx);
    const z0 = toCell(o.z - hz), z1 = toCell(o.z + hz);
    for (let gz = z0; gz <= z1; gz++) {
      for (let gx = x0; gx <= x1; gx++) {
        const k = gz * size + gx;
        const b = buckets[k] ?? (buckets[k] = []);
        b.push(i);
      }
    }
  }
  return { cell, origin, size, buckets };
}

/**
 * Sammelt die EINDEUTIGEN, AUFSTEIGEND SORTIERTEN Hindernis-Indizes, deren Zelle
 * die AABB [minx,maxx]×[minz,maxz] berührt. Sortiert → Aufrufer verarbeitet in
 * Array-Reihenfolge (Paritäts-Garantie, s.o.).
 */
export function gatherCandidates(
  grid: CollisionGrid,
  minx: number, minz: number, maxx: number, maxz: number,
): number[] {
  const { cell, origin, size, buckets } = grid;
  const toCell = (w: number) => {
    const c = Math.floor((w - origin) / cell);
    return c < 0 ? 0 : c >= size ? size - 1 : c;
  };
  const x0 = toCell(minx), x1 = toCell(maxx);
  const z0 = toCell(minz), z1 = toCell(maxz);
  const out: number[] = [];
  // Bei einer einzelnen Zelle (häufigster Fall) ist der Bucket bereits eindeutig
  // → keine Set-Dedup nötig.
  if (x0 === x1 && z0 === z1) {
    const b = buckets[z0 * size + x0];
    return b ? b.slice().sort((a, c) => a - c) : out;
  }
  const seen = new Set<number>();
  for (let gz = z0; gz <= z1; gz++) {
    for (let gx = x0; gx <= x1; gx++) {
      const b = buckets[gz * size + gx];
      if (!b) continue;
      for (const idx of b) {
        if (!seen.has(idx)) { seen.add(idx); out.push(idx); }
      }
    }
  }
  out.sort((a, b) => a - b);
  return out;
}
