// Balance pass: elite monsters (Mittel + Krass tier) were too fragile
// against high-tier weapons (Ultra weapon = 100 dmg/0.45s = 222 DPS):
//
// Problem: Dämonenfürst (345 HP) died in just 4 Ultra hits (1.8s). No real
// boss feel. Geist (20 atk) was completely blocked by full Ultra armor (20)
// — fastest monster in the game dealt literally 1 damage per hit to a
// fully-geared player, zero threat despite its speed niche. Ork/Zombie-Brute
// were also slightly underwhelming vs high gear.
//
// Targets (health, attack_damage only — rewards/speeds unchanged):
//
// Zombie-Brute : 160 → 190 HP (Mythisch now needs 4 hits instead of 3)
// Skelett-Krieger: 122 → 155 HP (extra buffer without pushing to 4 Mythisch hits)
// Ork          : 178 → 220 HP (Ultra now needs 3 hits instead of 2 — real fight)
// Geist        : 138 → 160 HP, 20 → 26 atk (punches 6 dmg through max armor)
// Dämonenfürst : 345 → 480 HP, 39 → 42 atk (Mythisch: 9 hits; Ultra: 5 hits)
//
// Fight duration with Mythisch weapon (55 dmg, 0.45s cooldown):
//   Zombie-Brute:     190/55 = 4 hits  = 1.8s  (was 3 hits / 1.35s)
//   Skelett-Krieger:  155/55 = 3 hits  = 1.35s (was 3 hits — same, just more buffer)
//   Ork:              220/55 = 4 hits  = 1.8s  (same hit count, higher HP floor)
//   Geist:            160/55 = 3 hits  = 1.35s (same hit count)
//   Dämonenfürst:     480/55 = 9 hits  = 4.05s (was 7 hits / 3.15s — real boss)
//
// Usage: node scripts/balance-elite-monsters.mjs

import { Client } from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", ".env.local"), "utf-8")
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    })
);

const client = new Client({ connectionString: env.DATABASE_URL });

const TARGETS = [
  { id: "zombie_strong",    health: 190, attack_damage: 21 },
  { id: "skeleton_strong",  health: 155, attack_damage: 24 },
  { id: "orc_brute",        health: 220, attack_damage: 28 },
  { id: "ghost_wraith",     health: 160, attack_damage: 26 },
  { id: "demon_boss",       health: 480, attack_damage: 42 },
];

async function main() {
  await client.connect();
  for (const t of TARGETS) {
    const r = await client.query(
      `UPDATE monster_types SET health = $2, attack_damage = $3, updated_at = now() WHERE id = $1`,
      [t.id, t.health, t.attack_damage]
    );
    console.log(`${t.id}: health=${t.health}, attack_damage=${t.attack_damage} — ${r.rowCount} row updated`);
  }
  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
