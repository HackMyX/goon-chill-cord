// Adds a per-user "support banned" flag — lets admins take the support
// ticket button away from spammers without touching their actual account
// ban (auth.admin ban_duration), which would log them out entirely.
// Usage: node scripts/add-support-ban.mjs

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
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS support_banned boolean NOT NULL DEFAULT false;
  `);
  console.log("profiles.support_banned column ready.");
  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
