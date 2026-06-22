// Adds a DELETE policy for `notifications` so players can clear their own
// notifications (individually or all at once) directly via the regular
// client, same self-access pattern as scripts/fix-notifications-rls.mjs.
// Usage: node scripts/add-notifications-delete-policy.mjs

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
    DROP POLICY IF EXISTS "notifications_delete_own" ON notifications;
    CREATE POLICY "notifications_delete_own" ON notifications
      FOR DELETE USING (auth.uid() = user_id);
  `);
  console.log("DELETE policy added.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
