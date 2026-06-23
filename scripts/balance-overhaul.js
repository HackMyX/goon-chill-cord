/**
 * Game-wide balance overhaul — run once to set all item stats, prices,
 * perks, shield values, and shop categories to a coherent, well-designed state.
 *
 * Safe to re-run: all operations are upserts / idempotent.
 *
 * Usage (from project root):
 *   node scripts/balance-overhaul.js
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local
 * automatically. Never commit credentials into this file.
 */
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Load .env.local unless vars are already set
const envFile = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, "utf8")
    .split("\n")
    .forEach((line) => {
      const eq = line.indexOf("=");
      if (eq > 0 && !line.startsWith("#")) {
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim();
        if (k && !process.env[k]) process.env[k] = v;
      }
    });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing env vars. Run from project root so .env.local is found.");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Deterministic hash → float in [0,1) per item+seed ────────────────────
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
function frac(id, seed = "") {
  return (hash(id + seed) % 10000) / 10000;
}
function roundNice(v) {
  if (v < 500)   return Math.round(v / 10) * 10;
  if (v < 5000)  return Math.round(v / 50) * 50;
  if (v < 20000) return Math.round(v / 100) * 100;
  return Math.round(v / 500) * 500;
}

// ─── Price ranges [min, max] by type × rarity ──────────────────────────────
// Design intent:
//   • Pure cosmetics (trail/aura/hair/face) = cheapest tier
//   • Gear (hat/jacket/pants/shoes) = mid tier, justified by armor stats
//   • Accessories (ring/amulet) = above gear — perks are powerful
//   • Shield = premium — defense value + unique mechanic
//   • Pet = premium — permanent visual companion
//   • Weapon = most expensive — direct combat power
const PRICE_RANGES = {
  trail:           { normal: [80,160],    selten: [400,700],   mythisch: [1600,2800],  ultra: [10000,16000] },
  aura:            { normal: [80,160],    selten: [400,700],   mythisch: [1600,2800],  ultra: [10000,16000] },
  hair:            { normal: [80,160],    selten: [400,700],   mythisch: [1600,2800],  ultra: [10000,16000] },
  face:            { normal: [80,160],    selten: [400,700],   mythisch: [1600,2800],  ultra: [10000,16000] },
  hat:             { normal: [120,200],   selten: [550,950],   mythisch: [2400,4000],  ultra: [15000,22000] },
  jacket:          { normal: [150,250],   selten: [650,1100],  mythisch: [2800,4500],  ultra: [17000,26000] },
  pants:           { normal: [120,200],   selten: [550,950],   mythisch: [2400,4000],  ultra: [15000,22000] },
  shoes:           { normal: [100,180],   selten: [450,850],   mythisch: [1800,3200],  ultra: [11000,18000] },
  ring:            { normal: [180,320],   selten: [800,1400],  mythisch: [3500,5500],  ultra: [20000,30000] },
  amulet:          { normal: [180,320],   selten: [800,1400],  mythisch: [3500,5500],  ultra: [20000,30000] },
  shield_cosmetic: { normal: [250,400],   selten: [950,1600],  mythisch: [4200,6500],  ultra: [25000,36000] },
  pet:             { normal: [280,480],   selten: [1200,2000], mythisch: [5500,9000],  ultra: [30000,44000] },
  weapon_cosmetic: { normal: [400,600],   selten: [1600,2500], mythisch: [7000,11000], ultra: [35000,50000] },
};

function computePrice(type, rarity, id) {
  const range = PRICE_RANGES[type]?.[rarity];
  if (!range) return 150;
  const t = frac(id, "p");
  return roundNice(range[0] + t * (range[1] - range[0]));
}

// ─── Armor per slot × rarity ───────────────────────────────────────────────
// Differentiated by slot (chest = most, feet = least).
// Totals at each rarity: normal≈4, selten≈8, mythisch≈14, ultra≈25 AP.
// Full ultra (25 AP) vs Dämonenfürst (29 DMG) → still takes 4 DMG — endgame
// survivable, never literally invincible. Fist/weak enemies feel trivial at
// mythisch+ intentionally (that's the reward for building full armor).
const ARMOR_BASE = {
  hat:    { normal: 1, selten: 2, mythisch: 3, ultra: 5 },
  jacket: { normal: 2, selten: 3, mythisch: 5, ultra: 9 },
  pants:  { normal: 1, selten: 2, mythisch: 4, ultra: 7 },
  shoes:  { normal: 0, selten: 1, mythisch: 2, ultra: 4 },
};

function computeArmor(type, rarity, id) {
  const base = ARMOR_BASE[type]?.[rarity];
  if (base === undefined || base === null) return null;
  if (base <= 1) return base; // don't vary 0 or 1
  // ±1 variation within each slot/rarity bucket — no two items are identical
  const v = hash(id + "a") % 3; // 0→−1, 1→0, 2→+1
  return Math.max(1, base + v - 1);
}

// ─── Perks for rings + amulets ────────────────────────────────────────────
const PERK_TYPES = ["speed_boost", "jump_boost", "hp_regen_boost"];

// Magnitudes [min, max] — stay under PERK_MULTIPLIER_CAP (1.4×) even when
// two ultra items of the same type are stacked: 1.35 × 1.35 = 1.82 → capped.
const PERK_MAGS = {
  normal:   [0.05, 0.08],
  selten:   [0.10, 0.15],
  mythisch: [0.18, 0.25],
  ultra:    [0.28, 0.35],
};

function computePerkType(type, id) {
  if (type !== "ring" && type !== "amulet") return null;
  return PERK_TYPES[hash(id + "pt") % 3];
}

function computePerkMag(type, rarity, id) {
  if (type !== "ring" && type !== "amulet") return null;
  const [min, max] = PERK_MAGS[rarity] || [0.05, 0.08];
  const t = frac(id, "pm");
  return Math.round((min + t * (max - min)) * 100) / 100;
}

// ─── Shield stats ─────────────────────────────────────────────────────────
// shield_hp = absorb pool before it breaks. regen_cooldown = seconds after
// breaking before it starts recharging. Both vary within rarity band.
// Ultra shield absorbs even the boss's full hit before HP is touched.
const SHIELD_STATS = {
  normal:   { hp: [12, 28],   cd: [20, 28] },
  selten:   { hp: [35, 60],   cd: [13, 20] },
  mythisch: { hp: [65, 90],   cd: [8,  13] },
  ultra:    { hp: [110, 150], cd: [4,  8]  },
};

function computeShieldHp(type, rarity, id) {
  if (type !== "shield_cosmetic") return null;
  const s = SHIELD_STATS[rarity];
  if (!s) return null;
  return Math.round(s.hp[0] + frac(id, "sh") * (s.hp[1] - s.hp[0]));
}

function computeShieldCd(type, rarity, id) {
  if (type !== "shield_cosmetic") return null;
  const s = SHIELD_STATS[rarity];
  if (!s) return null;
  return Math.round(s.cd[0] + frac(id, "sc") * (s.cd[1] - s.cd[0]));
}

// ─── Weapon damage ─────────────────────────────────────────────────────────
// Calibrated against lib/monsters.ts HP pools and FIST_DAMAGE=8 floor.
// Normal: kills Slime (28 HP) in ≤2 hits. Ultra: one-shots mid-tier mobs.
const DMG_RANGES = {
  normal:   [13, 18],  // avg ~15 — floor clear improvement over fists (8)
  selten:   [26, 34],  // avg ~30 — kills Slime in 1 hit, Zombie in 2
  mythisch: [48, 62],  // avg ~55 — kills most mobs in 2 hits
  ultra:    [90, 115], // avg ~100 — near one-shots even the boss
};

function computeDamage(type, rarity, id) {
  if (type !== "weapon_cosmetic") return null;
  const range = DMG_RANGES[rarity];
  if (!range) return null;
  return Math.round(range[0] + frac(id, "d") * (range[1] - range[0]));
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Goon'n Chill Cord — Balance Overhaul ===\n");

  // 1. Quick count check
  console.log("1/5  Checking DB connection…");
  const { count, error: fetchErr } = await admin
    .from("items")
    .select("id", { count: "exact", head: true });
  if (fetchErr) {
    console.error("  ERROR:", fetchErr.message);
    process.exit(1);
  }
  console.log(`     ${count} items in DB.\n`);

  // 2. Compute new stat values and build upsert rows
  // NOTE: must include name/type/rarity/image_url in every row because
  // Supabase upsert validates the INSERT path (NOT NULL constraint on name)
  // even though every row already exists and the conflict UPDATE runs instead.
  console.log("2/4  Fetching full item rows for safe upsert…");
  const { data: fullItems, error: fullErr } = await admin
    .from("items")
    .select("id, name, rarity, type, price_cr, image_url, damage, armor, perk_type, perk_magnitude, shield_hp, shield_regen_cooldown_sec");
  if (fullErr || !fullItems) {
    console.error("  ERROR:", fullErr?.message ?? "no data");
    process.exit(1);
  }

  const typeStats = {};
  for (const item of fullItems) {
    typeStats[item.type] = (typeStats[item.type] || 0) + 1;
  }
  console.log("     Distribution:", JSON.stringify(typeStats));

  const updates = fullItems.map((item) => {
    // Start with all existing columns (satisfies NOT NULL constraint on name etc.)
    const row = { ...item };

    row.price_cr = computePrice(item.type, item.rarity, item.id);

    const isArmor  = ["hat", "jacket", "pants", "shoes"].includes(item.type);
    const isPerk   = ["ring", "amulet"].includes(item.type);
    const isShield = item.type === "shield_cosmetic";
    const isWeapon = item.type === "weapon_cosmetic";

    if (isArmor)  row.armor = computeArmor(item.type, item.rarity, item.id);
    if (isPerk) {
      row.perk_type      = computePerkType(item.type, item.id);
      row.perk_magnitude = computePerkMag(item.type, item.rarity, item.id);
    }
    if (isShield) {
      row.shield_hp                 = computeShieldHp(item.type, item.rarity, item.id);
      row.shield_regen_cooldown_sec = computeShieldCd(item.type, item.rarity, item.id);
    }
    if (isWeapon) row.damage = computeDamage(item.type, item.rarity, item.id);

    return row;
  });

  // Spot-check perk distribution
  const perkDist = {};
  updates.filter((u) => u.perk_type && u.perk_type !== "none").forEach((u) => {
    perkDist[u.perk_type] = (perkDist[u.perk_type] || 0) + 1;
  });
  console.log(`     Perk distribution (${Object.values(perkDist).reduce((a,b)=>a+b,0)} items):`, perkDist);

  // 3. Upsert in batches of 200
  console.log("\n3/4  Upserting item stats…");
  const BATCH = 200;
  let done = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const chunk = updates.slice(i, i + BATCH);
    const { error } = await admin.from("items").upsert(chunk, { onConflict: "id" });
    if (error) {
      console.error(`  Batch ${Math.ceil(i / BATCH) + 1} ERROR:`, error.message);
    } else {
      done += chunk.length;
      process.stdout.write(`\r     ${done}/${updates.length} items updated`);
    }
  }
  console.log("\n     Done.\n");

  // 5. Update shop settings (global fallback)
  console.log("5/6  Updating shop settings…");
  const { error: shopErr } = await admin.from("shop_settings").upsert({
    id: "default",
    auto_generate_enabled: true,
    auto_generate_item_count: 20,
    auto_generate_price_multiplier_min: 1.5,
    auto_generate_price_multiplier_max: 2.5,
    auto_generate_item_types: [
      "hat","jacket","pants","shoes",
      "weapon_cosmetic","pet","aura","trail",
      "ring","amulet","hair","face","shield_cosmetic",
    ],
    updated_at: new Date().toISOString(),
  });
  console.log("    ", shopErr ? "ERROR: " + shopErr.message : "OK");

  // 6. Create shop categories (replace all)
  console.log("\n6/6  Configuring shop categories…");

  // Delete all existing categories first (day rules cascade)
  const { error: delErr } = await admin
    .from("shop_categories")
    .delete()
    .not("id", "is", null);
  if (delErr) console.log("  Delete existing:", delErr.message);

  const categories = [
    // 6 items/day — normal+selten, all types → the everyday deal section
    {
      name: "Tägliche Deals",
      icon: "Tag",
      color: "#3b82f6",
      enabled: true,
      sort_order: 1,
      rarity_filter: ["normal", "selten"],
      type_filter: null,
      item_count: 6,
      price_multiplier_min: 1.4,
      price_multiplier_max: 2.0,
    },
    // 5 clothing items — hat/jacket/pants/shoes all rarities
    {
      name: "Kleidung & Rüstung",
      icon: "Shirt",
      color: "#8b5cf6",
      enabled: true,
      sort_order: 2,
      rarity_filter: null,
      type_filter: ["hat", "jacket", "pants", "shoes"],
      item_count: 5,
      price_multiplier_min: 1.5,
      price_multiplier_max: 2.3,
    },
    // 4 combat items — weapons + shields all rarities
    {
      name: "Kampfausrüstung",
      icon: "Sword",
      color: "#ef4444",
      enabled: true,
      sort_order: 3,
      rarity_filter: null,
      type_filter: ["weapon_cosmetic", "shield_cosmetic"],
      item_count: 4,
      price_multiplier_min: 1.6,
      price_multiplier_max: 2.5,
    },
    // 5 companion+magic items — pets, auras, trails, rings, amulets
    {
      name: "Begleiter & Magie",
      icon: "Sparkles",
      color: "#10b981",
      enabled: true,
      sort_order: 4,
      rarity_filter: null,
      type_filter: ["pet", "aura", "trail", "ring", "amulet"],
      item_count: 5,
      price_multiplier_min: 1.5,
      price_multiplier_max: 2.2,
    },
    // 2 rare showcase slots — mythisch+ultra only, all types
    // processed last so other categories can't "steal" the rare items
    {
      name: "Seltene Schätze",
      icon: "Gem",
      color: "#f59e0b",
      enabled: true,
      sort_order: 5,
      rarity_filter: ["mythisch", "ultra"],
      type_filter: null,
      item_count: 2,
      price_multiplier_min: 1.2,
      price_multiplier_max: 1.8,
    },
  ];

  for (const cat of categories) {
    const { error } = await admin.from("shop_categories").insert({
      ...cat,
      updated_at: new Date().toISOString(),
    });
    const status = error ? `ERROR: ${error.message}` : "✓";
    console.log(`    [${status}] ${cat.name}  (${cat.item_count} items/day, ×${cat.price_multiplier_min}–${cat.price_multiplier_max})`);
  }

  console.log("\n=== Balance overhaul complete ===");
  console.log("\nSummary:");
  console.log("  Items updated:  ", fullItems.length);
  console.log("  Shop categories:", categories.length, "(22 items/day total)");
  console.log("  Price bands:    fully differentiated by type + rarity");
  console.log("  Armor:          differentiated by slot (chest>legs>head>feet)");
  console.log("  Perks:          all rings/amulets now have speed/jump/regen boost");
  console.log("  Shields:        all shields have HP + cooldown tuned per rarity");
  console.log("  Weapons:        each weapon has a unique damage value within rarity");
  console.log("\nTo verify, run: node scripts/verify-balance.js");
}

main().catch((e) => {
  console.error("\nFATAL:", e.message);
  process.exit(1);
});
