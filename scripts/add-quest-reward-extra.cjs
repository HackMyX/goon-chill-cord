// scripts/add-quest-reward-extra.cjs
// Daily Quests können ZUSÄTZLICH zu ihren bisherigen Belohnungen beliebige
// Givables (RewardSpec[]) vergeben — vergeben über den zentralen Dispatcher
// grantReward() (lib/rewards-grant.ts).
//
// Fügt die Spalte reward_extra (jsonb, default '[]') hinzu an:
//   • daily_quest_templates  — die im Admin konfigurierten Extra-Belohnungen
//   • user_daily_quests      — die beim Generieren kopierte Liste, die beim Claim
//                              tatsächlich vergeben wird
// Idempotent. Run: node scripts/add-quest-reward-extra.cjs

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(
      "ALTER TABLE daily_quest_templates ADD COLUMN IF NOT EXISTS reward_extra jsonb NOT NULL DEFAULT '[]'::jsonb"
    );
    console.log("OK   daily_quest_templates.reward_extra ensured");

    await client.query(
      "ALTER TABLE user_daily_quests ADD COLUMN IF NOT EXISTS reward_extra jsonb NOT NULL DEFAULT '[]'::jsonb"
    );
    console.log("OK   user_daily_quests.reward_extra ensured");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
