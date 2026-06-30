import { WORLD_RADIUS } from "@/lib/world-config";
import { DEFAULT_WORLD_ENVIRONMENT, type WorldEnvironmentConfig } from "@/lib/world-environment-config";

// ─────────────────────────────────────────────────────────────────────────────
// EINE Quelle für kollidierbare Map-Strukturen: components/world/environment.tsx
// RENDERT daraus, und Player/Monster KOLLIDIEREN damit (components/world/
// player.tsx + monster.tsx). So passen Optik und Physik 1000% zusammen — man
// kann nicht durch Bäume/Ruinen laufen, niedrige Steine kann man überspringen.
// Deterministisch (mulberry32-Seeds) wie zuvor; dichte-abhängig (env-Config).
// ─────────────────────────────────────────────────────────────────────────────

export type ObstacleKind = "tree" | "rock" | "ruin" | "monument";

export interface Obstacle {
  kind: ObstacleKind;
  x: number;
  z: number;
  scale: number;
  /** Kollisionsradius (Draufsicht). */
  r: number;
  /** Blockhöhe: liegt der Fußpunkt der Entität DARÜBER (Sprung), wird das
   * Hindernis ignoriert → niedrige Steine sind überspringbar, Bäume/Ruinen nicht. */
  blockH: number;
  hue?: number; // tree
  rot?: number; // rock / ruin
  h?: number; // ruin column height
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dens = (base: number, mul: number) => Math.max(0, Math.round(base * mul));

export function buildObstacles(env: WorldEnvironmentConfig = DEFAULT_WORLD_ENVIRONMENT): Obstacle[] {
  const out: Obstacle[] = [];

  // Bäume — hoher Stamm, NICHT überspringbar.
  {
    const rand = mulberry32(1337);
    const count = dens(80, env.treeDensity);
    const inner = 11;
    const outer = WORLD_RADIUS - 6;
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = inner + rand() * (outer - inner);
      const scale = 0.8 + rand() * 0.7;
      out.push({
        kind: "tree",
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        scale,
        r: 0.34 * scale,
        blockH: 3.2,
        hue: Math.floor(rand() * 3),
      });
    }
  }

  // Felsen — niedrig, ÜBERSPRINGBAR.
  {
    const rand = mulberry32(7654);
    const outer = WORLD_RADIUS - 6;
    const count = dens(55, env.rockDensity);
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = 5 + rand() * (outer - 5);
      const scale = 0.55 + rand() * 0.9;
      out.push({
        kind: "rock",
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        scale,
        r: 0.48 * scale,
        blockH: 0.5 * scale + 0.22, // niedrig → überspringbar
        rot: rand() * Math.PI * 2,
      });
    }
  }

  // Ruinen-Säulen (in Clustern) — hoch, NICHT überspringbar.
  {
    const rand = mulberry32(31337);
    const count = dens(16, env.ruinDensity);
    const clusters = Math.max(1, Math.ceil(count / 4));
    let made = 0;
    for (let cl = 0; cl < clusters && made < count; cl++) {
      const ca = rand() * Math.PI * 2;
      const cr = 16 + rand() * (WORLD_RADIUS - 22);
      const cx = Math.cos(ca) * cr;
      const cz = Math.sin(ca) * cr;
      const per = Math.min(4, count - made);
      for (let i = 0; i < per; i++) {
        const scale = 0.85 + rand() * 0.7;
        out.push({
          kind: "ruin",
          x: cx + (rand() - 0.5) * 4.5,
          z: cz + (rand() - 0.5) * 4.5,
          scale,
          r: 0.5 * scale,
          blockH: 2.2,
          rot: rand() * Math.PI * 2,
          h: 1.1 + rand() * 1.6,
        });
        made++;
      }
    }
  }

  // Zentrales Monument (bei z = -9) — feste Kollision, nicht überspringbar.
  if (env.monument) {
    out.push({ kind: "monument", x: 0, z: -9, scale: 1, r: 1.25, blockH: 5 });
  }

  return out;
}

/**
 * Schiebt eine Entität (Kreis-Radius entR, Fußhöhe y) aus überlappenden
 * Hindernissen heraus (Gleiten an der Kante). Hindernisse, deren Blockhöhe
 * unter der Fußhöhe liegt (drübergesprungen), werden ignoriert. Gibt die
 * korrigierte Position zurück.
 */
export function resolveObstacleCollision(
  obstacles: Obstacle[] | null | undefined,
  x: number,
  z: number,
  y: number,
  entR: number,
): { x: number; z: number } {
  if (!obstacles || obstacles.length === 0) return { x, z };
  let nx = x;
  let nz = z;
  for (const o of obstacles) {
    if (y >= o.blockH) continue; // drüber (gesprungen)
    const dx = nx - o.x;
    const dz = nz - o.z;
    const minD = o.r + entR;
    const d2 = dx * dx + dz * dz;
    if (d2 >= minD * minD) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const push = minD - d;
      nx += (dx / d) * push;
      nz += (dz / d) * push;
    } else {
      nx += minD; // exakt im Zentrum → beliebig rausschieben
    }
  }
  return { x: nx, z: nz };
}

/** Liegt direkt vor (Bewegungsrichtung) ein ÜBERSPRINGBARES Hindernis nah genug,
 * dass die Entität springen sollte? Für Monster-KI (springen über Steine). */
export function shouldJumpObstacle(
  obstacles: Obstacle[] | null | undefined,
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  entR: number,
  y: number,
): boolean {
  if (!obstacles) return false;
  const aheadX = x + dirX * (entR + 0.5);
  const aheadZ = z + dirZ * (entR + 0.5);
  for (const o of obstacles) {
    if (o.blockH <= 0.05) continue;
    if (y >= o.blockH) continue; // schon drüber
    if (o.blockH > 1.4) continue; // zu hoch zum Springen (Baum/Ruine) → drumrum
    const dx = aheadX - o.x;
    const dz = aheadZ - o.z;
    const minD = o.r + entR;
    if (dx * dx + dz * dz < minD * minD) return true;
  }
  return false;
}
