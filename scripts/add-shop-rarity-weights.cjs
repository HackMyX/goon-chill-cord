// scripts/add-shop-rarity-weights.cjs
// Konfigurierbare Seltenheits-Gewichte für die Shop-Automatik. shop_settings
// bekommt rarity_weights jsonb. Idempotent. Run: node scripts/add-shop-rarity-weights.cjs

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(`
      ALTER TABLE shop_settings
        ADD COLUMN IF NOT EXISTS rarity_weights jsonb NOT NULL
        DEFAULT '{"normal":10,"selten":5,"mythisch":1.5,"ultra":0.4}'::jsonb;
    `);
    console.log("✅ shop_settings.rarity_weights");
    console.log("\n🎉 Shop-Rarity-Weights Migration abgeschlossen.");
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
