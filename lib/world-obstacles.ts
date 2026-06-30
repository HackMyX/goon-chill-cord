import { WORLD_RADIUS } from "@/lib/world-config";
import { DEFAULT_WORLD_ENVIRONMENT, type WorldEnvironmentConfig } from "@/lib/world-environment-config";

// ─────────────────────────────────────────────────────────────────────────────
// EINE Quelle für kollidierbare Map-Strukturen: components/world/environment.tsx
// RENDERT daraus, und Player/Monster KOLLIDIEREN damit (components/world/
// player.tsx + monster.tsx). So passen Optik und Physik 1000% zusammen — man
// kann nicht durch Bäume/Ruinen laufen, niedrige Steine kann man überspringen.
// Deterministisch (mulberry32-Seeds) wie zuvor; dichte-abhängig (env-Config).
// ─────────────────────────────────────────────────────────────────────────────

export type ObstacleKind = "tree" | "rock" | "ruin" | "monument" | "wall" | "lamp" | "crate" | "roof" | "road" | "campfire";

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
  /** Zonen-Farbton (Wände/Dächer) — macht Orte optisch unterscheidbar. */
  tone?: number;
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
function pushWall(out: Obstacle[], axis: "x" | "z", x: number, z: number, half: number, h: number, tone = 0) {
  const t = 0.22; // halbe Wanddicke
  const hx = axis === "x" ? half : t;
  const hz = axis === "x" ? t : half;
  out.push({ kind: "wall", x, z, scale: 1, shape: "box", hx, hz, r: Math.max(hx, hz), blockH: h, h, len: half * 2, tone });
}

/** Haus: 4 Wände mit Türöffnungen auf MEHREREN Seiten (mehrere Ausgänge → man
 * sitzt nicht in der Falle). `intact` = höhere, gleichmäßige Wände + Dach;
 * sonst verfallene, ungleiche Ruinen-Wände. */
function emitHouse(out: Obstacle[], cx: number, cz: number, w: number, d: number, wallH: number, doorSides: number[], intact: boolean, rand: () => number, tone = 0) {
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
      pushWall(out, s.axis, s.x, s.z, s.half, h, tone);
      return;
    }
    const segHalf = (s.half - doorHalf) / 2;
    if (segHalf <= 0.2) return; // Türöffnung füllt die ganze Seite
    const off = doorHalf + segHalf;
    if (s.axis === "x") {
      pushWall(out, "x", s.x - off, s.z, segHalf, h, tone);
      pushWall(out, "x", s.x + off, s.z, segHalf, h, tone);
    } else {
      pushWall(out, "z", s.x, s.z - off, segHalf, h, tone);
      pushWall(out, "z", s.x, s.z + off, segHalf, h, tone);
    }
  });
  // Fast heile Häuser bekommen ein Dach (render-only, blockH 0 → keine Kollision).
  if (intact) {
    out.push({ kind: "roof", x: cx, z: cz, scale: 1, shape: "box", hx: hw + 0.25, hz: hd + 0.25, r: 0, blockH: 0, h: wallH, len: w, tone });
  }
}

/** Leerer Laden: 3 Wände (Front offen) + Verkaufstresen + Dach + Schild. */
function emitShop(out: Obstacle[], cx: number, cz: number, w: number, d: number, wallH: number, facing: number, rand: () => number, tone = 1) {
  const hw = w / 2;
  const hd = d / 2;
  type Side = { axis: "x" | "z"; x: number; z: number; half: number };
  const sides: Side[] = [
    { axis: "x", x: cx, z: cz + hd, half: hw },
    { axis: "x", x: cx, z: cz - hd, half: hw },
    { axis: "z", x: cx + hw, z: cz, half: hd },
    { axis: "z", x: cx - hw, z: cz, half: hd },
  ];
  sides.forEach((s, i) => {
    if (i === facing) return; // offene Schaufront
    pushWall(out, s.axis, s.x, s.z, s.half, wallH, tone);
  });
  // Tresen vor der offenen Front (niedrig, kollidierbar)
  const front = sides[facing];
  const counterH = 0.95;
  if (front.axis === "x") {
    out.push({ kind: "crate", x: front.x, z: front.z, scale: 1, shape: "box", hx: front.half * 0.8, hz: 0.28, r: front.half * 0.8, blockH: counterH, rot: 0 });
  } else {
    out.push({ kind: "crate", x: front.x, z: front.z, scale: 1, shape: "box", hx: 0.28, hz: front.half * 0.8, r: front.half * 0.8, blockH: counterH, rot: 0 });
  }
  // Dach (Beleuchtung kommt von den Straßenlaternen — NICHT im Eingang).
  out.push({ kind: "roof", x: cx, z: cz, scale: 1, shape: "box", hx: hw + 0.3, hz: hd + 0.3, r: 0, blockH: 0, h: wallH, tone });
}

/** Straße/Pfad (render-only, blockH 0): Mittelpunkt + Länge/Breite + Winkel. */
function addRoad(out: Obstacle[], x: number, z: number, len: number, width: number, rot: number) {
  out.push({ kind: "road", x, z, scale: 1, shape: "box", hx: len / 2, hz: width / 2, r: 0, blockH: 0, rot, len });
}

/** Pfad zwischen zwei Punkten (eine gestreckte Fläche; Länge entlang lokaler X). */
function roadBetween(out: Obstacle[], ax: number, az: number, bx: number, bz: number, width: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1) return;
  // Box-Länge liegt entlang lokaler +X; Rotation um Y so, dass +X → (dx,dz).
  addRoad(out, (ax + bx) / 2, (az + bz) / 2, len, width, Math.atan2(-dz, dx));
}

/** Wählt 2–3 verschiedene Türseiten (mehrere Ausgänge). */
function pickDoors(rand: () => number): number[] {
  const all = [0, 1, 2, 3];
  const n = 2 + Math.floor(rand() * 2);
  const picked: number[] = [];
  for (let k = 0; k < n; k++) picked.push(all.splice(Math.floor(rand() * all.length), 1)[0]);
  return picked;
}

// ── Orts-Generatoren (jeder erzeugt einen eigenständigen, erkennbaren Platz) ──

function addLamp(out: Obstacle[], x: number, z: number, rand: () => number) {
  out.push({ kind: "lamp", x, z, scale: 1, shape: "circle", r: 0.18, blockH: 3.2, hue: Math.floor(rand() * 3) });
}

/** Laternen entlang einer Straße — am Straßenrand, in Abständen, abwechselnd
 * links/rechts (nie in Türen, weil sie auf der Straße sitzen). */
function lampLine(out: Obstacle[], ax: number, az: number, bx: number, bz: number, spacing: number, rand: () => number) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1) return;
  const n = Math.max(1, Math.floor(len / spacing));
  const ux = dx / len;
  const uz = dz / len;
  const px = -uz; // Senkrechte (Straßenrand-Versatz)
  const pz = ux;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const side = i % 2 === 0 ? 1 : -1;
    addLamp(out, ax + dx * t + px * 3.2 * side, az + dz * t + pz * 3.2 * side, rand);
  }
}

/** Ein Gebäude (Haus / Laden / Ruine), dessen EINGANG zur Straße (doorSide) zeigt. */
function placeBuilding(out: Obstacle[], cx: number, cz: number, doorSide: number, rand: () => number, tone: number) {
  const back = doorSide ^ 1; // gegenüberliegende Seite = Hinterausgang (0↔1, 2↔3)
  const roll = rand();
  if (roll < 0.18) {
    emitShop(out, cx, cz, 4.5 + rand() * 1.0, 4 + rand() * 0.8, 2.4 + rand() * 0.4, doorSide, rand, tone);
  } else if (roll < 0.36) {
    emitHouse(out, cx, cz, 3.8 + rand() * 1.4, 3.8 + rand() * 1.4, 1.1 + rand() * 0.8, [doorSide, back], false, rand, tone); // Ruine
  } else if (roll < 0.52) {
    // Größeres „Anwesen" — breiter, etwas höher, zweite Tür seitlich.
    const w = 6.5 + rand() * 2.5;
    const d = 6 + rand() * 2;
    emitHouse(out, cx, cz, w, d, 3.2 + rand() * 0.9, [doorSide, doorSide < 2 ? 2 : 0], true, rand, tone);
  } else {
    const w = 4 + rand() * 1.6;
    const d = 4 + rand() * 1.6;
    const wallH = 2.3 + rand() * 0.7; // menschliche Höhe, keine riesigen Türme mehr
    emitHouse(out, cx, cz, w, d, wallH, [doorSide, back], true, rand, tone);
  }
}

/** Leerstehender Supermarkt: großes Gebäude, breiter Eingang zur Straße,
 * Regalreihen mit alten Sachen (niedrige Boxen) + Kasse + Flachdach + Schild. */
function emitSupermarket(out: Obstacle[], cx: number, cz: number, facing: number, rand: () => number) {
  const w = 12;
  const d = 8;
  const wallH = 3.4;
  const tone = 1;
  const hw = w / 2;
  const hd = d / 2;
  type Side = { axis: "x" | "z"; x: number; z: number; half: number };
  const sides: Side[] = [
    { axis: "x", x: cx, z: cz + hd, half: hw },
    { axis: "x", x: cx, z: cz - hd, half: hw },
    { axis: "z", x: cx + hw, z: cz, half: hd },
    { axis: "z", x: cx - hw, z: cz, half: hd },
  ];
  const entHalf = 2.2;
  sides.forEach((s, i) => {
    if (i !== facing) {
      pushWall(out, s.axis, s.x, s.z, s.half, wallH, tone);
      return;
    }
    const seg = (s.half - entHalf) / 2;
    if (seg <= 0.2) return;
    const off = entHalf + seg;
    if (s.axis === "x") {
      pushWall(out, "x", s.x - off, s.z, seg, wallH, tone);
      pushWall(out, "x", s.x + off, s.z, seg, wallH, tone);
    } else {
      pushWall(out, "z", s.x, s.z - off, seg, wallH, tone);
      pushWall(out, "z", s.x, s.z + off, seg, wallH, tone);
    }
  });
  // Zwei Regalreihen aus je zwei kürzeren Segmenten (mit Gang dazwischen) —
  // „alte Sachen". Niedrig (1.2) und schlank, kein Riesenblock.
  const front = sides[facing];
  for (let row = 0; row < 2; row++) {
    const rz = cz + (row === 0 ? -1.9 : 1.9);
    for (const seg of [-1, 1]) {
      out.push({ kind: "crate", x: cx + seg * (hw * 0.5), z: rz, scale: 1, shape: "box", hx: hw * 0.4, hz: 0.5, r: hw * 0.4, blockH: 1.2, rot: 0 });
    }
  }
  // Flachdach + Laterne NEBEN dem Eingang (nicht drin).
  out.push({ kind: "roof", x: cx, z: cz, scale: 1, shape: "box", hx: hw + 0.3, hz: hd + 0.3, r: 0, blockH: 0, h: wallH, tone });
  addLamp(out, cx - hw - 1, front.z, rand);
}

/** DORF: kompakte Hauptstraße mit gut auseinanderstehenden Häusern beidseitig
 * (Eingang zur Straße), Laternen am Rand, ein Supermarkt + ein Dorfplatz. */
function genVillage(out: Obstacle[], ox: number, oz: number, rand: () => number) {
  const tone = 0;
  const avHalf = 20;
  const setback = 10; // großzügiger Abstand Haus↔Straße → nicht beengt
  roadBetween(out, ox - avHalf, oz, ox + avHalf, oz, 5); // Hauptstraße (Ost–West)
  lampLine(out, ox - avHalf + 4, oz, ox + avHalf - 4, oz, 10, rand);

  // Häuser locker entlang der Straße (10er-Abstand, mittiger Platz frei).
  for (const lx of [-16, -6, 6, 16]) {
    placeBuilding(out, ox + lx, oz - setback, 0, rand, tone); // Nordreihe, Eingang nach Süden
  }
  for (const lx of [6, 16]) {
    placeBuilding(out, ox + lx, oz + setback, 1, rand, tone); // Südreihe rechts
  }
  // Supermarkt links auf der Südseite (Front zur Straße).
  emitSupermarket(out, ox - 11, oz + setback + 1, 1, rand);

  // Dorfplatz (offen): nur ein Brunnen/Denkmal + zwei Laternen — kein Clutter.
  out.push({ kind: "ruin", x: ox, z: oz - setback, scale: 1.1, r: 0.6, blockH: 2.2, rot: 0, h: 1.5 });
  addLamp(out, ox - 4, oz + 3, rand);
  addLamp(out, ox + 4, oz + 3, rand);
}

/** MARKT: zwei Reihen leerer Marktstände an einer Mittel-Gasse + Laternen. */
function genMarket(out: Obstacle[], ox: number, oz: number, rand: () => number) {
  const n = 4;
  const gap = 7;
  roadBetween(out, ox - (n * gap) / 2 - 3, oz, ox + (n * gap) / 2 + 3, oz, 5); // Mittel-Gasse
  lampLine(out, ox - (n * gap) / 2, oz, ox + (n * gap) / 2, oz, 9, rand);
  for (let i = 0; i < n; i++) {
    const sx = ox - ((n - 1) * gap) / 2 + i * gap;
    emitShop(out, sx, oz - 5, 4.4, 3.6, 2.5 + rand() * 0.5, 0, rand, 1); // Front zur Gasse (−z Seite zur Gasse → facing 0)
    emitShop(out, sx, oz + 5, 4.4, 3.6, 2.5 + rand() * 0.5, 1, rand, 1);
    // Markttisch direkt vor dem Stand
    out.push({ kind: "crate", x: sx, z: oz - 2.4, scale: 1, shape: "box", hx: 1.0, hz: 0.4, r: 1.0, blockH: 0.95, rot: 0 });
    out.push({ kind: "crate", x: sx, z: oz + 2.4, scale: 1, shape: "box", hx: 1.0, hz: 0.4, r: 1.0, blockH: 0.95, rot: 0 });
  }
}

/** RUINENFELD: zerfallene Wände, Säulen, Schutt — eingestürztes Viertel. */
function genRuinsField(out: Obstacle[], ox: number, oz: number, rand: () => number) {
  for (let i = 0; i < 5; i++) {
    emitHouse(out, ox + (rand() - 0.5) * 26, oz + (rand() - 0.5) * 26, 4 + rand() * 3, 4 + rand() * 3, 0.8 + rand() * 0.9, pickDoors(rand), false, rand, 2);
  }
  // einzelne stehengebliebene Wandstücke
  for (let i = 0; i < 8; i++) {
    const x = ox + (rand() - 0.5) * 30;
    const z = oz + (rand() - 0.5) * 30;
    const along = rand() < 0.5 ? "x" : "z";
    pushWall(out, along, x, z, 0.8 + rand() * 1.4, 1.0 + rand() * 1.4, 2);
  }
  // Säulen + Schutt (Felsen)
  for (let i = 0; i < 6; i++) {
    const scale = 0.85 + rand() * 0.7;
    out.push({ kind: "ruin", x: ox + (rand() - 0.5) * 28, z: oz + (rand() - 0.5) * 28, scale, r: 0.5 * scale, blockH: 2.2, rot: rand() * Math.PI * 2, h: 1.1 + rand() * 1.6 });
  }
  for (let i = 0; i < 10; i++) {
    const scale = 0.5 + rand() * 0.8;
    out.push({ kind: "rock", x: ox + (rand() - 0.5) * 30, z: oz + (rand() - 0.5) * 30, scale, r: 0.48 * scale, blockH: 0.5 * scale + 0.22, rot: rand() * Math.PI * 2 });
  }
}

/** WALD: dichte Bäume + Felsen mit einer kleinen Lichtung. */
function genForest(out: Obstacle[], ox: number, oz: number, rand: () => number) {
  const count = 46;
  const R = 24;
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = 4 + rand() * R;
    const x = ox + Math.cos(a) * r;
    const z = oz + Math.sin(a) * r;
    if (Math.hypot(x - ox, z - oz) < 6) continue; // kleine Lichtung in der Mitte
    const scale = 0.85 + rand() * 0.8;
    out.push({ kind: "tree", x, z, scale, r: 0.34 * scale, blockH: 3.2, hue: Math.floor(rand() * 3) });
  }
  for (let i = 0; i < 14; i++) {
    const scale = 0.5 + rand() * 0.9;
    out.push({ kind: "rock", x: ox + (rand() - 0.5) * R * 1.6, z: oz + (rand() - 0.5) * R * 1.6, scale, r: 0.48 * scale, blockH: 0.5 * scale + 0.22, rot: rand() * Math.PI * 2 });
  }
}

/** CAMP: Lagerfeuer + Zelte (gekippte Boxen) + Barrikade + ein paar Kisten. */
function genCamp(out: Obstacle[], ox: number, oz: number, rand: () => number) {
  out.push({ kind: "campfire", x: ox, z: oz, scale: 1, r: 0.6, blockH: 0.5 });
  // Zelte = niedrige gekippte Kisten rundum
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rand() * 0.5;
    const r = 3 + rand() * 1.5;
    const s = 0.9 + rand() * 0.4;
    out.push({ kind: "crate", x: ox + Math.cos(a) * r, z: oz + Math.sin(a) * r, scale: s, shape: "box", hx: s, hz: s * 0.7, r: s, blockH: s * 1.1, rot: a });
  }
  // Barrikade: ein paar kurze Wandstücke
  for (let i = 0; i < 3; i++) {
    const a = rand() * Math.PI * 2;
    const r = 6 + rand() * 2;
    pushWall(out, rand() < 0.5 ? "x" : "z", ox + Math.cos(a) * r, oz + Math.sin(a) * r, 1 + rand(), 0.9 + rand() * 0.6, 3);
  }
  out.push({ kind: "lamp", x: ox + 2, z: oz + 2, scale: 1, shape: "circle", r: 0.16, blockH: 3, hue: 0 });
}

/** WILDER GARTEN / HECKEN-LABYRINTH: ein umrandetes Heckengitter mit Pfaden +
 * ein paar Bäumen + Mittelplatz. Hecken = Wände mit grünem Ton (tone 4). */
function genMaze(out: Obstacle[], ox: number, oz: number, rand: () => number) {
  const n = 6;
  const cell = 3.4;
  const half = (n * cell) / 2;
  const tone = 4; // Hecke (grün)
  const hedgeH = 1.9;
  const entranceCol = Math.floor(n / 2);
  // Waagerechte Heckenstücke (Rand immer; innen ~50% → Pfade); ein Eingang im Süden.
  for (let gx = 0; gx < n; gx++) {
    for (let gz = 0; gz <= n; gz++) {
      const isBorder = gz === 0 || gz === n;
      if (!isBorder && rand() < 0.5) continue;
      if (gz === n && gx === entranceCol) continue; // Eingang
      pushWall(out, "x", ox - half + gx * cell + cell / 2, oz - half + gz * cell, cell / 2, hedgeH, tone);
    }
  }
  // Senkrechte Heckenstücke.
  for (let gx = 0; gx <= n; gx++) {
    for (let gz = 0; gz < n; gz++) {
      const isBorder = gx === 0 || gx === n;
      if (!isBorder && rand() < 0.5) continue;
      pushWall(out, "z", ox - half + gx * cell, oz - half + gz * cell + cell / 2, cell / 2, hedgeH, tone);
    }
  }
  // Wilde Bäume + Mittelplatz + Laterne am Eingang.
  for (let i = 0; i < 5; i++) {
    const s = 0.7 + rand() * 0.5;
    out.push({ kind: "tree", x: ox + (rand() - 0.5) * half * 1.6, z: oz + (rand() - 0.5) * half * 1.6, scale: s, r: 0.34 * s, blockH: 3.2, hue: Math.floor(rand() * 3) });
  }
  out.push({ kind: "ruin", x: ox, z: oz, scale: 0.9, r: 0.5, blockH: 2.2, rot: 0, h: 1.3 }); // Mittelpunkt
  addLamp(out, ox, oz - half - 2, rand);
}

export function buildObstacles(env: WorldEnvironmentConfig = DEFAULT_WORLD_ENVIRONMENT): Obstacle[] {
  const out: Obstacle[] = [];

  // Bäume — dicht über die GANZE Map gestreut, inkl. Außenring (sqrt-Verteilung
  // → gleichmäßige Flächendichte, keine leeren Ränder). Der dichte Wald kommt
  // zusätzlich als eigene Zone.
  {
    const rand = mulberry32(1337);
    const count = dens(170, env.treeDensity);
    const inner = 9;
    const outer = WORLD_RADIUS - 3;
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      // sqrt → flächengleiche Verteilung (sonst klumpt alles in der Mitte).
      const radius = Math.sqrt(inner * inner + rand() * (outer * outer - inner * inner));
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

  // Felsen — niedrig, ÜBERSPRINGBAR, ebenfalls flächendeckend.
  {
    const rand = mulberry32(7654);
    const inner = 5;
    const outer = WORLD_RADIUS - 3;
    const count = dens(130, env.rockDensity);
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = Math.sqrt(inner * inner + rand() * (outer * outer - inner * inner));
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

  // Verschiedene, verteilte Orte (nicht alles aufeinander): Dorf, Markt mit
  // leeren Läden, Ruinenfeld, dichter Wald + Überlebenden-Camp — jeweils an
  // einer eigenen, weit auseinanderliegenden Stelle der Map, mit Wegen verbunden.
  {
    const rand = mulberry32(80808);
    const dq = env.buildingDensity ?? 1;
    const at = (angFrac: number, distFrac: number) => {
      const a = angFrac * Math.PI * 2;
      const r = distFrac * (WORLD_RADIUS - 12);
      return { x: Math.cos(a) * r, z: Math.sin(a) * r };
    };
    if (dq > 0) {
      // 6 Orte gleichmäßig um die Map verteilt (≈60° auseinander) + verschiedene
      // Radien → klar getrennt, kein Overlap.
      const village = at(0.00, 0.34);
      const market = at(0.17, 0.62);
      const ruinsF = at(0.34, 0.66);
      const forest = at(0.50, 0.58);
      const camp = at(0.67, 0.70);
      const maze = at(0.84, 0.60);
      genVillage(out, village.x, village.z, rand);
      genMarket(out, market.x, market.z, rand);
      genRuinsField(out, ruinsF.x, ruinsF.z, rand);
      genForest(out, forest.x, forest.z, rand);
      genCamp(out, camp.x, camp.z, rand);
      genMaze(out, maze.x, maze.z, rand);
      // Ein paar Verbindungswege vom Dorf aus (nicht zu jedem — sonst Wirrwarr).
      roadBetween(out, village.x, village.z, market.x, market.z, 3);
      roadBetween(out, village.x, village.z, forest.x, forest.z, 2.6);
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
  for (let attempt = 0; attempt < 40; attempt++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = 4 + Math.random() * (WORLD_RADIUS - 12);
    let x = Math.cos(ang) * rad;
    let z = Math.sin(ang) * rad;
    // mehrfach rausschieben (mehrere überlappende Hindernisse auflösen)
    for (let k = 0; k < 4; k++) {
      const res = resolveObstacleCollision(obstacles, x, z, 0, 0.7);
      x = res.x;
      z = res.z;
    }
    // 3.5 Freiraum-Radius → der Spawn liegt immer im Freien, nie in/an einem
    // Gebäude oder zwischen engen Wänden.
    if (Math.hypot(x, z) < WORLD_RADIUS - 4 && !pointInsideBlocker(obstacles, x, z, 3.5)) {
      return { x, z };
    }
  }
  return { x: 0, z: 8 }; // Fallback (nahe, aber nicht im Monument bei z=-9)
}

/** Ist die Stelle frei (kein hohes Hindernis im Radius r)? Für Spawns. */
export function isSpawnClear(obstacles: Obstacle[] | null | undefined, x: number, z: number, r: number): boolean {
  return !pointInsideBlocker(obstacles, x, z, r);
}

/** Steckt der Punkt (Radius r) noch in einer hohen, blockierenden Struktur? */
function pointInsideBlocker(obstacles: Obstacle[] | null | undefined, x: number, z: number, r: number): boolean {
  if (!obstacles) return false;
  for (const o of obstacles) {
    if (o.blockH < 1.0) continue;
    if (o.shape === "box") {
      const hx = (o.hx ?? o.r) + r;
      const hz = (o.hz ?? o.r) + r;
      if (x > o.x - hx && x < o.x + hx && z > o.z - hz && z < o.z + hz) return true;
    } else {
      const d = o.r + r;
      if ((x - o.x) ** 2 + (z - o.z) ** 2 < d * d) return true;
    }
  }
  return false;
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

/**
 * Line-of-Sight: liegt zwischen Angreifer (a) und Ziel (b) eine BLOCKIERENDE
 * Struktur (Wand/Baum/Ruine/Monument, blockH ≥ minBlockH)? Wird im Kampf
 * benutzt, damit weder Spieler/Haustier noch Monster DURCH Wände treffen.
 * Niedrige Dinge (Kisten/Steine/Tresen) blockieren NICHT. Wird nur bei echten
 * Treffern aufgerufen (selten) → Sampling ist günstig genug.
 */
export function segmentBlockedByObstacle(
  obstacles: Obstacle[] | null | undefined,
  ax: number, az: number, bx: number, bz: number,
  minBlockH = 1.2,
): boolean {
  if (!obstacles || obstacles.length === 0) return false;
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 0.05) return false;
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  const reach = len / 2 + 1.5;
  // Schrittweite 0.18 < Wanddicke (0.44) → eine dünne Wand wird zuverlässig
  // getroffen und nicht „durchsampelt" (sonst Treffer durch die Wand).
  const steps = Math.max(2, Math.ceil(len / 0.18));
  for (const o of obstacles) {
    if (o.blockH < minBlockH) continue;
    const half = o.shape === "box" ? Math.max(o.hx ?? o.r, o.hz ?? o.r) : o.r;
    // Grobfilter: Hindernis zu weit von der Strecken-Mitte → kann nicht treffen.
    if (Math.hypot(o.x - mx, o.z - mz) > reach + half) continue;
    if (o.shape === "box") {
      const hx = o.hx ?? o.r;
      const hz = o.hz ?? o.r;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = ax + dx * t;
        const pz = az + dz * t;
        if (px >= o.x - hx && px <= o.x + hx && pz >= o.z - hz && pz <= o.z + hz) return true;
      }
    } else {
      const r2 = o.r * o.r;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = ax + dx * t - o.x;
        const pz = az + dz * t - o.z;
        if (px * px + pz * pz < r2) return true;
      }
    }
  }
  return false;
}
