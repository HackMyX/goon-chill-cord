// scripts/add-shop-voucher-config.cjs
// Erweitert Gutschein-Kategorien im Shop: neben Gratis-Cases können sie jetzt
// auch SPIEL-BONUS-Gutscheine generieren (extra Plinko/Snake/DON-Züge).
// shop_categories bekommt voucher_kind + game/amount/duration. Idempotent.
// Run: node scripts/add-shop-voucher-config.cjs

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(`
      ALTER TABLE shop_categories
        ADD COLUMN IF NOT EXISTS voucher_kind           text NOT NULL DEFAULT 'case',
        ADD COLUMN IF NOT EXISTS voucher_game           text,
        ADD COLUMN IF NOT EXISTS voucher_amount         integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS voucher_duration_hours integer NOT NULL DEFAULT 0;
    `);
    console.log("✅ shop_categories: voucher_kind/game/amount/duration");
    console.log("\n🎉 Shop-Voucher-Config Migration abgeschlossen.");
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
