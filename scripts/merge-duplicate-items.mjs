// One-time cleanup: the catalogue had 14 exact (type, name) duplicate
// pairs scattered across hat/jacket/pants/shoes/trail/aura/pet/weapon_
// cosmetic (most likely leftover from re-running scripts/generate-all-
// items.js's color-matrix generation more than once for a few rows) — two
// DB rows for things like "Lila Mütze" that are supposed to be exactly one
// catalogue entry. Same merge logic as merge-hair-genders.mjs: keep one
// canonical row per (type, name), repoint any inventory pointing at the
// others to it, then delete the others. No player loses an item.
//
// Usage: node scripts/merge-duplicate-items.mjs

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

async function main() {
  const { data: rows, error } = await supabase.from("items").select("id, name, type");
  if (error) {
    console.error("Failed to fetch items:", error.message);
    process.exit(1);
  }

  const groups = new Map();
  for (const row of rows) {
    const key = `${row.type}::${row.name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const dupeGroups = [...groups.values()].filter((g) => g.length > 1);
  console.log(`Found ${dupeGroups.length} duplicate (type, name) groups across ${rows.length} items.`);

  let removed = 0;
  let reassignedInventory = 0;

  for (const group of dupeGroups) {
    const [canonical, ...duplicates] = group;
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
        console.error(`Failed to delete duplicate ${dup.id} (${dup.type}::${dup.name}):`, deleteError.message);
        continue;
      }
      removed++;
      console.log(`Merged duplicate: ${dup.type}::${dup.name} -> kept ${canonical.id}`);
    }
  }

  console.log(`Done. Removed ${removed} duplicate rows, repointed ${reassignedInventory} inventory rows.`);
}

main();
