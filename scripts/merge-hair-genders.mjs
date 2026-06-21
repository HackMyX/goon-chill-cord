// One-time data migration: collapses hair_m + hair_f into a single unisex
// "hair" dbType, so the *same* catalogue item (same id, same name) shows up
// for every player regardless of gender, and only the rendered *shape*
// (item-variants.tsx HairVariant) adapts per body. Also incidentally
// cleans up a handful of exact-duplicate rows discovered while building
// this (e.g. two identical "Braune Männerhaare" rows) — same merge logic
// handles both cases since it groups by canonical name, not by gender.
//
// For every group of rows that collapse to the same canonical name:
//   1. Picks one row as canonical.
//   2. Repoints every inventory row owning any *other* row in the group to
//      the canonical row's id (so no player loses an item they own).
//   3. Deletes the other rows.
//   4. Renames the canonical row (drops "Männer-"/"Frauen-") and retypes
//      it to "hair".
//
// Usage: node scripts/merge-hair-genders.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", ".env.local"), "utf-8")
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Curated ultra names don't share a "drop the gendered noun" pattern with
// the color matrix — mapped by hand, paired by theme (Void<->Void,
// Sternen<->Sternen).
const ULTRA_RENAME = {
  Voidhaar: "Void-Haare",
  Voidlocken: "Void-Haare",
  Sternenhaar: "Sternen-Haare",
  Sternenlocken: "Sternen-Haare",
};

function canonicalNameFor(name) {
  if (name in ULTRA_RENAME) return ULTRA_RENAME[name];
  return name.replace("Männerhaare", "Haare").replace("Frauenhaare", "Haare");
}

async function main() {
  const { data: rows, error } = await supabase
    .from("items")
    .select("id, name, type, rarity, price_cr")
    .in("type", ["hair_m", "hair_f"]);

  if (error) {
    console.error("Failed to fetch hair items:", error.message);
    process.exit(1);
  }

  console.log(`Found ${rows.length} hair_m/hair_f rows.`);

  const groups = new Map();
  for (const row of rows) {
    const key = canonicalNameFor(row.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  console.log(`Collapsing into ${groups.size} unisex "hair" items.`);

  let mergedDuplicates = 0;
  let reassignedInventory = 0;

  for (const [canonicalName, group] of groups) {
    const canonical = group[0];
    const duplicates = group.slice(1);

    for (const dup of duplicates) {
      const { data: invRows, error: invSelectError } = await supabase
        .from("inventory")
        .select("id")
        .eq("item_id", dup.id);

      if (invSelectError) {
        console.error(`Failed to read inventory for ${dup.id}:`, invSelectError.message);
        continue;
      }

      if (invRows && invRows.length > 0) {
        const { error: invUpdateError } = await supabase
          .from("inventory")
          .update({ item_id: canonical.id })
          .eq("item_id", dup.id);
        if (invUpdateError) {
          console.error(`Failed to reassign inventory for ${dup.id}:`, invUpdateError.message);
          continue;
        }
        reassignedInventory += invRows.length;
      }

      const { error: deleteError } = await supabase.from("items").delete().eq("id", dup.id);
      if (deleteError) {
        console.error(`Failed to delete duplicate ${dup.id} (${dup.name}):`, deleteError.message);
        continue;
      }
      mergedDuplicates++;
    }

    const { error: renameError } = await supabase
      .from("items")
      .update({ name: canonicalName, type: "hair" })
      .eq("id", canonical.id);

    if (renameError) {
      console.error(`Failed to rename canonical ${canonical.id}:`, renameError.message);
    }
  }

  console.log(
    `Done. ${groups.size} unisex hair items, ${mergedDuplicates} duplicate rows merged/removed, ${reassignedInventory} inventory rows repointed.`
  );
}

main();
