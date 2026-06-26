// scripts/add-prio-badges.cjs
// Adds prio_badges TEXT[] to profiles and max_prio_badges INT to site_config

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    console.log("Adding prio_badges column to profiles...");
    await client.query(`
      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS prio_badges TEXT[] NOT NULL DEFAULT '{}';
    `);
    console.log("✅ prio_badges column added to profiles.");

    console.log("Adding max_prio_badges column to site_config...");
    await client.query(`
      ALTER TABLE site_config
      ADD COLUMN IF NOT EXISTS max_prio_badges INTEGER NOT NULL DEFAULT 2;
    `);
    console.log("✅ max_prio_badges column added to site_config.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
