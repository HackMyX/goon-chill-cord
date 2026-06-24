// Inserts missing monster rows (Slime, Ork, Geist, Dämonenfürst) into the
// monster_types table with the new balanced values. The 4 Niedrig/Mittel
// skeleton/zombie variants were already handled by earlier scripts;
// these 4 were never inserted because the admin panel only sees what's in
// the DB, falling back to code defaults silently.
//
// Usage: node scripts/upsert-missing-monsters.mjs

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

const monsters = [
  {
    id: "slime_weak", name: "Slime", health: 38, attack_damage: 8,
    move_speed: 4.6, aggro_range: 7, attack_range: 1.3, attack_cooldown: 1.0,
    reward_min: 10, reward_max: 16, spawn_weight: 16, color_hex: "#4ade80",
    enabled: true, has_weapon: false, can_throw: false,
    throw_damage: 0, throw_cooldown: 0, throw_range: 0,
  },
  {
    id: "orc_brute", name: "Ork", health: 220, attack_damage: 28,
    move_speed: 4.9, aggro_range: 11, attack_range: 1.9, attack_cooldown: 1.3,
    reward_min: 55, reward_max: 88, spawn_weight: 11, color_hex: "#5a6b35",
    enabled: true, has_weapon: true, can_throw: true,
    throw_damage: 18, throw_cooldown: 3.0, throw_range: 7,
  },
  {
    id: "ghost_wraith", name: "Geist", health: 160, attack_damage: 26,
    move_speed: 6.3, aggro_range: 14, attack_range: 1.7, attack_cooldown: 0.75,
    reward_min: 55, reward_max: 80, spawn_weight: 8, color_hex: "#b9d6ff",
    enabled: true, has_weapon: false, can_throw: true,
    throw_damage: 14, throw_cooldown: 2.0, throw_range: 10,
  },
  {
    id: "demon_boss", name: "Daenonenfuerst", health: 480, attack_damage: 42,
    move_speed: 5.5, aggro_range: 13, attack_range: 2.0, attack_cooldown: 1.0,
    reward_min: 115, reward_max: 175, spawn_weight: 5, color_hex: "#7a1020",
    enabled: true, has_weapon: true, can_throw: true,
    throw_damage: 24, throw_cooldown: 2.5, throw_range: 9,
  },
];

async function main() {
  await client.connect();

  for (const m of monsters) {
    const r = await client.query(
      `INSERT INTO monster_types (
         id, name, health, attack_damage, move_speed,
         aggro_range, attack_range, attack_cooldown,
         reward_min, reward_max, spawn_weight, color_hex, enabled,
         has_weapon, can_throw, throw_damage, throw_cooldown, throw_range
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (id) DO UPDATE SET
         health        = EXCLUDED.health,
         attack_damage = EXCLUDED.attack_damage,
         updated_at    = now()`,
      [
        m.id, m.name, m.health, m.attack_damage, m.move_speed,
        m.aggro_range, m.attack_range, m.attack_cooldown,
        m.reward_min, m.reward_max, m.spawn_weight, m.color_hex, m.enabled,
        m.has_weapon, m.can_throw, m.throw_damage, m.throw_cooldown, m.throw_range,
      ]
    );
    console.log(`${m.id}: ${r.rowCount} row upserted (${m.health} HP / ${m.attack_damage} dmg)`);
  }

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
