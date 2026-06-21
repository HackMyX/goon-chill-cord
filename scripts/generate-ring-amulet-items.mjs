// Adds the "ring" and "amulet" item types to the catalogue — these dbTypes
// already existed in lib/cases.ts (ALL_ITEM_TYPES, case pool config) but
// scripts/generate-all-items.js never actually generated any items for
// them, so equipping a ring/amulet was structurally impossible: there were
// none to win, buy, or grant. RingVariant/AmuletVariant (components/world/
// item-variants.tsx) and the "ring"/"amulet" Garderobe categories
// (lib/wardrobe.ts) now exist too — this is the last piece, the actual rows.
//
// Usage: node scripts/generate-ring-amulet-items.mjs
//
// Safe to run once. Re-running would insert a second full set (no dedupe),
// same caveat as generate-all-items.js.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf-8")
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// "Ring" (der Ring) is masculine, "Amulett" (das Amulett) is neuter — neither
// matches the f/m-only COLORS table in generate-all-items.js, so both get
// their own correctly-inflected adjective forms here instead of reusing it.
const RING_COLORS = [
  "Roter", "Blauer", "Grüner", "Gelber", "Lila", "Orange",
  "Cyan", "Rosa", "Weißer", "Schwarzer", "Brauner", "Türkiser",
];
const AMULET_COLORS = [
  "Rotes", "Blaues", "Grünes", "Gelbes", "Lila", "Orange",
  "Cyan", "Rosa", "Weißes", "Schwarzes", "Braunes", "Türkises",
];

const PREFIX_TIERS = [
  { prefix: "", rarity: "normal" },
  { prefix: "Ungewöhnlicher", rarity: "normal" },
  { prefix: "Seltener", rarity: "selten" },
  { prefix: "Epischer", rarity: "selten" },
  { prefix: "Legendärer", rarity: "mythisch" },
  { prefix: "Mythischer", rarity: "mythisch" },
];
// Neuter agreement for "Amulett" — same tiers, "-es" forms.
const PREFIX_TIERS_NEUTER = [
  { prefix: "", rarity: "normal" },
  { prefix: "Ungewöhnliches", rarity: "normal" },
  { prefix: "Seltenes", rarity: "selten" },
  { prefix: "Episches", rarity: "selten" },
  { prefix: "Legendäres", rarity: "mythisch" },
  { prefix: "Mythisches", rarity: "mythisch" },
];

const PRICE_BY_RARITY = { normal: 150, selten: 600, mythisch: 3000, ultra: 20000 };

const ULTRA_NAMES = {
  ring: ["Unendlichkeitsring", "Voidring", "Sternenring"],
  amulet: ["Amulett der Götter", "Void-Amulett", "Sternenamulett"],
};

const items = [];

for (const tier of PREFIX_TIERS) {
  for (const color of RING_COLORS) {
    const name = [tier.prefix, color, "Ring"].filter(Boolean).join(" ");
    items.push({ name, rarity: tier.rarity, type: "ring", price_cr: PRICE_BY_RARITY[tier.rarity] });
  }
}

for (const tier of PREFIX_TIERS_NEUTER) {
  for (const color of AMULET_COLORS) {
    const name = [tier.prefix, color, "Amulett"].filter(Boolean).join(" ");
    items.push({ name, rarity: tier.rarity, type: "amulet", price_cr: PRICE_BY_RARITY[tier.rarity] });
  }
}

for (const [type, names] of Object.entries(ULTRA_NAMES)) {
  for (const name of names) {
    items.push({ name, rarity: "ultra", type, price_cr: PRICE_BY_RARITY.ultra });
  }
}

console.log(`Generated ${items.length} ring/amulet items.`);

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
