// scripts/add-bp-voucher-rewards.cjs
// Battle-Pass-Tiers können jetzt Case-Gutscheine + Spiel-Bonus als Reward tragen
// (genau wie ability/item). Flache Spalten analog zu reward_ability_key usw.
// Idempotent. Run: node scripts/add-bp-voucher-rewards.cjs

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(`
      ALTER TABLE battle_pass_tiers
        ADD COLUMN IF NOT EXISTS reward_case_voucher_mode          text,
        ADD COLUMN IF NOT EXISTS reward_case_voucher_tier_id       text,
        ADD COLUMN IF NOT EXISTS reward_case_voucher_rarity_floor  text,
        ADD COLUMN IF NOT EXISTS reward_case_voucher_duration_hours integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS reward_game_bonus_game            text,
        ADD COLUMN IF NOT EXISTS reward_game_bonus_amount          integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS reward_game_bonus_duration_hours  integer NOT NULL DEFAULT 0;
    `);
    console.log("✅ battle_pass_tiers: Gutschein-Reward-Spalten hinzugefügt");
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
