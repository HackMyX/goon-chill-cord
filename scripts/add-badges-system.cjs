// node scripts/add-badges-system.cjs
const { Pool } = require("pg");
require("dotenv").config({ path: ".env.local" });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const sql = `
-- Badge definitions (templates admin creates)
CREATE TABLE IF NOT EXISTS badge_definitions (
  key text PRIMARY KEY,
  label text NOT NULL,
  color text NOT NULL DEFAULT '#7c3aed',
  icon text NOT NULL DEFAULT '⭐',
  description text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Badges assigned to users
CREATE TABLE IF NOT EXISTS user_badges (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_key text NOT NULL REFERENCES badge_definitions(key) ON DELETE CASCADE,
  granted_by uuid REFERENCES profiles(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_key)
);

-- Seed default badge definitions
INSERT INTO badge_definitions (key, label, color, icon, description) VALUES
  ('verified',    'Verifiziert',   '#3b82f6', '✔',  'Offiziell verifiziertes Mitglied'),
  ('premium',     'Premium',       '#f59e0b', '♛',  'Premium Battle Pass Inhaber'),
  ('elite',       'Elite',         '#a855f7', '💎', 'Elite Battle Pass Inhaber'),
  ('mod',         'Moderator',     '#22c55e', '🛡', 'Team-Mitglied'),
  ('admin',       'Admin',         '#ef4444', '⚡', 'Administrator'),
  ('og',          'OG-Mitglied',   '#f97316', '👑', 'Eines der ersten Mitglieder'),
  ('streaker',    'Streak-König',  '#eab308', '🔥', '30-Tage Streak erreicht'),
  ('vip',         'VIP',           '#d946ef', '💜', 'VIP-Status'),
  ('helper',      'Community-Helfer','#06b6d4','💬', 'Hilfreicher Community-Helfer')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

-- Everyone can read badge definitions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='badge_definitions' AND policyname='public read badge_definitions') THEN
    CREATE POLICY "public read badge_definitions" ON badge_definitions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_badges' AND policyname='public read user_badges') THEN
    CREATE POLICY "public read user_badges" ON user_badges FOR SELECT USING (true);
  END IF;
END $$;
`;

pool.query(sql)
  .then(() => { console.log("✅ Badges system migration done."); pool.end(); })
  .catch(e => { console.error("❌", e.message); pool.end(); });
