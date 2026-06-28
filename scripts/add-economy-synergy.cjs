// scripts/add-economy-synergy.cjs
// Creates the economy_synergy_config singleton — the cross-system progression layer
// (Level ↔ Battle Pass ↔ Daily Quests ↔ whole economy): level-scaled rewards,
// XP→BP cross-flow, weekend / happy-hour time boosts, daily-quest scaling. One row.
// Idempotent.

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS economy_synergy_config (
        id text PRIMARY KEY DEFAULT 'default',
        config jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await client.query("ALTER TABLE economy_synergy_config ENABLE ROW LEVEL SECURITY");
    await client.query("INSERT INTO economy_synergy_config (id, config) VALUES ('default', '{}'::jsonb) ON CONFLICT (id) DO NOTHING");
    console.log("✅ economy_synergy_config singleton ensured.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
