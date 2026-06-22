// Notifies every admin/moderator whenever a new profile row is created.
// Profile rows are created by an existing `on_auth_user_created` trigger on
// auth.users (not by any application code path) — rather than touching
// that trigger, this adds a separate, additive AFTER INSERT trigger on
// `profiles` so a new signup always reaches staff notifications too.
// Usage: node scripts/add-new-user-staff-notify.mjs

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
    CREATE OR REPLACE FUNCTION notify_staff_on_new_profile()
    RETURNS TRIGGER AS $$
    BEGIN
      INSERT INTO notifications (user_id, type, title, message, link)
      SELECT p.id, 'admin_action', 'Neuer Spieler registriert',
             COALESCE(NEW.username, 'Ein neuer Spieler') || ' hat sich gerade registriert.',
             '/admin?tab=users'
      FROM profiles p
      WHERE p.role IN ('admin', 'moderator') AND p.id != NEW.id;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);
  console.log("notify_staff_on_new_profile() function ready.");

  await client.query(`DROP TRIGGER IF EXISTS on_profile_created_notify_staff ON profiles;`);
  await client.query(`
    CREATE TRIGGER on_profile_created_notify_staff
    AFTER INSERT ON profiles
    FOR EACH ROW EXECUTE FUNCTION notify_staff_on_new_profile();
  `);
  console.log("Trigger created.");

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
