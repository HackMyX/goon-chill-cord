// scripts/add-level-road-config.cjs
// Adds admin-global Level-Road appearance config columns to xp_config:
//   level_reward_display   text  '3d' | 'icon'   — how level rewards render
//   level_road_config      jsonb                 — per-tier colours / layout (admin-editable)
// Idempotent.

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(`ALTER TABLE xp_config ADD COLUMN IF NOT EXISTS level_reward_display text NOT NULL DEFAULT '3d';`);
    await client.query(`ALTER TABLE xp_config ADD COLUMN IF NOT EXISTS level_road_config jsonb;`);
    const r = await client.query(`SELECT level_reward_display FROM xp_config WHERE id = 'default';`);
    console.log("✅ xp_config.level_reward_display + level_road_config added. current display =", r.rows[0]?.level_reward_display ?? "(no row yet → default '3d')");
  } finally {
    await client.end();
  }
}

main().catch((err) => { console.error("Migration failed:", err); process.exit(1); });
