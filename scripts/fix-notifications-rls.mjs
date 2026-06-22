// `notifications` has RLS enabled but had ZERO policies — every regular
// (non-service-role) client read returned an empty array with no error,
// which is why getNotifications()/the bell's realtime subscription never
// showed anything for anyone, even though rows were being inserted fine
// via the service-role client. Adds the missing self-access policies.
// Usage: node scripts/fix-notifications-rls.mjs

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
    DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
    CREATE POLICY "notifications_select_own" ON notifications
      FOR SELECT USING (auth.uid() = user_id);
  `);
  console.log("SELECT policy added.");

  await client.query(`
    DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
    CREATE POLICY "notifications_update_own" ON notifications
      FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  `);
  console.log("UPDATE policy added.");

  // No INSERT/DELETE policy for regular users on purpose — every write
  // happens through lib/notifications-internal.ts's service-role client,
  // after that code's own auth/ownership checks already ran.

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
