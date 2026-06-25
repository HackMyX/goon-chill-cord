/**
 * Migration: Level/XP System + Abilities System + Sound Config
 * Run: node scripts/add-level-xp-abilities.cjs
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

  // ─── 1. Profiles — XP, Level, Equipped Ability ──────────────────────────────
  await client.query(`
    ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS xp bigint NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS equipped_ability_key text;
  `);
  console.log("✅ profiles.xp + level + equipped_ability_key added");

  // ─── 2. xp_config singleton ─────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS xp_config (
      id text PRIMARY KEY DEFAULT 'default',
      levels jsonb NOT NULL DEFAULT '[]',
      sources jsonb NOT NULL DEFAULT '{}',
      ability_slot_count integer NOT NULL DEFAULT 1,
      updated_at timestamptz DEFAULT now()
    );
    ALTER TABLE xp_config ENABLE ROW LEVEL SECURITY;
  `);
  console.log("✅ xp_config table created");

  // ─── 3. xp_events log ───────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS xp_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
      amount integer NOT NULL,
      source text NOT NULL,
      source_detail text,
      created_at timestamptz DEFAULT now()
    );
    ALTER TABLE xp_events ENABLE ROW LEVEL SECURITY;
    CREATE INDEX IF NOT EXISTS xp_events_user_id_idx ON xp_events(user_id);
    CREATE INDEX IF NOT EXISTS xp_events_created_at_idx ON xp_events(created_at DESC);
  `);
  console.log("✅ xp_events table created");

  // ─── 4. ability_definitions catalog ─────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS ability_definitions (
      key text PRIMARY KEY,
      name text NOT NULL,
      description text,
      category text NOT NULL DEFAULT 'global',
      effect_type text NOT NULL DEFAULT 'xp_boost',
      effect_value numeric(10,4) NOT NULL DEFAULT 0,
      effect_config jsonb NOT NULL DEFAULT '{}',
      rarity text NOT NULL DEFAULT 'selten',
      icon text NOT NULL DEFAULT 'Zap',
      shop_price_cr integer NOT NULL DEFAULT 0,
      available_in_shop boolean NOT NULL DEFAULT false,
      can_drop_from_cases boolean NOT NULL DEFAULT true,
      enabled boolean NOT NULL DEFAULT true,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz DEFAULT now()
    );
    ALTER TABLE ability_definitions ENABLE ROW LEVEL SECURITY;
  `);
  console.log("✅ ability_definitions table created");

  // ─── 5. user_abilities inventory ────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_abilities (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
      ability_key text REFERENCES ability_definitions(key) ON DELETE CASCADE,
      source text NOT NULL DEFAULT 'unknown',
      source_detail text,
      acquired_at timestamptz DEFAULT now(),
      expires_at timestamptz
    );
    ALTER TABLE user_abilities ENABLE ROW LEVEL SECURITY;
    CREATE INDEX IF NOT EXISTS user_abilities_user_id_idx ON user_abilities(user_id);
  `);
  console.log("✅ user_abilities table created");

  // ─── 6. sound_config singleton ──────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS sound_config (
      id text PRIMARY KEY DEFAULT 'default',
      config jsonb NOT NULL DEFAULT '{}',
      updated_at timestamptz DEFAULT now()
    );
    ALTER TABLE sound_config ENABLE ROW LEVEL SECURITY;
  `);
  console.log("✅ sound_config table created");

  // ─── 7. Battle Pass tiers — ability reward column ────────────────────────────
  await client.query(`
    ALTER TABLE battle_pass_tiers
      ADD COLUMN IF NOT EXISTS reward_ability_key text;
  `);
  console.log("✅ battle_pass_tiers.reward_ability_key added");

  // ─── 8. Seed default XP config ───────────────────────────────────────────────
  const levels = [];
  const levelTitles = [
    "", // 0 = unused
    "Neuling","Neuling","Neuling","Neuling",
    "Anfänger","Anfänger","Anfänger","Anfänger","Anfänger",
    "Rookie","Rookie","Rookie","Rookie","Rookie",
    "Spieler","Spieler","Spieler","Spieler","Spieler",
    "Veteran","Veteran","Veteran","Veteran","Veteran",
    "Experte","Experte","Experte","Experte","Experte",
    "Elite","Elite","Elite","Elite","Elite",
    "Meister","Meister","Meister","Meister","Meister",
    "Großmeister","Großmeister","Großmeister","Großmeister","Großmeister",
    "Legende","Legende","Legende","Legende","Legende",
    "Mythisch",
  ];
  const levelRewards = {
    5:  [{ type: "credits", amount: 5000 }],
    10: [{ type: "credits", amount: 15000 }, { type: "ability", abilityKey: "xp_crystal" }],
    15: [{ type: "credits", amount: 10000 }],
    20: [{ type: "credits", amount: 30000 }, { type: "ability", abilityKey: "mine_pickaxe_gold" }],
    25: [{ type: "credits", amount: 20000 }],
    30: [{ type: "credits", amount: 50000 }, { type: "ability", abilityKey: "credit_amulett" }],
    35: [{ type: "credits", amount: 30000 }],
    40: [{ type: "credits", amount: 100000 }, { type: "ability", abilityKey: "mine_diamond_pickaxe" }],
    45: [{ type: "credits", amount: 50000 }],
    50: [{ type: "credits", amount: 200000 }, { type: "ability", abilityKey: "mine_ultra_core" }],
  };
  for (let n = 1; n <= 50; n++) {
    const xpRequired = n === 1 ? 0 : Math.round(Math.floor(100 * Math.pow(n, 2.2)) / 100) * 100;
    levels.push({
      level: n,
      xpRequired,
      title: levelTitles[n] || "Spieler",
      rewards: levelRewards[n] || [],
    });
  }

  const defaultSources = {
    mine_collect_per_100cr: 1,
    streak_per_day: 8,
    snake_per_score_point: 0.5,
    plinko_per_drop: 5,
    don_win: 20,
    case_open: 30,
    world_kill: 10,
    bp_tier_claim: 50,
    pvp_kill: 25,
  };

  await client.query(
    `INSERT INTO xp_config (id, levels, sources, ability_slot_count)
     VALUES ('default', $1, $2, 1)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(levels), JSON.stringify(defaultSources)]
  );
  console.log("✅ xp_config seeded with 50 levels");

  // ─── 9. Seed default ability definitions ─────────────────────────────────────
  const abilities = [
    // ── Mine abilities ──
    { key: "mine_pickaxe_gold", name: "Goldene Spitzhacke", description: "+25% Credits pro Mine-Sammlung", category: "mine", effect_type: "mine_cr_bonus", effect_value: 0.25, rarity: "selten", icon: "Pickaxe", shop_price_cr: 50000, available_in_shop: true, can_drop_from_cases: true, sort_order: 1 },
    { key: "mine_diamond_pickaxe", name: "Diamant-Spitzhacke", description: "+50% Credits pro Mine-Sammlung & +15% Lagerkapazität", category: "mine", effect_type: "mine_cr_bonus", effect_value: 0.50, effect_config: { storage_bonus: 0.15 }, rarity: "mythisch", icon: "Pickaxe", shop_price_cr: 200000, available_in_shop: false, can_drop_from_cases: true, sort_order: 2 },
    { key: "mine_double_ore", name: "Doppel-Erz-Sensor", description: "20% Chance für doppelte Credits beim Sammeln", category: "mine", effect_type: "mine_double_chance", effect_value: 0.20, rarity: "selten", icon: "Gem", shop_price_cr: 75000, available_in_shop: true, can_drop_from_cases: true, sort_order: 3 },
    { key: "mine_turbo_drill", name: "Turbo-Bohrmaschine", description: "Effektives Sammel-Intervall -20%", category: "mine", effect_type: "mine_speed", effect_value: 0.20, rarity: "selten", icon: "Zap", shop_price_cr: 60000, available_in_shop: true, can_drop_from_cases: true, sort_order: 4 },
    { key: "mine_vault", name: "Erz-Tresor", description: "+8 Stunden max. Lagerkapazität", category: "mine", effect_type: "mine_storage_hours", effect_value: 8, rarity: "selten", icon: "Database", shop_price_cr: 55000, available_in_shop: true, can_drop_from_cases: true, sort_order: 5 },
    { key: "mine_engineer", name: "Meister-Ingenieur", description: "Upgrade-Kosten -10%", category: "mine", effect_type: "mine_upgrade_discount", effect_value: 0.10, rarity: "selten", icon: "Wrench", shop_price_cr: 40000, available_in_shop: true, can_drop_from_cases: true, sort_order: 6 },
    { key: "mine_ultra_core", name: "Ultra-Kern-Reaktor", description: "+80% Credits, 30% Doppel-Chance, -15% Upgrade-Kosten", category: "mine", effect_type: "mine_cr_bonus", effect_value: 0.80, effect_config: { double_chance: 0.30, upgrade_discount: 0.15 }, rarity: "ultra", icon: "Atom", shop_price_cr: 0, available_in_shop: false, can_drop_from_cases: false, sort_order: 7 },

    // ── Snake abilities ──
    { key: "snake_apple_radar", name: "Apfel-Radar", description: "+1 CR Bonus pro gegessenem Apfel", category: "snake", effect_type: "snake_cr_per_apple", effect_value: 1, rarity: "selten", icon: "Apple", shop_price_cr: 30000, available_in_shop: true, can_drop_from_cases: true, sort_order: 10 },
    { key: "snake_gold_apple", name: "Goldener Apfel", description: "Goldene Äpfel spawnen 30% häufiger", category: "snake", effect_type: "snake_gold_apple_rate", effect_value: 0.30, rarity: "mythisch", icon: "Apple", shop_price_cr: 0, available_in_shop: false, can_drop_from_cases: true, sort_order: 11 },

    // ── Plinko abilities ──
    { key: "plinko_safety_net", name: "Sicherheitsnetz", description: "Beim schlechtesten Slot: 25% des Einsatzes zurück", category: "plinko", effect_type: "plinko_loss_recovery", effect_value: 0.25, rarity: "mythisch", icon: "Shield", shop_price_cr: 0, available_in_shop: false, can_drop_from_cases: true, sort_order: 20 },
    { key: "plinko_lucky_charm", name: "Glücks-Anhänger", description: "+5% zu allen Multiplikatoren", category: "plinko", effect_type: "plinko_multiplier_boost", effect_value: 0.05, rarity: "selten", icon: "Star", shop_price_cr: 45000, available_in_shop: true, can_drop_from_cases: true, sort_order: 21 },

    // ── DON abilities ──
    { key: "don_lucky_coin", name: "Glücks-Münze", description: "+1 Bonus-Flip pro Tag", category: "don", effect_type: "don_bonus_flips", effect_value: 1, rarity: "selten", icon: "Coins", shop_price_cr: 35000, available_in_shop: true, can_drop_from_cases: true, sort_order: 30 },
    { key: "don_phoenix_feather", name: "Phönixfeder", description: "1× täglich: verlierst du, verlierst du nichts", category: "don", effect_type: "don_daily_shield", effect_value: 1, rarity: "mythisch", icon: "Bird", shop_price_cr: 0, available_in_shop: false, can_drop_from_cases: true, sort_order: 31 },

    // ── World abilities ──
    { key: "world_berserker", name: "Berserker-Serum", description: "+10% Schaden in der Welt", category: "world", effect_type: "world_damage_boost", effect_value: 0.10, rarity: "selten", icon: "Sword", shop_price_cr: 40000, available_in_shop: true, can_drop_from_cases: true, sort_order: 40 },
    { key: "world_medic", name: "Medizin-Pack", description: "HP-Regeneration +30%", category: "world", effect_type: "world_hp_regen", effect_value: 0.30, rarity: "mythisch", icon: "Heart", shop_price_cr: 0, available_in_shop: false, can_drop_from_cases: true, sort_order: 41 },
    { key: "world_xp_amplifier", name: "XP-Verstärker (Welt)", description: "+25% XP aus Welt-Kills", category: "world", effect_type: "world_xp_boost", effect_value: 0.25, rarity: "selten", icon: "TrendingUp", shop_price_cr: 30000, available_in_shop: true, can_drop_from_cases: true, sort_order: 42 },

    // ── Global abilities ──
    { key: "xp_crystal", name: "XP-Kristall", description: "+25% XP aus allen Quellen", category: "global", effect_type: "xp_boost", effect_value: 0.25, rarity: "selten", icon: "Gem", shop_price_cr: 50000, available_in_shop: true, can_drop_from_cases: true, sort_order: 50 },
    { key: "xp_prism", name: "XP-Prisma", description: "+60% XP aus allen Quellen", category: "global", effect_type: "xp_boost", effect_value: 0.60, rarity: "mythisch", icon: "Sparkles", shop_price_cr: 0, available_in_shop: false, can_drop_from_cases: true, sort_order: 51 },
    { key: "credit_amulett", name: "Credits-Amulett", description: "+5% zu allen Credit-Einnahmen", category: "global", effect_type: "credit_bonus", effect_value: 0.05, rarity: "selten", icon: "Coins", shop_price_cr: 60000, available_in_shop: true, can_drop_from_cases: true, sort_order: 52 },
    { key: "streak_shield", name: "Streak-Schutzschild", description: "+2 Stunden Gnadenfrist für den Daily-Streak", category: "global", effect_type: "streak_grace_hours", effect_value: 2, rarity: "selten", icon: "Shield", shop_price_cr: 25000, available_in_shop: true, can_drop_from_cases: true, sort_order: 53 },
  ];

  for (const a of abilities) {
    await client.query(
      `INSERT INTO ability_definitions
        (key, name, description, category, effect_type, effect_value, effect_config, rarity, icon, shop_price_cr, available_in_shop, can_drop_from_cases, enabled, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13)
       ON CONFLICT (key) DO NOTHING`,
      [
        a.key, a.name, a.description ?? null, a.category,
        a.effect_type, a.effect_value,
        JSON.stringify(a.effect_config ?? {}),
        a.rarity, a.icon, a.shop_price_cr,
        a.available_in_shop ?? false, a.can_drop_from_cases ?? true, a.sort_order ?? 0,
      ]
    );
  }
  console.log(`✅ ${abilities.length} ability definitions seeded`);

  // ─── 10. Seed default sound config ───────────────────────────────────────────
  const defaultSoundConfig = {
    tick:     { file: "/sounds/tick.wav",      volume: 0.18, enabled: true },
    hover:    { file: "/sounds/hover.wav",     volume: 0.10, enabled: true },
    hit:      { file: "/sounds/hit.wav",       volume: 0.28, enabled: true },
    click:    { file: "/sounds/click.wav",     volume: 0.18, enabled: true },
    win:      { file: "/sounds/win.wav",       volume: 0.35, enabled: true },
    ultraWin: { file: "/sounds/ultra-win.wav", volume: 0.35, enabled: true },
    error:    { file: "/sounds/error.wav",     volume: 0.35, enabled: true },
    flip:     { file: "/sounds/flip.wav",      volume: 0.35, enabled: true },
    save:     { file: "/sounds/save.wav",      volume: 0.20, enabled: true },
    levelUp:  { file: "/sounds/win.wav",       volume: 0.40, enabled: true },
    xpGain:   { file: "/sounds/tick.wav",      volume: 0.15, enabled: true },
    abilityEquip: { file: "/sounds/save.wav",  volume: 0.25, enabled: true },
  };

  await client.query(
    `INSERT INTO sound_config (id, config) VALUES ('default', $1)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(defaultSoundConfig)]
  );
  console.log("✅ sound_config seeded");

  await client.end();
  console.log("\n🎉 Migration complete!");
}

run().catch((e) => {
  console.error("❌ Migration failed:", e.message);
  process.exit(1);
});
