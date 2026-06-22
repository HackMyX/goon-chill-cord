// Creates the shop category + per-day scheduling system: shop_categories,
// shop_category_day_rules, and a nullable category_id FK on shop_listings.
// Usage: node scripts/create-shop-categories.mjs

import { Client } from "pg";
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

const client = new Client({ connectionString: env.DATABASE_URL });

async function main() {
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS shop_categories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      icon text NOT NULL DEFAULT 'Tag',
      color text NOT NULL DEFAULT 'purple',
      enabled boolean NOT NULL DEFAULT true,
      sort_order integer NOT NULL DEFAULT 0,
      rarity_filter text[],
      type_filter text[],
      item_count integer NOT NULL DEFAULT 2,
      price_multiplier_min numeric NOT NULL DEFAULT 3,
      price_multiplier_max numeric NOT NULL DEFAULT 8,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("shop_categories table ready.");

  await client.query(`
    CREATE TABLE IF NOT EXISTS shop_category_day_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      category_id uuid NOT NULL REFERENCES shop_categories(id) ON DELETE CASCADE,
      day_of_week integer,
      specific_date date,
      enabled boolean NOT NULL DEFAULT true,
      rarity_filter text[],
      type_filter text[],
      item_count_override integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("shop_category_day_rules table ready.");

  await client.query(`
    DO $$ BEGIN
      ALTER TABLE shop_category_day_rules ADD CONSTRAINT shop_category_day_rules_xor_check
        CHECK (
          (day_of_week IS NOT NULL AND specific_date IS NULL AND day_of_week BETWEEN 0 AND 6)
          OR (day_of_week IS NULL AND specific_date IS NOT NULL)
        );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  console.log("XOR check constraint ready.");

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS shop_category_day_rules_dow_uniq
      ON shop_category_day_rules (category_id, day_of_week) WHERE day_of_week IS NOT NULL;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS shop_category_day_rules_date_uniq
      ON shop_category_day_rules (category_id, specific_date) WHERE specific_date IS NOT NULL;
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS shop_category_day_rules_specific_date_idx
      ON shop_category_day_rules (specific_date) WHERE specific_date IS NOT NULL;
  `);
  console.log("Indexes ready.");

  await client.query(`
    ALTER TABLE shop_listings ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES shop_categories(id) ON DELETE SET NULL;
  `);
  console.log("shop_listings.category_id column ready.");

  await client.query(`ALTER TABLE shop_categories ENABLE ROW LEVEL SECURITY;`);
  await client.query(`ALTER TABLE shop_category_day_rules ENABLE ROW LEVEL SECURITY;`);
  console.log("RLS enabled.");

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
