const { Client } = require("pg");

const DATABASE_URL = "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected.");

  // Add shop availability columns to name_styles
  await client.query(`
    ALTER TABLE name_styles
    ADD COLUMN IF NOT EXISTS available_in_shop boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS shop_price_cr integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS shop_stock integer NULL,
    ADD COLUMN IF NOT EXISTS shop_expires_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS shop_sort_order integer NOT NULL DEFAULT 0;
  `);
  console.log("name_styles: shop columns added.");

  // Update unlock_price_cr to match economy based on rarity
  await client.query(`
    UPDATE name_styles SET unlock_price_cr = 5000 WHERE rarity = 'normal' AND unlock_price_cr < 4000;
    UPDATE name_styles SET unlock_price_cr = 32000 WHERE rarity = 'selten' AND unlock_price_cr < 20000;
    UPDATE name_styles SET unlock_price_cr = 135000 WHERE rarity = 'mythisch' AND unlock_price_cr < 100000;
    UPDATE name_styles SET unlock_price_cr = 560000 WHERE rarity = 'ultra' AND unlock_price_cr < 400000;
  `);
  console.log("name_styles: unlock_price_cr updated to match economy.");

  // Add shop_sort_order to battle_passes
  await client.query(`
    ALTER TABLE battle_passes
    ADD COLUMN IF NOT EXISTS shop_sort_order integer NOT NULL DEFAULT 0;
  `);
  console.log("battle_passes: shop_sort_order added.");

  // Add reward_name_style_key to battle_pass_tiers
  await client.query(`
    ALTER TABLE battle_pass_tiers
    ADD COLUMN IF NOT EXISTS reward_name_style_key text NULL;
  `);
  console.log("battle_pass_tiers: reward_name_style_key added.");

  await client.end();
  console.log("Done.");
}

main().catch(console.error);
