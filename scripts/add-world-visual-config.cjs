/**
 * adds world_visual_config table for 3D world visual settings
 * Safe to run multiple times — IF NOT EXISTS / ON CONFLICT DO NOTHING.
 * Run: node scripts/add-world-visual-config.cjs
 */
"use strict";

const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const envFile = path.join(__dirname, "..", ".env.local");
if (!fs.existsSync(envFile)) { console.error(".env.local not found"); process.exit(1); }
for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
  const m = line.match(/^([^#=\s]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const db = new Client({ connectionString: process.env.DATABASE_URL });

async function step(label, sqls) {
  process.stdout.write(`\n── ${label} ──\n`);
  for (const sql of Array.isArray(sqls) ? sqls : [sqls]) {
    try {
      await db.query(sql);
      const preview = sql.replace(/\s+/g, " ").trim().slice(0, 90);
      console.log(`  ✅ ${preview}`);
    } catch (e) {
      const preview = sql.replace(/\s+/g, " ").trim().slice(0, 90);
      if (e.message.includes("already exists") || e.message.includes("duplicate column")) {
        console.log(`  ⏭  (already) ${preview}`);
      } else {
        console.log(`  ❌ ${preview}`);
        console.log(`     ${e.message.split("\n")[0]}`);
      }
    }
  }
}

async function main() {
  await db.connect();
  console.log("✅ Connected\n");
  console.log("add-world-visual-config — 2026-06-25\n");

  await step("world_visual_config: create table", [`
    CREATE TABLE IF NOT EXISTS world_visual_config (
      id text PRIMARY KEY DEFAULT 'default',
      sky_top_color text NOT NULL DEFAULT '#0a0a1a',
      sky_horizon_color text NOT NULL DEFAULT '#1a0a2e',
      sky_bottom_color text NOT NULL DEFAULT '#0d0520',
      fog_color text NOT NULL DEFAULT '#0d0520',
      fog_near numeric NOT NULL DEFAULT 40,
      fog_far numeric NOT NULL DEFAULT 120,
      fog_enabled boolean NOT NULL DEFAULT true,
      ambient_light_color text NOT NULL DEFAULT '#ffffff',
      ambient_light_intensity numeric NOT NULL DEFAULT 0.4,
      sun_light_color text NOT NULL DEFAULT '#7c3aed',
      sun_light_intensity numeric NOT NULL DEFAULT 0.8,
      sun_position_x numeric NOT NULL DEFAULT -50,
      sun_position_y numeric NOT NULL DEFAULT 50,
      sun_position_z numeric NOT NULL DEFAULT -30,
      ground_color text NOT NULL DEFAULT '#1a0a2e',
      ground_grid_color text NOT NULL DEFAULT '#2d1b4e',
      ground_grid_opacity numeric NOT NULL DEFAULT 0.3,
      ground_size numeric NOT NULL DEFAULT 200,
      nametag_visible_distance numeric NOT NULL DEFAULT 30,
      nametag_scale numeric NOT NULL DEFAULT 1.0,
      nametag_show_role_bar boolean NOT NULL DEFAULT true,
      nametag_show_badges boolean NOT NULL DEFAULT true,
      nametag_max_badges integer NOT NULL DEFAULT 3,
      nametag_font_size text NOT NULL DEFAULT 'sm',
      world_particles_enabled boolean NOT NULL DEFAULT true,
      world_particle_count integer NOT NULL DEFAULT 50,
      slash_effect_color text NOT NULL DEFAULT '#a855f7',
      blood_effect_enabled boolean NOT NULL DEFAULT true,
      shadow_enabled boolean NOT NULL DEFAULT false,
      antialias boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `]);

  await step("world_visual_config: RLS + policies", [
    `ALTER TABLE world_visual_config ENABLE ROW LEVEL SECURITY`,
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='world_visual_config' AND policyname='admin_all') THEN
         CREATE POLICY admin_all ON world_visual_config FOR ALL
           USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
       END IF;
     END $$`,
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='world_visual_config' AND policyname='auth_select') THEN
         CREATE POLICY auth_select ON world_visual_config FOR SELECT
           USING (auth.role() = 'authenticated');
       END IF;
     END $$`,
  ]);

  await step("world_visual_config: seed default row", [
    `INSERT INTO world_visual_config (id) VALUES ('default') ON CONFLICT DO NOTHING`,
  ]);

  await db.end();
  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
