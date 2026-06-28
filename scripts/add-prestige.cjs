// scripts/add-prestige.cjs
// Adds profiles.prestige (int) — how many times a player has prestiged (reset
// from max level back to level 1 for a permanent XP boost). Idempotent.

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    console.log("Adding prestige column to profiles...");
    await client.query(`
      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS prestige int NOT NULL DEFAULT 0;
    `);
    console.log("✅ prestige column added.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
