/**
 * Master Migration Runner
 * Runs all schema migrations in the correct dependency order.
 * Safe to run multiple times — all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING.
 *
 * Usage: node scripts/run-all-migrations.cjs
 */

const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function run(label, sqls, client) {
  console.log(`\n── ${label} ──`);
  for (const sql of Array.isArray(sqls) ? sqls : [sqls]) {
    try {
      await client.query(sql);
      const preview = sql.replace(/\s+/g, " ").trim().slice(0, 80);
      console.log(`  ✅ ${preview}`);
    } catch (e) {
      const preview = sql.replace(/\s+/g, " ").trim().slice(0, 80);
      // Column/table already exists → not a real error
      if (
        e.message.includes("already exists") ||
        e.message.includes("duplicate column")
      ) {
        console.log(`  ⏭  (already exists) ${preview}`);
      } else {
        console.log(`  ❌ ${preview}`);
        console.log(`     ${e.message.split("\n")[0]}`);
      }
    }
  }
}

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("✅ Connected to DB");

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. CORE PROFILE / AUTH COLUMNS
  // ─────────────────────────────────────────────────────────────────────────────
  await run("Profiles: extra columns", [
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false`,
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS don_upgrade_tier integer NOT NULL DEFAULT 0`,
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_name_style_key text`,
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS warning_strikes integer NOT NULL DEFAULT 0`,
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS warning_note text`,
  ], client);

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. LOGIN EVENTS
  // ─────────────────────────────────────────────────────────────────────────────
  await run("login_events: fingerprint column", [
    `ALTER TABLE login_events ADD COLUMN IF NOT EXISTS fingerprint text`,
  ], client);

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. DON CONFIG UPGRADE COLUMNS
  // ─────────────────────────────────────────────────────────────────────────────
  await run("don_config: upgrade columns", [
    `ALTER TABLE don_config ADD COLUMN IF NOT EXISTS upgrade_enabled boolean NOT NULL DEFAULT false`,
    `ALTER TABLE don_config ADD COLUMN IF NOT EXISTS upgrade_tiers jsonb NOT NULL DEFAULT '[]'::jsonb`,
  ], client);

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. TICKETS: reward + escalation columns
  // ─────────────────────────────────────────────────────────────────────────────
  await run("tickets: reward_pending + escalated_to_admin", [
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reward_pending boolean NOT NULL DEFAULT false`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS escalated_to_admin boolean NOT NULL DEFAULT false`,
  ], client);

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. POLLS (placeholder — feature not yet live)
  // ─────────────────────────────────────────────────────────────────────────────
  await run("polls tables", [
    `CREATE TABLE IF NOT EXISTS polls (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      title text NOT NULL,
      description text,
      status text NOT NULL DEFAULT 'draft',
      created_at timestamptz NOT NULL DEFAULT now(),
      ends_at timestamptz,
      created_by uuid
    )`,
    `CREATE TABLE IF NOT EXISTS poll_options (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      poll_id text NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
      label text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS poll_votes (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      poll_id text NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
      option_id text NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
      user_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(poll_id, user_id)
    )`,
    `ALTER TABLE polls ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE poll_options ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY`,
  ], client);

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. PLINKO CONFIG + PLAYS
  // ─────────────────────────────────────────────────────────────────────────────
  await run("plinko_config table", [
    `CREATE TABLE IF NOT EXISTS plinko_config (
      id text PRIMARY KEY DEFAULT 'default',
      enabled boolean NOT NULL DEFAULT true,
      hourly_ball_limit integer NOT NULL DEFAULT 20,
      ball_cost_cr integer NOT NULL DEFAULT 100,
      rows integer NOT NULL DEFAULT 8,
      risk_levels jsonb NOT NULL DEFAULT '[
        {"key":"low","label":"Niedrig","emoji":"🟢","multipliers":[1.5,1.3,1.1,0.9,0.8,0.9,1.1,1.3,1.5]},
        {"key":"medium","label":"Mittel","emoji":"🟡","multipliers":[5,2,1.5,0.8,0.5,0.8,1.5,2,5]},
        {"key":"high","label":"Hoch","emoji":"🔴","multipliers":[10,3,1.5,0.5,0.2,0.5,1.5,3,10]}
      ]'::jsonb,
      max_win_cr integer NOT NULL DEFAULT 0,
      announce_big_wins boolean NOT NULL DEFAULT true,
      big_win_threshold integer NOT NULL DEFAULT 1000,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `INSERT INTO plinko_config (id) VALUES ('default') ON CONFLICT DO NOTHING`,
  ], client);

  await run("plinko_config: v2 columns", [
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS min_bet_cr integer DEFAULT 500`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS max_bet_cr integer DEFAULT 0`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS quick_bet_amounts jsonb DEFAULT '[500,1000,5000,25000,100000]'`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS particles_enabled boolean DEFAULT true`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS trail_length integer DEFAULT 6`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS glow_intensity numeric DEFAULT 1.5`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS animation_speed numeric DEFAULT 1.0`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS auto_bet_enabled boolean DEFAULT true`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS daily_ball_limit integer NOT NULL DEFAULT 0`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS show_history boolean NOT NULL DEFAULT true`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS show_leaderboard boolean NOT NULL DEFAULT true`,
    `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS leaderboard_size integer NOT NULL DEFAULT 10`,
  ], client);

  await run("plinko_plays table", [
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
  ], client);

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. BATTLE PASS TABLES
  // ─────────────────────────────────────────────────────────────────────────────
  await run("battle_passes table", [
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
    `CREATE TABLE IF NOT EXISTS user_bp_tier_claims (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id uuid NOT NULL,
      pass_id text NOT NULL,
      tier_id text NOT NULL REFERENCES battle_pass_tiers(id) ON DELETE CASCADE,
      claimed_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id, tier_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ubp_user ON user_battle_passes(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ubp_pass ON user_battle_passes(pass_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ubtc_user ON user_bp_tier_claims(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_bpt_pass_num ON battle_pass_tiers(pass_id, tier_number)`,
    `ALTER TABLE battle_passes ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE battle_pass_tiers ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE user_battle_passes ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE user_bp_tier_claims ENABLE ROW LEVEL SECURITY`,
  ], client);

  await run("battle_passes: v2 + elite + shop columns", [
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
  ], client);

  await run("battle_pass_tiers: v2 + elite + name-style columns", [
    `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS reward_badge_text text`,
    `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS reward_item_rarity text`,
    `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS reward_xp_boost integer`,
    `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS reward_quantity integer NOT NULL DEFAULT 1`,
    `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS highlight_tier boolean NOT NULL DEFAULT false`,
    `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS description text`,
    `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS is_elite boolean NOT NULL DEFAULT false`,
    `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS reward_name_style_key text NULL`,
  ], client);

  await run("user_battle_passes: elite columns", [
    `ALTER TABLE user_battle_passes ADD COLUMN IF NOT EXISTS has_elite boolean NOT NULL DEFAULT false`,
    `ALTER TABLE user_battle_passes ADD COLUMN IF NOT EXISTS elite_purchased_at timestamptz`,
  ], client);

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. BADGE SYSTEM
  // ─────────────────────────────────────────────────────────────────────────────
  await run("badge_definitions + user_badges tables", [
    `CREATE TABLE IF NOT EXISTS badge_definitions (
      key text PRIMARY KEY,
      label text NOT NULL,
      color text NOT NULL DEFAULT '#7c3aed',
      icon text NOT NULL DEFAULT '⭐',
      description text,
      created_by uuid REFERENCES profiles(id),
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS user_badges (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      badge_key text NOT NULL REFERENCES badge_definitions(key) ON DELETE CASCADE,
      granted_by uuid REFERENCES profiles(id),
      granted_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id, badge_key)
    )`,
    `ALTER TABLE badge_definitions ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='badge_definitions' AND policyname='public read badge_definitions') THEN
        CREATE POLICY "public read badge_definitions" ON badge_definitions FOR SELECT USING (true);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_badges' AND policyname='public read user_badges') THEN
        CREATE POLICY "public read user_badges" ON user_badges FOR SELECT USING (true);
      END IF;
    END $$`,
  ], client);

  await run("badge_definitions: seed all badges", [
    `INSERT INTO badge_definitions (key, label, color, icon, description) VALUES
      ('verified',    'Verifiziert',      '#3b82f6', '✔',  'Offiziell verifiziertes Mitglied'),
      ('premium',     'Premium',          '#f59e0b', '♛',  'Premium Battle Pass Inhaber'),
      ('elite',       'Elite',            '#a855f7', '💎', 'Elite Battle Pass Inhaber'),
      ('mod',         'Moderator',        '#22c55e', '🛡', 'Team-Mitglied'),
      ('admin',       'Admin',            '#ef4444', '⚡', 'Administrator'),
      ('og',          'OG-Mitglied',      '#f97316', '👑', 'Eines der ersten Mitglieder'),
      ('streaker',    'Streak-König',     '#eab308', '🔥', '30-Tage Streak erreicht'),
      ('vip',         'VIP',              '#d946ef', '💜', 'VIP-Status'),
      ('helper',      'Community-Helfer', '#06b6d4', '💬', 'Hilfreicher Community-Helfer'),
      ('ns_collector','Stil-Sammler',     '#c084fc', '🎨', 'Besitzt 5+ Name Styles — automatisch vergeben'),
      ('ns_ultra',    'Stil-Legende',     '#f59e0b', '👑', 'Besitzt einen Ultra Name Style — automatisch vergeben'),
      ('ns_mythisch', 'Stil-Meister',     '#a855f7', '✨', 'Besitzt einen Mythisch Name Style — automatisch vergeben'),
      ('grinder',     'Grinder',          '#f97316', '🔥', 'Aktiver Farmer und Grinder — vom Admin vergeben'),
      ('season_vet',  'Season-Veteran',   '#60a5fa', '⭐', 'War beim Start des Servers dabei — vom Admin vergeben')
    ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, color=EXCLUDED.color, icon=EXCLUDED.icon, description=EXCLUDED.description`,
  ], client);

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. NAME STYLES
  // ─────────────────────────────────────────────────────────────────────────────
  await run("name_styles + user_name_styles tables", [
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
    `CREATE TABLE IF NOT EXISTS user_name_styles (
      id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      style_key    text NOT NULL REFERENCES name_styles(key) ON DELETE CASCADE,
      source       text NOT NULL DEFAULT 'gifted',
      unlocked_at  timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id, style_key)
    )`,
    `ALTER TABLE name_styles ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE user_name_styles ENABLE ROW LEVEL SECURITY`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='name_styles' AND policyname='public read name_styles') THEN
        CREATE POLICY "public read name_styles" ON name_styles FOR SELECT USING (true);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_name_styles' AND policyname='public read user_name_styles') THEN
        CREATE POLICY "public read user_name_styles" ON user_name_styles FOR SELECT USING (true);
      END IF;
    END $$`,
  ], client);

  await run("name_styles: shop columns", [
    `ALTER TABLE name_styles ADD COLUMN IF NOT EXISTS available_in_shop boolean NOT NULL DEFAULT false`,
    `ALTER TABLE name_styles ADD COLUMN IF NOT EXISTS shop_price_cr integer NOT NULL DEFAULT 0`,
    `ALTER TABLE name_styles ADD COLUMN IF NOT EXISTS shop_stock integer NULL`,
    `ALTER TABLE name_styles ADD COLUMN IF NOT EXISTS shop_expires_at timestamptz NULL`,
    `ALTER TABLE name_styles ADD COLUMN IF NOT EXISTS shop_sort_order integer NOT NULL DEFAULT 0`,
  ], client);

  await run("name_styles: seed 27 styles", [
    // NORMAL
    `INSERT INTO name_styles (key,label,description,rarity,category,color1,color2,animation_type,glow_color,glow_radius,unlock_price_cr,can_win_from_case,sort_order) VALUES
    ('default',   'Standard',    'Schlichtes weiß — der Klassiker.',  'normal','solid','#f4f4f5',NULL,'none',NULL,0,50000,false,0),
    ('warm_white','Warmes Weiß', 'Warmes, cremiges Weiß.',             'normal','solid','#fef3c7',NULL,'none',NULL,0,50000,true, 1),
    ('sky',       'Himmelblau',  'Beruhigendes Himmelblau.',           'normal','solid','#7dd3fc',NULL,'none',NULL,0,50000,true, 2),
    ('mint',      'Mintgrün',    'Frisches Mint.',                     'normal','solid','#6ee7b7',NULL,'none',NULL,0,50000,true, 3),
    ('rose',      'Rose',        'Zart-rosiges Pink.',                 'normal','solid','#fda4af',NULL,'none',NULL,0,50000,true, 4)
    ON CONFLICT (key) DO NOTHING`,
    // SELTEN
    `INSERT INTO name_styles (key,label,description,rarity,category,color1,color2,color3,animation_type,glow_color,glow_radius,unlock_price_cr,can_win_from_case,sort_order) VALUES
    ('fire',      'Feuerrot',   'Lodernd wie Flammen.',            'selten','animated','#ff6b00','#ff0000','#ffaa00','shimmer','#ff4400',8, 350000,true,10),
    ('ice',       'Eisblau',    'Glitzernd wie Eis.',              'selten','animated','#bfdbfe','#60a5fa','#e0f2fe','shimmer','#3b82f6',6, 350000,true,11),
    ('toxic',     'Giftgrün',   'Giftig leuchtend.',               'selten','glow',    '#4ade80',NULL,    NULL,    'pulse', '#22c55e',10,350000,true,12),
    ('gold_shine','Goldglanz',  'Schimmerndes Gold.',              'selten','animated','#fbbf24','#f59e0b','#fde68a','shimmer','#f59e0b',6, 350000,true,13),
    ('neon_pink', 'Neon Pink',  'Knalliges Neon-Pink.',            'selten','glow',    '#f472b6',NULL,    NULL,    'pulse', '#ec4899',10,350000,true,14),
    ('neon_cyan', 'Neon Cyan',  'Elektrisches Cyan-Leuchten.',     'selten','glow',    '#22d3ee',NULL,    NULL,    'pulse', '#06b6d4',10,350000,true,15),
    ('blood',     'Blutrot',    'Tiefes Karmesinrot.',             'selten','glow',    '#dc2626',NULL,    NULL,    'pulse', '#991b1b',8, 350000,true,16),
    ('poison',    'Gift',       'Giftsäure-Grün.',                 'selten','animated','#84cc16','#365314',NULL,   'wave',  '#65a30d',8, 350000,true,17)
    ON CONFLICT (key) DO NOTHING`,
    // MYTHISCH
    `INSERT INTO name_styles (key,label,description,rarity,category,color1,color2,color3,animation_type,animation_speed,glow_color,glow_radius,unlock_price_cr,can_win_from_case,prefix_icon,sort_order) VALUES
    ('rainbow',  'Regenbogen','Voller Regenbogen-Cycle.',          'mythisch','animated','#ff0000','#00ff00','#0000ff','rainbow',1.0,NULL,      0, 2000000,true,NULL,20),
    ('lightning','Blitz',     'Elektrisches Gelb-Weiß.',           'mythisch','animated','#fef08a','#ffffff','#fde047','flicker',0.5,'#facc15',12,2000000,true,'⚡',21),
    ('galaxy',   'Galaxie',   'Tieflila-Blau wie der Weltraum.',   'mythisch','animated','#a855f7','#6366f1','#ec4899','shimmer',1.5,'#8b5cf6',10,2000000,true,'✦',22),
    ('lava',     'Lava',      'Brodelnde Lava.',                   'mythisch','animated','#ef4444','#f97316','#1c0000','wave',  0.8,'#dc2626',12,2000000,true,NULL,23),
    ('shadow',   'Schatten',  'Dunkles Lila-Schwarz.',             'mythisch','glow',    '#a78bfa','#1e0035',NULL,    'pulse', 1.2,'#7c3aed',12,2000000,true,NULL,24),
    ('glitch',   'Glitch',    'RGB-Glitch Effekt.',                'mythisch','special', '#ffffff','#ff0000','#00ffff','glitch',0.4,NULL,      0, 2000000,true,NULL,25),
    ('matrix',   'Matrix',    'Terminal-Grün — Die Matrix.',       'mythisch','special', '#00ff41','#003b00',NULL,    'matrix',1.0,'#00ff41',14,2000000,true,NULL,26),
    ('royalty',  'Royalty',   'Gold-Lila-Gradient mit Krone.',     'mythisch','animated','#f59e0b','#7c3aed','#fde68a','shimmer',1.2,'#f59e0b',8,2000000,true,'♛',27)
    ON CONFLICT (key) DO NOTHING`,
    // ULTRA
    `INSERT INTO name_styles (key,label,description,rarity,category,color1,color2,color3,animation_type,animation_speed,glow_color,glow_radius,unlock_price_cr,can_win_from_case,prefix_icon,suffix_icon,sort_order) VALUES
    ('prismatic','Prismatisch','Voller Spektrum-Farbverlauf.',     'ultra','animated','#ff0000','#00ff00','#0000ff','prismatic',0.8,NULL,      0, 12000000,true,NULL,NULL,30),
    ('celestial','Celestial',  'Göttlich gold-weiß strahlend.',   'ultra','animated','#fef9c3','#f59e0b','#ffffff','shimmer',  2.0,'#fef08a',20,12000000,true,'✦','✦',31),
    ('void',     'Void',       'Purpur-Schwarz — das Nichts.',    'ultra','glow',    '#9333ea','#4c1d95','#000000','pulse',    1.8,'#7c3aed',20,12000000,true,NULL,NULL,32),
    ('hologram', 'Hologramm',  'Transluzentes Hologramm.',        'ultra','animated','#67e8f9','#a5f3fc','#0891b2','hologram', 1.0,'#06b6d4',18,12000000,true,NULL,NULL,33),
    ('obfuscated','Obfuscated','Zufällig wechselnde Zeichen.',    'ultra','special', '#00ff41',NULL,    NULL,    'obfuscated',1.0,'#00ff41',14,12000000,true,NULL,NULL,34),
    ('rgb_wave', 'RGB Wave',   'RGB-Wellenmuster.',               'ultra','special', '#ff0000','#00ff00','#0000ff','rgb_wave', 1.2,NULL,      0, 12000000,true,NULL,NULL,35)
    ON CONFLICT (key) DO NOTHING`,
    // SPECIAL (admin-only)
    `INSERT INTO name_styles (key,label,description,rarity,category,color1,color2,color3,animation_type,animation_speed,glow_color,glow_radius,unlock_price_cr,can_win_from_case,is_special,prefix_icon,sort_order) VALUES
    ('warned',     'Verwarnt',  'Rote Warnung.',                  'selten',  'glow',    '#ef4444',NULL,NULL,'flicker', 0.6,'#dc2626',12,0,false,true,'⚠',40),
    ('admin_style','Admin',     'Exklusiv für Admins.',           'ultra',   'animated','#f59e0b','#ef4444','#fde68a','prismatic',1.5,'#f59e0b',20,0,false,true,'⚡',41),
    ('mod_style',  'Moderator', 'Exklusiv für Mods.',            'mythisch','glow',    '#22c55e',NULL,NULL,'pulse',   1.2,'#16a34a',14,0,false,true,'🛡',42)
    ON CONFLICT (key) DO NOTHING`,
  ], client);

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. NAME STYLE RARITY CONFIG
  // ─────────────────────────────────────────────────────────────────────────────
  await run("name_style_rarity_config table", [
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
    `INSERT INTO name_style_rarity_config (rarity, base_shop_price_cr, max_shop_price_cr, case_drop_weight, case_drop_enabled, bp_reward_enabled, can_trade) VALUES
      ('normal',   50000,     200000,     200, false, true, false),
      ('selten',   350000,    1500000,     80, false, true, false),
      ('mythisch', 2000000,   8000000,     20, false, true, false),
      ('ultra',    12000000,  50000000,     5, false, true, false)
    ON CONFLICT (rarity) DO UPDATE SET
      base_shop_price_cr = EXCLUDED.base_shop_price_cr,
      max_shop_price_cr  = EXCLUDED.max_shop_price_cr,
      case_drop_weight   = EXCLUDED.case_drop_weight`,
    // Sync unlock_price_cr and shop_price_cr
    `UPDATE name_styles SET unlock_price_cr = 50000    WHERE rarity = 'normal'`,
    `UPDATE name_styles SET unlock_price_cr = 350000   WHERE rarity = 'selten'`,
    `UPDATE name_styles SET unlock_price_cr = 2000000  WHERE rarity = 'mythisch'`,
    `UPDATE name_styles SET unlock_price_cr = 12000000 WHERE rarity = 'ultra'`,
    `UPDATE name_styles SET shop_price_cr = unlock_price_cr WHERE NOT is_special`,
  ], client);

  // ─────────────────────────────────────────────────────────────────────────────
  // 11. PET RARITY OVERRIDES
  // ─────────────────────────────────────────────────────────────────────────────
  await run("pet_rarity_overrides table", [
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
  ], client);

  // ─────────────────────────────────────────────────────────────────────────────
  // 12. CASE GROUPS (dynamic case system)
  // ─────────────────────────────────────────────────────────────────────────────
  await run("case_groups table", [
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
      ('weapons','Waffen Case','Gewinne Waffen für den 3D-World-Kampf — ab 30.000 CR','swords',
        ARRAY['weapon_cosmetic'],
        1, true, false)
    ON CONFLICT (id) DO NOTHING`,
  ], client);

  await run("case_tiers: new columns", [
    `ALTER TABLE case_tiers ADD COLUMN IF NOT EXISTS sort_order           INTEGER  DEFAULT 0`,
    `ALTER TABLE case_tiers ADD COLUMN IF NOT EXISTS per_rarity_item_ids  JSONB`,
    `ALTER TABLE case_tiers ADD COLUMN IF NOT EXISTS name_styles_eligible BOOLEAN  DEFAULT false`,
    `ALTER TABLE case_tiers ADD COLUMN IF NOT EXISTS tier_sublabel        TEXT`,
    `UPDATE case_tiers SET sort_order = 0 WHERE id LIKE '%-standard' AND (sort_order IS NULL OR sort_order = 0)`,
    `UPDATE case_tiers SET sort_order = 1 WHERE id LIKE '%-premium'  AND (sort_order IS NULL OR sort_order = 0)`,
  ], client);

  // ─────────────────────────────────────────────────────────────────────────────
  // 13. OPTIONAL TABLES (auction_bids, trade_items)
  // ─────────────────────────────────────────────────────────────────────────────
  await run("optional: auction_bids + trade_items", [
    `CREATE TABLE IF NOT EXISTS auction_bids (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      auction_id uuid NOT NULL,
      bidder_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
      amount integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `ALTER TABLE auction_bids ENABLE ROW LEVEL SECURITY`,
    `CREATE INDEX IF NOT EXISTS idx_auction_bids_auction ON auction_bids(auction_id)`,
    `CREATE INDEX IF NOT EXISTS idx_auction_bids_bidder ON auction_bids(bidder_id)`,
    `CREATE TABLE IF NOT EXISTS trade_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      trade_id uuid NOT NULL,
      inventory_id uuid REFERENCES inventory(id) ON DELETE SET NULL,
      side text NOT NULL DEFAULT 'from' CHECK (side IN ('from', 'to')),
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `ALTER TABLE trade_items ENABLE ROW LEVEL SECURITY`,
    `CREATE INDEX IF NOT EXISTS idx_trade_items_trade ON trade_items(trade_id)`,
  ], client);

  // ─────────────────────────────────────────────────────────────────────────────
  // 14. CLEANUP CONFIG SEED
  // ─────────────────────────────────────────────────────────────────────────────
  await run("cleanup_config: seed rows", [
    `INSERT INTO cleanup_config (source_key, enabled, retention_days, updated_at) VALUES
      ('debug_logs',          false, 7,   now()),
      ('global_chat_messages',false, 30,  now()),
      ('mod_actions',         false, 90,  now()),
      ('login_events',        false, 30,  now()),
      ('notifications',       false, 60,  now()),
      ('audit_logs',          false, 365, now()),
      ('tickets_closed',      false, 180, now()),
      ('trade_offers_done',   false, 30,  now()),
      ('auctions_done',       false, 30,  now())
    ON CONFLICT (source_key) DO NOTHING`,
  ], client);

  // ─────────────────────────────────────────────────────────────────────────────
  // 15. GAME LEADERBOARD CONFIG
  // ─────────────────────────────────────────────────────────────────────────────
  await run("game_leaderboard_config singleton", [
    `CREATE TABLE IF NOT EXISTS game_leaderboard_config (
      id         TEXT        PRIMARY KEY DEFAULT 'default',
      items      JSONB       NOT NULL    DEFAULT '[]',
      updated_at TIMESTAMPTZ NOT NULL    DEFAULT now()
    )`,
    `ALTER TABLE game_leaderboard_config ENABLE ROW LEVEL SECURITY`,
    `INSERT INTO game_leaderboard_config (id, items) VALUES ('default', '[
      {"id":"snake_x1",   "label":"Snake Classic ×1","enabled":true, "limit":10,"sort":0},
      {"id":"snake_x2",   "label":"Snake Turbo ×2",  "enabled":true, "limit":10,"sort":1},
      {"id":"snake_grind","label":"Snake Grind",       "enabled":false,"limit":10,"sort":2},
      {"id":"snake_farm", "label":"Snake Endless",     "enabled":false,"limit":10,"sort":3},
      {"id":"mine",       "label":"Mine",              "enabled":true, "limit":10,"sort":4}
    ]'::jsonb) ON CONFLICT (id) DO NOTHING`,
  ], client);

  // ─────────────────────────────────────────────────────────────────────────────
  // 16. MUSIC CONFIG
  // ─────────────────────────────────────────────────────────────────────────────
  await run("music_config singleton", [
    `CREATE TABLE IF NOT EXISTS music_config (
      id         TEXT        PRIMARY KEY DEFAULT 'default',
      config     JSONB       NOT NULL    DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL    DEFAULT now()
    )`,
    `ALTER TABLE music_config ENABLE ROW LEVEL SECURITY`,
    `INSERT INTO music_config (id, config) VALUES ('default', '{
      "enabled":false,
      "defaultVolume":0.12,
      "fadeInMs":1200,
      "fadeOutMs":500,
      "tracks":[
        {"id":"arc_neon_rush",  "name":"Neon Rush",       "artist":"Royalty Free","vibe":"arcade",   "url":"/music/arcade-neon-rush.mp3"},
        {"id":"arc_pixel_chase","name":"Pixel Chase",     "artist":"Royalty Free","vibe":"arcade",   "url":"/music/arcade-pixel-chase.mp3"},
        {"id":"arc_8bit_fever", "name":"8-Bit Fever",     "artist":"Royalty Free","vibe":"arcade",   "url":"/music/arcade-8bit-fever.mp3"},
        {"id":"arc_hyper_drive","name":"Hyper Drive",     "artist":"Royalty Free","vibe":"arcade",   "url":"/music/arcade-hyper-drive.mp3"},
        {"id":"chl_midnight",   "name":"Midnight Lounge", "artist":"Royalty Free","vibe":"chill",    "url":"/music/chill-midnight-lounge.mp3"},
        {"id":"chl_purple_rain","name":"Purple Rain",     "artist":"Royalty Free","vibe":"chill",    "url":"/music/chill-purple-rain.mp3"},
        {"id":"chl_crystal",    "name":"Crystal Clear",   "artist":"Royalty Free","vibe":"chill",    "url":"/music/chill-crystal-clear.mp3"},
        {"id":"chl_lofi_sat",   "name":"Lo-Fi Saturday",  "artist":"Royalty Free","vibe":"chill",    "url":"/music/chill-lofi-saturday.mp3"},
        {"id":"adv_into_wild",  "name":"Into the Wild",   "artist":"Royalty Free","vibe":"adventure","url":"/music/adventure-into-wild.mp3"},
        {"id":"adv_ruins",      "name":"Ancient Ruins",   "artist":"Royalty Free","vibe":"adventure","url":"/music/adventure-ancient-ruins.mp3"},
        {"id":"adv_mystic",     "name":"Mystic Forest",   "artist":"Royalty Free","vibe":"adventure","url":"/music/adventure-mystic-forest.mp3"},
        {"id":"adv_journey",    "name":"Endless Journey", "artist":"Royalty Free","vibe":"adventure","url":"/music/adventure-endless-journey.mp3"}
      ],
      "pageAssignments":{
        "homepage":"chl_midnight","snake":"arc_neon_rush","don":"arc_8bit_fever",
        "world":"adv_into_wild","cases":"chl_purple_rain","shop":"chl_crystal",
        "community":"chl_lofi_sat","dashboard":"chl_midnight"
      }
    }'::jsonb) ON CONFLICT (id) DO NOTHING`,
  ], client);

  // ─────────────────────────────────────────────────────────────────────────────
  // 17. THEME CONFIG (Theming Engine)
  // ─────────────────────────────────────────────────────────────────────────────
  await run("theme_config singleton", [
    `CREATE TABLE IF NOT EXISTS theme_config (
      id         TEXT        PRIMARY KEY DEFAULT 'default',
      config     JSONB       NOT NULL    DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL    DEFAULT now()
    )`,
    `ALTER TABLE theme_config ENABLE ROW LEVEL SECURITY`,
    `INSERT INTO theme_config (id, config) VALUES ('default', '{
      "activeTheme":"default",
      "allowUserChoice":false
    }'::jsonb) ON CONFLICT (id) DO NOTHING`,
  ], client);

  // ─────────────────────────────────────────────────────────────────────────────
  await client.end();
  console.log("\n🎉 All migrations complete!\n");
}

main().catch((err) => {
  console.error("❌ Fatal:", err.message);
  process.exit(1);
});
