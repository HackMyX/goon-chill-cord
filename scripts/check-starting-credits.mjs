import { createRequire } from "module";
import { config } from "dotenv";
config({ path: ".env.local" });
const require = createRequire(import.meta.url);
const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();

  // Check site_config columns
  const cols = await client.query(
    "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='site_config' AND table_schema='public' ORDER BY ordinal_position"
  );
  console.log("=== site_config columns ===");
  cols.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type}) DEFAULT: ${r.column_default}`));

  // Check if starting_credits exists
  const hasSC = cols.rows.some(r => r.column_name === "starting_credits");
  console.log("\nstarting_credits exists:", hasSC);

  // Check current site_config row
  const row = await client.query("SELECT * FROM site_config WHERE id='default'");
  console.log("\n=== site_config default row ===");
  if (row.rows[0]) Object.entries(row.rows[0]).forEach(([k,v]) => console.log(`  ${k}: ${v}`));

  // Check if handle_new_user trigger exists and its body
  const trigger = await client.query(
    "SELECT trigger_name, event_manipulation, event_object_table FROM information_schema.triggers WHERE trigger_schema='public' ORDER BY trigger_name"
  );
  console.log("\n=== Triggers ===");
  trigger.rows.forEach(r => console.log(`  ${r.trigger_name} ON ${r.event_object_table} (${r.event_manipulation})`));

  // Check trigger function body
  const fn = await client.query(
    "SELECT proname, prosrc FROM pg_proc WHERE proname IN ('handle_new_user','create_profile_on_signup','on_auth_user_created')"
  );
  console.log("\n=== Trigger functions ===");
  fn.rows.forEach(r => {
    console.log(`\n--- ${r.proname} ---`);
    console.log(r.prosrc.slice(0, 800));
  });

  // Also check what schema auth triggers are on
  const authTriggers = await client.query(
    "SELECT trigger_name, event_object_schema, event_object_table FROM information_schema.triggers WHERE event_object_schema='auth' ORDER BY trigger_name"
  );
  console.log("\n=== Auth triggers ===");
  authTriggers.rows.forEach(r => console.log(`  ${r.trigger_name} ON ${r.event_object_schema}.${r.event_object_table}`));

  await client.end();
}
main().catch(async e => { console.error("FATAL:", e.message); await client.end(); });
