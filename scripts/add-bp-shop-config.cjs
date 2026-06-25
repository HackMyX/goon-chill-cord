const { Client } = require("pg");
const DB_URL = "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";
async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const adds = [
    "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS shop_position text DEFAULT 'below_featured'",
    "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS shop_banner_size text DEFAULT 'card'",
    "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS custom_buy_text text",
    "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS custom_elite_buy_text text",
    "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS highlight_color text",
    "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS show_tier_count_in_shop boolean DEFAULT true",
    "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS show_countdown boolean DEFAULT true",
    "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS pass_icon text DEFAULT '🏆'",
    "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()",
  ];
  for (const sql of adds) { await client.query(sql); console.log("OK:", sql.slice(0, 80)); }
  await client.end();
  console.log("Done.");
}
main().catch(console.error);
