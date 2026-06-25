/**
 * Migration: add incompatible_with TEXT[] column to battle_passes
 * Run: node scripts/add-bp-incompatible.cjs
 */
const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(`
    ALTER TABLE battle_passes
    ADD COLUMN IF NOT EXISTS incompatible_with TEXT[] NOT NULL DEFAULT '{}';
  `);
  console.log("battle_passes.incompatible_with column added (or already exists).");

  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
