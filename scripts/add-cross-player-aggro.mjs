/**
 * Adds the cross_player_aggro_duration_sec column to world_config.
 *
 * Run once:  node scripts/add-cross-player-aggro.mjs
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 * (same as every other script in this directory).
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log("Adding cross_player_aggro_duration_sec to world_config…");

  // Add the column (no-op if it already exists due to IF NOT EXISTS).
  // We use raw SQL via rpc if available, or fall back to the REST API
  // by simply upserting a row with the new column — Supabase will
  // auto-create it on the first upsert IF the table was created without
  // strict schema enforcement.  The safest path: use the SQL editor in
  // the Supabase dashboard and run:
  //
  //   ALTER TABLE world_config
  //     ADD COLUMN IF NOT EXISTS cross_player_aggro_duration_sec numeric DEFAULT 8;
  //
  // OR let this script do it via the service-role client:

  const { error } = await supabase.rpc("exec_sql", {
    sql: `ALTER TABLE world_config
            ADD COLUMN IF NOT EXISTS cross_player_aggro_duration_sec numeric DEFAULT 8;`,
  });

  if (error) {
    // exec_sql RPC might not exist — print the manual SQL to run instead.
    console.warn("exec_sql RPC failed (might not exist):", error.message);
    console.log("\nRun this SQL manually in the Supabase SQL Editor:");
    console.log(
      "\n  ALTER TABLE world_config\n    ADD COLUMN IF NOT EXISTS cross_player_aggro_duration_sec numeric DEFAULT 8;\n"
    );
  } else {
    console.log("Column added (or already existed). Done.");
  }

  // Upsert a default row so getWorldSpawnConfig() can read the value.
  const { error: upsertError } = await supabase
    .from("world_config")
    .upsert({ id: "default", cross_player_aggro_duration_sec: 8 });

  if (upsertError) {
    console.warn("Could not upsert default value:", upsertError.message);
  } else {
    console.log("Default value set to 8 seconds.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
