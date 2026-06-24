/**
 * DB audit + full migration — run once:
 *   node scripts/db-check-and-migrate.mjs
 *
 * Checks every column the codebase references, adds missing ones,
 * enables Realtime on required tables, and seeds any missing config rows.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { createRequire } from "module";

config({ path: ".env.local" });

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const DB_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DB_URL || !SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing env vars — check .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

// ─── helpers ─────────────────────────────────────────────────────────────────

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

async function hasColumn(table, column) {
  const res = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [table, column]
  );
  return res.rows.length > 0;
}

async function addColumn(table, column, type, defaultVal) {
  if (await hasColumn(table, column)) {
    console.log(`  - ${table}.${column} already exists`);
    return;
  }
  const def = defaultVal !== undefined ? ` DEFAULT ${defaultVal}` : "";
  await q(
    `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}${def}`,
    `Added ${table}.${column} (${type}${def})`
  );
}

async function hasTable(table) {
  const res = await client.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=$1`,
    [table]
  );
  return res.rows.length > 0;
}

async function isRealtimeEnabled(table) {
  const res = await client.query(
    `SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND tablename=$1`,
    [table]
  );
  return res.rows.length > 0;
}

async function enableRealtime(table) {
  if (await isRealtimeEnabled(table)) {
    console.log(`  - realtime on ${table} already enabled`);
    return;
  }
  await q(
    `ALTER PUBLICATION supabase_realtime ADD TABLE ${table}`,
    `Enabled Realtime on ${table}`
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  await client.connect();
  console.log("Connected to DB\n");

  // ── 1. SHOW CURRENT STATE ──────────────────────────────────────────────────
  const tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
  );
  console.log("=== Current tables ===");
  tables.rows.forEach(r => process.stdout.write(r.table_name + "  "));
  console.log("\n");

  // ── 2. profiles ───────────────────────────────────────────────────────────
  console.log("=== profiles ===");
  await addColumn("profiles", "support_banned", "boolean", "false");
  await addColumn("profiles", "temp_banned_until", "timestamptz", "NULL");
  await addColumn("profiles", "gender", "text", "'m'");
  await addColumn("profiles", "mod_permissions_override", "jsonb", "NULL");

  // ── 3. world_config ───────────────────────────────────────────────────────
  console.log("\n=== world_config ===");
  if (!(await hasTable("world_config"))) {
    await q(`CREATE TABLE world_config (
      id text PRIMARY KEY DEFAULT 'default',
      updated_at timestamptz DEFAULT now()
    )`, "Created world_config table");
    await q(`INSERT INTO world_config (id) VALUES ('default') ON CONFLICT DO NOTHING`, "Seeded default row");
  }

  // world-session-config columns
  await addColumn("world_config", "max_players", "integer", "20");
  await addColumn("world_config", "session_timeout_min", "integer", "60");
  await addColumn("world_config", "pvp_enabled", "boolean", "true");
  await addColumn("world_config", "friendly_fire", "boolean", "false");

  // world-spawn-config columns
  await addColumn("world_config", "max_alive_monsters", "integer", "8");
  await addColumn("world_config", "spawn_interval_min_sec", "numeric", "4");
  await addColumn("world_config", "spawn_interval_max_sec", "numeric", "8");
  await addColumn("world_config", "spawn_safe_radius", "numeric", "12");
  await addColumn("world_config", "alive_cap_per_extra_player", "integer", "5");
  await addColumn("world_config", "alive_cap_max", "integer", "35");
  await addColumn("world_config", "spawn_interval_floor", "numeric", "0.4");

  // NEW: cross-player aggro duration
  await addColumn("world_config", "cross_player_aggro_duration_sec", "numeric", "8");

  // character-config columns
  await addColumn("world_config", "max_hp", "integer", "100");
  await addColumn("world_config", "max_stamina", "integer", "100");
  await addColumn("world_config", "move_speed", "numeric", "5");
  await addColumn("world_config", "sprint_speed", "numeric", "9");
  await addColumn("world_config", "fist_damage", "integer", "12");
  await addColumn("world_config", "attack_range", "numeric", "2.2");
  await addColumn("world_config", "attack_cooldown", "numeric", "0.45");
  await addColumn("world_config", "attack_hit_radius", "numeric", "0.9");
  await addColumn("world_config", "attack_cone_half_angle", "numeric", "0.9");
  await addColumn("world_config", "sprint_damage_multiplier", "numeric", "1.4");
  await addColumn("world_config", "airborne_damage_multiplier", "numeric", "1.6");
  await addColumn("world_config", "perk_multiplier_cap", "numeric", "0.4");
  await addColumn("world_config", "hp_regen_rate", "numeric", "0");
  await addColumn("world_config", "hp_regen_delay_sec", "numeric", "4");

  // world-spawn world-spawn-config columns (additional ones that might exist)
  await addColumn("world_config", "updated_at", "timestamptz", "now()");

  // Ensure there's a default row
  await q(
    `INSERT INTO world_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING`,
    "Ensured default world_config row"
  );

  // ── 4. audit_logs ─────────────────────────────────────────────────────────
  console.log("\n=== audit_logs ===");
  if (!(await hasTable("audit_logs"))) {
    await q(`CREATE TABLE audit_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
      action text NOT NULL,
      payload jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`, "Created audit_logs table");
    await q(`CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs(user_id)`, "Created user_id index");
    await q(`CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action)`, "Created action index");
    await q(`CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC)`, "Created created_at index");
  } else {
    await addColumn("audit_logs", "payload", "jsonb", "NULL");
  }

  // ── 5. inventory ──────────────────────────────────────────────────────────
  console.log("\n=== inventory ===");
  if (await hasTable("inventory")) {
    await addColumn("inventory", "equipped", "boolean", "false");
    await addColumn("inventory", "obtained_at", "timestamptz", "now()");
  }

  // ── 6. items ──────────────────────────────────────────────────────────────
  console.log("\n=== items ===");
  if (await hasTable("items")) {
    await addColumn("items", "shield_hp", "integer", "0");
    await addColumn("items", "shield_regen_cooldown_sec", "numeric", "0");
    await addColumn("items", "perk_type", "text", "'none'");
    await addColumn("items", "perk_magnitude", "numeric", "0");
    await addColumn("items", "damage", "integer", "NULL");
    await addColumn("items", "armor", "integer", "0");
    await addColumn("items", "price_cr", "integer", "0");
    await addColumn("items", "type", "text", "'cosmetic'");
  }

  // ── 7. monster_types ──────────────────────────────────────────────────────
  console.log("\n=== monster_types ===");
  if (await hasTable("monster_types")) {
    await addColumn("monster_types", "enabled", "boolean", "true");
    await addColumn("monster_types", "can_throw", "boolean", "false");
    await addColumn("monster_types", "throw_damage", "integer", "NULL");
    await addColumn("monster_types", "throw_cooldown", "numeric", "NULL");
    await addColumn("monster_types", "throw_range", "numeric", "NULL");
    await addColumn("monster_types", "visual_kind", "text", "'zombie'");
    await addColumn("monster_types", "color", "text", "'#4ade80'");
    await addColumn("monster_types", "scale", "numeric", "1");
    await addColumn("monster_types", "spawn_weight", "numeric", "1");
    await addColumn("monster_types", "has_weapon", "boolean", "false");
  }

  // ── 8. site_config ────────────────────────────────────────────────────────
  console.log("\n=== site_config ===");
  if (await hasTable("site_config")) {
    await addColumn("site_config", "currency_name", "text", "'CR'");
    await addColumn("site_config", "site_name", "text", "'Goon n Chill'");
    await addColumn("site_config", "damage_label", "text", "'DMG'");
    await addColumn("site_config", "armor_label", "text", "'AP'");
    await addColumn("site_config", "logo_icon", "text", "'default'");
  }

  // ── 9. REALTIME ───────────────────────────────────────────────────────────
  console.log("\n=== Realtime subscriptions ===");
  await enableRealtime("profiles");
  await enableRealtime("audit_logs");
  await enableRealtime("inventory");
  await enableRealtime("notifications");

  // ── 10. INDEXES for performance ───────────────────────────────────────────
  console.log("\n=== Indexes ===");
  await q(`CREATE INDEX IF NOT EXISTS profiles_role_idx ON profiles(role)`, "profiles.role index");
  await q(`CREATE INDEX IF NOT EXISTS profiles_credits_idx ON profiles(credits DESC)`, "profiles.credits index");
  await q(`CREATE INDEX IF NOT EXISTS audit_logs_user_action_idx ON audit_logs(user_id, action)`, "audit_logs composite index");
  await q(`CREATE INDEX IF NOT EXISTS audit_logs_payload_target_idx ON audit_logs USING gin(payload)`, "audit_logs GIN payload index");

  // ── 11. FINAL STATE REPORT ────────────────────────────────────────────────
  console.log("\n=== Final: world_config columns ===");
  const wcFinal = await client.query(
    "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='world_config' AND table_schema='public' ORDER BY ordinal_position"
  );
  wcFinal.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));

  console.log("\n=== Final: Realtime-enabled tables ===");
  const rtFinal = await client.query(
    "SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' ORDER BY tablename"
  );
  rtFinal.rows.forEach(r => console.log(" ", r.tablename));

  console.log("\nAll done!");
  await client.end();
}

main().catch(async e => {
  console.error("\nFATAL:", e.message);
  await client.end();
  process.exit(1);
});
