// scripts/validate-parkour-maps.mjs
// Beweist, dass JEDE Parkour-Map spielbar ist: simuliert echte Sprung-Trajektorien
// (mit exakt den Engine-Konstanten aus components/parkour/parkour-player.tsx) und
// prüft für jede aufeinanderfolgende Plattform der Route, ob der Sprung schaffbar
// ist. Zusätzlich: Überlappungs-/Fallen-Check + Checkpoint-/Finish-Erreichbarkeit.
//
// Run: node scripts/validate-parkour-maps.mjs
// (Node 24 strippt die TS-Typen von lib/parkour-config.ts automatisch.)

import { PARKOUR_MAPS, moverCenterAt } from "../lib/parkour-config.ts";

// ── Engine-Konstanten (müssen mit parkour-player.tsx übereinstimmen) ──
const R = 0.42;
const LAND_MARGIN = 0.16;
const H = 1.7;
const REACH = R + LAND_MARGIN;

function aabb(pos, size) {
  const [cx, cy, cz] = pos;
  const [sx, sy, sz] = size;
  return {
    minX: cx - sx / 2, maxX: cx + sx / 2,
    minZ: cz - sz / 2, maxZ: cz + sz / 2,
    top: cy + sy / 2, bottom: cy - sy / 2, cx, cz,
  };
}

/** Simuliert einen Sprung von `from` (Punkt auf Startplattform-Oberkante) Richtung
 * Zielplattform B. Probiert mehrere Doppelsprung-Zeitpunkte; schaffbar, wenn EINE
 * Variante auf B landet. Startpunkt = Punkt auf A am nächsten zu B (Kante). */
function jumpReaches(map, A, B) {
  const g = map.gravity, vJ = map.jumpVelocity, air = map.airJumps;
  const vXmax = map.moveSpeed * map.sprintMultiplier; // volle Sprint-Geschwindigkeit
  // Startpunkt: nächster Punkt auf A zu B-Zentrum.
  const sx = Math.max(A.minX, Math.min(B.cx, A.maxX));
  const sz = Math.max(A.minZ, Math.min(B.cz, A.maxZ));
  const dx = B.cx - sx, dz = B.cz - sz;
  const len = Math.hypot(dx, dz) || 1e-6;
  const ux = dx / len, uz = dz / len;

  const apex = vJ / Math.abs(g);
  const djCandidates = air > 0 ? [null, 0.0, apex * 0.5, apex, apex * 1.4] : [null];
  // Der Spieler steuert die Geschwindigkeit (Gehen bis Sprint) → wir suchen, ob
  // IRGENDEINE Geschwindigkeit+Timing auf B landet (nicht drüber schießt).
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
        if (y < B.top - 10) break;
        t += dt;
      }
      if (ok) return { reachable: true, dj, frac };
    }
  }
  return { reachable: false };
}

function overlapsXZ(a, b) {
  return !(a.maxX <= b.minX || a.minX >= b.maxX || a.maxZ <= b.minZ || a.minZ >= b.maxZ);
}

let totalProblems = 0;

for (const map of PARKOUR_MAPS) {
  const problems = [];
  const singleH = (map.jumpVelocity ** 2) / (2 * Math.abs(map.gravity));
  const boxes = map.platforms.map((p) => ({ ...aabb(p.pos, p.size), kill: !!p.kill, raw: p }));
  const finishBox = aabb(map.finish, map.finishSize);

  // Route: routeHint (Plattform ODER beweglicher Node) + Finish. Ein beweglicher
  // Node liefert mehrere Kandidaten-Boxen (Phasen) — der Spieler kann timen, also
  // gilt eine Transition als schaffbar, wenn IRGENDEIN Phasen-Paar reicht.
  const moverBox = (m, t) => aabb(moverCenterAt(m, t), m.size);
  const nodeCandidates = (n) => {
    if (n.kind === "mover") {
      const m = map.movers[n.index];
      const K = 6;
      return Array.from({ length: K }, (_, k) => moverBox(m, (m.period * k) / K));
    }
    return [boxes[n.index]];
  };
  const routeNodes = (map.routeHint && map.routeHint.length
    ? map.routeHint.map(nodeCandidates)
    : boxes.filter((b) => !b.kill).map((b) => [b]));
  const nodes = [...routeNodes, [finishBox]]; // each node = array of candidate boxes

  // Start-Pad: enthält es die Start-XZ und passt die Höhe?
  const startBox = boxes.find((b) =>
    map.start[0] >= b.minX && map.start[0] <= b.maxX && map.start[2] >= b.minZ && map.start[2] <= b.maxZ);
  if (!startBox) problems.push(`Start (${map.start}) liegt auf keiner Plattform.`);
  else if (Math.abs(startBox.top - map.start[1]) > 0.4) problems.push(`Start-Höhe ${map.start[1]} passt nicht zur Pad-Oberkante ${startBox.top.toFixed(2)}.`);

  // Erreichbarkeit jeder Transition (bestes Kandidaten-Paar zählt)
  for (let i = 0; i < nodes.length - 1; i++) {
    const A = nodes[i], B = nodes[i + 1];
    let reachable = false;
    for (const a of A) { for (const b of B) { if (jumpReaches(map, a, b).reachable) { reachable = true; break; } } if (reachable) break; }
    if (!reachable) {
      const a0 = A[0], b0 = B[0];
      const rise = b0.top - a0.top;
      const dist = Math.hypot(b0.cx - a0.cx, b0.cz - a0.cz);
      const label = i === nodes.length - 2 ? "→ FINISH" : `#${i} → #${i + 1}`;
      problems.push(`UNERREICHBAR ${label}: Anstieg ${rise.toFixed(2)} (SingleJump ${singleH.toFixed(2)}, airJumps ${map.airJumps}), Distanz ${dist.toFixed(2)}.`);
    }
  }

  // Überlappungs-/Fallen-Check (inkl. Finish gegen Plattformen)
  const all = [...boxes.map((b, i) => ({ b, name: `P#${i}` })), { b: finishBox, name: "FINISH" }];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i].b, c = all[j].b;
      if (!overlapsXZ(a, c)) continue;
      const upper = a.top >= c.top ? a : c;
      const lower = a.top >= c.top ? c : a;
      const clearance = upper.bottom - lower.top; // Luft zwischen unterer Oberkante und oberer Unterkante
      if (clearance > -0.05 && clearance < H) {
        problems.push(`ÜBERLAPPUNG ${all[i].name}/${all[j].name}: XZ überlappen, nur ${clearance.toFixed(2)} Höhe frei (< ${H}) → Falle/Doppelboden.`);
      }
    }
  }

  // Checkpoints müssen auf einer Plattform-Oberkante sitzen
  for (const cp of map.checkpoints) {
    const on = boxes.find((b) =>
      cp.pos[0] >= b.minX - 0.6 && cp.pos[0] <= b.maxX + 0.6 &&
      cp.pos[2] >= b.minZ - 0.6 && cp.pos[2] <= b.maxZ + 0.6 &&
      Math.abs(b.top - cp.pos[1]) < 1.0);
    if (!on) problems.push(`Checkpoint ${cp.index} (${cp.pos}) sitzt auf keiner Plattform-Oberkante.`);
  }

  if (problems.length === 0) {
    console.log(`✅ ${map.name} (${map.difficulty}) — ${map.platforms.length} Plattformen, alle ${nodes.length - 1} Sprünge schaffbar, keine Überlappungen.`);
  } else {
    console.log(`❌ ${map.name} (${map.difficulty}) — ${problems.length} Problem(e):`);
    for (const p of problems) console.log(`   • ${p}`);
    totalProblems += problems.length;
  }
}

console.log(totalProblems === 0 ? "\n🎉 Alle Maps 1000% valide." : `\n⚠️  ${totalProblems} Problem(e) gesamt.`);
process.exit(totalProblems === 0 ? 0 : 1);
