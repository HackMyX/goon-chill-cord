// scripts/add-prio-badges-locked.cjs
// Adds profiles.prio_badges_locked (boolean) — when true, the user cannot
// change their own prio-badge selection; only an admin (force-display) can.
// Part of admin badge omnipotence. Idempotent.

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    console.log("Adding prio_badges_locked column to profiles...");
    await client.query(`
      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS prio_badges_locked boolean NOT NULL DEFAULT false;
    `);
    console.log("✅ prio_badges_locked column added.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
