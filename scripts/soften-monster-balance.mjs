// One-time balance fix: the previous rebalance (after the weapon-damage
// bug fix) buffed health/attackDamage up to compensate for weapons
// suddenly dealing their real damage — but over-corrected, making several
// variants feel too strong/fast. Trims health/attackDamage ~10-12% back
// down from that pass (still well above the original pre-weapon-fix
// numbers) and trims moveSpeed a few percent on the Mittel/Krass variants
// that had the most headroom above the player's 4.5 walk speed floor
// (Zombie-Brute, Skelett-Krieger, Ork, Geist, Dämonenfürst) — see
// lib/monsters.ts' updated doc comment for the full reasoning.
//
// Same "UPDATE 4 specific monster_types rows that have stale DB override
// data" pattern as scripts/sync-stale-monster-overrides.mjs — only 2 of
// these 4 ids (zombie_strong, skeleton_weak — the latter via its
// throw_damage too) actually need new values here; zombie_weak's
// health/attackDamage are tuned through this same UPDATE for consistency
// even though they round to the same ballpark.
//
// Usage: node scripts/soften-monster-balance.mjs

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
  { id: "zombie_weak", health: 58, attack_damage: 7, move_speed: 4.6 },
  { id: "zombie_strong", health: 135, attack_damage: 17, move_speed: 4.8 },
  { id: "skeleton_weak", health: 45, attack_damage: 9, move_speed: 4.8, throw_damage: 5 },
  { id: "skeleton_strong", health: 104, attack_damage: 20, move_speed: 5.1, throw_damage: 12 },
];

async function main() {
  await client.connect();
  for (const t of TARGETS) {
    if (t.throw_damage !== undefined) {
      const r = await client.query(
        `UPDATE monster_types SET health = $2, attack_damage = $3, move_speed = $4, throw_damage = $5, updated_at = now() WHERE id = $1`,
        [t.id, t.health, t.attack_damage, t.move_speed, t.throw_damage]
      );
      console.log(`softened ${t.id}: ${r.rowCount} row`);
    } else {
      const r = await client.query(
        `UPDATE monster_types SET health = $2, attack_damage = $3, move_speed = $4, updated_at = now() WHERE id = $1`,
        [t.id, t.health, t.attack_damage, t.move_speed]
      );
      console.log(`softened ${t.id}: ${r.rowCount} row`);
    }
  }
  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
