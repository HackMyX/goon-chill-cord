// One-off data seed for cosmetic wardrobe items + demo inventory grants.
// Usage: node scripts/seed-wardrobe.mjs
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
  { name: "Lila Mütze", rarity: "selten", type: "hat", price_cr: 300 },
  { name: "Rosa Mütze", rarity: "normal", type: "hat", price_cr: 200 },
  { name: "Cyan Jacke", rarity: "normal", type: "jacket", price_cr: 200 },
  { name: "Goldene Jacke", rarity: "mythisch", type: "jacket", price_cr: 4000 },
  { name: "Weiße Hose", rarity: "normal", type: "pants", price_cr: 150 },
  { name: "Lederhose", rarity: "selten", type: "pants", price_cr: 350 },
  { name: "Weiße Schuhe", rarity: "normal", type: "shoes", price_cr: 200 },
  { name: "Seltene Weiße Schuhe", rarity: "selten", type: "shoes", price_cr: 400 },
  { name: "Gelbe Spur", rarity: "normal", type: "trail", price_cr: 250 },
  { name: "Weiße Spur", rarity: "normal", type: "trail", price_cr: 250 },
  { name: "Blaues Schild", rarity: "normal", type: "shield_cosmetic", price_cr: 300 },
  { name: "Goldenes Schild", rarity: "mythisch", type: "shield_cosmetic", price_cr: 3500 },
  { name: "Seltene Rote Aura", rarity: "selten", type: "aura", price_cr: 2000 },
  { name: "Lila Aura", rarity: "selten", type: "aura", price_cr: 2000 },
  { name: "Lächelndes Gesicht", rarity: "normal", type: "face", price_cr: 100 },
  { name: "Episches Grinsen", rarity: "mythisch", type: "face", price_cr: 5000 },
  { name: "Mythische Schwarze Männerhaare", rarity: "mythisch", type: "hair_m", price_cr: 35000 },
  { name: "Braune Männerhaare", rarity: "normal", type: "hair_m", price_cr: 200 },
  { name: "Seltene Cyan Frauenhaare", rarity: "selten", type: "hair_f", price_cr: 1500 },
  { name: "Seltene Lila Frauenhaare", rarity: "selten", type: "hair_f", price_cr: 300 },
  { name: "Weiße Katze", rarity: "normal", type: "pet", price_cr: 900 },
  { name: "Roter Hund", rarity: "normal", type: "pet", price_cr: 201 },
  { name: "Holzbrett", rarity: "normal", type: "weapon_cosmetic", price_cr: 100 },
  { name: "Butterfly", rarity: "mythisch", type: "weapon_cosmetic", price_cr: 800001 },
];

const { data: insertedItems, error } = await supabase
  .from("items")
  .insert(items)
  .select();

if (error) {
  console.error("Seed failed:", error);
  process.exit(1);
}

console.log(`Seeded ${insertedItems.length} wardrobe items.`);

const { data: profiles } = await supabase.from("profiles").select("id").limit(1);
const userId = profiles?.[0]?.id;

if (userId) {
  // Grant one item per category to the demo user, equip the first two.
  const grants = insertedItems
    .filter((_, i) => i % 2 === 0)
    .map((item, i) => ({
      user_id: userId,
      item_id: item.id,
      equipped: i < 2,
    }));

  const { error: invError } = await supabase.from("inventory").insert(grants);
  if (invError) {
    console.error("Granting demo inventory failed:", invError);
    process.exit(1);
  }
  console.log(`Granted ${grants.length} demo items to user ${userId}.`);
}
