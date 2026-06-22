// Creates the `backups` table — full config+catalog snapshot/restore
// system for the admin panel's new "Backup" tab.
// Usage: node scripts/create-backups.mjs

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
    CREATE TABLE IF NOT EXISTS backups (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import')),
      tables jsonb NOT NULL,
      table_counts jsonb NOT NULL,
      size_bytes integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("backups table ready.");

  await client.query(`CREATE INDEX IF NOT EXISTS backups_created_at_idx ON backups (created_at DESC);`);
  console.log("Index created.");

  // RLS enabled, no policies — every read/write goes through the
  // service-role admin client, same pattern as tickets/debug_logs.
  await client.query(`ALTER TABLE backups ENABLE ROW LEVEL SECURITY;`);
  console.log("RLS enabled.");

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
