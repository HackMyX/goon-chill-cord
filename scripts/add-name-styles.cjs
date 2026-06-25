// node scripts/add-name-styles.cjs
const { Pool } = require("pg");
require("dotenv").config({ path: ".env.local" });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const sql = `
-- ── Name Styles catalog ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS name_styles (
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
);

-- ── User-owned name styles ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_name_styles (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  style_key    text NOT NULL REFERENCES name_styles(key) ON DELETE CASCADE,
  source       text NOT NULL DEFAULT 'gifted',
  unlocked_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, style_key)
);

-- ── Active style on profiles ────────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_name_style_key text;

-- ── Warning strike system ───────────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS warning_strikes integer NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS warning_note text;

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE name_styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_name_styles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='name_styles' AND policyname='public read name_styles') THEN
    CREATE POLICY "public read name_styles" ON name_styles FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_name_styles' AND policyname='public read user_name_styles') THEN
    CREATE POLICY "public read user_name_styles" ON user_name_styles FOR SELECT USING (true);
  END IF;
END $$;

-- ── Seed: 27 Name Styles ───────────────────────────────────────────────────────
-- NORMAL (5)
INSERT INTO name_styles (key,label,description,rarity,category,color1,color2,animation_type,glow_color,glow_radius,unlock_price_cr,can_win_from_case,sort_order) VALUES
('default',   'Standard',       'Schlichtes weiß — der Klassiker.',             'normal','solid',   '#f4f4f5',NULL,        'none',       NULL,       0,   0,     false, 0),
('warm_white','Warmes Weiß',    'Warmes, cremiges Weiß.',                        'normal','solid',   '#fef3c7',NULL,        'none',       NULL,       0,   500,   true,  1),
('sky',       'Himmelblau',     'Beruhigendes Himmelblau.',                      'normal','solid',   '#7dd3fc',NULL,        'none',       NULL,       0,   500,   true,  2),
('mint',      'Mintgrün',       'Frisches Mint.',                                'normal','solid',   '#6ee7b7',NULL,        'none',       NULL,       0,   500,   true,  3),
('rose',      'Rose',           'Zart-rosiges Pink.',                            'normal','solid',   '#fda4af',NULL,        'none',       NULL,       0,   500,   true,  4)
ON CONFLICT (key) DO NOTHING;

-- SELTEN (8)
INSERT INTO name_styles (key,label,description,rarity,category,color1,color2,color3,animation_type,glow_color,glow_radius,unlock_price_cr,can_win_from_case,sort_order) VALUES
('fire',      'Feuerrot',       'Lodernd wie Flammen — orange-roter Feuergradient.',    'selten','animated', '#ff6b00','#ff0000','#ffaa00','shimmer',    '#ff4400',8,  3000,  true, 10),
('ice',       'Eisblau',        'Glitzernd wie Eis — blau-weißer Shimmer.',             'selten','animated', '#bfdbfe','#60a5fa','#e0f2fe','shimmer',    '#3b82f6',6,  3000,  true, 11),
('toxic',     'Giftgrün',       'Giftig leuchtend — Neon Grün.',                        'selten','glow',     '#4ade80',NULL,    NULL,    'pulse',      '#22c55e',10, 3000,  true, 12),
('gold_shine','Goldglanz',      'Schimmerndes Gold.',                                    'selten','animated', '#fbbf24','#f59e0b','#fde68a','shimmer',    '#f59e0b',6,  3500,  true, 13),
('neon_pink', 'Neon Pink',      'Knalliges Neon-Pink — kaum zu übersehen.',              'selten','glow',     '#f472b6',NULL,    NULL,    'pulse',      '#ec4899',10, 3500,  true, 14),
('neon_cyan', 'Neon Cyan',      'Elektrisches Cyan-Leuchten.',                           'selten','glow',     '#22d3ee',NULL,    NULL,    'pulse',      '#06b6d4',10, 3500,  true, 15),
('blood',     'Blutrot',        'Tiefes Karmesinrot, bedrohlich.',                       'selten','glow',     '#dc2626',NULL,    NULL,    'pulse',      '#991b1b',8,  3500,  true, 16),
('poison',    'Gift',           'Giftsäure-Grün — zischend und gefährlich.',             'selten','animated', '#84cc16','#365314',NULL,    'wave',       '#65a30d',8,  3500,  true, 17)
ON CONFLICT (key) DO NOTHING;

-- MYTHISCH (8)
INSERT INTO name_styles (key,label,description,rarity,category,color1,color2,color3,animation_type,animation_speed,glow_color,glow_radius,unlock_price_cr,can_win_from_case,prefix_icon,sort_order) VALUES
('rainbow',   'Regenbogen',     'Voller Regenbogen-Cycle — alle Farben.',                'mythisch','animated','#ff0000','#00ff00','#0000ff','rainbow',   1.0,  NULL,       0,   12000, true, NULL, 20),
('lightning', 'Blitz',          'Elektrisches Gelb-Weiß mit Blitz-Flash.',               'mythisch','animated','#fef08a','#ffffff','#fde047','flicker',   0.5,  '#facc15',  12,  12000, true, '⚡',  21),
('galaxy',    'Galaxie',        'Tieflila-Blau wie der Weltraum.',                        'mythisch','animated','#a855f7','#6366f1','#ec4899','shimmer',   1.5,  '#8b5cf6',  10,  14000, true, '✦', 22),
('lava',      'Lava',           'Brodelnde Lava — rot-orange-schwarz Flow.',              'mythisch','animated','#ef4444','#f97316','#1c0000','wave',      0.8,  '#dc2626',  12,  14000, true, NULL, 23),
('shadow',    'Schatten',       'Dunkles Lila-Schwarz — mysteriös.',                     'mythisch','glow',    '#a78bfa','#1e0035',NULL,    'pulse',     1.2,  '#7c3aed',  12,  14000, true, NULL, 24),
('glitch',    'Glitch',         'RGB-Glitch Effekt — kaputte Matrix.',                   'mythisch','special', '#ffffff','#ff0000','#00ffff','glitch',    0.4,  NULL,       0,   16000, true, NULL, 25),
('matrix',    'Matrix',         'Terminal-Grün — Die Matrix hat dich.',                  'mythisch','special', '#00ff41','#003b00',NULL,    'matrix',    1.0,  '#00ff41',  14,  16000, true, NULL, 26),
('royalty',   'Royalty',        'Gold-Lila-Gradient mit Kronen-Icon.',                   'mythisch','animated','#f59e0b','#7c3aed','#fde68a','shimmer',   1.2,  '#f59e0b',  8,   18000, true, '♛', 27)
ON CONFLICT (key) DO NOTHING;

-- ULTRA (6)
INSERT INTO name_styles (key,label,description,rarity,category,color1,color2,color3,animation_type,animation_speed,glow_color,glow_radius,unlock_price_cr,can_win_from_case,prefix_icon,suffix_icon,sort_order) VALUES
('prismatic', 'Prismatisch',    'Voller Spektrum-Farbverlauf, unendlich animiert.',       'ultra','animated','#ff0000','#00ff00','#0000ff','prismatic',  0.8,  NULL,       0,   50000, true, NULL, NULL, 30),
('celestial', 'Celestial',      'Göttlich gold-weiß strahlend.',                          'ultra','animated','#fef9c3','#f59e0b','#ffffff','shimmer',    2.0,  '#fef08a',  20,  50000, true, '✦', '✦', 31),
('void',      'Void',           'Purpur-Schwarz — das Nichts selbst.',                    'ultra','glow',    '#9333ea','#4c1d95','#000000','pulse',      1.8,  '#7c3aed',  20,  60000, true, NULL, NULL, 32),
('hologram',  'Hologramm',      'Transluzentes cyan-blaues Hologramm.',                  'ultra','animated','#67e8f9','#a5f3fc','#0891b2','hologram',   1.0,  '#06b6d4',  18,  60000, true, NULL, NULL, 33),
('obfuscated','Obfuscated',     'Zufällig wechselnde Zeichen — unleserlich.',             'ultra','special', '#00ff41',NULL,    NULL,    'obfuscated', 1.0,  '#00ff41',  14,  80000, true, NULL, NULL, 34),
('rgb_wave',  'RGB Wave',       'RGB-Wellenmuster — jeder Buchstabe eigene Phase.',       'ultra','special', '#ff0000','#00ff00','#0000ff','rgb_wave',   1.2,  NULL,       0,   80000, true, NULL, NULL, 35)
ON CONFLICT (key) DO NOTHING;

-- SPECIAL / Admin-only (3)
INSERT INTO name_styles (key,label,description,rarity,category,color1,color2,color3,animation_type,animation_speed,glow_color,glow_radius,unlock_price_cr,can_win_from_case,is_special,prefix_icon,sort_order) VALUES
('warned',    'Verwarnt',       'Rote Warnung — dieser User wurde verwarnt.',             'selten','glow',    '#ef4444',NULL,    NULL,    'flicker',    0.6,  '#dc2626',  12,  0,     false, true, '⚠', 40),
('admin_style','Admin',         'Exklusiv für Admins — golden und mächtig.',              'ultra','animated','#f59e0b','#ef4444','#fde68a','prismatic',  1.5,  '#f59e0b',  20,  0,     false, true, '⚡', 41),
('mod_style', 'Moderator',      'Exklusiv für Mods — kühles Grün.',                      'mythisch','glow', '#22c55e',NULL,    NULL,    'pulse',      1.2,  '#16a34a',  14,  0,     false, true, '🛡', 42)
ON CONFLICT (key) DO NOTHING;
`;

pool.query(sql)
  .then(() => { console.log("✅ Name Styles migration done (27+ styles seeded)."); pool.end(); })
  .catch(e => { console.error("❌", e.message); pool.end(); });
