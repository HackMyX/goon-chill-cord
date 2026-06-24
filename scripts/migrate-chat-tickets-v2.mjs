// Adds global_chat_config table and extends tickets + mod_permissions for v2 features.
// Usage: node scripts/migrate-chat-tickets-v2.mjs

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

  // ── Global chat config table ────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS global_chat_config (
      id text PRIMARY KEY DEFAULT 'default',
      enabled boolean NOT NULL DEFAULT true,
      message_cooldown_sec integer NOT NULL DEFAULT 2,
      max_message_length integer NOT NULL DEFAULT 300,
      banned_words text[] NOT NULL DEFAULT '{}',
      auto_filter boolean NOT NULL DEFAULT true,
      mods_can_clear boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await client.query(`INSERT INTO global_chat_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;`);
  console.log("global_chat_config table ready.");

  // ── Ticket reward + attachment columns ────────────────────────────────────
  await client.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS attachment_url text;`);
  await client.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reward_credits integer;`);
  await client.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reward_granted_at timestamptz;`);
  await client.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reward_granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;`);
  await client.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reward_note text;`);
  console.log("tickets reward + attachment columns added.");

  // ── avatar_url in global_chat_messages ───────────────────────────────────
  await client.query(`ALTER TABLE global_chat_messages ADD COLUMN IF NOT EXISTS avatar_url text;`);
  console.log("global_chat_messages avatar_url column added.");

  // ── Extended mod permissions ────────────────────────────────────────────────
  await client.query(`ALTER TABLE mod_permissions ADD COLUMN IF NOT EXISTS can_clear_chat boolean NOT NULL DEFAULT false;`);
  await client.query(`ALTER TABLE mod_permissions ADD COLUMN IF NOT EXISTS can_delete_tickets boolean NOT NULL DEFAULT false;`);
  await client.query(`ALTER TABLE mod_permissions ADD COLUMN IF NOT EXISTS can_set_ticket_priority boolean NOT NULL DEFAULT false;`);
  await client.query(`ALTER TABLE mod_permissions ADD COLUMN IF NOT EXISTS can_update_ticket_status boolean NOT NULL DEFAULT false;`);
  await client.query(`ALTER TABLE mod_permissions ADD COLUMN IF NOT EXISTS can_reward_tickets boolean NOT NULL DEFAULT false;`);
  console.log("mod_permissions extended permissions added.");

  // ── Ticket attachment indexes ───────────────────────────────────────────────
  await client.query(`CREATE INDEX IF NOT EXISTS tickets_reward_at_idx ON tickets (reward_granted_at) WHERE reward_granted_at IS NOT NULL;`);
  console.log("Indexes created.");

  await client.end();
  console.log("✓ Migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
