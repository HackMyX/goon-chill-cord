import { createRequire } from "module";
import { config } from "dotenv";
config({ path: ".env.local" });
const require = createRequire(import.meta.url);
const { Client } = require("pg");

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function q(sql, params = []) {
  try { return await client.query(sql, params); }
  catch(e) { console.error("Query error:", e.message); return { rows: [] }; }
}

async function main() {
  await client.connect();

  // Check character_config table (separate from world_config)
  const cc = await q("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='character_config' AND table_schema='public' ORDER BY ordinal_position");
  console.log("=== character_config columns ===");
  cc.rows.forEach(r => console.log(" -", r.column_name, "(" + r.data_type + ")"));

  // monster_types current data
  const mt = await q("SELECT id, name, visual_kind, color, scale, enabled FROM monster_types ORDER BY name");
  console.log("\n=== monster_types data ===");
  mt.rows.forEach(r => console.log(` [${r.enabled ? "on" : "off"}] ${r.name} | kind=${r.visual_kind} | color=${r.color} | scale=${r.scale}`));

  // world_config current row
  const wc = await q("SELECT * FROM world_config WHERE id='default'");
  console.log("\n=== world_config default row ===");
  if (wc.rows[0]) {
    const row = wc.rows[0];
    Object.entries(row).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  }

  // profiles: check all users
  const prof = await q("SELECT id, username, role, credits, support_banned FROM profiles ORDER BY credits DESC LIMIT 10");
  console.log("\n=== Top 10 profiles ===");
  prof.rows.forEach(r => console.log(`  ${r.username} | role=${r.role} | cr=${r.credits} | sb=${r.support_banned}`));

  // audit_logs count + sample
  const al = await q("SELECT COUNT(*) as cnt FROM audit_logs");
  const als = await q("SELECT action, payload FROM audit_logs ORDER BY created_at DESC LIMIT 5");
  console.log(`\n=== audit_logs: ${al.rows[0]?.cnt ?? 0} total ===`);
  als.rows.forEach(r => console.log(`  ${r.action}`, r.payload ? JSON.stringify(r.payload).slice(0, 80) : ""));

  // Check kill_streak_config table
  const ks = await q("SELECT column_name FROM information_schema.columns WHERE table_name='kill_streak_config' AND table_schema='public' ORDER BY ordinal_position");
  console.log("\n=== kill_streak_config columns ===");
  ks.rows.forEach(r => console.log(" -", r.column_name));

  // pet_configs
  const pt = await q("SELECT column_name FROM information_schema.columns WHERE table_name='pet_configs' AND table_schema='public'");
  console.log("\n=== pet_configs columns ===");
  pt.rows.forEach(r => console.log(" -", r.column_name));

  // shop_settings
  const ss = await q("SELECT * FROM shop_settings LIMIT 1");
  console.log("\n=== shop_settings row ===");
  if (ss.rows[0]) Object.entries(ss.rows[0]).forEach(([k,v]) => console.log(`  ${k}: ${v}`));

  // Check mod_permissions
  const mp = await q("SELECT column_name FROM information_schema.columns WHERE table_name='mod_permissions' AND table_schema='public'");
  console.log("\n=== mod_permissions columns ===");
  mp.rows.forEach(r => console.log(" -", r.column_name));

  // Check if any tables need indexes
  const missingIdx = await q(`
    SELECT t.table_name
    FROM information_schema.tables t
    WHERE t.table_schema='public'
    AND t.table_name NOT IN (
      SELECT DISTINCT tablename FROM pg_indexes WHERE schemaname='public'
    )
    ORDER BY t.table_name
  `);
  console.log("\n=== Tables with NO indexes ===");
  missingIdx.rows.forEach(r => console.log(" -", r.table_name));

  await client.end();
}

main().catch(async e => { console.error("FATAL:", e.message, e.stack); await client.end(); });
