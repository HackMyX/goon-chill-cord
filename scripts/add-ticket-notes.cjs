/**
 * Migration: ticket_internal_notes table
 * Private mod/admin notes on tickets — not visible to users.
 * Run once: node scripts/add-ticket-notes.cjs
 */
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected.");

  await client.query(`
    CREATE TABLE IF NOT EXISTS ticket_internal_notes (
      id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
      ticket_id   UUID        NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      note        TEXT        NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("ticket_internal_notes table created.");

  await client.query(`ALTER TABLE ticket_internal_notes ENABLE ROW LEVEL SECURITY;`);

  // Only service-role (admin client) can access — no public policies
  console.log("RLS enabled (no public policies — server-action gated).");

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_ticket_internal_notes_ticket
    ON ticket_internal_notes(ticket_id);
  `);
  console.log("Index created.");

  await client.end();
  console.log("Done.");
}

main().catch((e) => { console.error("Error:", e.message); process.exit(1); });
