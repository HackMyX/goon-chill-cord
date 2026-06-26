#!/usr/bin/env node
/**
 * Theming Engine — creates the theme_config singleton table.
 * Stores the globally-active site theme + whether users may pick their own.
 * Idempotent.
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
    `CREATE TABLE IF NOT EXISTS theme_config (
      id         TEXT        PRIMARY KEY DEFAULT 'default',
      config     JSONB       NOT NULL    DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL    DEFAULT now()
    )`,
    `ALTER TABLE theme_config ENABLE ROW LEVEL SECURITY`,
    `INSERT INTO theme_config (id, config) VALUES ('default', '{
      "activeTheme":"default",
      "allowUserChoice":false
    }'::jsonb) ON CONFLICT (id) DO NOTHING`,
  ];

  for (const q of queries) {
    console.log("Running:", q.trim().slice(0, 80).replace(/\s+/g, " "));
    await client.query(q);
    console.log("  OK");
  }

  await client.end();
  console.log("Done.");
}

run().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
