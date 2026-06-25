/**
 * Balance Pass v3 — items, perks, name styles, monster credits, shop
 *
 * Run: node scripts/balance-pass-v3.cjs
 * Requires: DATABASE_URL in .env.local
 *
 * What this covers:
 *   - monster_types.credits_reward: all monsters are stuck at 5 CR — scale by difficulty
 *   - name_style_rarity_config: prices 75% too high for the economy
 *   - world_config: sync perk_multiplier_cap with character_config (0.4→1.6)
 *   - items (weapon_cosmetic): weapon damage is already reasonable; just verify
 *   - shop_settings: tighten price_multiplier range so items aren't 2.5× base
 */
"use strict";

const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const envFile = path.join(__dirname, "..", ".env.local");
if (!fs.existsSync(envFile)) { console.error(".env.local not found"); process.exit(1); }
for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
  const m = line.match(/^([^#=\s]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const db = new Client({ connectionString: process.env.DATABASE_URL });

// ── Monster credits reward ─────────────────────────────────────────────────────
// Currently ALL 8 monster types give 5 CR — a flat placeholder.
// Scale rewards with HP / danger. Active world play should yield
// ~400-700 CR/h for a decent player (below mine but meaningful for active fun).
//
//   ~14 monsters active, approx 2 kills/min in a busy session = 120/h
//   Mix: mostly weak mobs, some strong, rare boss → avg ~55 CR per kill
//   = ~6,600 CR/h at peak. That's comparable to mine level 5-6, which is correct:
//   the world requires active play so it should reward more than passive mine.
const MONSTER_CREDITS = [
  { id: "slime_weak",       credits_reward: 22  }, // easy, common
  { id: "skeleton_weak",    credits_reward: 28  }, // easy, common
  { id: "zombie_weak",      credits_reward: 32  }, // easy, common
  { id: "zombie_strong",    credits_reward: 70  }, // medium, uncommon
  { id: "skeleton_strong",  credits_reward: 75  }, // medium, uncommon
  { id: "ghost_wraith",     credits_reward: 90  }, // hard (fast + throws)
  { id: "orc_brute",        credits_reward: 95  }, // hard (tanky + throws)
  { id: "demon_boss",       credits_reward: 220 }, // rare boss
];

// ── Name style prices ─────────────────────────────────────────────────────────
// Current prices are 75-80% too high for the economy.
//   Economy daily income (at various mine levels + games):
//     Early player (~mine L3):  ~25k CR/day
//     Mid player (~mine L6):    ~80k CR/day
//     End player (~mine L10):  ~380k CR/day
//
// Target: normal styles feel achievable in 2-4 days for a new player,
//         ultra styles feel like a long-term goal (~1 month of mining).
//
// New prices (base = single purchase price, max = random shop ceiling):
//   normal:   base  12,000  max  45,000   (was 50k–200k)  → 2 days early player
//   selten:   base  80,000  max 300,000   (was 350k–1.5M) → 3 days mid player
//   mythisch: base 500,000  max 2,000,000 (was 2M–8M)     → 6 days mid player
//   ultra:    base 3,000,000 max 12,000,000 (was 12M–50M) → 8 days end player
const NAME_STYLE_PRICES = [
  { rarity: "normal",   base_shop_price:   12000, max_shop_price:   45000 },
  { rarity: "selten",   base_shop_price:   80000, max_shop_price:  300000 },
  { rarity: "mythisch", base_shop_price:  500000, max_shop_price: 2000000 },
  { rarity: "ultra",    base_shop_price: 3000000, max_shop_price:12000000 },
];

// ── Shop settings ─────────────────────────────────────────────────────────────
// Current multiplier 1.5–2.5× is too wide. At 2.5× an ultra cosmetic (504k)
// would show up in the shop for 1.26M CR. Narrow it: 1.2–1.6× gives
// shop items a consistent ~40% premium that still feels like a premium service.
const SHOP_SETTINGS = {
  price_multiplier_min: 1.2,
  price_multiplier_max: 1.6,
};

// ── World config — perk cap sync ──────────────────────────────────────────────
// world_config.perk_multiplier_cap is 0.4 (old placeholder).
// character_config.perk_multiplier_cap is 1.6 (correctly set in v2).
// Items have perk_magnitude 0.05–0.34. With cap=0.4 players wearing
// 2 mythisch ring+amulet (0.22+0.22=0.44) would be immediately over cap.
// Raise to 1.0 so stacking multiple items is meaningful up to +100% boost.
const WORLD_PERK_CAP = 1.0;

// ─────────────────────────────────────────────────────────────────────────────
async function run() {
  await db.connect();
  console.log("Connected. Running balance pass v3...\n");

  // ── Monster credits ───────────────────────────────────────────────────────
  console.log("👾 Monster credits_reward...");
  for (const m of MONSTER_CREDITS) {
    const r = await db.query(
      "UPDATE monster_types SET credits_reward = $1 WHERE id = $2 RETURNING id, name",
      [m.credits_reward, m.id],
    );
    if (r.rowCount) {
      console.log(`  ✓ ${r.rows[0].name.padEnd(20)} 5 → ${m.credits_reward} CR`);
    } else {
      console.log(`  – Not found: ${m.id}`);
    }
  }
  console.log();

  // ── Name style prices ─────────────────────────────────────────────────────
  console.log("🎨 Name style rarity prices...");
  for (const ns of NAME_STYLE_PRICES) {
    const r = await db.query(
      `UPDATE name_style_rarity_config
          SET base_shop_price = $1,
              max_shop_price  = $2
        WHERE rarity = $3
       RETURNING rarity`,
      [ns.base_shop_price, ns.max_shop_price, ns.rarity],
    );
    if (r.rowCount) {
      console.log(`  ✓ ${ns.rarity.padEnd(10)} base ${ns.base_shop_price.toLocaleString("de-DE").padStart(12)} CR  max ${ns.max_shop_price.toLocaleString("de-DE").padStart(14)} CR`);
    } else {
      console.log(`  – Not found: ${ns.rarity}`);
    }
  }
  console.log();

  // ── Shop price multiplier ─────────────────────────────────────────────────
  console.log("🏪 Shop price multiplier...");
  const s = await db.query(
    `UPDATE shop_settings
        SET price_multiplier = jsonb_set(
              jsonb_set(price_multiplier::jsonb, '{min}', $1::text::jsonb),
              '{max}', $2::text::jsonb
            )
      WHERE id = 'default'
     RETURNING id`,
    [SHOP_SETTINGS.price_multiplier_min, SHOP_SETTINGS.price_multiplier_max],
  );
  if (s.rowCount) {
    console.log(`  ✓ Shop multiplier: 1.5–2.5× → ${SHOP_SETTINGS.price_multiplier_min}–${SHOP_SETTINGS.price_multiplier_max}×`);
  } else {
    // Fallback: column might be two separate numeric columns
    try {
      await db.query(
        "UPDATE shop_settings SET price_multiplier_min = $1, price_multiplier_max = $2 WHERE id = 'default'",
        [SHOP_SETTINGS.price_multiplier_min, SHOP_SETTINGS.price_multiplier_max],
      );
      console.log(`  ✓ Shop multiplier (flat cols): ${SHOP_SETTINGS.price_multiplier_min}–${SHOP_SETTINGS.price_multiplier_max}×`);
    } catch (_) {
      console.log("  ⚠ Could not update shop_settings.price_multiplier (schema mismatch)");
    }
  }
  console.log();

  // ── World perk cap ────────────────────────────────────────────────────────
  console.log("⚙️  World perk_multiplier_cap...");
  await db.query(
    "UPDATE world_config SET perk_multiplier_cap = $1 WHERE id = 'default'",
    [WORLD_PERK_CAP],
  );
  console.log(`  ✓ world_config.perk_multiplier_cap: 0.4 → ${WORLD_PERK_CAP}`);
  console.log();

  // ── Verify weapon damage values ───────────────────────────────────────────
  console.log("⚔️  Weapon damage sanity check...");
  const w = await db.query(`
    SELECT rarity,
           COUNT(*) as cnt,
           MIN(damage) as min_dmg,
           MAX(damage) as max_dmg,
           ROUND(AVG(damage),1) as avg_dmg
      FROM items
     WHERE type = 'weapon_cosmetic'
     GROUP BY rarity
     ORDER BY CASE rarity WHEN 'normal' THEN 1 WHEN 'selten' THEN 2 WHEN 'mythisch' THEN 3 WHEN 'ultra' THEN 4 END
  `);
  for (const row of w.rows) {
    const pvpMin = (row.min_dmg * 0.4).toFixed(1);
    const pvpMax = (row.max_dmg * 0.4).toFixed(1);
    console.log(`  ${row.rarity.padEnd(10)} dmg ${String(row.min_dmg).padStart(3)}–${String(row.max_dmg).padEnd(3)}  (PvP ×0.4 = ${pvpMin}–${pvpMax} per hit)`);
  }
  const fist = await db.query("SELECT fist_damage FROM character_config WHERE id='default'");
  if (fist.rows[0]) console.log(`  fist_damage = ${fist.rows[0].fist_damage} (PvP = ${(fist.rows[0].fist_damage * 0.4).toFixed(1)})`);
  console.log();

  // ── Check if armor reduction is working (info only) ──────────────────────
  console.log("🛡️  Armor ranges check...");
  const a = await db.query(`
    SELECT type, rarity,
           MIN(armor) as min_ap,
           MAX(armor) as max_ap
      FROM items
     WHERE armor > 0
     GROUP BY type, rarity
     ORDER BY type, CASE rarity WHEN 'normal' THEN 1 WHEN 'selten' THEN 2 WHEN 'mythisch' THEN 3 WHEN 'ultra' THEN 4 END
  `);
  for (const row of a.rows) {
    console.log(`  ${row.type.padEnd(18)} ${row.rarity.padEnd(10)} AP ${row.min_ap}–${row.max_ap}`);
  }
  console.log();

  console.log("=".repeat(60));
  console.log("✅ Balance pass v3 complete!\n");
  console.log("What changed:");
  console.log("  • Monster credits: 5 CR (flat) → 22–220 CR (by difficulty)");
  console.log("  • Name style prices: reduced ~75% (now achievable in days not months)");
  console.log("  • Shop price multiplier: 1.5–2.5× → 1.2–1.6× (more consistent)");
  console.log("  • World perk cap: 0.4 → 1.0 (stacking items is meaningful now)");

  await db.end();
}

run().catch((err) => { console.error(err); db.end(); process.exit(1); });
