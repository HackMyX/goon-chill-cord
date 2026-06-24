// Creates the ai_config table for storing the Gemini API key in the DB,
// allowing admins to update it without restarting the server.
// Usage: node scripts/migrate-ai-config.mjs

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
    CREATE TABLE IF NOT EXISTS ai_config (
      id         text        PRIMARY KEY DEFAULT 'default',
      gemini_api_key text,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await client.query(
    `INSERT INTO ai_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;`
  );
  console.log("ai_config table ready.");

  await client.end();
  console.log("✓ Migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
