/**
 * Migration: create mine_config and mine_progress tables.
 * Run once: node scripts/migrate-mine.mjs
 */
import pg from "pg";
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

const DEFAULT_LEVELS = JSON.stringify([
  { level: 1,  crPerHour: 100,  maxStorageHours: 24, upgradeCost: 500 },
  { level: 2,  crPerHour: 132,  maxStorageHours: 24, upgradeCost: 2500 },
  { level: 3,  crPerHour: 174,  maxStorageHours: 24, upgradeCost: 9300 },
  { level: 4,  crPerHour: 229,  maxStorageHours: 24, upgradeCost: 25000 },
  { level: 5,  crPerHour: 302,  maxStorageHours: 24, upgradeCost: 75000 },
  { level: 6,  crPerHour: 398,  maxStorageHours: 24, upgradeCost: 200000 },
  { level: 7,  crPerHour: 524,  maxStorageHours: 24, upgradeCost: 500000 },
  { level: 8,  crPerHour: 691,  maxStorageHours: 24, upgradeCost: 1500000 },
  { level: 9,  crPerHour: 910,  maxStorageHours: 24, upgradeCost: 5000000 },
  { level: 10, crPerHour: 1200, maxStorageHours: 24, upgradeCost: null },
]);

const statements = [
  `CREATE TABLE IF NOT EXISTS mine_config (
    id               text        PRIMARY KEY DEFAULT 'default',
    enabled          boolean     NOT NULL DEFAULT true,
    levels           jsonb       NOT NULL DEFAULT '[]'::jsonb,
    section_title    text        NOT NULL DEFAULT 'Goldmine',
    section_subtitle text        NOT NULL DEFAULT 'Passives Einkommen — upgraden und Schürfen',
    updated_at       timestamptz DEFAULT now()
  )`,
  `ALTER TABLE mine_config ENABLE ROW LEVEL SECURITY`,

  `CREATE TABLE IF NOT EXISTS mine_progress (
    user_id           uuid        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    level             integer     NOT NULL DEFAULT 1,
    last_collected_at timestamptz NOT NULL DEFAULT now(),
    total_mined       integer     NOT NULL DEFAULT 0,
    updated_at        timestamptz DEFAULT now()
  )`,
  `ALTER TABLE mine_progress ENABLE ROW LEVEL SECURITY`,
  `CREATE POLICY IF NOT EXISTS "allow_read_mine_progress" ON mine_progress FOR SELECT USING (true)`,
  `CREATE POLICY IF NOT EXISTS "allow_self_mine_progress" ON mine_progress FOR ALL USING (auth.uid() = user_id)`,

  `INSERT INTO mine_config (id, levels) VALUES ('default', '${DEFAULT_LEVELS}') ON CONFLICT (id) DO NOTHING`,

  `ALTER PUBLICATION supabase_realtime ADD TABLE mine_progress`,
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
