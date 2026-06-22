// Companion to scripts/migrate-monster-weapon-throw.mjs: the new columns
// default to false/0 for every existing row, but 4 monster_types rows
// (zombie_weak, zombie_strong, skeleton_weak, skeleton_strong) are DB
// overrides that lib/actions/monsters.ts' getMonsterTypes() prefers over
// the lib/monsters.ts code defaults — without this, those 4 rows would
// silently mask the new hasWeapon/canThrow/throw* code defaults the
// instant rowToConfig starts reading these columns (e.g. Skelett's bone-
// throw ability would read as disabled in the live game even though the
// code default has it enabled), exactly the same staleness bug
// scripts/sync-stale-monster-overrides.mjs fixed for the original 4
// numeric stats. Syncs all 5 new columns to match the current code
// defaults for those same 4 ids.
//
// Usage: node scripts/sync-monster-weapon-throw-defaults.mjs

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
  { id: "zombie_weak", has_weapon: false, can_throw: false, throw_damage: 0, throw_cooldown: 0, throw_range: 0 },
  { id: "zombie_strong", has_weapon: true, can_throw: false, throw_damage: 0, throw_cooldown: 0, throw_range: 0 },
  {
    id: "skeleton_weak",
    has_weapon: true,
    can_throw: true,
    throw_damage: 6,
    throw_cooldown: 3,
    throw_range: 7,
  },
  {
    id: "skeleton_strong",
    has_weapon: true,
    can_throw: true,
    throw_damage: 14,
    throw_cooldown: 2.6,
    throw_range: 8,
  },
];

async function main() {
  await client.connect();
  for (const t of TARGETS) {
    const r = await client.query(
      `UPDATE monster_types SET
        has_weapon = $2, can_throw = $3, throw_damage = $4, throw_cooldown = $5, throw_range = $6,
        updated_at = now()
      WHERE id = $1`,
      [t.id, t.has_weapon, t.can_throw, t.throw_damage, t.throw_cooldown, t.throw_range]
    );
    console.log(`synced ${t.id}: ${r.rowCount} row`);
  }
  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
