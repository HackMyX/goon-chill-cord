// scripts/validate-parkour-maps.mjs
// Beweist, dass JEDE Parkour-Map spielbar ist — nutzt das gemeinsame Kernmodul
// scripts/parkour-validate-core.mjs (dieselbe Logik wie die Seed-Suche), damit
// „schaffbar" überall identisch bedeutet.
//
// Run: node scripts/validate-parkour-maps.mjs

import { PARKOUR_MAPS } from "../lib/parkour-config.ts";
import { validateMap } from "./parkour-validate-core.mjs";

let totalProblems = 0;
for (const map of PARKOUR_MAPS) {
  const { ok, problems, transitions } = validateMap(map);
  if (ok) {
    console.log(`✅ ${map.name} (${map.difficulty}) — ${map.platforms.length} Plattformen, alle ${transitions} Sprünge schaffbar, keine Überlappungen.`);
  } else {
    console.log(`❌ ${map.name} (${map.difficulty}) — ${problems.length} Problem(e):`);
    for (const p of problems) console.log(`   • ${p}`);
    totalProblems += problems.length;
  }
}
console.log(totalProblems === 0 ? "\n🎉 Alle Maps 1000% valide." : `\n⚠️  ${totalProblems} Problem(e) gesamt.`);
process.exit(totalProblems === 0 ? 0 : 1);
