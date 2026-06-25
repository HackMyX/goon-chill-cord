const { Client } = require("pg");
const DATABASE_URL = "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected.");

  await client.query(`
    CREATE TABLE IF NOT EXISTS name_style_rarity_config (
      rarity text PRIMARY KEY,
      base_shop_price_cr bigint NOT NULL DEFAULT 50000,
      max_shop_price_cr bigint NOT NULL DEFAULT 500000,
      case_drop_weight integer NOT NULL DEFAULT 50,
      case_drop_enabled boolean NOT NULL DEFAULT false,
      bp_reward_enabled boolean NOT NULL DEFAULT true,
      can_trade boolean NOT NULL DEFAULT false,
      label_override text,
      glow_color_override text,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE name_style_rarity_config ENABLE ROW LEVEL SECURITY;
  `);
  console.log("Table created.");

  await client.query(`
    INSERT INTO name_style_rarity_config (rarity, base_shop_price_cr, max_shop_price_cr, case_drop_weight, case_drop_enabled, bp_reward_enabled, can_trade)
    VALUES
      ('normal',   50000,     200000,    200, false, true,  false),
      ('selten',   350000,    1500000,    80, false, true,  false),
      ('mythisch', 2000000,   8000000,    20, false, true,  false),
      ('ultra',    12000000,  50000000,    5, false, true,  false)
    ON CONFLICT (rarity) DO UPDATE SET
      base_shop_price_cr = EXCLUDED.base_shop_price_cr,
      max_shop_price_cr  = EXCLUDED.max_shop_price_cr,
      case_drop_weight   = EXCLUDED.case_drop_weight;
  `);
  console.log("Rarity configs seeded.");

  await client.query(`
    UPDATE name_styles SET unlock_price_cr = 50000    WHERE rarity = 'normal';
    UPDATE name_styles SET unlock_price_cr = 350000   WHERE rarity = 'selten';
    UPDATE name_styles SET unlock_price_cr = 2000000  WHERE rarity = 'mythisch';
    UPDATE name_styles SET unlock_price_cr = 12000000 WHERE rarity = 'ultra';
  `);
  console.log("unlock_price_cr updated.");

  await client.query(`
    UPDATE name_styles SET shop_price_cr = unlock_price_cr WHERE NOT is_special;
  `);
  console.log("shop_price_cr synced.");

  await client.end();
  console.log("Done.");
}
main().catch(console.error);
