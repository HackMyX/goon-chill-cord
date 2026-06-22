// Creates the debug_logs table — full-scope server error capture for the
// admin panel's Debug Log tab. Usage: node scripts/create-debug-logs.mjs

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
    CREATE TABLE IF NOT EXISTS debug_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      level text NOT NULL DEFAULT 'error' CHECK (level IN ('error', 'warn', 'info')),
      scope text NOT NULL,
      message text NOT NULL,
      detail text,
      context jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("debug_logs table ready.");

  await client.query(`CREATE INDEX IF NOT EXISTS debug_logs_created_at_idx ON debug_logs (created_at DESC);`);
  await client.query(`CREATE INDEX IF NOT EXISTS debug_logs_level_idx ON debug_logs (level);`);
  console.log("Indexes created.");

  // RLS enabled, no policies — every read/write goes through the
  // service-role admin client, same pattern as tickets/ticket_messages.
  await client.query(`ALTER TABLE debug_logs ENABLE ROW LEVEL SECURITY;`);
  console.log("RLS enabled.");

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
