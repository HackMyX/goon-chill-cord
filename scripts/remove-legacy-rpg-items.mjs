// One-time cleanup: scripts/seed-items.mjs (an old, pre-color-matrix seed
// script using the now-dead "weapon"/"shield"/"armor"/"helmet"/"cape"
// dbTypes — note its rows even used the OLD rarity strings "rare"/"epic",
// not the current normal/selten/mythisch/ultra enum, confirming how stale
// they are) left 8 rows behind that components/world/character-model.tsx
// has no render path for at all (only "weapon_cosmetic"/"shield_cosmetic"
// actually draw anything in the 3D world — equipping one of these legacy
// types renders nothing, see the debugWarn there). Two of them
// ("Flammenschwert", "Voidklinge", type "weapon") happen to share a name
// with a real, working "weapon_cosmetic" item — which is exactly the
// visible "two Flammenschwerter in admin search" duplicate this script
// was written to fix. The other 6 have no working counterpart at all and
// are simply dead weight.
//
// For the 2 name-colliding rows: reassigns any inventory pointing at the
// legacy row onto the real weapon_cosmetic counterpart (carrying over
// `equipped` state) before deleting it — same "never let a player silently
// lose an owned item" reasoning as merge-duplicate-items.mjs.
// For the other 6: deletes their (non-functional) inventory rows along
// with the catalog rows themselves — there is no working item to
// reassign to, and an invisible item conveys nothing worth preserving.
//
// Usage: node scripts/remove-legacy-rpg-items.mjs

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

const NAME_COLLISIONS = ["Flammenschwert", "Voidklinge"];
const DEAD_LEGACY_TYPES = ["weapon", "shield", "armor", "helmet", "cape"];

async function main() {
  // --- Part 1: reassign + delete the 2 name-colliding legacy rows.
  for (const name of NAME_COLLISIONS) {
    const { data: rows, error } = await supabase.from("items").select("id, type").eq("name", name);
    if (error || !rows) {
      console.error(`Failed to look up "${name}":`, error?.message);
      continue;
    }
    const canonical = rows.find((r) => r.type === "weapon_cosmetic");
    const legacy = rows.find((r) => r.type === "weapon");
    if (!canonical || !legacy) {
      console.log(`"${name}": no weapon/weapon_cosmetic pair found, skipping.`);
      continue;
    }

    const { data: invRows } = await supabase
      .from("inventory")
      .select("id, equipped")
      .eq("item_id", legacy.id);

    for (const inv of invRows ?? []) {
      await supabase.from("inventory").update({ item_id: canonical.id }).eq("id", inv.id);
    }
    console.log(`"${name}": reassigned ${invRows?.length ?? 0} inventory row(s) -> ${canonical.id}`);

    const { error: deleteError } = await supabase.from("items").delete().eq("id", legacy.id);
    if (deleteError) console.error(`Failed to delete legacy "${name}":`, deleteError.message);
    else console.log(`"${name}": deleted legacy weapon-type row ${legacy.id}`);
  }

  // --- Part 2: delete the remaining dead-type rows (and whatever
  // inventory points at them — nothing real to reassign to).
  const { data: deadRows, error: deadError } = await supabase
    .from("items")
    .select("id, name, type")
    .in("type", DEAD_LEGACY_TYPES);
  if (deadError) {
    console.error("Failed to fetch dead-type rows:", deadError.message);
    return;
  }

  for (const row of deadRows ?? []) {
    const { data: invRows } = await supabase.from("inventory").select("id").eq("item_id", row.id);
    if (invRows && invRows.length > 0) {
      await supabase.from("inventory").delete().eq("item_id", row.id);
      console.log(`"${row.name}" (${row.type}): removed ${invRows.length} non-functional inventory row(s)`);
    }
    const { error: deleteError } = await supabase.from("items").delete().eq("id", row.id);
    if (deleteError) console.error(`Failed to delete "${row.name}":`, deleteError.message);
    else console.log(`"${row.name}" (${row.type}): deleted`);
  }

  console.log("Done.");
}

main();
