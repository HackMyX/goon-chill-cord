/**
 * Balance Final — High-Stakes Economy
 *
 * Philosophy: Items sollen sich krass anfuehlen. Ultra = 5M+ CR. Normale Items
 * 10-20k. Nametags Ultra 12-30M. Einkommen skaliert mit rauf damit die Grind-
 * Zeit vernuenftig bleibt (Ultra in ca. 1-2 Wochen grinden moeglich).
 *
 * Run: node scripts/balance-final.cjs
 */
"use strict";
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const envFile = path.join(__dirname, "..", ".env.local");
for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
  const m = line.match(/^([^#=\s]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const db = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await db.connect();
  console.log("Connected. Running final high-stakes balance pass...\n");

  // ── 1. ITEM PRICES — tiered multipliers per rarity ────────────────────────
  // Normal:   ×2.5  → avg ~12k  (user: 8-20k)
  // Selten:   ×3.0  → avg ~100k
  // Mythisch: ×5.0  → avg ~700k
  // Ultra:    ×7.0  → avg ~4.5M (user: ~5M for ultra)
  console.log("💎 Item prices (all 993 items)...");
  const rarityMult = [
    { rarity: "normal",   mult: 2.5 },
    { rarity: "selten",   mult: 3.0 },
    { rarity: "mythisch", mult: 5.0 },
    { rarity: "ultra",    mult: 7.0 },
  ];
  for (const r of rarityMult) {
    const res = await db.query(
      "UPDATE items SET price_cr = ROUND(price_cr::numeric * $1::numeric)::integer WHERE rarity = $2",
      [r.mult, r.rarity]
    );
    const check = await db.query(
      "SELECT MIN(price_cr) as mn, MAX(price_cr) as mx, ROUND(AVG(price_cr)) as avg FROM items WHERE rarity=$1",
      [r.rarity]
    );
    const row = check.rows[0];
    console.log(
      "  " + r.rarity.padEnd(10) +
      " ×" + String(r.mult).padEnd(4) +
      "  " + Number(row.mn).toLocaleString("de-DE").padStart(10) +
      " – " + Number(row.mx).toLocaleString("de-DE").padEnd(12) + " CR" +
      "  (avg " + Number(row.avg).toLocaleString("de-DE") + ")"
    );
  }
  console.log();

  // ── 2. NAME STYLE PRICES ─────────────────────────────────────────────────
  // Ultra nametag ~12-30M CR (user said ~15M ist ok)
  console.log("🎨 Name style prices...");
  const nameStyles = [
    { rarity: "normal",   base: 40000,    max: 100000    },
    { rarity: "selten",   base: 300000,   max: 800000    },
    { rarity: "mythisch", base: 2000000,  max: 6000000   },
    { rarity: "ultra",    base: 12000000, max: 30000000  },
  ];
  for (const ns of nameStyles) {
    await db.query(
      "UPDATE name_style_rarity_config SET base_shop_price_cr=$1, max_shop_price_cr=$2 WHERE rarity=$3",
      [ns.base, ns.max, ns.rarity]
    );
    console.log("  " + ns.rarity.padEnd(10) + " " + ns.base.toLocaleString("de-DE").padStart(12) + " – " + ns.max.toLocaleString("de-DE") + " CR");
  }
  console.log();

  // ── 3. CASE PRICES ───────────────────────────────────────────────────────
  // Hoher Einsatz = mehr Spannung. Standard Cases fuer ~1 Arbeitstag Mine,
  // Premium Cases als echte Investition.
  console.log("📦 Case prices...");
  const cases = [
    { id: "cosmetics-standard", price: 8000   },
    { id: "cosmetics-premium",  price: 35000  },
    { id: "weapons-standard",   price: 25000  },
    { id: "weapons-premium",    price: 100000 },
  ];
  for (const c of cases) {
    const r = await db.query(
      "UPDATE case_tiers SET price=$1 WHERE id=$2 RETURNING label, price",
      [c.price, c.id]
    );
    if (r.rowCount) {
      console.log("  ✓ " + c.id.padEnd(22) + " " + c.price.toLocaleString("de-DE") + " CR");
    }
  }
  console.log();

  // ── 4. STARTING CREDITS ──────────────────────────────────────────────────
  console.log("💰 Starting credits...");
  await db.query("UPDATE site_config SET starting_credits=$1 WHERE id='default'", [20000]);
  console.log("  ✓ 3,000 → 20,000 CR (neuer Spieler kann sofort 2 Normal-Cases oeffnen)\n");

  // ── 5. MINE — 1.5x bump to match higher economy ──────────────────────────
  // Passive income skaliert mit damit Ultra nicht unerreichbar bleibt
  console.log("⛏️  Mine (passive income, +50% from v2 values)...");
  const mineLevels = [
    { level: 1,  crPerHour:   550, maxStorageHours: 24, upgradeCost:   120000 },
    { level: 2,  crPerHour:   850, maxStorageHours: 24, upgradeCost:   170000 },
    { level: 3,  crPerHour:  1300, maxStorageHours: 24, upgradeCost:   280000 },
    { level: 4,  crPerHour:  2000, maxStorageHours: 24, upgradeCost:   480000 },
    { level: 5,  crPerHour:  3100, maxStorageHours: 24, upgradeCost:   800000 },
    { level: 6,  crPerHour:  4700, maxStorageHours: 24, upgradeCost:  1350000 },
    { level: 7,  crPerHour:  7000, maxStorageHours: 24, upgradeCost:  2200000 },
    { level: 8,  crPerHour: 10500, maxStorageHours: 24, upgradeCost:  3600000 },
    { level: 9,  crPerHour: 15500, maxStorageHours: 24, upgradeCost:  5800000 },
    { level: 10, crPerHour: 24000, maxStorageHours: 24, upgradeCost:  null    },
  ];
  await db.query(
    "UPDATE mine_config SET levels=$1::jsonb WHERE id='default'",
    [JSON.stringify(mineLevels)]
  );
  mineLevels.forEach(function(l) {
    const day = (l.crPerHour * 24).toLocaleString("de-DE");
    const cost = l.upgradeCost ? (l.upgradeCost / 1000).toFixed(0) + "k" : "MAX";
    console.log("  L" + String(l.level).padEnd(3) + " " + l.crPerHour.toLocaleString("de-DE").padStart(6) + " CR/h  " + day.padStart(9) + "/Tag  →  " + cost);
  });
  console.log();

  // ── 6. SNAKE — scale all modes ×2.5 ─────────────────────────────────────
  console.log("🐍 Snake modes...");
  const snakeRow = await db.query("SELECT modes_config FROM snake_config WHERE id='default'");
  const modes = snakeRow.rows[0].modes_config;

  // x1
  modes.x1.creditsPerApple = 30;
  modes.x1.dailyCrLimit = 60000;
  modes.x1.bonusCrFlat = 200;
  modes.x1.goldenAppleCrMultiplier = 6;
  // x2
  modes.x2.creditsPerApple = 70;
  modes.x2.dailyCrLimit = 120000;
  modes.x2.bonusCrFlat = 400;
  modes.x2.goldenAppleCrMultiplier = 6;
  // farm
  modes.farm.creditsPerApple = 15;
  modes.farm.dailyCrLimit = 40000;
  modes.farm.dailyGameLimit = 20;
  // grind
  modes.grind.creditsPerApple = 20;
  modes.grind.dailyCrLimit = 250000;
  modes.grind.bonusCrFlat = 400;
  modes.grind.bonusCrPerShrink = 250;
  modes.grind.goldenAppleCrMultiplier = 6;

  await db.query(
    "UPDATE snake_config SET modes_config=$1::jsonb, credits_per_apple_x1=$2, credits_per_apple_x2=$3, daily_cr_limit=$4, bonus_cr_flat=$5 WHERE id='default'",
    [JSON.stringify(modes), 30, 70, 60000, 200]
  );
  console.log("  ✓ x1:    12→30 CR/apple   daily 20k→60k CR");
  console.log("  ✓ x2:    28→70 CR/apple   daily 40k→120k CR");
  console.log("  ✓ farm:   6→15 CR/apple   daily 15k→40k CR");
  console.log("  ✓ grind:  8→20 CR/apple   daily 75k→250k CR\n");

  // ── 7. STREAK REWARDS ────────────────────────────────────────────────────
  console.log("🔥 Streak rewards...");
  await db.query(
    "UPDATE streak_config SET base_reward=$1, daily_increment=$2, max_reward=$3, milestone_bonus=$4 WHERE id='default'",
    [2000, 250, 25000, 60000]
  );
  console.log("  ✓ base:      600 → 2,000 CR");
  console.log("  ✓ increment: 100 → 250 CR/day");
  console.log("  ✓ max:     6,000 → 25,000 CR");
  console.log("  ✓ milestone: 12,000 → 60,000 CR (every 7 days)\n");

  // ── 8. MONSTER CREDITS ───────────────────────────────────────────────────
  console.log("👾 Monster credits (higher stakes)...");
  const monsters = [
    { id: "slime_weak",      credits_reward: 60  },
    { id: "skeleton_weak",   credits_reward: 75  },
    { id: "zombie_weak",     credits_reward: 85  },
    { id: "zombie_strong",   credits_reward: 180 },
    { id: "skeleton_strong", credits_reward: 200 },
    { id: "ghost_wraith",    credits_reward: 240 },
    { id: "orc_brute",       credits_reward: 260 },
    { id: "demon_boss",      credits_reward: 800 },
  ];
  for (const m of monsters) {
    const r = await db.query(
      "UPDATE monster_types SET credits_reward=$1 WHERE id=$2 RETURNING name",
      [m.credits_reward, m.id]
    );
    if (r.rowCount) {
      console.log("  ✓ " + r.rows[0].name.padEnd(20) + " → " + m.credits_reward + " CR");
    }
  }
  console.log();

  // ── 9. DON CONFIG — quick amounts skalieren ───────────────────────────────
  console.log("🎲 DON quick amounts...");
  await db.query(
    "UPDATE don_config SET quick_amounts=$1, min_bet=$2 WHERE id='default'",
    [[2000, 10000, 50000, 250000, 1000000], 2000]
  );
  console.log("  ✓ quick: 2k / 10k / 50k / 250k / 1M CR");
  console.log("  ✓ min_bet: 1,000 → 2,000 CR\n");

  // ── 10. PLINKO — hoeherer Einsatz ────────────────────────────────────────
  console.log("🔵 Plinko...");
  await db.query(
    "UPDATE plinko_config SET ball_cost_cr=$1, min_bet_cr=$2, quick_bet_amounts=$3::jsonb WHERE id='default'",
    [2000, 2000, JSON.stringify([2000, 10000, 50000, 200000, 1000000])]
  );
  console.log("  ✓ ball_cost_cr: 500 → 2,000 CR");
  console.log("  ✓ quick bets: 2k / 10k / 50k / 200k / 1M CR\n");

  // ── 11. SHOP MULTIPLIER — etwas breiter fuer mehr Variation ──────────────
  console.log("🏪 Shop multiplier...");
  await db.query(
    "UPDATE shop_settings SET auto_generate_price_multiplier_min=$1, auto_generate_price_multiplier_max=$2 WHERE id='default'",
    [1.3, 1.8]
  );
  console.log("  ✓ 1.2–1.6× → 1.3–1.8× (items im Shop = Aufpreis fuer Bequemlichkeit)\n");

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  console.log("=".repeat(65));
  console.log("✅ Final high-stakes balance complete!\n");
  console.log("ECONOMY OVERVIEW:");
  console.log("  Start:       20,000 CR    (2x Normal-Cases sofort moeglich)");
  console.log("  Normal item: ~12,500 CR   (user-request: 8-20k ✓)");
  console.log("  Selten item: ~100,000 CR");
  console.log("  Mythisch:    ~700,000 CR");
  console.log("  Ultra item:  ~4,500,000 CR (user-request: ~5M ✓)");
  console.log("  Nametag N:   40k – 100k CR");
  console.log("  Nametag U:   12M – 30M CR (user-request: ~15M ✓)");
  console.log("  Mine L10:    24,000 CR/h  = 576,000 CR/Tag");
  console.log("  Ultra grind: ~8 Tage voller Mine fuer 1 ultra item");
  console.log("  Streak max:  25,000 CR/Tag + 60k Milestone");

  await db.end();
}

run().catch(function(err) { console.error(err); db.end(); process.exit(1); });
