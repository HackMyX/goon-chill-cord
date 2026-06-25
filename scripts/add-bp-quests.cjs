/**
 * Migration: Battle Pass Quest System + XP-based Progression
 * Run: node scripts/add-bp-quests.cjs
 *
 * Adds:
 *  - bp_quest_definitions  — reusable quest templates (admin-created)
 *  - bp_quests             — quests assigned to a specific battle pass
 *  - user_bp_quest_progress — per-user progress per quest
 *  - battle_passes.progression_type  (days | xp)
 *  - battle_passes.bp_xp_per_tier   (XP required per tier when xp-based)
 *  - battle_passes.bp_xp_cap_per_day
 *  - battle_pass_tiers.bp_xp_required (optional per-tier XP override)
 *  - user_battle_passes.bp_xp        (accumulated BP XP)
 */

const { Client } = require("pg");

const client = new Client({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
  ssl: { rejectUnauthorized: false },
});

async function run() {
  await client.connect();
  console.log("✅ Connected to DB");

  // ─── 1. battle_passes — progression fields ────────────────────────────────
  await client.query(`
    ALTER TABLE battle_passes
      ADD COLUMN IF NOT EXISTS progression_type text NOT NULL DEFAULT 'days',
      ADD COLUMN IF NOT EXISTS bp_xp_per_tier integer NOT NULL DEFAULT 1000,
      ADD COLUMN IF NOT EXISTS bp_xp_cap_per_day integer NOT NULL DEFAULT 0;
  `);
  console.log("✅ battle_passes: progression_type, bp_xp_per_tier, bp_xp_cap_per_day added");

  // ─── 2. battle_pass_tiers — per-tier XP requirement override ─────────────
  await client.query(`
    ALTER TABLE battle_pass_tiers
      ADD COLUMN IF NOT EXISTS bp_xp_required integer;
  `);
  console.log("✅ battle_pass_tiers: bp_xp_required added");

  // ─── 3. user_battle_passes — accumulated BP XP ────────────────────────────
  await client.query(`
    ALTER TABLE user_battle_passes
      ADD COLUMN IF NOT EXISTS bp_xp bigint NOT NULL DEFAULT 0;
  `);
  console.log("✅ user_battle_passes: bp_xp added");

  // ─── 4. bp_quest_definitions — reusable quest templates ──────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS bp_quest_definitions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      key text UNIQUE NOT NULL,
      label text NOT NULL,
      description text,
      quest_type text NOT NULL,
      target_action text NOT NULL,
      default_target integer NOT NULL DEFAULT 10,
      default_bp_xp_reward integer NOT NULL DEFAULT 250,
      difficulty text NOT NULL DEFAULT 'medium',
      frequency text NOT NULL DEFAULT 'weekly',
      icon text NOT NULL DEFAULT '🎯',
      enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    ALTER TABLE bp_quest_definitions ENABLE ROW LEVEL SECURITY;
    DO $$ BEGIN
      CREATE POLICY "admins_all" ON bp_quest_definitions USING (true);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  console.log("✅ bp_quest_definitions created");

  // ─── 5. bp_quests — quests assigned to a specific pass ───────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS bp_quests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      pass_id text REFERENCES battle_passes(id) ON DELETE CASCADE,
      definition_id uuid REFERENCES bp_quest_definitions(id) ON DELETE SET NULL,
      label text NOT NULL,
      description text,
      quest_type text NOT NULL,
      target_action text NOT NULL,
      target_value integer NOT NULL DEFAULT 10,
      bp_xp_reward integer NOT NULL DEFAULT 250,
      difficulty text NOT NULL DEFAULT 'medium',
      frequency text NOT NULL DEFAULT 'weekly',
      icon text NOT NULL DEFAULT '🎯',
      sort_order integer NOT NULL DEFAULT 0,
      enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    ALTER TABLE bp_quests ENABLE ROW LEVEL SECURITY;
    DO $$ BEGIN
      CREATE POLICY "admins_all" ON bp_quests USING (true);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS bp_quests_pass_id_idx ON bp_quests (pass_id);
  `);
  console.log("✅ bp_quests created");

  // ─── 6. user_bp_quest_progress — per-user progress ───────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_bp_quest_progress (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
      quest_id uuid REFERENCES bp_quests(id) ON DELETE CASCADE,
      pass_id text REFERENCES battle_passes(id) ON DELETE CASCADE,
      current_value integer NOT NULL DEFAULT 0,
      completed boolean NOT NULL DEFAULT false,
      bp_xp_awarded boolean NOT NULL DEFAULT false,
      completed_at timestamptz,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE (user_id, quest_id)
    );
    ALTER TABLE user_bp_quest_progress ENABLE ROW LEVEL SECURITY;
    DO $$ BEGIN
      CREATE POLICY "users_own" ON user_bp_quest_progress USING (auth.uid() = user_id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE POLICY "admins_all" ON user_bp_quest_progress USING (true);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS ubqp_user_pass_idx ON user_bp_quest_progress (user_id, pass_id);
    CREATE INDEX IF NOT EXISTS ubqp_quest_idx ON user_bp_quest_progress (quest_id);
  `);
  console.log("✅ user_bp_quest_progress created");

  // ─── 7. Seed default quest definitions ───────────────────────────────────
  await client.query(`
    INSERT INTO bp_quest_definitions (key, label, description, quest_type, target_action, default_target, default_bp_xp_reward, difficulty, frequency, icon)
    VALUES
      ('snake_play_5',     'Schlangen-Läufer',     'Spiele 5 Snake-Runden',             'count',    'snake_game',     5,   200, 'easy',       'daily',    '🐍'),
      ('snake_score_100',  'Schlangen-Legende',    'Erziele 100 Punkte in Snake',        'accumulate','snake_game',   100,  500, 'medium',     'weekly',   '🐍'),
      ('mine_collect_50',  'Bergmann',             'Sammle 50 Ressourcen in der Mine',   'count',    'mine_collect',  50,   300, 'easy',       'daily',    '⛏️'),
      ('mine_collect_200', 'Bergwerk-König',       'Sammle 200 Ressourcen in der Mine',  'count',    'mine_collect',  200,  800, 'hard',       'weekly',   '⛏️'),
      ('monster_kill_10',  'Monsterjäger',         'Töte 10 Monster in der Farnwelt',    'count',    'monster_kill',  10,   400, 'medium',     'daily',    '⚔️'),
      ('monster_kill_50',  'Weltenbesieger',       'Töte 50 Monster in der Farnwelt',    'count',    'monster_kill',  50,  1000, 'hard',       'weekly',   '⚔️'),
      ('pvp_kill_3',       'Krieger',              'Besiege 3 Spieler im PvP',           'count',    'pvp_kill',       3,   600, 'medium',     'weekly',   '🗡️'),
      ('pvp_kill_10',      'PvP-Meister',          'Besiege 10 Spieler im PvP',          'count',    'pvp_kill',      10,  1500, 'hard',       'weekly',   '🗡️'),
      ('plinko_spin_20',   'Glücksrad',            'Drehe das Plinko 20 Mal',            'count',    'plinko_spin',   20,   300, 'easy',       'daily',    '🎲'),
      ('plinko_spin_100',  'Plinko-Fanatiker',     'Drehe das Plinko 100 Mal',           'count',    'plinko_spin',  100,   700, 'medium',     'weekly',   '🎲'),
      ('case_open_3',      'Kisten-Öffner',        'Öffne 3 Cases',                      'count',    'case_open',      3,   400, 'medium',     'daily',    '📦'),
      ('case_open_15',     'Kisten-Süchtiger',     'Öffne 15 Cases',                     'count',    'case_open',     15,  1000, 'hard',       'weekly',   '📦'),
      ('daily_login',      'Treuer Spieler',       'Logge dich heute ein',               'count',    'daily_login',    1,   150, 'easy',       'daily',    '📅'),
      ('login_streak_3',   'Auf dem Weg',          'Halte 3 Tage Streak aufrecht',       'count',    'login_streak',   3,   500, 'medium',     'weekly',   '🔥'),
      ('login_streak_7',   'Wochenstreaker',       'Halte 7 Tage Streak aufrecht',       'count',    'login_streak',   7,  1200, 'hard',       'seasonal', '🔥'),
      ('world_time_30',    'Weltentaucher',        'Verbringe 30 Min in der Farnwelt',   'accumulate','world_playtime',30,  600, 'medium',     'weekly',   '🌍'),
      ('auction_bid_5',    'Bieter',               'Gib 5 Gebote bei Auktionen ab',      'count',    'auction_bid',    5,   350, 'easy',       'weekly',   '🔨'),
      ('credits_earn_500', 'Kredite-Sammler',      'Verdiene 500 Credits',               'accumulate','credits_earn', 500,  400, 'medium',     'weekly',   '💰')
    ON CONFLICT (key) DO NOTHING;
  `);
  console.log("✅ Default quest definitions seeded");

  await client.end();
  console.log("✅ Migration complete!");
}

run().catch((e) => { console.error(e); process.exit(1); });
