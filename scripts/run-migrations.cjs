const { Pool } = require("pg");
// Run: DATABASE_URL="postgresql://postgres.PROJECT:PASSWORD@host:6543/postgres" node scripts/run-migrations.cjs
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "",
  ssl: { rejectUnauthorized: false }
});

const migrations = [
  // Battle Pass tables
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
  // Indexes
  `CREATE INDEX IF NOT EXISTS idx_ubp_user ON user_battle_passes(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ubp_pass ON user_battle_passes(pass_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ubtc_user ON user_bp_tier_claims(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_bpt_pass_num ON battle_pass_tiers(pass_id, tier_number)`,
  // RLS
  `ALTER TABLE battle_passes ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE battle_pass_tiers ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_battle_passes ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_bp_tier_claims ENABLE ROW LEVEL SECURITY`,
  // profiles columns (DON upgrade + verified)
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS don_upgrade_tier integer NOT NULL DEFAULT 0`,
  // don_config upgrade columns
  `ALTER TABLE don_config ADD COLUMN IF NOT EXISTS upgrade_enabled boolean NOT NULL DEFAULT false`,
  `ALTER TABLE don_config ADD COLUMN IF NOT EXISTS upgrade_tiers jsonb NOT NULL DEFAULT '[]'::jsonb`,
  // Polls (placeholder tables — feature not yet built)
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
  // login_events fingerprint column
  `ALTER TABLE login_events ADD COLUMN IF NOT EXISTS fingerprint text`,
];

async function run() {
  for (const sql of migrations) {
    try {
      await pool.query(sql);
      const name = sql.trim().split('\n')[0].slice(0, 70);
      console.log("OK   " + name);
    } catch (e) {
      const name = sql.trim().split('\n')[0].slice(0, 70);
      console.log("ERR  " + name + " :: " + e.message.split('\n')[0]);
    }
  }
  await pool.end();
}
run();
