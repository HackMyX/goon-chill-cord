import { WORLD_RADIUS } from "@/lib/world-config";
import { DEFAULT_WORLD_ENVIRONMENT, type WorldEnvironmentConfig } from "@/lib/world-environment-config";

// ─────────────────────────────────────────────────────────────────────────────
// EINE Quelle für kollidierbare Map-Strukturen: components/world/environment.tsx
// RENDERT daraus, und Player/Monster KOLLIDIEREN damit (components/world/
// player.tsx + monster.tsx). So passen Optik und Physik 1000% zusammen — man
// kann nicht durch Bäume/Ruinen laufen, niedrige Steine kann man überspringen.
// Deterministisch (mulberry32-Seeds) wie zuvor; dichte-abhängig (env-Config).
// ─────────────────────────────────────────────────────────────────────────────

export type ObstacleKind = "tree" | "rock" | "ruin" | "monument" | "wall" | "lamp" | "crate" | "roof";

export interface Obstacle {
  kind: ObstacleKind;
  x: number;
  z: number;
  scale: number;
  /** Form: "circle" (Radius r) oder "box" (Halb-Achsen hx/hz, achsen-ausgerichtet). */
  shape?: "circle" | "box";
  /** Kollisionsradius (Draufsicht) — bei shape "circle". */
  r: number;
  /** Box-Halb-Achsen (shape "box"). */
  hx?: number;
  hz?: number;
  /** Blockhöhe: liegt der Fußpunkt der Entität DARÜBER (Sprung), wird das
   * Hindernis ignoriert → niedrige Steine sind überspringbar, Bäume/Ruinen nicht. */
  blockH: number;
  hue?: number; // tree
  rot?: number; // rock / ruin
  h?: number; // ruin column / wall height
  /** Wand-Länge (Render). */
  len?: number;
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

/** Eine Wand-Segment (Box) als Hindernis. axis="x" → entlang X, sonst entlang Z. */
function pushWall(out: Obstacle[], axis: "x" | "z", x: number, z: number, half: number, h: number) {
  const t = 0.22; // halbe Wanddicke
  const hx = axis === "x" ? half : t;
  const hz = axis === "x" ? t : half;
  out.push({ kind: "wall", x, z, scale: 1, shape: "box", hx, hz, r: Math.max(hx, hz), blockH: h, h, len: half * 2 });
}

/** Haus: 4 Wände mit Türöffnungen auf MEHREREN Seiten (mehrere Ausgänge → man
 * sitzt nicht in der Falle). `intact` = höhere, gleichmäßige Wände + Dach;
 * sonst verfallene, ungleiche Ruinen-Wände. */
function emitHouse(out: Obstacle[], cx: number, cz: number, w: number, d: number, wallH: number, doorSides: number[], intact: boolean, rand: () => number) {
  const hw = w / 2;
  const hd = d / 2;
  const doorHalf = 0.75;
  type Side = { axis: "x" | "z"; x: number; z: number; half: number };
  const sides: Side[] = [
    { axis: "x", x: cx, z: cz + hd, half: hw },
    { axis: "x", x: cx, z: cz - hd, half: hw },
    { axis: "z", x: cx + hw, z: cz, half: hd },
    { axis: "z", x: cx - hw, z: cz, half: hd },
  ];
  sides.forEach((s, i) => {
    const h = intact ? wallH : wallH * (0.5 + rand() * 0.65); // heil = voll, Ruine = uneben/gebrochen
    if (!doorSides.includes(i)) {
      pushWall(out, s.axis, s.x, s.z, s.half, h);
      return;
    }
    const segHalf = (s.half - doorHalf) / 2;
    if (segHalf <= 0.2) return; // Türöffnung füllt die ganze Seite
    const off = doorHalf + segHalf;
    if (s.axis === "x") {
      pushWall(out, "x", s.x - off, s.z, segHalf, h);
      pushWall(out, "x", s.x + off, s.z, segHalf, h);
    } else {
      pushWall(out, "z", s.x, s.z - off, segHalf, h);
      pushWall(out, "z", s.x, s.z + off, segHalf, h);
    }
  });
  // Fast heile Häuser bekommen ein Dach (render-only, blockH 0 → keine Kollision).
  if (intact) {
    out.push({ kind: "roof", x: cx, z: cz, scale: 1, shape: "box", hx: hw + 0.25, hz: hd + 0.25, r: 0, blockH: 0, h: wallH, len: w });
  }
}

export function buildObstacles(env: WorldEnvironmentConfig = DEFAULT_WORLD_ENVIRONMENT): Obstacle[] {
  const out: Obstacle[] = [];

  // Bäume — hoher Stamm, NICHT überspringbar.
  {
    const rand = mulberry32(1337);
    const count = dens(120, env.treeDensity);
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
    const count = dens(90, env.rockDensity);
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

  // Verlassene/tote Stadt: Cluster aus dachlosen Ruinen-Häusern (Wände mit
  // Türöffnung) + Laternen + Kisten/Trümmer. buildingDensity steuert die Menge.
  {
    const rand = mulberry32(80808);
    // Mehr & größere Stadtviertel auf der größeren Map.
    const clusters = Math.max(0, Math.round(3.5 * (env.buildingDensity ?? 1)));
    // Hilfsfunktion: wähle 2–3 verschiedene Türseiten (mehrere Ausgänge).
    const pickDoors = () => {
      const all = [0, 1, 2, 3];
      const n = 2 + Math.floor(rand() * 2); // 2–3 Türen
      const picked: number[] = [];
      for (let k = 0; k < n; k++) picked.push(all.splice(Math.floor(rand() * all.length), 1)[0]);
      return picked;
    };
    for (let cl = 0; cl < clusters; cl++) {
      const ca = rand() * Math.PI * 2;
      const cr = 14 + rand() * (WORLD_RADIUS - 26);
      const ox = Math.cos(ca) * cr;
      const oz = Math.sin(ca) * cr;
      const spread = 22;
      const houses = 5 + Math.floor(rand() * 4); // 5–8 Häuser je Viertel
      for (let h = 0; h < houses; h++) {
        const intact = rand() < 0.45; // ~45% fast heil (mit Dach), Rest Ruine
        const w = (intact ? 4 : 3.5) + rand() * 3.5;
        const d = (intact ? 4 : 3.5) + rand() * 3.5;
        const wallH = intact ? 2.6 + rand() * 1.0 : 1.6 + rand() * 1.2;
        emitHouse(out, ox + (rand() - 0.5) * spread, oz + (rand() - 0.5) * spread, w, d, wallH, pickDoors(), intact, rand);
      }
      const lamps = 3 + Math.floor(rand() * 4);
      for (let l = 0; l < lamps; l++) {
        out.push({ kind: "lamp", x: ox + (rand() - 0.5) * spread, z: oz + (rand() - 0.5) * spread, scale: 1, shape: "circle", r: 0.18, blockH: 3.2, hue: Math.floor(rand() * 3) });
      }
      const crates = 4 + Math.floor(rand() * 5);
      for (let c2 = 0; c2 < crates; c2++) {
        const s = 0.4 + rand() * 0.4;
        out.push({ kind: "crate", x: ox + (rand() - 0.5) * spread, z: oz + (rand() - 0.5) * spread, scale: s, shape: "box", hx: s, hz: s, r: s, blockH: s * 1.4 + 0.18, rot: rand() * Math.PI * 2 });
      }
    }
    // Vereinzelte Ruinen-Häuser quer über die Map (apokalyptisch verstreut).
    const strays = Math.round(6 * (env.buildingDensity ?? 1));
    for (let s = 0; s < strays; s++) {
      const a = rand() * Math.PI * 2;
      const r = 16 + rand() * (WORLD_RADIUS - 24);
      emitHouse(out, Math.cos(a) * r, Math.sin(a) * r, 3.5 + rand() * 2.5, 3.5 + rand() * 2.5, 1.3 + rand() * 1.1, pickDoors(), false, rand);
    }
  }

  // Zentrales Monument (bei z = -9) — feste Kollision, nicht überspringbar.
  if (env.monument) {
    out.push({ kind: "monument", x: 0, z: -9, scale: 1, r: 1.25, blockH: 5 });
  }

  return out;
}

/** Zufälliger, gültiger Spawn-Punkt: irgendwo in der Welt, nicht in einem
 * Hindernis (rausgeschoben), mit Mindestabstand zum Rand. */
export function randomSpawnPoint(obstacles: Obstacle[] | null | undefined): { x: number; z: number } {
  for (let attempt = 0; attempt < 30; attempt++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * (WORLD_RADIUS - 8);
    let x = Math.cos(ang) * rad;
    let z = Math.sin(ang) * rad;
    const res = resolveObstacleCollision(obstacles, x, z, 0, 0.6);
    x = res.x;
    z = res.z;
    // gültig, wenn nach dem Rausschieben noch im Spielfeld
    if (Math.hypot(x, z) < WORLD_RADIUS - 4) return { x, z };
  }
  return { x: 0, z: 8 }; // Fallback (nahe, aber nicht im Monument bei z=-9)
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
    if (o.shape === "box") {
      const hx = o.hx ?? o.r;
      const hz = o.hz ?? o.r;
      // nächster Punkt der AABB zum Entitätszentrum
      const cx = Math.max(o.x - hx, Math.min(nx, o.x + hx));
      const cz = Math.max(o.z - hz, Math.min(nz, o.z + hz));
      const dx = nx - cx;
      const dz = nz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= entR * entR) continue;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = entR - d;
        nx += (dx / d) * push;
        nz += (dz / d) * push;
      } else {
        // Zentrum IN der Box → an nächster Fläche rausschieben
        const toR = o.x + hx + entR - nx;
        const toL = nx - (o.x - hx - entR);
        const toT = o.z + hz + entR - nz;
        const toB = nz - (o.z - hz - entR);
        const m = Math.min(toR, toL, toT, toB);
        if (m === toL) nx = o.x - hx - entR;
        else if (m === toR) nx = o.x + hx + entR;
        else if (m === toB) nz = o.z - hz - entR;
        else nz = o.z + hz + entR;
      }
      continue;
    }
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
    if (o.blockH > 1.4) continue; // zu hoch zum Springen (Baum/Ruine/Wand) → drumrum
    if (o.shape === "box") {
      const hx = o.hx ?? o.r;
      const hz = o.hz ?? o.r;
      const cx = Math.max(o.x - hx, Math.min(aheadX, o.x + hx));
      const cz = Math.max(o.z - hz, Math.min(aheadZ, o.z + hz));
      const dx = aheadX - cx;
      const dz = aheadZ - cz;
      if (dx * dx + dz * dz < entR * entR) return true;
      continue;
    }
    const dx = aheadX - o.x;
    const dz = aheadZ - o.z;
    const minD = o.r + entR;
    if (dx * dx + dz * dz < minD * minD) return true;
  }
  return false;
}
