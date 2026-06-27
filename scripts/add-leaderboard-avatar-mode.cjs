#!/usr/bin/env node
/**
 * Adds the avatar_mode column to game_leaderboard_config.
 *
 * Steuert, ob auf der Startseite alle Plätze ("all") oder nur die ersten 3
 * ("top3") ein Profilbild bekommen. Default: 'top3'. Idempotent.
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
    `ALTER TABLE game_leaderboard_config ADD COLUMN IF NOT EXISTS avatar_mode text NOT NULL DEFAULT 'top3';`,
    // Guard against bad values getting in
    `ALTER TABLE game_leaderboard_config DROP CONSTRAINT IF EXISTS game_leaderboard_config_avatar_mode_chk;`,
    `ALTER TABLE game_leaderboard_config ADD CONSTRAINT game_leaderboard_config_avatar_mode_chk CHECK (avatar_mode IN ('top3','all'));`,
    // Make sure the default singleton row exists so the setting is editable.
    `INSERT INTO game_leaderboard_config (id, items) VALUES ('default', '[]'::jsonb) ON CONFLICT (id) DO NOTHING;`,
  ];

  for (const q of queries) {
    console.log("Running:", q.trim().slice(0, 90));
    await client.query(q);
    console.log("  OK");
  }

  // Reload PostgREST schema cache so the new column is queryable immediately.
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
