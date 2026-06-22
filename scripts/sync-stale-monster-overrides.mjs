// One-time balance fix: `monster_types` had 4 stale rows (zombie_weak,
// zombie_strong, skeleton_weak, skeleton_strong) frozen at an *old* set of
// code defaults — move_speed 1.6-2.5 (well under the player's walk speed,
// from before the kiting-exploit speed rebalance), old spawn_weight (from
// before the roster expanded to 8 types), and old health/attack_damage
// (from before the weapon-damage fix made every fight noticeably easier).
// lib/actions/monsters.ts' getMonsterTypes() always prefers a DB row over
// the code default when one exists, so every one of those later code
// changes was silently masked for these 4 specific ids in the live game,
// even though the other 4 (newer) monster types picked up each change
// immediately (they have no override row at all).
//
// This UPDATEs all 4 rows to match the current lib/monsters.ts
// DEFAULT_MONSTER_TYPES values exactly, restoring the same "code defaults
// are the live values" state the other 4 types have always been in — a
// correction, not a destructive delete, so any other admin-side metadata
// on these rows (e.g. `enabled`) is preserved rather than dropped.
//
// Usage: node scripts/sync-stale-monster-overrides.mjs

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
  {
    id: "zombie_weak",
    health: 64,
    attack_damage: 8,
    move_speed: 4.6,
    aggro_range: 9,
    attack_range: 1.6,
    attack_cooldown: 1.1,
    reward_min: 15,
    reward_max: 25,
    spawn_weight: 32,
  },
  {
    id: "zombie_strong",
    health: 150,
    attack_damage: 19,
    move_speed: 5,
    aggro_range: 10,
    attack_range: 1.8,
    attack_cooldown: 1.3,
    reward_min: 40,
    reward_max: 65,
    spawn_weight: 13,
  },
  {
    id: "skeleton_weak",
    health: 50,
    attack_damage: 10,
    move_speed: 4.8,
    aggro_range: 10,
    attack_range: 1.6,
    attack_cooldown: 0.9,
    reward_min: 12,
    reward_max: 20,
    spawn_weight: 28,
  },
  {
    id: "skeleton_strong",
    health: 115,
    attack_damage: 22,
    move_speed: 5.4,
    aggro_range: 11,
    attack_range: 1.8,
    attack_cooldown: 1,
    reward_min: 35,
    reward_max: 55,
    spawn_weight: 9,
  },
];

async function main() {
  await client.connect();
  for (const t of TARGETS) {
    const r = await client.query(
      `UPDATE monster_types SET
        health = $2, attack_damage = $3, move_speed = $4, aggro_range = $5,
        attack_range = $6, attack_cooldown = $7, reward_min = $8, reward_max = $9,
        spawn_weight = $10, updated_at = now()
      WHERE id = $1`,
      [
        t.id,
        t.health,
        t.attack_damage,
        t.move_speed,
        t.aggro_range,
        t.attack_range,
        t.attack_cooldown,
        t.reward_min,
        t.reward_max,
        t.spawn_weight,
      ]
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
