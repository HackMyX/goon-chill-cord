// One-off data seed for the "items" table. Does not touch the schema.
// Usage: node scripts/seed-items.mjs
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

const items = [
  { name: "Gewöhnliches Schwert", rarity: "common", type: "weapon", price_cr: 50 },
  { name: "Gewöhnlicher Schild", rarity: "common", type: "shield", price_cr: 50 },
  { name: "Seltener Bogen", rarity: "rare", type: "weapon", price_cr: 250 },
  { name: "Seltene Rüstung", rarity: "rare", type: "armor", price_cr: 250 },
  { name: "Epischer Helm", rarity: "epic", type: "helmet", price_cr: 1000 },
  { name: "Epischer Umhang", rarity: "epic", type: "cape", price_cr: 1000 },
  { name: "Legendärer Ring", rarity: "legendary", type: "ring", price_cr: 5000 },
  { name: "Legendäres Amulett", rarity: "legendary", type: "amulet", price_cr: 5000 },
];

const { data, error } = await supabase.from("items").insert(items).select();

if (error) {
  console.error("Seed failed:", error);
  process.exit(1);
}

console.log(`Seeded ${data.length} items.`);
