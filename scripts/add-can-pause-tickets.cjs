#!/usr/bin/env node
/**
 * Adds can_pause_tickets column to mod_permissions table.
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
    `ALTER TABLE mod_permissions ADD COLUMN IF NOT EXISTS can_pause_tickets boolean NOT NULL DEFAULT false;`,
    // Make sure the default row exists
    `INSERT INTO mod_permissions (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;`,
  ];

  for (const q of queries) {
    console.log("Running:", q.trim().slice(0, 80));
    await client.query(q);
    console.log("  OK");
  }

  await client.end();
  console.log("Done.");
}

run().catch((e) => { console.error(e); process.exit(1); });
