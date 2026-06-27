// scripts/add-don-shield.cjs
// Adds profiles.don_shield_used_at (timestamptz) for the don_daily_shield
// ability — records when a player's once-per-day loss-shield was last used.
// Idempotent.

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    console.log("Adding profiles.don_shield_used_at…");
    await client.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS don_shield_used_at timestamptz;`);
    console.log("✅ don_shield_used_at column added.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
