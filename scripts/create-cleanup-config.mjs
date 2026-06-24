// Creates the cleanup_config table — admin-configurable auto-cleanup for all
// history tables (chat, debug logs, audit, tickets, trades, auctions, etc.).
// Usage: node scripts/create-cleanup-config.mjs

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
    CREATE TABLE IF NOT EXISTS cleanup_config (
      source_key  text      PRIMARY KEY,
      enabled     boolean   NOT NULL DEFAULT false,
      retention_days integer NOT NULL DEFAULT 30
        CHECK (retention_days BETWEEN 1 AND 3650),
      last_run_at   timestamptz,
      last_run_deleted integer,
      updated_at  timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("cleanup_config table created.");

  await client.query(`CREATE INDEX IF NOT EXISTS cleanup_config_enabled_idx ON cleanup_config (enabled);`);
  console.log("Index created.");

  // RLS enabled — all access via service-role admin client only.
  await client.query(`ALTER TABLE cleanup_config ENABLE ROW LEVEL SECURITY;`);
  console.log("RLS enabled.");

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
