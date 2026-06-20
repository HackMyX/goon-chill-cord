// One-off data seed for the "case_tiers" admin-economy table, mirroring the
// current code defaults in lib/cases.ts so the admin panel has real,
// editable rows from day one. Safe to re-run (upsert).
// Usage: node scripts/seed-case-tiers.mjs
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

// Mirrors lib/cases.ts CASE_GROUPS — keep these two in sync manually.
const rows = [
  {
    id: "cosmetics-standard",
    group_id: "cosmetics",
    label: "CASE ÖFFNEN",
    price: 100,
    rarity_weights: { normal: 92, selten: 6, mythisch: 2, ultra: 0.05 },
    enabled: true,
  },
  {
    id: "cosmetics-premium",
    group_id: "cosmetics",
    label: "PREMIUM",
    price: 500,
    rarity_weights: { normal: 84.8, selten: 9, mythisch: 6, ultra: 0.2 },
    enabled: true,
  },
  {
    id: "weapons-standard",
    group_id: "weapons",
    label: "WAFFEN CASE",
    price: 2000,
    rarity_weights: { normal: 80, selten: 15, mythisch: 4.5, ultra: 0.5 },
    enabled: true,
  },
  {
    id: "weapons-premium",
    group_id: "weapons",
    label: "PREMIUM WAFFE",
    price: 10000,
    rarity_weights: { normal: 65, selten: 25, mythisch: 9, ultra: 1 },
    enabled: true,
  },
];

const { data, error } = await supabase.from("case_tiers").upsert(rows).select();

if (error) {
  console.error("Seed failed:", error.message);
  console.error(
    "Did you run the CREATE TABLE snippet for case_tiers/audit_logs in the Supabase SQL editor yet?"
  );
  process.exit(1);
}

console.log(`Upserted ${data.length} case_tiers rows.`);
