// One-time data migration: the "hat" category's display word is being
// renamed from "Mütze" (feminine) to "Helm" (masculine) everywhere in the
// app (admin panel + frontend labels — see lib/cases.ts TYPE_LABELS and
// lib/wardrobe.ts). The dbType itself ("hat") is NOT changing, only the
// German word baked into every existing item's `name` column needs
// rewriting — and since German adjectives decline by grammatical gender,
// every prefix/color adjective in a "Mütze" name also needs its ending
// flipped from the feminine "-e" form to the masculine "-er" form (e.g.
// "Seltene Blaue Mütze" -> "Seltener Blauer Helm"), not just a literal
// word-swap of "Mütze" -> "Helm".
//
// Builds the exact old (feminine) name set generate-all-items.js used to
// produce, paired with the new (masculine) name it now produces for the
// same prefix/color combination, and renames any matching `hat` row by
// exact lookup — never a blind substring replace, so nothing is silently
// mismatched. Any "hat" row whose name doesn't match a known generated
// pattern (curated names like "Sternenhelm") is left untouched and logged.
//
// Usage: node scripts/rename-hat-to-helm.mjs

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

// Mirrors scripts/generate-all-items.js's COLORS/PREFIX_TIERS exactly —
// kept duplicated rather than imported since this is a throwaway one-time
// migration, not shared runtime logic.
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

// Prefix tiers decline too — feminine "-e" paired with its masculine "-er".
const PREFIX_TIERS = [
  { f: "", m: "" },
  { f: "Ungewöhnliche", m: "Ungewöhnlicher" },
  { f: "Seltene", m: "Seltener" },
  { f: "Epische", m: "Epischer" },
  { f: "Legendäre", m: "Legendärer" },
  { f: "Mythische", m: "Mythischer" },
];

const renameMap = new Map();
for (const tier of PREFIX_TIERS) {
  for (const color of COLORS) {
    const oldName = [tier.f, color.f, "Mütze"].filter(Boolean).join(" ");
    const newName = [tier.m, color.m, "Helm"].filter(Boolean).join(" ");
    renameMap.set(oldName, newName);
  }
}
// Curated ultra-tier names that used the old word.
renameMap.set("Kronen-Mütze", "Kronen-Helm");
renameMap.set("Voidkappe", "Voidhelm");

async function main() {
  const { data: rows, error } = await supabase.from("items").select("id, name").eq("type", "hat");
  if (error) {
    console.error("Failed to fetch hat items:", error.message);
    process.exit(1);
  }

  let renamed = 0;
  let unmatched = 0;

  for (const row of rows) {
    const newName = renameMap.get(row.name);
    if (!newName) {
      unmatched++;
      console.log(`No mapping for "${row.name}" (id ${row.id}) — left unchanged.`);
      continue;
    }
    const { error: updateError } = await supabase.from("items").update({ name: newName }).eq("id", row.id);
    if (updateError) {
      console.error(`Failed to rename "${row.name}" -> "${newName}":`, updateError.message);
      continue;
    }
    renamed++;
    console.log(`Renamed: "${row.name}" -> "${newName}"`);
  }

  console.log(`Done. Renamed ${renamed} items, ${unmatched} left unmatched (review log above).`);
}

main();
