/**
 * Migration: create don_config table for Double or Nothing settings.
 * Run once: node scripts/migrate-don-config.mjs
 */
import pg from "pg";
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

const statements = [
  `CREATE TABLE IF NOT EXISTS don_config (
    id               text        PRIMARY KEY DEFAULT 'default',
    enabled          boolean     NOT NULL DEFAULT true,
    daily_flip_limit integer     NOT NULL DEFAULT 50,
    cooldown_sec     integer     NOT NULL DEFAULT 0,
    win_chance       real        NOT NULL DEFAULT 0.5,
    min_bet          integer     NOT NULL DEFAULT 1,
    max_bet          integer,
    quick_amounts    integer[]   NOT NULL DEFAULT '{100,500,1000,5000,10000}',
    section_title    text        NOT NULL DEFAULT 'Double or Nothing',
    section_subtitle text        NOT NULL DEFAULT 'Riskiere deine Credits — 50/50 Chance auf das Doppelte',
    show_remaining_spins boolean NOT NULL DEFAULT true,
    updated_at       timestamptz DEFAULT now()
  )`,
  `ALTER TABLE don_config ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE don_config ADD COLUMN IF NOT EXISTS hourly_flip_limit integer`,
  `ALTER TABLE don_config ADD COLUMN IF NOT EXISTS allow_all_in boolean NOT NULL DEFAULT false`,
];

for (const sql of statements) {
  try {
    await client.query(sql);
    console.log("OK:", sql.trim().slice(0, 80));
  } catch (e) {
    console.error("SKIP:", sql.trim().slice(0, 80), "\n →", e.message);
  }
}

await client.end();
console.log("\nDone.");
