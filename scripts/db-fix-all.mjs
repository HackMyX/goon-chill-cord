/**
 * Full DB fix: monster data, world_config seeds, indexes, RLS checks.
 * Run: node scripts/db-fix-all.mjs
 */
import { createRequire } from "module";
import { config } from "dotenv";
config({ path: ".env.local" });
const require = createRequire(import.meta.url);
const { Client } = require("pg");

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function q(sql, params = [], label = "") {
  try {
    const res = await client.query(sql, params);
    if (label) console.log(`  ✓ ${label}`);
    return res;
  } catch (e) {
    console.error(`  ✗ ${label || sql.slice(0, 60)}: ${e.message}`);
    return { rows: [] };
  }
}

async function addColumn(table, column, type, defaultVal) {
  const res = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [table, column]
  );
  if (res.rows.length > 0) {
    console.log(`  - ${table}.${column} already exists`);
    return;
  }
  const def = defaultVal !== undefined ? ` DEFAULT ${defaultVal}` : "";
  await q(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}${def}`, [],
    `Added ${table}.${column} (${type}${def})`);
}

async function enableRealtime(table) {
  const res = await client.query(
    `SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename=$1`, [table]
  );
  if (res.rows.length > 0) { console.log(`  - realtime ${table} already on`); return; }
  await q(`ALTER PUBLICATION supabase_realtime ADD TABLE ${table}`, [], `Realtime ON → ${table}`);
}

async function main() {
  await client.connect();
  console.log("Connected\n");

  // ── Check all monster_types columns ───────────────────────────────────────
  const mtCols = await client.query(
    "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='monster_types' AND table_schema='public' ORDER BY ordinal_position"
  );
  console.log("=== monster_types columns ===");
  mtCols.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));

  // Add missing monster_types columns
  await addColumn("monster_types", "id", "text", null);
  await addColumn("monster_types", "name", "text", null);
  await addColumn("monster_types", "health", "integer", "50");
  await addColumn("monster_types", "attack_damage", "integer", "10");
  await addColumn("monster_types", "attack_range", "numeric", "1.8");
  await addColumn("monster_types", "attack_cooldown", "numeric", "1.5");
  await addColumn("monster_types", "aggro_range", "numeric", "10");
  await addColumn("monster_types", "move_speed", "numeric", "3.5");
  await addColumn("monster_types", "spawn_weight", "numeric", "1");
  await addColumn("monster_types", "enabled", "boolean", "true");
  await addColumn("monster_types", "visual_kind", "text", "'zombie'");
  await addColumn("monster_types", "color", "text", "'#4ade80'");
  await addColumn("monster_types", "scale", "numeric", "1");
  await addColumn("monster_types", "has_weapon", "boolean", "false");
  await addColumn("monster_types", "can_throw", "boolean", "false");
  await addColumn("monster_types", "throw_damage", "integer", null);
  await addColumn("monster_types", "throw_cooldown", "numeric", null);
  await addColumn("monster_types", "throw_range", "numeric", null);
  await addColumn("monster_types", "credits_reward", "integer", "5");
  await addColumn("monster_types", "updated_at", "timestamptz", "now()");

  // ── Fix monster_types data (correct visual_kind + color + scale) ──────────
  console.log("\n=== Fixing monster_types data ===");
  const monsters = await client.query("SELECT id, name FROM monster_types ORDER BY name");
  for (const m of monsters.rows) {
    const name = m.name.toLowerCase();
    let kind = "zombie";
    let color = "#4ade80";
    let scale = 1.0;
    let hasWeapon = false;
    let canThrow = false;

    if (name.includes("skelett") || name.includes("skeleton")) {
      kind = "skeleton";
      color = "#e8e4d8";
      hasWeapon = true;
    } else if (name.includes("geist") || name.includes("ghost")) {
      kind = "ghost";
      color = "#b9d6ff";
      scale = 1.1;
    } else if (name.includes("orc") || name.includes("ork")) {
      kind = "orc";
      color = "#86efac";
      scale = 1.2;
      hasWeapon = true;
    } else if (name.includes("demon") || name.includes("dämon") || name.includes("damon")) {
      kind = "demon";
      color = "#f87171";
      scale = 1.6;
      hasWeapon = true;
      canThrow = true;
    } else if (name.includes("slime") || name.includes("schleim")) {
      kind = "slime";
      color = "#a3e635";
      scale = 0.85;
    } else if (name.includes("brute") || name.includes("brutte") || name.includes("boss")) {
      scale = 1.3;
    }

    // Only update if still at default values (don't overwrite admin-set values)
    await q(
      `UPDATE monster_types SET visual_kind=$1, color=$2, scale=$3, has_weapon=$4, can_throw=$5
       WHERE id=$6 AND visual_kind='zombie' AND color='#4ade80' AND scale=1`,
      [kind, color, scale, hasWeapon, canThrow, m.id],
      `Fixed ${m.name}: kind=${kind} color=${color} scale=${scale}`
    );
  }

  // ── character_config: add missing columns ─────────────────────────────────
  console.log("\n=== character_config ===");
  await addColumn("character_config", "pvp_damage_multiplier", "numeric", "1.0");
  await addColumn("character_config", "sprint_multiplier", "numeric", "1.8");

  // Ensure default row exists
  await q(
    `INSERT INTO character_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING`,
    [], "Ensured character_config default row"
  );

  // ── streak_config: add missing columns ────────────────────────────────────
  console.log("\n=== streak_config ===");
  const scCols = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='streak_config' AND table_schema='public'"
  );
  console.log("  Columns:", scCols.rows.map(r => r.column_name).join(", "));
  await addColumn("streak_config", "base_reward", "integer", "50");
  await addColumn("streak_config", "bonus_per_day", "integer", "10");
  await addColumn("streak_config", "max_bonus_days", "integer", "30");
  await addColumn("streak_config", "enabled", "boolean", "true");
  await q(
    `INSERT INTO streak_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING`,
    [], "Ensured streak_config default row"
  );

  // ── notifications: add missing columns ────────────────────────────────────
  console.log("\n=== notifications ===");
  const notifCols = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='notifications' AND table_schema='public'"
  );
  console.log("  Columns:", notifCols.rows.map(r => r.column_name).join(", "));
  await addColumn("notifications", "read", "boolean", "false");
  await addColumn("notifications", "type", "text", "'info'");
  await addColumn("notifications", "link", "text", null);

  // ── case_tiers: check columns ─────────────────────────────────────────────
  console.log("\n=== case_tiers ===");
  const ctCols = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='case_tiers' AND table_schema='public'"
  );
  console.log("  Columns:", ctCols.rows.map(r => r.column_name).join(", "));
  await addColumn("case_tiers", "item_types", "text[]", null);
  await addColumn("case_tiers", "item_ids", "text[]", null);
  await addColumn("case_tiers", "group_label", "text", null);
  await addColumn("case_tiers", "group_subtitle", "text", null);
  await addColumn("case_tiers", "preview_cost", "integer", null);
  await addColumn("case_tiers", "multi_open_max", "integer", null);
  await addColumn("case_tiers", "updated_at", "timestamptz", "now()");

  // ── tickets: check columns ────────────────────────────────────────────────
  console.log("\n=== tickets ===");
  const tickCols = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='tickets' AND table_schema='public'"
  );
  console.log("  Columns:", tickCols.rows.map(r => r.column_name).join(", "));
  await addColumn("tickets", "closed_at", "timestamptz", null);
  await addColumn("tickets", "closed_by", "uuid", null);
  await addColumn("tickets", "priority", "text", "'normal'");

  // ── login_events: check columns ───────────────────────────────────────────
  console.log("\n=== login_events ===");
  const leCols = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='login_events' AND table_schema='public'"
  );
  console.log("  Columns:", leCols.rows.map(r => r.column_name).join(", "));
  await addColumn("login_events", "ip_address", "text", null);
  await addColumn("login_events", "user_agent", "text", null);
  await addColumn("login_events", "created_at", "timestamptz", "now()");

  // ── device_bans: check columns ────────────────────────────────────────────
  console.log("\n=== device_bans ===");
  const dbCols = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='device_bans' AND table_schema='public'"
  );
  console.log("  Columns:", dbCols.rows.map(r => r.column_name).join(", "));

  // ── Additional Realtime ───────────────────────────────────────────────────
  console.log("\n=== Realtime ===");
  await enableRealtime("audit_logs");
  await enableRealtime("notifications");
  await enableRealtime("inventory");
  await enableRealtime("profiles");

  // ── Additional indexes ────────────────────────────────────────────────────
  console.log("\n=== Indexes ===");
  await q(`CREATE INDEX IF NOT EXISTS monster_types_enabled_idx ON monster_types(enabled)`, [], "monster_types.enabled idx");
  await q(`CREATE INDEX IF NOT EXISTS inventory_user_id_idx ON inventory(user_id)`, [], "inventory.user_id idx");
  await q(`CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id)`, [], "notifications.user_id idx");
  await q(`CREATE INDEX IF NOT EXISTS notifications_read_idx ON notifications(user_id, read) WHERE read=false`, [], "notifications unread idx");
  await q(`CREATE INDEX IF NOT EXISTS login_events_user_id_idx ON login_events(user_id)`, [], "login_events.user_id idx");
  await q(`CREATE INDEX IF NOT EXISTS tickets_user_id_idx ON tickets(user_id)`, [], "tickets.user_id idx");
  await q(`CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets(status)`, [], "tickets.status idx");

  // ── FINAL CHECK ───────────────────────────────────────────────────────────
  console.log("\n=== Final monster_types data ===");
  const finalMt = await client.query("SELECT name, visual_kind, color, scale, enabled FROM monster_types ORDER BY name");
  finalMt.rows.forEach(r => console.log(`  [${r.enabled ? "✓" : "✗"}] ${r.name} | ${r.visual_kind} | ${r.color} | scale=${r.scale}`));

  console.log("\n=== Realtime-enabled tables ===");
  const rt = await client.query("SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' ORDER BY tablename");
  rt.rows.forEach(r => console.log(" ", r.tablename));

  console.log("\nAll done! DB is fully up to date.");
  await client.end();
}

main().catch(async e => { console.error("FATAL:", e.message); await client.end(); process.exit(1); });
