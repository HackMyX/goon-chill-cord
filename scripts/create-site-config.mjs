// Sitewide branding settings — site name (shown top-left in TopBar and as
// the browser tab title) and an optional logo image URL replacing the
// default Gamepad2 icon. Same single-row, id='default' shape as every
// other admin config table in this project.
//
// Usage: node scripts/create-site-config.mjs

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
    CREATE TABLE IF NOT EXISTS site_config (
      id text PRIMARY KEY DEFAULT 'default',
      site_name text NOT NULL DEFAULT 'Goon''n Chill Cord',
      logo_url text,
      logo_icon_name text NOT NULL DEFAULT 'Gamepad2',
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("site_config table ready.");

  await client.query(`ALTER TABLE site_config ENABLE ROW LEVEL SECURITY;`);
  console.log("RLS enabled on site_config.");

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
