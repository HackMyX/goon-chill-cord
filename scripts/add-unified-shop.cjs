// scripts/add-unified-shop.cjs
// V-UNIFIED-SHOP Phase 1 — der Shop kann jetzt JEDEN Givable-Typ listen, nicht
// nur Items. shop_listings bekommt listing_type + typ-spezifische Keys; item_id
// wird nullable. shop_categories bekommt content_type, damit die Auto-Generierung
// pro Kategorie aus dem richtigen Pool (Item/Fähigkeit/Style/Badge) zieht.
// Idempotent. Run: node scripts/add-unified-shop.cjs

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(`
      ALTER TABLE shop_listings
        ADD COLUMN IF NOT EXISTS listing_type   text NOT NULL DEFAULT 'item',
        ADD COLUMN IF NOT EXISTS ability_key    text,
        ADD COLUMN IF NOT EXISTS name_style_key text,
        ADD COLUMN IF NOT EXISTS badge_key      text,
        ADD COLUMN IF NOT EXISTS badge_text     text,
        ADD COLUMN IF NOT EXISTS voucher_config jsonb;
    `);
    console.log("✅ shop_listings: listing_type + typ-Keys");

    // item_id war NOT NULL — für Nicht-Item-Listings muss es nullable sein.
    await client.query(`ALTER TABLE shop_listings ALTER COLUMN item_id DROP NOT NULL;`);
    console.log("✅ shop_listings.item_id ist jetzt nullable");

    await client.query(`
      ALTER TABLE shop_categories
        ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'item';
    `);
    console.log("✅ shop_categories.content_type");

    console.log("\n🎉 Unified-Shop Migration abgeschlossen.");
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
