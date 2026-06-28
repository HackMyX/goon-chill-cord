// Editierbare Seltenheits-Stufen (Stärke→Seltenheit) als Config in site_config.
const { Client } = require("pg");
const DB_URL = process.env.DATABASE_URL || "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";
const DEFAULT = [
  { rarity: "normal", minAmount: 0 },
  { rarity: "selten", minAmount: 10 },
  { rarity: "episch", minAmount: 20 },
  { rarity: "mythisch", minAmount: 35 },
  { rarity: "ultra", minAmount: 50 },
];
(async () => {
  const c = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query("ALTER TABLE site_config ADD COLUMN IF NOT EXISTS rarity_tiers jsonb;");
  await c.query("UPDATE site_config SET rarity_tiers=$1::jsonb WHERE id='default' AND rarity_tiers IS NULL", [JSON.stringify(DEFAULT)]);
  const r = await c.query("SELECT rarity_tiers FROM site_config WHERE id='default'");
  console.log("✅ site_config.rarity_tiers =", JSON.stringify(r.rows[0].rarity_tiers));
  await c.end();
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
