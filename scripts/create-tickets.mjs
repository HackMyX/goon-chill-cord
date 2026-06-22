// Creates the tickets + ticket_messages tables for the support ticket system.
// Usage: node scripts/create-tickets.mjs

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
    CREATE TABLE IF NOT EXISTS tickets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      subject text NOT NULL,
      description text NOT NULL,
      status text NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("tickets table ready.");

  await client.query(`
    CREATE TABLE IF NOT EXISTS ticket_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      message text NOT NULL,
      is_staff boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("ticket_messages table ready.");

  // Indexes for common lookups
  await client.query(`
    CREATE INDEX IF NOT EXISTS tickets_user_id_idx ON tickets (user_id);
    CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets (status);
    CREATE INDEX IF NOT EXISTS ticket_messages_ticket_id_idx ON ticket_messages (ticket_id);
  `);
  console.log("Indexes created.");

  // RLS enabled — all access goes through the admin client (service role)
  await client.query(`ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;`);
  await client.query(`ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;`);
  console.log("RLS enabled on tickets and ticket_messages.");

  await client.end();
  console.log("Done. Support ticket system is ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
