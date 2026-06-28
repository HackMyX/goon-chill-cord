// Migration: Streak milestone rewards — beliebige Givables (RewardSpec[]) an Meilenstein-Tagen
// Run: node scripts/add-streak-milestone-rewards.cjs

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log("Connected. Running migration...");

  await client.query(`
    ALTER TABLE streak_config
      ADD COLUMN IF NOT EXISTS milestone_rewards jsonb NOT NULL DEFAULT '[]'::jsonb;
  `);
  console.log("✅ streak_config: milestone_rewards added");

  await client.end();
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
