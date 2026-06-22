// Adds the `starting_credits` column to the site_config table and recreates
// the handle_new_user trigger so new users receive the admin-configured amount
// instead of a hardcoded value.
//
// Run once: node scripts/add-starting-credits.mjs

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

  // 1. Add column to site_config
  await client.query(`
    ALTER TABLE site_config
    ADD COLUMN IF NOT EXISTS starting_credits integer NOT NULL DEFAULT 500;
  `);
  console.log("starting_credits column added to site_config.");

  // 2. Recreate handle_new_user trigger to read starting_credits from site_config.
  //    This replaces any existing trigger function of the same name in the
  //    public schema. The function uses SECURITY DEFINER so it can read
  //    site_config (which has RLS enabled with no public policies).
  await client.query(`
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER SET search_path = ''
    AS $$
    DECLARE
      _starting_credits integer := 500;
    BEGIN
      SELECT COALESCE(starting_credits, 500)
        INTO _starting_credits
        FROM public.site_config
       WHERE id = 'default'
       LIMIT 1;

      INSERT INTO public.profiles (id, username, credits, cases_opened, role)
      VALUES (
        new.id,
        COALESCE(
          new.raw_user_meta_data->>'username',
          split_part(new.email, '@', 1)
        ),
        _starting_credits,
        0,
        'user'
      )
      ON CONFLICT (id) DO NOTHING;

      RETURN new;
    END;
    $$;
  `);
  console.log("handle_new_user trigger function updated.");

  // 3. Ensure the trigger still exists (in case it was dropped)
  await client.query(`
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  `);
  console.log("on_auth_user_created trigger (re)created.");

  await client.end();
  console.log("Done. New users will now receive the starting_credits value from site_config.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
