/**
 * Adds missing site_config columns + ensures trigger reads the correct value.
 * Run: node scripts/fix-site-config.mjs
 */
import { createRequire } from "module";
import { config } from "dotenv";
config({ path: ".env.local" });
const require = createRequire(import.meta.url);
const { Client } = require("pg");

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function q(sql, label = "") {
  try {
    const res = await client.query(sql);
    if (label) console.log(`  ✓ ${label}`);
    return res;
  } catch (e) {
    console.error(`  ✗ ${label || "query"}: ${e.message}`);
    return null;
  }
}

async function addCol(col, type, def) {
  const exists = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='site_config' AND table_schema='public' AND column_name=$1`,
    [col]
  );
  if (exists.rows.length > 0) { console.log(`  - site_config.${col} already exists`); return; }
  await q(`ALTER TABLE site_config ADD COLUMN IF NOT EXISTS ${col} ${type} DEFAULT ${def}`, `Added site_config.${col}`);
}

async function main() {
  await client.connect();
  console.log("Connected\n");

  // Add every column getSiteConfig() selects
  await addCol("rarity_normal_label",   "text", "'Normal'");
  await addCol("rarity_selten_label",   "text", "'Selten'");
  await addCol("rarity_mythisch_label", "text", "'Mythisch'");
  await addCol("rarity_ultra_label",    "text", "'Ultra'");
  await addCol("perk_speed_label",      "text", "'Tempo'");
  await addCol("perk_jump_label",       "text", "'Sprung'");
  await addCol("perk_regen_label",      "text", "'Regen'");

  // Also add logo_icon_name if somehow missing (older installs used logo_icon)
  await addCol("logo_icon_name", "text", "'Gamepad2'");

  // Ensure the default row has correct values for new columns
  await q(`
    UPDATE site_config SET
      rarity_normal_label   = COALESCE(NULLIF(rarity_normal_label,''),   'Normal'),
      rarity_selten_label   = COALESCE(NULLIF(rarity_selten_label,''),   'Selten'),
      rarity_mythisch_label = COALESCE(NULLIF(rarity_mythisch_label,''), 'Mythisch'),
      rarity_ultra_label    = COALESCE(NULLIF(rarity_ultra_label,''),    'Ultra'),
      perk_speed_label      = COALESCE(NULLIF(perk_speed_label,''),      'Tempo'),
      perk_jump_label       = COALESCE(NULLIF(perk_jump_label,''),       'Sprung'),
      perk_regen_label      = COALESCE(NULLIF(perk_regen_label,''),      'Regen'),
      logo_icon_name        = COALESCE(NULLIF(logo_icon_name,''),        'Gamepad2')
    WHERE id = 'default'
  `, "Updated default row with missing label defaults");

  // Verify the full row is now readable
  const row = await client.query("SELECT * FROM site_config WHERE id='default'");
  console.log("\n=== site_config default row (complete) ===");
  if (row.rows[0]) Object.entries(row.rows[0]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  // Verify the trigger still reads starting_credits
  const fn = await client.query(
    "SELECT prosrc FROM pg_proc WHERE proname='handle_new_user' LIMIT 1"
  );
  const body = fn.rows[0]?.prosrc ?? "";
  const readsStartingCredits = body.includes("starting_credits");
  console.log(`\nTrigger reads starting_credits: ${readsStartingCredits ? "✓ YES" : "✗ NO — needs update"}`);

  if (!readsStartingCredits) {
    // Update the trigger to read from site_config
    await q(`
      CREATE OR REPLACE FUNCTION public.handle_new_user()
      RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
      DECLARE
        _starting_credits integer := 500;
        _base_username text;
        _username text;
      BEGIN
        SELECT COALESCE(starting_credits, 500) INTO _starting_credits
          FROM public.site_config WHERE id = 'default' LIMIT 1;

        _base_username := left(COALESCE(
          new.raw_user_meta_data->>'username',
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'name',
          split_part(COALESCE(new.email, ''), '@', 1),
          'Spieler'
        ), 28);
        IF _base_username = '' THEN _base_username := 'Spieler'; END IF;

        _username := _base_username;
        IF EXISTS (SELECT 1 FROM public.profiles WHERE username = _username AND id <> new.id) THEN
          _username := _base_username || '_' || substr(new.id::text, 1, 5);
        END IF;

        INSERT INTO public.profiles (id, username, credits, role)
        VALUES (new.id, _username, _starting_credits, 'user')
        ON CONFLICT (id) DO NOTHING;

        RETURN new;
      END;
      $$
    `, "Updated handle_new_user trigger function");
  }

  console.log("\nDone! site_config is now fully readable by getSiteConfig().");
  await client.end();
}

main().catch(async e => { console.error("FATAL:", e.message); await client.end(); process.exit(1); });
