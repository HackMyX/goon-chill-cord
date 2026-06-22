// Adds self-service player preference columns to `profiles` — surfaced in
// a new "Einstellungen" card on the account page.
// Usage: node scripts/add-player-settings.mjs

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
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS accepts_trades boolean NOT NULL DEFAULT true;
  `);
  console.log("profiles.accepts_trades column ready.");

  await client.query(`
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_visible boolean NOT NULL DEFAULT true;
  `);
  console.log("profiles.profile_visible column ready.");

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
