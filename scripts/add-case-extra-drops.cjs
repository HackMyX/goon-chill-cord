#!/usr/bin/env node
/**
 * Adds the extra_drops column to case_tiers.
 *
 * Speichert konfigurierbare Nicht-Item-Drops einer Case (Credits, Name-Styles,
 * Fähigkeiten, Badges) als JSONB-Array. Default: '[]'. Idempotent.
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
    `ALTER TABLE case_tiers ADD COLUMN IF NOT EXISTS extra_drops jsonb NOT NULL DEFAULT '[]'::jsonb;`,
  ];

  for (const q of queries) {
    console.log("Running:", q.trim().slice(0, 90));
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
