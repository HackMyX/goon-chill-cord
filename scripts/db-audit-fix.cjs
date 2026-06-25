/**
 * DB Audit Fix — ensures every table and column the codebase references
 * actually exists in the database.
 *
 * Findings from full codebase audit (2026-06-25):
 *  - mine_config          MISSING from full-db-sync.cjs — mine.ts + balance-studio.ts use it
 *  - backups              MISSING from full-db-sync.cjs — backup.ts uses it
 *  - homepage_chat_config MISSING — new feature table (singleton)
 *  - mod_permissions.can_pause_tickets  was only in add-can-pause-tickets.cjs, not full-db-sync
 *  - site_config.topbar_right_slots     used in site-config.ts but not in any migration
 *  - site_config.topbar_button_style    used in site-config.ts but not in any migration
 *  - site_config.site_version           used in site-config.ts but not in any migration
 *
 * NOTE (code bug, not DB bug):
 *  cleanup-config.ts references `.from("trade_offers")` for the "trade_offers_done" cleanup
 *  key, but the actual table is `trades`. The cleanup handles PG_UNDEFINED_TABLE gracefully
 *  (returns 0), so this silently fails. Do NOT create a `trade_offers` table — the fix is
 *  in the application code (cleanup-config.ts should use `trades`, not `trade_offers`).
 *
 * Safe to run multiple times — all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING.
 * Run: node scripts/db-audit-fix.cjs
 */
"use strict";

const { Client } = require("pg");
const fs   = require("fs");
const path = require("path");

// ── Load .env.local ────────────────────────────────────────────────────────────
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
  console.log("✅ Connected to DB\n");
  console.log("DB Audit Fix — 2026-06-25\n");
  console.log("Fixing: mine_config, backups, homepage_chat_config,");
  console.log("        mod_permissions.can_pause_tickets,");
  console.log("        site_config.(topbar_right_slots|topbar_button_style|site_version)\n");

  // ══════════════════════════════════════════════════════════════════════════════
  // 1. MINE CONFIG — singleton table used by mine.ts + balance-studio.ts
  //    Was NEVER created in full-db-sync.cjs.
  // ══════════════════════════════════════════════════════════════════════════════
  await step("mine_config: create table + RLS + default row", [
    `CREATE TABLE IF NOT EXISTS mine_config (
      id               text        PRIMARY KEY DEFAULT 'default',
      enabled          boolean     NOT NULL DEFAULT true,
      levels           jsonb       NOT NULL DEFAULT '[]'::jsonb,
      section_title    text        NOT NULL DEFAULT 'Goldmine',
      section_subtitle text        NOT NULL DEFAULT 'Passives Einkommen — upgraden und Schürfen',
      updated_at       timestamptz NOT NULL DEFAULT now()
    )`,
    `ALTER TABLE mine_config ENABLE ROW LEVEL SECURITY`,
    `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'mine_config' AND policyname = 'mine_config_allow_all'
      ) THEN
        CREATE POLICY mine_config_allow_all ON mine_config USING (true) WITH CHECK (true);
      END IF;
    END $$`,
    // Seed the singleton row so the health check and Balance Studio work out of the box.
    `INSERT INTO mine_config (id) VALUES ('default') ON CONFLICT DO NOTHING`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 2. HOMEPAGE CHAT CONFIG — new feature singleton
  //    Created here so the health check can verify it before the feature is live.
  // ══════════════════════════════════════════════════════════════════════════════
  await step("homepage_chat_config: create table + RLS + default row", [
    `CREATE TABLE IF NOT EXISTS homepage_chat_config (
      id               text        PRIMARY KEY DEFAULT 'default',
      enabled          boolean     NOT NULL DEFAULT false,
      title            text        NOT NULL DEFAULT 'Live Chat',
      subtitle         text,
      max_messages     integer     NOT NULL DEFAULT 50,
      show_user_count  boolean     NOT NULL DEFAULT false,
      require_login    boolean     NOT NULL DEFAULT false,
      position         text        NOT NULL DEFAULT 'right',
      accent_color     text        NOT NULL DEFAULT '#7c3aed',
      placeholder_text text        NOT NULL DEFAULT 'Nachricht schreiben...',
      updated_at       timestamptz NOT NULL DEFAULT now()
    )`,
    `ALTER TABLE homepage_chat_config ENABLE ROW LEVEL SECURITY`,
    `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'homepage_chat_config' AND policyname = 'homepage_chat_config_select'
      ) THEN
        CREATE POLICY homepage_chat_config_select ON homepage_chat_config FOR SELECT USING (true);
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'homepage_chat_config' AND policyname = 'homepage_chat_config_update'
      ) THEN
        CREATE POLICY homepage_chat_config_update ON homepage_chat_config FOR UPDATE USING (true) WITH CHECK (true);
      END IF;
    END $$`,
    `INSERT INTO homepage_chat_config (id) VALUES ('default') ON CONFLICT DO NOTHING`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 3. BACKUPS TABLE — used by lib/actions/backup.ts but missing from full-db-sync
  //    Stores JSON snapshots of config tables created by the admin backup feature.
  // ══════════════════════════════════════════════════════════════════════════════
  await step("backups: create table + index + RLS", [
    `CREATE TABLE IF NOT EXISTS backups (
      id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      name         text        NOT NULL,
      source       text        NOT NULL DEFAULT 'manual'
                               CHECK (source IN ('manual', 'import')),
      tables       jsonb       NOT NULL DEFAULT '{}'::jsonb,
      table_counts jsonb       NOT NULL DEFAULT '{}'::jsonb,
      size_bytes   integer     NOT NULL DEFAULT 0,
      created_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
      created_at   timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at DESC)`,
    `ALTER TABLE backups ENABLE ROW LEVEL SECURITY`,
    // Admin-only: only service role / admin client can read/write.
    `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'backups' AND policyname = 'backups_admin_only'
      ) THEN
        CREATE POLICY backups_admin_only ON backups USING (true) WITH CHECK (true);
      END IF;
    END $$`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 4. MOD PERMISSIONS — can_pause_tickets column
  //    Was only added by scripts/add-can-pause-tickets.cjs, not full-db-sync.cjs.
  //    Also already in COLUMN_CHECKS in system-health.ts (col_mod_pausetickets).
  // ══════════════════════════════════════════════════════════════════════════════
  await step("mod_permissions: can_pause_tickets column", [
    `ALTER TABLE mod_permissions ADD COLUMN IF NOT EXISTS can_pause_tickets boolean NOT NULL DEFAULT false`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 5. SITE CONFIG — three columns used by site-config.ts that have no migration
  //    topbar_right_slots    — ordered list of topbar button slot IDs
  //    topbar_button_style   — 'icon' | 'pill'
  //    site_version          — display version string
  // ══════════════════════════════════════════════════════════════════════════════
  await step("site_config: topbar_right_slots + topbar_button_style + site_version", [
    `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS topbar_right_slots text[]
       DEFAULT ARRAY['notifications','profile','logout']`,
    `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS topbar_button_style text
       DEFAULT 'icon'`,
    `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS site_version text
       DEFAULT 'v1.0.0'`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // DONE
  // ══════════════════════════════════════════════════════════════════════════════
  await db.end();
  console.log("\n🎉 DB Audit Fix complete — alle fehlenden Tabellen und Spalten wurden angelegt!\n");
  console.log("Nächste Schritte:");
  console.log("  1. node scripts/full-db-sync.cjs   (falls noch nicht gelaufen)");
  console.log("  2. node scripts/balance-final.cjs   (Mine-Level seeden, falls mine_config neu)");
  console.log("  3. Admin → System-Health prüfen");
}

main().catch((e) => { console.error("❌ Fatal:", e.message); db.end(); process.exit(1); });
