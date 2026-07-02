// scripts/parkour-validate-core.mjs
// EINE Quelle der Wahrheit für die Parkour-Solvability-Prüfung. Wird von
// validate-parkour-maps.mjs (CLI) UND search-parkour-seed.mjs (Seed-Suche) genutzt,
// damit „schaffbar" überall exakt dasselbe bedeutet. Muss mit den Engine-Konstanten
// aus components/parkour/parkour-player.tsx synchron bleiben.

import { moverCenterAt } from "../lib/parkour-config.ts";

// ── Engine-Konstanten (identisch zu parkour-player.tsx) ──
export const R = 0.42;
export const H = 1.7;
// Lande-Reichweite = Fußabdruck (kein Ledge-Pull-in mehr — siehe parkour-player.tsx).
export const REACH = R;

export function aabb(pos, size) {
  const [cx, cy, cz] = pos;
  const [sx, sy, sz] = size;
  return {
    minX: cx - sx / 2, maxX: cx + sx / 2,
    minZ: cz - sz / 2, maxZ: cz + sz / 2,
    top: cy + sy / 2, bottom: cy - sy / 2, cx, cz,
  };
}

/** Simuliert einen Sprung von A Richtung B; schaffbar, wenn IRGENDEINE
 * Geschwindigkeit+Timing auf B oben landet (nicht seitlich blockiert wird). */
export function jumpReaches(map, A, B) {
  const g = map.gravity, vJ = map.jumpVelocity, air = map.airJumps;
  const vXmax = map.moveSpeed * map.sprintMultiplier;
  const sx = Math.max(A.minX, Math.min(B.cx, A.maxX));
  const sz = Math.max(A.minZ, Math.min(B.cz, A.maxZ));
  const dx = B.cx - sx, dz = B.cz - sz;
  const len = Math.hypot(dx, dz) || 1e-6;
  const ux = dx / len, uz = dz / len;

  const apex = vJ / Math.abs(g);
  const djCandidates = air > 0 ? [null, 0.0, apex * 0.5, apex, apex * 1.4] : [null];
  const speedFracs = [0.25, 0.4, 0.55, 0.7, 0.85, 1.0];

  for (const frac of speedFracs) {
    const vX = vXmax * frac;
    for (const dj of djCandidates) {
      let x = sx, z = sz, y = A.top, vv = vJ, used = 0, t = 0, prevY = y;
      let triggered = dj === null;
      const dt = 1 / 120;
      let ok = false;
      while (t < 5) {
        if (!triggered && air > 0 && used < air && t >= dj) { vv = vJ * 0.92; used++; triggered = true; }
        prevY = y;
        vv += g * dt; y += vv * dt;
        x += ux * vX * dt; z += uz * vX * dt;
        if (vv <= 0 && prevY > B.top - 0.001 && y <= B.top + 0.03 &&
            x > B.minX - REACH && x < B.maxX + REACH && z > B.minZ - REACH && z < B.maxZ + REACH) {
          ok = true; break;
        }
        if (y < B.top - 0.06 &&
            x > B.minX - R && x < B.maxX + R && z > B.minZ - R && z < B.maxZ + R) {
          break; // SOLID side blocks this trajectory
        }
        if (y < B.top - 10) break;
        t += dt;
      }
      if (ok) return true;
    }
  }
  return false;
}

export function overlapsXZ(a, b) {
  return !(a.maxX <= b.minX || a.minX >= b.maxX || a.maxZ <= b.minZ || a.minZ >= b.maxZ);
}

/** Validate ONE map object ({gravity,jumpVelocity,airJumps,moveSpeed,sprintMultiplier,
 * platforms,movers,checkpoints,routeHint,start,finish,finishSize}). Returns
 * { ok, problems[] }. Pure — no console output. */
export function validateMap(map, { stopEarly = false } = {}) {
  const problems = [];
  const boxes = map.platforms.map((p) => ({ ...aabb(p.pos, p.size), kill: !!p.kill }));
  const finishBox = aabb(map.finish, map.finishSize);

  const nodeCandidates = (n) => {
    if (n.kind === "mover") {
      const m = map.movers[n.index];
      const K = 6;
      return Array.from({ length: K }, (_, k) => aabb(moverCenterAt(m, (m.period * k) / K), m.size));
    }
    return [boxes[n.index]];
  };
  const routeNodes = (map.routeHint && map.routeHint.length
    ? map.routeHint.map(nodeCandidates)
    : boxes.filter((b) => !b.kill).map((b) => [b]));
  const nodes = [...routeNodes, [finishBox]];

  const startBox = boxes.find((b) =>
    map.start[0] >= b.minX && map.start[0] <= b.maxX && map.start[2] >= b.minZ && map.start[2] <= b.maxZ);
  if (!startBox) problems.push(`Start (${map.start}) liegt auf keiner Plattform.`);
  else if (Math.abs(startBox.top - map.start[1]) > 0.4) problems.push(`Start-Höhe passt nicht (${map.start[1]} vs ${startBox.top.toFixed(2)}).`);

  for (let i = 0; i < nodes.length - 1; i++) {
    const A = nodes[i], B = nodes[i + 1];
    let reachable = false;
    for (const a of A) { for (const b of B) { if (jumpReaches(map, a, b)) { reachable = true; break; } } if (reachable) break; }
    if (!reachable) {
      const a0 = A[0], b0 = B[0];
      const rise = b0.top - a0.top;
      const dist = Math.hypot(b0.cx - a0.cx, b0.cz - a0.cz);
      const label = i === nodes.length - 2 ? "→ FINISH" : `#${i} → #${i + 1}`;
      problems.push(`UNERREICHBAR ${label}: Anstieg ${rise.toFixed(2)}, Distanz ${dist.toFixed(2)}.`);
      if (stopEarly) return { ok: false, problems, transitions: nodes.length - 1 };
    }
  }

  const all = [...boxes.map((b, i) => ({ b, name: `P#${i}` })), { b: finishBox, name: "FINISH" }];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i].b, c = all[j].b;
      if (!overlapsXZ(a, c)) continue;
      const upper = a.top >= c.top ? a : c;
      const lower = a.top >= c.top ? c : a;
      const clearance = upper.bottom - lower.top;
      if (clearance > -0.05 && clearance < H) {
        problems.push(`ÜBERLAPPUNG ${all[i].name}/${all[j].name}: nur ${clearance.toFixed(2)} frei (< ${H}).`);
        if (stopEarly) return { ok: false, problems, transitions: nodes.length - 1 };
      }
    }
  }

  for (const cp of map.checkpoints) {
    const on = boxes.find((b) =>
      cp.pos[0] >= b.minX - 0.6 && cp.pos[0] <= b.maxX + 0.6 &&
      cp.pos[2] >= b.minZ - 0.6 && cp.pos[2] <= b.maxZ + 0.6 &&
      Math.abs(b.top - cp.pos[1]) < 1.0);
    if (!on) problems.push(`Checkpoint ${cp.index} sitzt auf keiner Plattform-Oberkante.`);
  }

  return { ok: problems.length === 0, problems, transitions: nodes.length - 1 };
}

/** Difficulty metrics for a built course — used to compare/score how "wild & hard"
 * a candidate is (higher = harder). Pure geometry, no judgement. */
export function courseMetrics(geo, params) {
  const plats = geo.platforms;
  const movers = geo.movers;
  const nPlat = plats.length, nMover = movers.length;
  const crumble = plats.filter((p) => p.crumble).length;
  const ice = plats.filter((p) => p.ice).length;
  const minSize = Math.min(...plats.map((p) => Math.min(p.size[0], p.size[2])));
  const avgSize = plats.reduce((s, p) => s + Math.min(p.size[0], p.size[2]), 0) / Math.max(1, nPlat);
  const spinners = geo.hazards.filter((h) => h.kind === "spinner").length;
  const sliders = geo.hazards.filter((h) => h.kind === "slider").length;
  // Longest gap between consecutive route nodes (centre distance), a proxy for jump length.
  const centers = geo.routeHint.map((n) =>
    n.kind === "mover" ? [movers[n.index].pos[0], movers[n.index].pos[2]] : [plats[n.index].pos[0], plats[n.index].pos[2]]);
  let maxGap = 0, sumGap = 0;
  for (let i = 1; i < centers.length; i++) {
    const d = Math.hypot(centers[i][0] - centers[i - 1][0], centers[i][1] - centers[i - 1][1]);
    maxGap = Math.max(maxGap, d); sumGap += d;
  }
  return {
    steps: params.steps, platforms: nPlat, movers: nMover, hazards: geo.hazards.length,
    spinners, sliders, crumble, ice, checkpoints: geo.checkpoints.length,
    minPlatform: +minSize.toFixed(2), avgPlatform: +avgSize.toFixed(2),
    maxGap: +maxGap.toFixed(2), avgGap: +(sumGap / Math.max(1, centers.length - 1)).toFixed(2),
    airJumps: params.airJumps,
  };
}
