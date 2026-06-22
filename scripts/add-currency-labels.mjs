// Adds configurable currency/stat label columns to site_config so the
// admin panel can rename "CR"/"DMG"/"AP" sitewide.
// Usage: node scripts/add-currency-labels.mjs

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

  await client.query(`ALTER TABLE site_config ADD COLUMN IF NOT EXISTS currency_name text NOT NULL DEFAULT 'CR';`);
  await client.query(`ALTER TABLE site_config ADD COLUMN IF NOT EXISTS damage_label text NOT NULL DEFAULT 'DMG';`);
  await client.query(`ALTER TABLE site_config ADD COLUMN IF NOT EXISTS armor_label text NOT NULL DEFAULT 'AP';`);
  console.log("site_config currency/label columns ready.");

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
