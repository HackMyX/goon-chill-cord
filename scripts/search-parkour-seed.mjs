// scripts/search-parkour-seed.mjs
// Sucht für einen gegebenen CourseParams-Satz Seeds, bei denen der generierte Kurs
// den Solvability-Validator (parkour-validate-core.mjs) besteht — so lässt sich ein
// „geisteskrank schwerer" Parameter-Satz finden, der GARANTIERT durchspielbar ist.
//
// Nutzung:
//   node scripts/search-parkour-seed.mjs --params '<json>' [--from 1] [--to 40000] [--count 1] [--quiet]
//
// <json> = vollständiges CourseParams-Objekt (das "seed"-Feld wird pro Iteration
// überschrieben). Ausgabe: JSON { found:[{seed,metrics}], scanned, ok }.
// Exit 0 wenn >=1 gültiger Seed gefunden, sonst 1.

import { buildCourse } from "../lib/parkour-config.ts";
import { validateMap, courseMetrics } from "./parkour-validate-core.mjs";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

const paramsRaw = arg("params", null);
if (!paramsRaw) { console.error('Fehlt: --params \'<json>\''); process.exit(2); }
let base;
try { base = JSON.parse(paramsRaw); } catch (e) { console.error("Ungültiges --params JSON:", e.message); process.exit(2); }

const from = parseInt(arg("from", "1"), 10);
const to = parseInt(arg("to", "40000"), 10);
const count = parseInt(arg("count", "1"), 10);
const quiet = hasFlag("quiet");

const found = [];
let scanned = 0;
for (let seed = from; seed <= to && found.length < count; seed++) {
  scanned++;
  const params = { ...base, seed };
  let geo;
  try { geo = buildCourse(params); } catch { continue; }
  const map = {
    gravity: params.gravity, jumpVelocity: params.jumpVelocity, airJumps: params.airJumps,
    moveSpeed: params.moveSpeed, sprintMultiplier: params.sprintMultiplier,
    ...geo,
  };
  const res = validateMap(map, { stopEarly: true });
  if (res.ok) found.push({ seed, metrics: courseMetrics(geo, params) });
}

const out = { ok: found.length > 0, scanned, from, to, found };
console.log(JSON.stringify(out, quiet ? undefined : null, quiet ? undefined : 2));
process.exit(found.length > 0 ? 0 : 1);
