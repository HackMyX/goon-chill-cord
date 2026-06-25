/**
 * Full DB Sync — ensures EVERY table, column, singleton row, and seed is in place.
 * Safe to run multiple times (all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING).
 *
 * Run: node scripts/full-db-sync.cjs
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

  // ══════════════════════════════════════════════════════════════════════════════
  // 1. PROFILES — extra columns
  // ══════════════════════════════════════════════════════════════════════════════
  await step("profiles: extra columns", [
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false`,
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS don_upgrade_tier integer NOT NULL DEFAULT 0`,
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_name_style_key text`,
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS warning_strikes integer NOT NULL DEFAULT 0`,
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS warning_note text`,
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS temp_banned_until timestamptz`,
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mod_permissions_override jsonb`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 2. LOGIN EVENTS
  // ══════════════════════════════════════════════════════════════════════════════
  await step("login_events: fingerprint", [
    `ALTER TABLE login_events ADD COLUMN IF NOT EXISTS fingerprint text`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 3. MOD PERMISSIONS
  // ══════════════════════════════════════════════════════════════════════════════
  await step("mod_permissions: max_reward_per_ticket", [
    `ALTER TABLE mod_permissions ADD COLUMN IF NOT EXISTS max_reward_per_ticket integer DEFAULT 0`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 4. TICKETS
  // ══════════════════════════════════════════════════════════════════════════════
  await step("tickets: reward + escalation + attachment", [
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reward_pending boolean NOT NULL DEFAULT false`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS escalated_to_admin boolean NOT NULL DEFAULT false`,
    `ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS attachment_url text`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 5. TICKET INTERNAL NOTES (optional feature)
  // ══════════════════════════════════════════════════════════════════════════════
  await step("ticket_internal_notes table", [
    `CREATE TABLE IF NOT EXISTS ticket_internal_notes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      content text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `ALTER TABLE ticket_internal_notes ENABLE ROW LEVEL SECURITY`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 6. SITE CONFIG — extra columns
  // ══════════════════════════════════════════════════════════════════════════════
  await step("site_config: homepage + topbar columns", [
    `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS homepage_config jsonb`,
    `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS topbar_show_labels boolean DEFAULT false`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 7. PATCH NOTES
  // ══════════════════════════════════════════════════════════════════════════════
  await step("patch_notes: show_popup", [
    `ALTER TABLE patch_notes ADD COLUMN IF NOT EXISTS show_popup boolean NOT NULL DEFAULT false`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 8. GLOBAL CHAT
  // ══════════════════════════════════════════════════════════════════════════════
  await step("global_chat_messages: avatar_url", [
    `ALTER TABLE global_chat_messages ADD COLUMN IF NOT EXISTS avatar_url text`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 9. SHOP SETTINGS
  // ══════════════════════════════════════════════════════════════════════════════
  await step("shop_settings: motd columns", [
    `ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS motd text`,
    `ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS motd_enabled boolean DEFAULT false`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 10. STREAK CONFIG
  // ══════════════════════════════════════════════════════════════════════════════
  await step("streak_config: special event columns", [
    `ALTER TABLE streak_config ADD COLUMN IF NOT EXISTS special_event_enabled boolean DEFAULT false`,
    `ALTER TABLE streak_config ADD COLUMN IF NOT EXISTS special_event_multiplier numeric(4,2) DEFAULT 2.0`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 11. DON CONFIG
  // ══════════════════════════════════════════════════════════════════════════════
  await step("don_config: upgrade columns", [
    `ALTER TABLE don_config ADD COLUMN IF NOT EXISTS upgrade_enabled boolean NOT NULL DEFAULT false`,
    `ALTER TABLE don_config ADD COLUMN IF NOT EXISTS upgrade_tiers jsonb NOT NULL DEFAULT '[]'::jsonb`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 12. WORLD CONFIG — spawn columns
  // ══════════════════════════════════════════════════════════════════════════════
  await step("world_config: spawn config columns", [
    `ALTER TABLE world_config ADD COLUMN IF NOT EXISTS max_alive_monsters integer`,
    `ALTER TABLE world_config ADD COLUMN IF NOT EXISTS spawn_interval_min_sec numeric`,
    `ALTER TABLE world_config ADD COLUMN IF NOT EXISTS spawn_interval_max_sec numeric`,
    `ALTER TABLE world_config ADD COLUMN IF NOT EXISTS spawn_safe_radius numeric`,
    `ALTER TABLE world_config ADD COLUMN IF NOT EXISTS alive_cap_per_extra_player integer`,
    `ALTER TABLE world_config ADD COLUMN IF NOT EXISTS alive_cap_max integer`,
    `ALTER TABLE world_config ADD COLUMN IF NOT EXISTS spawn_interval_floor numeric`,
    `ALTER TABLE world_config ADD COLUMN IF NOT EXISTS cross_player_aggro_duration_sec numeric`,
    `ALTER TABLE world_config ADD COLUMN IF NOT EXISTS perk_multiplier_cap numeric`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 13. CHARACTER CONFIG — combat columns
  // ══════════════════════════════════════════════════════════════════════════════
  await step("character_config: all combat columns", [
    `ALTER TABLE character_config ADD COLUMN IF NOT EXISTS attack_cooldown numeric`,
    `ALTER TABLE character_config ADD COLUMN IF NOT EXISTS hp_regen_per_sec numeric`,
    `ALTER TABLE character_config ADD COLUMN IF NOT EXISTS hp_regen_delay_after_hit_sec numeric`,
    `ALTER TABLE character_config ADD COLUMN IF NOT EXISTS pvp_damage_multiplier numeric`,
    `ALTER TABLE character_config ADD COLUMN IF NOT EXISTS perk_multiplier_cap numeric`,
    `ALTER TABLE character_config ADD COLUMN IF NOT EXISTS fist_damage integer`,
    `ALTER TABLE character_config ADD COLUMN IF NOT EXISTS move_speed numeric`,
    `ALTER TABLE character_config ADD COLUMN IF NOT EXISTS sprint_multiplier numeric`,
    `ALTER TABLE character_config ADD COLUMN IF NOT EXISTS sprint_damage_multiplier numeric`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 14. KILL STREAK CONFIG — singleton + columns
  // ══════════════════════════════════════════════════════════════════════════════
  await step("kill_streak_config: create + seed default row", [
    `CREATE TABLE IF NOT EXISTS kill_streak_config (
      id text PRIMARY KEY DEFAULT 'default',
      multiplier_per_kill numeric NOT NULL DEFAULT 0.04,
      max_multiplier numeric NOT NULL DEFAULT 3.0,
      mob_scale_per_kill numeric NOT NULL DEFAULT 0.012,
      mob_scale_max numeric NOT NULL DEFAULT 3.5,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `ALTER TABLE kill_streak_config ENABLE ROW LEVEL SECURITY`,
    `INSERT INTO kill_streak_config (id) VALUES ('default') ON CONFLICT DO NOTHING`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 15. MONSTER TYPES — reward columns
  // ══════════════════════════════════════════════════════════════════════════════
  await step("monster_types: reward + balance columns", [
    `ALTER TABLE monster_types ADD COLUMN IF NOT EXISTS credits_reward integer NOT NULL DEFAULT 10`,
    `ALTER TABLE monster_types ADD COLUMN IF NOT EXISTS reward_min integer NOT NULL DEFAULT 0`,
    `ALTER TABLE monster_types ADD COLUMN IF NOT EXISTS reward_max integer NOT NULL DEFAULT 0`,
    `ALTER TABLE monster_types ADD COLUMN IF NOT EXISTS spawn_weight integer NOT NULL DEFAULT 10`,
  ]);

  // Seed default credits_reward if all are still 0/10
  await step("monster_types: seed credit rewards", [
    `UPDATE monster_types SET credits_reward = 60  WHERE id = 'slime_weak'      AND credits_reward <= 10`,
    `UPDATE monster_types SET credits_reward = 75  WHERE id = 'skeleton_weak'   AND credits_reward <= 10`,
    `UPDATE monster_types SET credits_reward = 85  WHERE id = 'zombie_weak'     AND credits_reward <= 10`,
    `UPDATE monster_types SET credits_reward = 180 WHERE id = 'zombie_strong'   AND credits_reward <= 10`,
    `UPDATE monster_types SET credits_reward = 200 WHERE id = 'skeleton_strong' AND credits_reward <= 10`,
    `UPDATE monster_types SET credits_reward = 240 WHERE id = 'ghost_wraith'    AND credits_reward <= 10`,
    `UPDATE monster_types SET credits_reward = 260 WHERE id = 'orc_brute'       AND credits_reward <= 10`,
    `UPDATE monster_types SET credits_reward = 800 WHERE id = 'demon_boss'      AND credits_reward <= 10`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 16. PLINKO CONFIG + PLAYS
  // ══════════════════════════════════════════════════════════════════════════════
  await step("plinko_config: create + seed", [
    `CREATE TABLE IF NOT EXISTS plinko_config (
      id text PRIMARY KEY DEFAULT 'default',
      enabled boolean NOT NULL DEFAULT true,
      hourly_ball_limit integer NOT NULL DEFAULT 20,
      ball_cost_cr integer NOT NULL DEFAULT 2000,
      rows integer NOT NULL DEFAULT 8,
      risk_levels jsonb NOT NULL DEFAULT '[
        {"key":"low","label":"Niedrig","emoji":"🟢","multipliers":[1.5,1.3,1.1,0.9,0.8,0.9,1.1,1.3,1.5]},
        {"key":"medium","label":"Mittel","emoji":"🟡","multipliers":[5,2,1.5,0.8,0.5,0.8,1.5,2,5]},
        {"key":"high","label":"Hoch","emoji":"🔴","multipliers":[10,3,1.5,0.5,0.2,0.5,1.5,3,10]}
      ]'::jsonb,
      max_win_cr integer NOT NULL DEFAULT 0,
      announce_big_wins boolean NOT NULL DEFAULT true,
      big_win_threshold integer NOT NULL DEFAULT 10000,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `INSERT INTO plinko_config (id) VALUES ('default') ON CONFLICT DO NOTHING`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS min_bet_cr integer DEFAULT 2000`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS max_bet_cr integer DEFAULT 0`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS quick_bet_amounts jsonb DEFAULT '[2000,10000,50000,200000,1000000]'`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS particles_enabled boolean DEFAULT true`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS trail_length integer DEFAULT 6`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS glow_intensity numeric DEFAULT 1.5`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS animation_speed numeric DEFAULT 1.0`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS auto_bet_enabled boolean DEFAULT true`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS daily_ball_limit integer NOT NULL DEFAULT 0`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS show_history boolean NOT NULL DEFAULT true`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS show_leaderboard boolean NOT NULL DEFAULT true`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS leaderboard_size integer NOT NULL DEFAULT 10`,
  ]);

  await step("plinko_plays table", [
    `CREATE TABLE IF NOT EXISTS plinko_plays (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id uuid NOT NULL,
      risk_level text NOT NULL,
      ball_cost integer NOT NULL,
      result_multiplier numeric(8,2) NOT NULL,
      payout_cr integer NOT NULL,
      bucket_index integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_plinko_plays_user_time ON plinko_plays(user_id, created_at)`,
    `ALTER TABLE plinko_plays ENABLE ROW LEVEL SECURITY`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 17. CASE TIERS — extended columns
  // ══════════════════════════════════════════════════════════════════════════════
  await step("case_tiers: extended columns", [
    `ALTER TABLE case_tiers ADD COLUMN IF NOT EXISTS preview_cost integer DEFAULT 0`,
    `ALTER TABLE case_tiers ADD COLUMN IF NOT EXISTS multi_open_max integer DEFAULT 10`,
    `ALTER TABLE case_tiers ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0`,
    `ALTER TABLE case_tiers ADD COLUMN IF NOT EXISTS per_rarity_item_ids jsonb`,
    `ALTER TABLE case_tiers ADD COLUMN IF NOT EXISTS name_styles_eligible boolean DEFAULT false`,
    `ALTER TABLE case_tiers ADD COLUMN IF NOT EXISTS tier_sublabel text`,
    `ALTER TABLE case_tiers ADD COLUMN IF NOT EXISTS group_id text`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 18. CASE GROUPS
  // ══════════════════════════════════════════════════════════════════════════════
  await step("case_groups table", [
    `CREATE TABLE IF NOT EXISTS case_groups (
      id           TEXT        PRIMARY KEY,
      title        TEXT        NOT NULL,
      subtitle     TEXT,
      icon_name    TEXT        NOT NULL DEFAULT 'package',
      item_types   TEXT[]      NOT NULL DEFAULT '{}',
      display_order INTEGER    NOT NULL DEFAULT 0,
      enabled      BOOLEAN     NOT NULL DEFAULT true,
      accent_color TEXT,
      is_custom    BOOLEAN     NOT NULL DEFAULT false,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `ALTER TABLE case_groups ENABLE ROW LEVEL SECURITY`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='case_groups' AND policyname='case_groups_select_all') THEN
        CREATE POLICY case_groups_select_all ON case_groups FOR SELECT USING (true);
      END IF;
    END $$`,
    `INSERT INTO case_groups (id, title, subtitle, icon_name, item_types, display_order, enabled, is_custom) VALUES
      ('cosmetics','Case Opening',NULL,'package',
        ARRAY['hat','jacket','pants','shoes','trail','shield_cosmetic','aura','face','hair','pet','ring','amulet'],
        0, true, false),
      ('weapons','Waffen Case','Gewinne Waffen für den 3D-World-Kampf — ab 25.000 CR','swords',
        ARRAY['weapon_cosmetic'],
        1, true, false)
    ON CONFLICT (id) DO NOTHING`,
  ]);

  // Assign group_id to existing case tiers
  await step("case_tiers: assign group_id", [
    `UPDATE case_tiers SET group_id = 'cosmetics', sort_order = 0 WHERE id = 'cosmetics-standard' AND group_id IS NULL`,
    `UPDATE case_tiers SET group_id = 'cosmetics', sort_order = 1 WHERE id = 'cosmetics-premium'  AND group_id IS NULL`,
    `UPDATE case_tiers SET group_id = 'weapons',   sort_order = 0 WHERE id = 'weapons-standard'   AND group_id IS NULL`,
    `UPDATE case_tiers SET group_id = 'weapons',   sort_order = 1 WHERE id = 'weapons-premium'    AND group_id IS NULL`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 19. BATTLE PASS TABLES
  // ══════════════════════════════════════════════════════════════════════════════
  await step("battle_passes table", [
    `CREATE TABLE IF NOT EXISTS battle_passes (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name text NOT NULL,
      season_label text NOT NULL DEFAULT 'Pass',
      description text,
      price_cr integer NOT NULL DEFAULT 2000,
      enabled boolean NOT NULL DEFAULT true,
      is_active boolean NOT NULL DEFAULT false,
      start_date date,
      end_date date,
      tier_count integer NOT NULL DEFAULT 20,
      spin_chance_boost numeric(4,3) NOT NULL DEFAULT 0.020,
      banner_color text NOT NULL DEFAULT '#7c3aed',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `ALTER TABLE battle_passes ENABLE ROW LEVEL SECURITY`,
    `CREATE TABLE IF NOT EXISTS battle_pass_tiers (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      pass_id text NOT NULL REFERENCES battle_passes(id) ON DELETE CASCADE,
      tier_number integer NOT NULL,
      name text NOT NULL DEFAULT 'Belohnung',
      is_premium boolean NOT NULL DEFAULT true,
      reward_type text NOT NULL DEFAULT 'credits',
      reward_credits integer DEFAULT 100,
      reward_item_id text,
      reward_badge_key text,
      icon text NOT NULL DEFAULT '🎁',
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(pass_id, tier_number)
    )`,
    `ALTER TABLE battle_pass_tiers ENABLE ROW LEVEL SECURITY`,
    `CREATE TABLE IF NOT EXISTS user_battle_passes (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id uuid NOT NULL,
      pass_id text NOT NULL REFERENCES battle_passes(id) ON DELETE CASCADE,
      has_premium boolean NOT NULL DEFAULT false,
      progress_days integer NOT NULL DEFAULT 0,
      purchased_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id, pass_id)
    )`,
    `ALTER TABLE user_battle_passes ENABLE ROW LEVEL SECURITY`,
    `CREATE TABLE IF NOT EXISTS user_bp_tier_claims (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id uuid NOT NULL,
      pass_id text NOT NULL,
      tier_id text NOT NULL REFERENCES battle_pass_tiers(id) ON DELETE CASCADE,
      claimed_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id, tier_id)
    )`,
    `ALTER TABLE user_bp_tier_claims ENABLE ROW LEVEL SECURITY`,
  ]);

  await step("battle_passes: v2 + elite + shop + icon columns", [
    `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'default'`,
    `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS accent_color text NOT NULL DEFAULT '#7c3aed'`,
    `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS banner_image_url text`,
    `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS show_in_shop boolean NOT NULL DEFAULT true`,
    `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS show_on_dashboard boolean NOT NULL DEFAULT true`,
    `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS elite_price_cr integer NOT NULL DEFAULT 0`,
    `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS elite_enabled boolean NOT NULL DEFAULT false`,
    `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS shop_sort_order integer NOT NULL DEFAULT 0`,
    `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS shop_position text DEFAULT 'below_featured'`,
    `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS shop_banner_size text DEFAULT 'card'`,
    `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS custom_buy_text text`,
    `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS custom_elite_buy_text text`,
    `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS highlight_color text`,
    `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS show_tier_count_in_shop boolean DEFAULT true`,
    `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS show_countdown boolean DEFAULT true`,
    `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS pass_icon text DEFAULT '🏆'`,
  ]);

  await step("battle_pass_tiers: v2 + elite + name-style columns", [
    `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS reward_badge_text text`,
    `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS reward_item_rarity text`,
    `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS reward_xp_boost integer`,
    `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS reward_quantity integer NOT NULL DEFAULT 1`,
    `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS highlight_tier boolean NOT NULL DEFAULT false`,
    `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS description text`,
    `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS is_elite boolean NOT NULL DEFAULT false`,
    `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS reward_name_style_key text`,
  ]);

  await step("user_battle_passes: elite columns", [
    `ALTER TABLE user_battle_passes ADD COLUMN IF NOT EXISTS has_elite boolean NOT NULL DEFAULT false`,
    `ALTER TABLE user_battle_passes ADD COLUMN IF NOT EXISTS elite_purchased_at timestamptz`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 20. BADGE SYSTEM
  // ══════════════════════════════════════════════════════════════════════════════
  await step("badge_definitions + user_badges", [
    `CREATE TABLE IF NOT EXISTS badge_definitions (
      key text PRIMARY KEY,
      label text NOT NULL,
      color text NOT NULL DEFAULT '#7c3aed',
      icon text NOT NULL DEFAULT '⭐',
      description text,
      created_by uuid,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `ALTER TABLE badge_definitions ENABLE ROW LEVEL SECURITY`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='badge_definitions' AND policyname='public read badge_definitions') THEN
        CREATE POLICY "public read badge_definitions" ON badge_definitions FOR SELECT USING (true);
      END IF;
    END $$`,
    `CREATE TABLE IF NOT EXISTS user_badges (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      badge_key text NOT NULL REFERENCES badge_definitions(key) ON DELETE CASCADE,
      granted_by uuid,
      granted_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id, badge_key)
    )`,
    `ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_badges' AND policyname='public read user_badges') THEN
        CREATE POLICY "public read user_badges" ON user_badges FOR SELECT USING (true);
      END IF;
    END $$`,
  ]);

  await step("badge_definitions: seed", [
    `INSERT INTO badge_definitions (key,label,color,icon,description) VALUES
      ('verified',    'Verifiziert',      '#3b82f6', '✔',  'Offiziell verifiziertes Mitglied'),
      ('premium',     'Premium',          '#f59e0b', '♛',  'Premium Battle Pass Inhaber'),
      ('elite',       'Elite',            '#a855f7', '💎', 'Elite Battle Pass Inhaber'),
      ('mod',         'Moderator',        '#22c55e', '🛡', 'Team-Mitglied'),
      ('admin',       'Admin',            '#ef4444', '⚡', 'Administrator'),
      ('og',          'OG-Mitglied',      '#f97316', '👑', 'Eines der ersten Mitglieder'),
      ('streaker',    'Streak-König',     '#eab308', '🔥', '30-Tage Streak erreicht'),
      ('vip',         'VIP',              '#d946ef', '💜', 'VIP-Status'),
      ('helper',      'Community-Helfer', '#06b6d4', '💬', 'Hilfreicher Community-Helfer'),
      ('ns_collector','Stil-Sammler',     '#c084fc', '🎨', 'Besitzt 5+ Name Styles'),
      ('ns_ultra',    'Stil-Legende',     '#f59e0b', '👑', 'Besitzt einen Ultra Name Style'),
      ('ns_mythisch', 'Stil-Meister',     '#a855f7', '✨', 'Besitzt einen Mythisch Name Style'),
      ('grinder',     'Grinder',          '#f97316', '🔥', 'Aktiver Farmer und Grinder'),
      ('season_vet',  'Season-Veteran',   '#60a5fa', '⭐', 'War beim Start dabei')
    ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, color=EXCLUDED.color, icon=EXCLUDED.icon, description=EXCLUDED.description`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 21. NAME STYLES
  // ══════════════════════════════════════════════════════════════════════════════
  await step("name_styles + user_name_styles tables", [
    `CREATE TABLE IF NOT EXISTS name_styles (
      key                text PRIMARY KEY,
      label              text NOT NULL,
      description        text,
      rarity             text NOT NULL DEFAULT 'normal',
      category           text NOT NULL DEFAULT 'gradient',
      color1             text NOT NULL DEFAULT '#f4f4f5',
      color2             text,
      color3             text,
      color4             text,
      animation_type     text NOT NULL DEFAULT 'none',
      animation_speed    numeric(4,2) NOT NULL DEFAULT 1.0,
      glow_color         text,
      glow_radius        integer NOT NULL DEFAULT 0,
      prefix_icon        text,
      suffix_icon        text,
      unlock_price_cr    integer NOT NULL DEFAULT 0,
      can_win_from_case  boolean NOT NULL DEFAULT true,
      is_special         boolean NOT NULL DEFAULT false,
      sort_order         integer NOT NULL DEFAULT 0,
      created_at         timestamptz NOT NULL DEFAULT now()
    )`,
    `ALTER TABLE name_styles ENABLE ROW LEVEL SECURITY`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='name_styles' AND policyname='public read name_styles') THEN
        CREATE POLICY "public read name_styles" ON name_styles FOR SELECT USING (true);
      END IF;
    END $$`,
    `CREATE TABLE IF NOT EXISTS user_name_styles (
      id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      style_key   text NOT NULL REFERENCES name_styles(key) ON DELETE CASCADE,
      source      text NOT NULL DEFAULT 'gifted',
      unlocked_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id, style_key)
    )`,
    `ALTER TABLE user_name_styles ENABLE ROW LEVEL SECURITY`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_name_styles' AND policyname='public read user_name_styles') THEN
        CREATE POLICY "public read user_name_styles" ON user_name_styles FOR SELECT USING (true);
      END IF;
    END $$`,
  ]);

  await step("name_styles: shop columns", [
    `ALTER TABLE name_styles ADD COLUMN IF NOT EXISTS available_in_shop boolean NOT NULL DEFAULT false`,
    `ALTER TABLE name_styles ADD COLUMN IF NOT EXISTS shop_price_cr integer NOT NULL DEFAULT 0`,
    `ALTER TABLE name_styles ADD COLUMN IF NOT EXISTS shop_stock integer`,
    `ALTER TABLE name_styles ADD COLUMN IF NOT EXISTS shop_expires_at timestamptz`,
    `ALTER TABLE name_styles ADD COLUMN IF NOT EXISTS shop_sort_order integer NOT NULL DEFAULT 0`,
  ]);

  await step("name_style_rarity_config table + seed", [
    `CREATE TABLE IF NOT EXISTS name_style_rarity_config (
      rarity text PRIMARY KEY,
      base_shop_price_cr bigint NOT NULL DEFAULT 50000,
      max_shop_price_cr bigint NOT NULL DEFAULT 500000,
      case_drop_weight integer NOT NULL DEFAULT 50,
      case_drop_enabled boolean NOT NULL DEFAULT false,
      bp_reward_enabled boolean NOT NULL DEFAULT true,
      can_trade boolean NOT NULL DEFAULT false,
      label_override text,
      glow_color_override text,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `ALTER TABLE name_style_rarity_config ENABLE ROW LEVEL SECURITY`,
    `INSERT INTO name_style_rarity_config (rarity,base_shop_price_cr,max_shop_price_cr,case_drop_weight,case_drop_enabled,bp_reward_enabled,can_trade) VALUES
      ('normal',   40000,      100000,    200, false, true, false),
      ('selten',   300000,     800000,     80, false, true, false),
      ('mythisch', 2000000,   6000000,     20, false, true, false),
      ('ultra',    12000000,  30000000,     5, false, true, false)
    ON CONFLICT (rarity) DO NOTHING`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 22. PET RARITY OVERRIDES
  // ══════════════════════════════════════════════════════════════════════════════
  await step("pet_rarity_overrides table", [
    `CREATE TABLE IF NOT EXISTS pet_rarity_overrides (
      pet_type_id TEXT NOT NULL,
      rarity      TEXT NOT NULL,
      damage      INTEGER NOT NULL DEFAULT 4,
      aggro_radius FLOAT NOT NULL DEFAULT 5,
      attack_speed FLOAT NOT NULL DEFAULT 1.0,
      move_speed   FLOAT NOT NULL DEFAULT 3.4,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (pet_type_id, rarity)
    )`,
    `ALTER TABLE pet_rarity_overrides ENABLE ROW LEVEL SECURITY`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pet_rarity_overrides' AND policyname='allow_read') THEN
        CREATE POLICY allow_read ON pet_rarity_overrides FOR SELECT USING (true);
      END IF;
    END $$`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 23. OPTIONAL: auction_bids + trade_items
  // ══════════════════════════════════════════════════════════════════════════════
  await step("optional: auction_bids + trade_items", [
    `CREATE TABLE IF NOT EXISTS auction_bids (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      auction_id uuid NOT NULL,
      bidder_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
      amount integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `ALTER TABLE auction_bids ENABLE ROW LEVEL SECURITY`,
    `CREATE INDEX IF NOT EXISTS idx_auction_bids_auction ON auction_bids(auction_id)`,
    `CREATE TABLE IF NOT EXISTS trade_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      trade_id uuid NOT NULL,
      inventory_id uuid REFERENCES inventory(id) ON DELETE SET NULL,
      side text NOT NULL DEFAULT 'from' CHECK (side IN ('from','to')),
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `ALTER TABLE trade_items ENABLE ROW LEVEL SECURITY`,
    `CREATE INDEX IF NOT EXISTS idx_trade_items_trade ON trade_items(trade_id)`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 24. CLEANUP CONFIG SEED
  // ══════════════════════════════════════════════════════════════════════════════
  await step("cleanup_config: seed all rows", [
    `INSERT INTO cleanup_config (source_key,enabled,retention_days,updated_at) VALUES
      ('debug_logs',          false,  7,  now()),
      ('global_chat_messages',false,  30, now()),
      ('mod_actions',         false,  90, now()),
      ('login_events',        false,  30, now()),
      ('notifications',       false,  60, now()),
      ('audit_logs',          false, 365, now()),
      ('tickets_closed',      false, 180, now()),
      ('trade_offers_done',   false,  30, now()),
      ('auctions_done',       false,  30, now()),
      ('plinko_plays',        false,  30, now()),
      ('snake_best_scores',   false, 365, now())
    ON CONFLICT (source_key) DO NOTHING`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 25. POLLS (placeholder)
  // ══════════════════════════════════════════════════════════════════════════════
  await step("polls tables (placeholder)", [
    `CREATE TABLE IF NOT EXISTS polls (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      title text NOT NULL,
      description text,
      status text NOT NULL DEFAULT 'draft',
      created_at timestamptz NOT NULL DEFAULT now(),
      ends_at timestamptz,
      created_by uuid
    )`,
    `ALTER TABLE polls ENABLE ROW LEVEL SECURITY`,
    `CREATE TABLE IF NOT EXISTS poll_options (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      poll_id text NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
      label text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0
    )`,
    `ALTER TABLE poll_options ENABLE ROW LEVEL SECURITY`,
    `CREATE TABLE IF NOT EXISTS poll_votes (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      poll_id text NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
      option_id text NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
      user_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(poll_id, user_id)
    )`,
    `ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY`,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 26. STORAGE: ticket-attachments bucket policy check (informational)
  // ══════════════════════════════════════════════════════════════════════════════
  // Storage buckets can only be created via Supabase API/dashboard, not pg.
  // Run scripts/migrate-ticket-attachments.cjs to create the bucket if needed.

  // ══════════════════════════════════════════════════════════════════════════════
  // DONE
  // ══════════════════════════════════════════════════════════════════════════════
  await db.end();
  console.log("\n🎉 Full DB sync complete — all tables, columns, and seeds are in place!\n");
}

main().catch((e) => { console.error("❌ Fatal:", e.message); db.end(); process.exit(1); });
