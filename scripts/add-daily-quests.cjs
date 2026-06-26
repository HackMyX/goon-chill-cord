// Run: node scripts/add-daily-quests.cjs
// Creates the Daily Quest system tables and seeds default templates.
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // ── daily_quest_templates ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_quest_templates (
        key                  TEXT PRIMARY KEY,
        label                TEXT NOT NULL,
        description          TEXT NOT NULL DEFAULT '',
        target_action        TEXT NOT NULL,
        base_target          INT  NOT NULL DEFAULT 1,
        difficulty           TEXT NOT NULL DEFAULT 'easy',
        min_level            INT  NOT NULL DEFAULT 1,
        max_level            INT  NOT NULL DEFAULT 999,
        reward_type          TEXT NOT NULL DEFAULT 'credits',
        base_reward_credits  INT  NOT NULL DEFAULT 0,
        base_reward_xp       INT  NOT NULL DEFAULT 0,
        base_reward_bp_xp    INT  NOT NULL DEFAULT 0,
        reward_item_rarity   TEXT,
        icon                 TEXT NOT NULL DEFAULT 'Star',
        category             TEXT NOT NULL DEFAULT 'allgemein',
        enabled              BOOL NOT NULL DEFAULT true,
        sort_order           INT  NOT NULL DEFAULT 0,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    console.log('OK   daily_quest_templates created');

    await client.query(`ALTER TABLE daily_quest_templates ENABLE ROW LEVEL SECURITY`);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='daily_quest_templates' AND policyname='public_read_templates') THEN
          CREATE POLICY public_read_templates ON daily_quest_templates FOR SELECT USING (true);
        END IF;
      END $$
    `);
    console.log('OK   RLS daily_quest_templates');

    // ── daily_quest_config singleton ──────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_quest_config (
        id                      TEXT PRIMARY KEY DEFAULT 'default',
        enabled                 BOOL NOT NULL DEFAULT true,
        quests_per_day          INT  NOT NULL DEFAULT 3,
        refresh_hour_utc        INT  NOT NULL DEFAULT 0,
        auto_generate           BOOL NOT NULL DEFAULT true,
        manual_template_keys    TEXT[] NOT NULL DEFAULT '{}',
        level_scale_targets     BOOL NOT NULL DEFAULT true,
        level_scale_rewards     BOOL NOT NULL DEFAULT true,
        xp_reward_multiplier    NUMERIC(4,2) NOT NULL DEFAULT 1.0,
        credits_reward_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0,
        bp_xp_reward_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0,
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    console.log('OK   daily_quest_config created');

    await client.query(`ALTER TABLE daily_quest_config ENABLE ROW LEVEL SECURITY`);
    await client.query(`
      INSERT INTO daily_quest_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING
    `);
    console.log('OK   daily_quest_config default row seeded');

    // ── user_daily_quests ─────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_daily_quests (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        template_key       TEXT REFERENCES daily_quest_templates(key) ON DELETE SET NULL,
        quest_date         DATE NOT NULL DEFAULT CURRENT_DATE,
        label              TEXT NOT NULL,
        description        TEXT NOT NULL DEFAULT '',
        target_action      TEXT NOT NULL,
        target_value       INT  NOT NULL DEFAULT 1,
        current_value      INT  NOT NULL DEFAULT 0,
        completed          BOOL NOT NULL DEFAULT false,
        difficulty         TEXT NOT NULL DEFAULT 'easy',
        reward_type        TEXT NOT NULL DEFAULT 'credits',
        reward_credits     INT  NOT NULL DEFAULT 0,
        reward_xp          INT  NOT NULL DEFAULT 0,
        reward_bp_xp       INT  NOT NULL DEFAULT 0,
        reward_item_rarity TEXT,
        reward_claimed     BOOL NOT NULL DEFAULT false,
        claimed_at         TIMESTAMPTZ,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(user_id, template_key, quest_date)
      )
    `);
    console.log('OK   user_daily_quests created');

    await client.query(`ALTER TABLE user_daily_quests ENABLE ROW LEVEL SECURITY`);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_daily_quests' AND policyname='own_quests_select') THEN
          CREATE POLICY own_quests_select ON user_daily_quests FOR SELECT USING (auth.uid() = user_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_daily_quests' AND policyname='own_quests_update') THEN
          CREATE POLICY own_quests_update ON user_daily_quests FOR UPDATE USING (auth.uid() = user_id);
        END IF;
      END $$
    `);
    console.log('OK   RLS user_daily_quests');

    // ── Seed default templates ─────────────────────────────────────────────────
    const templates = [
      // Easy
      { key: 'daily_login',     label: 'Täglicher Login',        description: 'Melde dich an und hol deinen täglichen Streak-Bonus.',  target_action: 'daily_login',   base_target: 1,   difficulty: 'easy',   min_level: 1, reward_type: 'credits', base_reward_credits: 500,  base_reward_xp: 50,  base_reward_bp_xp: 25, icon: 'Calendar',    category: 'allgemein', sort_order: 0 },
      { key: 'snake_1game',     label: 'Snake spielen',          description: 'Spiele eine Runde Snake.',                              target_action: 'snake_game',    base_target: 1,   difficulty: 'easy',   min_level: 1, reward_type: 'credits', base_reward_credits: 800,  base_reward_xp: 80,  base_reward_bp_xp: 30, icon: 'Joystick',    category: 'spiele',    sort_order: 1 },
      { key: 'plinko_3balls',   label: 'Plinko ausprobieren',    description: 'Wirf 3 Kugeln in Plinko.',                             target_action: 'plinko_play',   base_target: 3,   difficulty: 'easy',   min_level: 1, reward_type: 'credits', base_reward_credits: 600,  base_reward_xp: 60,  base_reward_bp_xp: 20, icon: 'CircleDot',   category: 'spiele',    sort_order: 2 },
      { key: 'case_open_1',     label: 'Eine Case öffnen',       description: 'Öffne eine Case.',                                     target_action: 'case_open',     base_target: 1,   difficulty: 'easy',   min_level: 1, reward_type: 'credits', base_reward_credits: 700,  base_reward_xp: 70,  base_reward_bp_xp: 25, icon: 'Package',     category: 'wirtschaft', sort_order: 3 },
      { key: 'mine_collect_1',  label: 'Mine sammeln',           description: 'Sammle einmal Credits aus der Mine.',                  target_action: 'mine_collect',  base_target: 1,   difficulty: 'easy',   min_level: 1, reward_type: 'credits', base_reward_credits: 400,  base_reward_xp: 40,  base_reward_bp_xp: 15, icon: 'Pickaxe',     category: 'wirtschaft', sort_order: 4 },
      // Medium
      { key: 'snake_score_50',  label: 'Snake Profi',            description: 'Erziele 50 Punkte in einer Snake-Runde.',              target_action: 'snake_score',   base_target: 50,  difficulty: 'medium', min_level: 3, reward_type: 'mixed',   base_reward_credits: 1500, base_reward_xp: 150, base_reward_bp_xp: 75, icon: 'Joystick',    category: 'spiele',    sort_order: 10 },
      { key: 'plinko_10balls',  label: 'Plinko-Runde',           description: 'Wirf 10 Kugeln in Plinko.',                            target_action: 'plinko_play',   base_target: 10,  difficulty: 'medium', min_level: 3, reward_type: 'mixed',   base_reward_credits: 1200, base_reward_xp: 120, base_reward_bp_xp: 60, icon: 'CircleDot',   category: 'spiele',    sort_order: 11 },
      { key: 'case_open_3',     label: 'Cases Streak',           description: 'Öffne 3 Cases an einem Tag.',                          target_action: 'case_open',     base_target: 3,   difficulty: 'medium', min_level: 5, reward_type: 'mixed',   base_reward_credits: 2000, base_reward_xp: 200, base_reward_bp_xp: 100, icon: 'Package',    category: 'wirtschaft', sort_order: 12 },
      { key: 'monster_kill_5',  label: 'Monster-Jäger',          description: 'Töte 5 Monster in der Farmwelt.',                      target_action: 'monster_kill',  base_target: 5,   difficulty: 'medium', min_level: 4, reward_type: 'xp',      base_reward_credits: 0,    base_reward_xp: 300, base_reward_bp_xp: 100, icon: 'Skull',      category: 'farmwelt',   sort_order: 13 },
      { key: 'credits_collect', label: 'Großer Sammler',         description: 'Sammle 5.000 Credits aus der Mine.',                   target_action: 'credits_collected', base_target: 5000, difficulty: 'medium', min_level: 5, reward_type: 'credits', base_reward_credits: 3000, base_reward_xp: 150, base_reward_bp_xp: 75, icon: 'Coins', category: 'wirtschaft', sort_order: 14 },
      // Hard
      { key: 'snake_score_200', label: 'Snake-Champion',         description: 'Erziele 200 Punkte in einer Snake-Runde.',             target_action: 'snake_score',   base_target: 200, difficulty: 'hard',   min_level: 10, reward_type: 'mixed',  base_reward_credits: 5000, base_reward_xp: 500, base_reward_bp_xp: 250, icon: 'Trophy',     category: 'spiele',    sort_order: 20 },
      { key: 'pvp_hit_10',      label: 'PvP-Angreifer',          description: 'Treffe 10 Mal andere Spieler in der Farmwelt.',         target_action: 'pvp_hit',       base_target: 10,  difficulty: 'hard',   min_level: 10, reward_type: 'xp',     base_reward_credits: 0,    base_reward_xp: 600, base_reward_bp_xp: 300, icon: 'Swords',     category: 'farmwelt',   sort_order: 21 },
      { key: 'case_open_5',     label: 'Case-Fanatiker',         description: 'Öffne 5 Cases an einem Tag.',                          target_action: 'case_open',     base_target: 5,   difficulty: 'hard',   min_level: 8, reward_type: 'mixed',   base_reward_credits: 4000, base_reward_xp: 400, base_reward_bp_xp: 200, icon: 'Package',    category: 'wirtschaft', sort_order: 22 },
      { key: 'monster_kill_15', label: 'Monsterschlächter',      description: 'Töte 15 Monster in der Farmwelt.',                     target_action: 'monster_kill',  base_target: 15,  difficulty: 'hard',   min_level: 12, reward_type: 'item',   base_reward_credits: 0,    base_reward_xp: 800, base_reward_bp_xp: 400, reward_item_rarity: 'selten', icon: 'Skull', category: 'farmwelt', sort_order: 23 },
      // Legendary
      { key: 'snake_score_500', label: 'Snake-Legende',          description: 'Erziele 500 Punkte in einer Snake-Runde.',             target_action: 'snake_score',   base_target: 500, difficulty: 'legendary', min_level: 20, reward_type: 'item', base_reward_credits: 10000, base_reward_xp: 1000, base_reward_bp_xp: 500, reward_item_rarity: 'mythisch', icon: 'Crown', category: 'spiele', sort_order: 30 },
      { key: 'plinko_25balls',  label: 'Plinko-Meister',         description: 'Wirf 25 Kugeln in Plinko.',                            target_action: 'plinko_play',   base_target: 25,  difficulty: 'legendary', min_level: 15, reward_type: 'mixed', base_reward_credits: 8000, base_reward_xp: 800, base_reward_bp_xp: 400, icon: 'Star',       category: 'spiele',    sort_order: 31 },
    ];

    let inserted = 0;
    for (const t of templates) {
      const { rowCount } = await client.query(`
        INSERT INTO daily_quest_templates
          (key, label, description, target_action, base_target, difficulty, min_level, max_level,
           reward_type, base_reward_credits, base_reward_xp, base_reward_bp_xp,
           reward_item_rarity, icon, category, sort_order)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (key) DO NOTHING
      `, [
        t.key, t.label, t.description, t.target_action, t.base_target,
        t.difficulty, t.min_level, t.max_level ?? 999, t.reward_type,
        t.base_reward_credits, t.base_reward_xp, t.base_reward_bp_xp,
        t.reward_item_rarity ?? null, t.icon, t.category, t.sort_order,
      ]);
      if (rowCount > 0) inserted++;
    }
    console.log(`OK   Seeded ${inserted} quest templates (${templates.length - inserted} already existed)`);

  } finally {
    await client.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
