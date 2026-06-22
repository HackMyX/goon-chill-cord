// One-time schema migration: adds the held-weapon/ranged-throw columns
// lib/monsters.ts' MonsterTypeConfig grew (hasWeapon, canThrow,
// throwDamage, throwCooldown, throwRange) so the admin panel can actually
// tune them per variant instead of them only ever being code-only
// defaults — every other monster stat (health, attackDamage, moveSpeed,
// etc.) has been admin-editable since the panel existed; these were the
// one gap. Run via a direct Postgres connection (DATABASE_URL in
// .env.local), same as scripts/migrate-item-stats.mjs.
//
// Usage: node scripts/migrate-monster-weapon-throw.mjs

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

async function main() {
  await client.connect();

  await client.query(`
    ALTER TABLE monster_types
      ADD COLUMN IF NOT EXISTS has_weapon boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS can_throw boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS throw_damage integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS throw_cooldown numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS throw_range numeric NOT NULL DEFAULT 0;
  `);
  console.log("monster_types: has_weapon/can_throw/throw_damage/throw_cooldown/throw_range columns ready.");

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
