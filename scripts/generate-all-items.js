// Procedurally generates 900+ cosmetic/weapon items following the
// Rarity-Prefix x Color x Type pattern observed in the reference Garderobe
// screenshots, and pushes them straight into the Supabase `items` table.
//
// Usage: node scripts/generate-all-items.js
//
// Re-running this script will insert a second full set (no dedupe) — only
// run it once, or clear the relevant rows first if you want a clean re-seed.

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env.local");
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf-8")
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

// feminine ("-e") / masculine ("-er") adjective forms — invariable colors
// (Lila, Orange, Cyan, Rosa, Türkis) use the same form for both.
const COLORS = [
  { f: "Rote", m: "Roter" },
  { f: "Blaue", m: "Blauer" },
  { f: "Grüne", m: "Grüner" },
  { f: "Gelbe", m: "Gelber" },
  { f: "Lila", m: "Lila" },
  { f: "Orange", m: "Orange" },
  { f: "Cyan", m: "Cyan" },
  { f: "Rosa", m: "Rosa" },
  { f: "Weiße", m: "Weißer" },
  { f: "Schwarze", m: "Schwarzer" },
  { f: "Braune", m: "Brauner" },
  { f: "Türkise", m: "Türkiser" },
];

// Prefix tiers (cosmetic naming) -> actual game rarity.
const PREFIX_TIERS = [
  { prefix: "", rarity: "normal" },
  { prefix: "Ungewöhnliche", rarity: "normal" },
  { prefix: "Seltene", rarity: "selten" },
  { prefix: "Epische", rarity: "selten" },
  { prefix: "Legendäre", rarity: "mythisch" },
  { prefix: "Mythische", rarity: "mythisch" },
];

const PRICE_BY_RARITY = { normal: 150, selten: 600, mythisch: 3000, ultra: 20000 };

// Color-combinatorial wardrobe types (feminine noun forms).
const COLOR_TYPES = [
  { dbType: "hat", word: "Mütze" },
  { dbType: "jacket", word: "Jacke" },
  { dbType: "pants", word: "Hose" },
  { dbType: "shoes", word: "Schuhe" },
  { dbType: "trail", word: "Spur" },
  { dbType: "shield_cosmetic", word: "Schild" },
  { dbType: "aura", word: "Aura" },
  { dbType: "face", word: "Maske" },
  { dbType: "hair_m", word: "Männerhaare" },
  { dbType: "hair_f", word: "Frauenhaare" },
];

// Pets use a masculine noun (Hund) and a feminine noun (Katze).
const PET_NOUNS = [
  { dbType: "pet", word: "Hund", form: "m" },
  { dbType: "pet", word: "Katze", form: "f" },
];

// Ultra is rare by design — curated unique names per type instead of the
// full color matrix.
const ULTRA_NAMES = {
  hat: ["Kronen-Mütze", "Voidkappe", "Sternenhelm"],
  jacket: ["Drachenrüstung", "Phönixmantel", "Voidjacke"],
  pants: ["Voidhose", "Sternenstoff-Hose"],
  shoes: ["Lichtschritt-Stiefel", "Voidtreter"],
  trail: ["RGB-Spur", "Regenbogen-Spur", "Galaxie-Spur"],
  shield_cosmetic: ["Voidschild", "Drachenschild"],
  aura: ["Rainbow-Aura", "Void-Aura", "Sternen-Aura"],
  face: ["Gottes-Maske", "Regenbogen-Visier"],
  hair_m: ["Voidhaar", "Sternenhaar"],
  hair_f: ["Voidlocken", "Sternenlocken"],
  pet: ["Schatten-Drache", "Mini-Phönix"],
  weapon_cosmetic: ["Voidklinge", "Götterschwert", "Sternensplitter"],
};

// Weapons follow thematic unique names per rarity tier, not the color matrix.
const WEAPON_NAMES = {
  normal: ["Rohr", "Holzbrett", "Rostige Klinge", "Holzschwert", "Stahlrohr"],
  selten: ["Glasflasche", "Dolch", "Stahlschild", "Machete", "Wurfstern"],
  mythisch: ["Messer", "Butterfly", "Baseballschläger", "Flammenschwert", "Donnerhammer"],
};

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

const items = [];

function adjective(color, gender) {
  return gender === "m" ? color.m : color.f;
}

// 10 color types x 12 colors x 6 prefix tiers = 720 items.
for (const type of COLOR_TYPES) {
  for (const tier of PREFIX_TIERS) {
    for (const color of COLORS) {
      const name = [tier.prefix, adjective(color, "f"), type.word]
        .filter(Boolean)
        .join(" ");
      items.push({
        name,
        rarity: tier.rarity,
        type: type.dbType,
        price_cr: PRICE_BY_RARITY[tier.rarity],
      });
    }
  }
}

// Pets: 2 nouns x 12 colors x 6 prefix tiers = 144 items.
for (const pet of PET_NOUNS) {
  for (const tier of PREFIX_TIERS) {
    for (const color of COLORS) {
      const name = [tier.prefix, adjective(color, pet.form), pet.word]
        .filter(Boolean)
        .join(" ");
      items.push({
        name,
        rarity: tier.rarity,
        type: pet.dbType,
        price_cr: PRICE_BY_RARITY[tier.rarity],
      });
    }
  }
}

// Weapons: curated names per rarity (normal/selten/mythisch), no color matrix.
for (const [rarity, names] of Object.entries(WEAPON_NAMES)) {
  for (const name of names) {
    items.push({ name, rarity, type: "weapon_cosmetic", price_cr: PRICE_BY_RARITY[rarity] });
  }
}

// Ultra uniques across every type (including weapons).
for (const [dbType, names] of Object.entries(ULTRA_NAMES)) {
  for (const name of names) {
    items.push({ name, rarity: "ultra", type: dbType, price_cr: PRICE_BY_RARITY.ultra });
  }
}

console.log(`Generated ${items.length} items.`);

// ---------------------------------------------------------------------------
// Push to Supabase in batches
// ---------------------------------------------------------------------------

async function main() {
  const BATCH_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.from("items").insert(batch).select("id");
    if (error) {
      console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, error.message);
      process.exit(1);
    }
    inserted += data.length;
    console.log(`Inserted batch ${i / BATCH_SIZE + 1}: ${data.length} rows (total ${inserted})`);
  }

  console.log(`Done. Inserted ${inserted} items total.`);
}

main();
