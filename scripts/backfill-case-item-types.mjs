// Narrow, safe backfill: sets `item_types` on existing case_tiers rows to
// match the current code defaults in lib/cases.ts, WITHOUT touching price/
// rarity_weights/enabled (which an admin may have already customized via
// the panel). Run once after adding the `item_types` column.
// Usage: node scripts/backfill-case-item-types.mjs
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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Mirrors lib/cases.ts CASE_GROUPS itemTypes — keep in sync manually.
const COSMETICS_TYPES = [
  "hat",
  "jacket",
  "pants",
  "shoes",
  "trail",
  "shield_cosmetic",
  "aura",
  "face",
  "hair_m",
  "hair_f",
  "pet",
  "ring",
  "amulet",
  "helmet",
  "armor",
  "cape",
];
const WEAPON_TYPES = ["weapon", "shield", "weapon_cosmetic"];

const updates = [
  { id: "cosmetics-standard", item_types: COSMETICS_TYPES },
  { id: "cosmetics-premium", item_types: COSMETICS_TYPES },
  { id: "weapons-standard", item_types: WEAPON_TYPES },
  { id: "weapons-premium", item_types: WEAPON_TYPES },
];

for (const { id, item_types } of updates) {
  const { error } = await supabase.from("case_tiers").update({ item_types }).eq("id", id);
  if (error) {
    console.error(`Failed for ${id}:`, error.message);
    process.exit(1);
  }
  console.log(`Backfilled item_types for ${id} (${item_types.length} types).`);
}

console.log("Done.");
