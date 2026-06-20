// Ensures every (case-group itemType x rarity) combination has at least one
// item, so a case roll never lands on an empty pool. Pure data seed.
// Usage: node scripts/seed-fallback-coverage.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf-8")
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => {
      const [key, ...rest] = line.split("=");
      return [key.trim(), rest.join("=").trim()];
    })
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const RARITIES = ["normal", "selten", "mythisch", "ultra"];
const PRICE_BY_RARITY = { normal: 100, selten: 500, mythisch: 2500, ultra: 15000 };

const GROUPS = [
  {
    types: ["ring", "amulet", "helmet", "armor", "cape"],
    names: {
      normal: "Holzring",
      selten: "Silberamulett",
      mythisch: "Drachenhelm",
      ultra: "Phönixumhang",
    },
  },
  {
    types: ["weapon", "shield"],
    names: {
      normal: "Rostige Klinge",
      selten: "Stahlschild",
      mythisch: "Flammenschwert",
      ultra: "Voidklinge",
    },
  },
];

const { data: existing } = await supabase.from("items").select("rarity, type");

const toInsert = [];
for (const group of GROUPS) {
  for (const rarity of RARITIES) {
    const hasCoverage = existing.some(
      (i) => group.types.includes(i.type) && i.rarity === rarity
    );
    if (!hasCoverage) {
      toInsert.push({
        name: group.names[rarity],
        rarity,
        type: group.types[0],
        price_cr: PRICE_BY_RARITY[rarity],
      });
    }
  }
}

if (toInsert.length === 0) {
  console.log("Coverage already complete, nothing to insert.");
} else {
  const { data, error } = await supabase.from("items").insert(toInsert).select();
  if (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
  console.log(`Inserted ${data.length} fallback-coverage items:`, data.map((d) => `${d.name} (${d.rarity})`));
}
