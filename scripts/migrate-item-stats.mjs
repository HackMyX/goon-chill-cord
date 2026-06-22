// One-time schema migration: adds the real RPG stat columns every item
// needs for the armor/perk/shield overhaul (lib/combat.ts
// applyArmorReduction, lib/actions/admin.ts ItemInput) — before this,
// `items` only had `damage` (weapons only); everything else was purely
// cosmetic. Run via a direct Postgres connection (DATABASE_URL in
// .env.local) since supabase-js has no DDL/ALTER TABLE API.
//
// Usage: node scripts/migrate-item-stats.mjs

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

  // armor: flat damage-reduction points (jacket/pants/hat/shoes).
  // perk_type/perk_magnitude: amulet/ring perks (speed_boost/jump_boost/
  // hp_regen_boost), magnitude is a multiplier added on top of 1.0 (e.g.
  // 0.15 = +15%).
  // shield_hp/shield_regen_cooldown_sec: shield_cosmetic items that
  // actually function (absorb damage), not just decorate.
  await client.query(`
    ALTER TABLE items
      ADD COLUMN IF NOT EXISTS armor integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS perk_type text NOT NULL DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS perk_magnitude numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS shield_hp integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS shield_regen_cooldown_sec integer NOT NULL DEFAULT 0;
  `);
  console.log("items: armor/perk_type/perk_magnitude/shield_hp/shield_regen_cooldown_sec columns ready.");

  await client.query(`
    ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS pending_streak_cr integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS streak_kill_count integer NOT NULL DEFAULT 0;
  `);
  console.log("profiles: pending_streak_cr/streak_kill_count columns ready.");

  await client.query(`
    CREATE TABLE IF NOT EXISTS pet_configs (
      id text PRIMARY KEY,
      damage integer NOT NULL DEFAULT 5,
      aggro_radius numeric NOT NULL DEFAULT 6,
      attack_speed numeric NOT NULL DEFAULT 1.2,
      move_speed numeric NOT NULL DEFAULT 3,
      enabled boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("pet_configs table ready.");

  await client.query(`
    CREATE TABLE IF NOT EXISTS kill_streak_config (
      id text PRIMARY KEY DEFAULT 'default',
      multiplier_per_kill numeric NOT NULL DEFAULT 0.04,
      max_multiplier numeric NOT NULL DEFAULT 3,
      mob_scale_per_kill numeric NOT NULL DEFAULT 0.02,
      mob_scale_max numeric NOT NULL DEFAULT 1.6,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("kill_streak_config table ready.");

  // Every brand-new table in this project ends up RLS-enabled with no
  // policies (see lib/actions/streak.ts's top comment on streak_config for
  // the incident this convention exists to avoid) — meaning only the
  // service-role client (createAdminClient(), used exclusively by
  // lib/actions/pets.ts and lib/actions/kill-streak.ts) can read/write
  // these two, never a regular user's own client. Plain CREATE TABLE
  // leaves RLS *disabled* by default, which would otherwise leave both
  // tables openly readable/writable by anyone with the public anon key.
  await client.query(`ALTER TABLE pet_configs ENABLE ROW LEVEL SECURITY;`);
  await client.query(`ALTER TABLE kill_streak_config ENABLE ROW LEVEL SECURITY;`);
  console.log("RLS enabled on pet_configs and kill_streak_config.");

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
