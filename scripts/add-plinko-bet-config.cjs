const { Client } = require("pg");
const DB_URL = "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";
async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const adds = [
    "ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS min_bet_cr integer DEFAULT 500",
    "ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS max_bet_cr integer DEFAULT 0",
    "ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS quick_bet_amounts jsonb DEFAULT '[500,1000,5000,25000,100000]'",
    "ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS particles_enabled boolean DEFAULT true",
    "ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS trail_length integer DEFAULT 6",
    "ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS glow_intensity numeric DEFAULT 1.5",
    "ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS animation_speed numeric DEFAULT 1.0",
    "ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS auto_bet_enabled boolean DEFAULT true",
  ];
  for (const sql of adds) { await client.query(sql); console.log("OK:", sql.slice(0, 70)); }
  await client.end();
  console.log("Done.");
}
main().catch(console.error);
