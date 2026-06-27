// scripts/add-suggestion-outcome.cjs
// Adds tickets.suggestion_outcome (text: null | 'accepted' | 'declined') so a
// suggestion's decision is tracked distinctly from the generic status
// (accepted → resolved + auto-reward, declined → closed). Idempotent.

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    console.log("Adding suggestion_outcome column to tickets...");
    await client.query(`
      ALTER TABLE tickets
      ADD COLUMN IF NOT EXISTS suggestion_outcome text
      CHECK (suggestion_outcome IS NULL OR suggestion_outcome IN ('accepted','declined'));
    `);
    console.log("✅ suggestion_outcome column added.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
