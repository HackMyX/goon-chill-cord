// Adds a `category` column to `tickets` so users can submit either a bug
// report or an improvement suggestion through the same ticket system.
// Usage: node scripts/add-ticket-category.mjs

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
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'bug';
  `);
  await client.query(`
    DO $$ BEGIN
      ALTER TABLE tickets ADD CONSTRAINT tickets_category_check CHECK (category IN ('bug', 'suggestion'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  console.log("tickets.category column ready.");

  await client.query(`CREATE INDEX IF NOT EXISTS tickets_category_idx ON tickets (category);`);
  console.log("Index created.");

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
