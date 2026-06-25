-- Run once in Supabase SQL editor:
-- node scripts/add-battlepass-upgrades.sql (or paste directly)

-- 1. Add verified + DON upgrade tier to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS don_upgrade_tier integer NOT NULL DEFAULT 0;

-- 2. Add upgrade config columns to don_config
ALTER TABLE don_config
  ADD COLUMN IF NOT EXISTS upgrade_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS upgrade_tiers jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3. Battle passes (one active at a time)
CREATE TABLE IF NOT EXISTS battle_passes (
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
);

-- 4. Tier rewards for each pass
CREATE TABLE IF NOT EXISTS battle_pass_tiers (
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
);

-- 5. Users' pass records (purchase + daily-login progress)
CREATE TABLE IF NOT EXISTS user_battle_passes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL,
  pass_id text NOT NULL REFERENCES battle_passes(id) ON DELETE CASCADE,
  has_premium boolean NOT NULL DEFAULT false,
  progress_days integer NOT NULL DEFAULT 0,
  purchased_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, pass_id)
);

-- 6. Per-tier claim log
CREATE TABLE IF NOT EXISTS user_bp_tier_claims (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL,
  pass_id text NOT NULL,
  tier_id text NOT NULL REFERENCES battle_pass_tiers(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, tier_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ubp_user     ON user_battle_passes(user_id);
CREATE INDEX IF NOT EXISTS idx_ubp_pass     ON user_battle_passes(pass_id);
CREATE INDEX IF NOT EXISTS idx_ubtc_user    ON user_bp_tier_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_bpt_pass_num ON battle_pass_tiers(pass_id, tier_number);

-- RLS (all reads go through the service-role admin client in server actions)
ALTER TABLE battle_passes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_pass_tiers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_battle_passes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_bp_tier_claims   ENABLE ROW LEVEL SECURITY;
