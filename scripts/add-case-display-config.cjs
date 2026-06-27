#!/usr/bin/env node
/**
 * Creates the case_display_config singleton table.
 *
 * Speichert admin-einstellbare Größen/Anzeige-Optionen für das Case-Opening
 * (Reel-Größe, 3D-Zoom, Pool-Spalten, Charakter-Vorschau, …). Idempotent.
 */
const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function run() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log("Connected to DB");

  const queries = [
    `CREATE TABLE IF NOT EXISTS case_display_config (
      id text PRIMARY KEY DEFAULT 'default',
      config jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    );`,
    `ALTER TABLE case_display_config ENABLE ROW LEVEL SECURITY;`,
    `DROP POLICY IF EXISTS case_display_config_read ON case_display_config;`,
    `CREATE POLICY case_display_config_read ON case_display_config FOR SELECT USING (true);`,
    `INSERT INTO case_display_config (id, config) VALUES ('default', '{}'::jsonb) ON CONFLICT (id) DO NOTHING;`,
  ];

  for (const q of queries) {
    console.log("Running:", q.trim().slice(0, 80).replace(/\s+/g, " "));
    await client.query(q);
    console.log("  OK");
  }

  try {
    await client.query(`NOTIFY pgrst, 'reload schema';`);
    console.log("  schema cache reload requested");
  } catch (e) {
    console.warn("  schema reload notify failed (non-fatal):", e.message);
  }

  await client.end();
  console.log("Done.");
}

run().catch((e) => { console.error(e); process.exit(1); });
