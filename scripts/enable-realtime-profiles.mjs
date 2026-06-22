// Adds `profiles` to the supabase_realtime publication so clients can
// subscribe to postgres_changes (credits/role/ban live-updates, live
// leaderboard) — only `notifications` was in the publication before this.
// Usage: node scripts/enable-realtime-profiles.mjs

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

  const { rows } = await client.query(
    `SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'`
  );
  if (rows.length > 0) {
    console.log("profiles already in supabase_realtime publication.");
  } else {
    await client.query(`ALTER PUBLICATION supabase_realtime ADD TABLE profiles;`);
    console.log("profiles added to supabase_realtime publication.");
  }

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
