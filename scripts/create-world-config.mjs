// New table for the 3D World's session-level admin settings — same
// "single row, id='default'" shape as kill_streak_config/streak_config
// (see scripts/migrate-item-stats.mjs for the original of that pattern).
// Holds settings that previously had no admin surface at all: the
// Disconnect button's countdown duration (was hardcoded to 10 in
// world-shell.tsx), plus two master kill-switches (world_enabled,
// pvp_enabled) for the new admin Games tab.
//
// Usage: node scripts/create-world-config.mjs

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
    CREATE TABLE IF NOT EXISTS world_config (
      id text PRIMARY KEY DEFAULT 'default',
      disconnect_countdown_sec integer NOT NULL DEFAULT 10,
      world_enabled boolean NOT NULL DEFAULT true,
      pvp_enabled boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("world_config table ready.");

  // Same RLS-enabled-no-policies convention as every other admin-only
  // config table in this project (see kill_streak_config's migration) —
  // only the service-role client (createAdminClient()) can read/write it.
  await client.query(`ALTER TABLE world_config ENABLE ROW LEVEL SECURITY;`);
  console.log("RLS enabled on world_config.");

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
