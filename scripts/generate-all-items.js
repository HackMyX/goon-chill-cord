// Procedurally generates 900+ cosmetic/weapon items following the
// Rarity-Prefix x Color x Type pattern observed in the reference Garderobe
// screenshots, and pushes them straight into the Supabase `items` table.
//
// Usage: node scripts/generate-all-items.js
//
// Idempotent: fetches existing (type, name) pairs first and skips any item
// that's already in the catalogue, so re-running this to add new vocabulary
// later never reintroduces duplicates (see scripts/merge-duplicate-items.mjs
// for the one-time cleanup of the dupes an earlier non-idempotent run left
// behind).

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

// Color-combinatorial wardrobe types. Noun gender drives which adjective
// form is grammatically correct ("der Helm" is masculine -> "-er" ending,
// e.g. "Roter Helm", unlike the rest of this list which are feminine/plural
// nouns taking the "-e" ending, e.g. "Rote Jacke").
const COLOR_TYPES = [
  { dbType: "hat", word: "Helm", gender: "m" },
  { dbType: "jacket", word: "Jacke", gender: "f" },
  { dbType: "pants", word: "Hose", gender: "f" },
  { dbType: "shoes", word: "Schuhe", gender: "f" },
  { dbType: "trail", word: "Spur", gender: "f" },
  { dbType: "shield_cosmetic", word: "Schild", gender: "f" },
  { dbType: "aura", word: "Aura", gender: "f" },
  { dbType: "face", word: "Maske", gender: "f" },
  { dbType: "hair_m", word: "Männerhaare", gender: "f" },
  { dbType: "hair_f", word: "Frauenhaare", gender: "f" },
];

// Pets use a masculine noun (Hund) and a feminine noun (Katze).
const PET_NOUNS = [
  { dbType: "pet", word: "Hund", form: "m" },
  { dbType: "pet", word: "Katze", form: "f" },
];

// Ultra is rare by design — curated unique names per type instead of the
// full color matrix.
const ULTRA_NAMES = {
  hat: ["Kronen-Helm", "Voidhelm", "Sternenhelm"],
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
      const name = [tier.prefix, adjective(color, type.gender), type.word]
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
  const { data: existingRows, error: fetchError } = await supabase.from("items").select("type, name");
  if (fetchError) {
    console.error("Failed to fetch existing items:", fetchError.message);
    process.exit(1);
  }

  const existingKeys = new Set(existingRows.map((row) => `${row.type}::${row.name}`));
  const toInsert = items.filter((item) => !existingKeys.has(`${item.type}::${item.name}`));
  const skipped = items.length - toInsert.length;
  console.log(`Skipping ${skipped} items that already exist; inserting ${toInsert.length} new items.`);

  const BATCH_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.from("items").insert(batch).select("id");
    if (error) {
      console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, error.message);
      process.exit(1);
    }
    inserted += data.length;
    console.log(`Inserted batch ${i / BATCH_SIZE + 1}: ${data.length} rows (total ${inserted})`);
  }

  console.log(`Done. Inserted ${inserted} new items total.`);
}

main();
