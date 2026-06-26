// Migration: Add in_world flag to user_sessions for cross-browser world session enforcement
// Run: node scripts/add-session-in-world.cjs

const { Client } = require("pg");

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log("Connected. Running migration...");

  await client.query(`
    ALTER TABLE user_sessions
      ADD COLUMN IF NOT EXISTS in_world boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS in_world_since timestamptz;
  `);
  console.log("✅ user_sessions: in_world, in_world_since added");

  await client.end();
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
