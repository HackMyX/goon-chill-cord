const { Pool } = require("pg");
// Run: DATABASE_URL="postgresql://postgres.PROJECT:PASSWORD@host:6543/postgres" node scripts/run-ticket-reward-migration.cjs
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "",
  ssl: { rejectUnauthorized: false }
});

const migrations = [
  // Ticket reward_pending: reward is pinned but credits not yet paid out
  `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reward_pending boolean NOT NULL DEFAULT false`,
  // Ticket escalated_to_admin: mod forwarded ticket to admin for review
  `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS escalated_to_admin boolean NOT NULL DEFAULT false`,
  // Plinko config table
  `CREATE TABLE IF NOT EXISTS plinko_config (
    id text PRIMARY KEY DEFAULT 'default',
    enabled boolean NOT NULL DEFAULT true,
    hourly_ball_limit integer NOT NULL DEFAULT 20,
    ball_cost_cr integer NOT NULL DEFAULT 100,
    rows integer NOT NULL DEFAULT 8,
    risk_levels jsonb NOT NULL DEFAULT '[
      {"key":"low","label":"Niedrig","emoji":"🟢","multipliers":[1.5,1.3,1.1,0.9,0.8,0.9,1.1,1.3,1.5]},
      {"key":"medium","label":"Mittel","emoji":"🟡","multipliers":[5,2,1.5,0.8,0.5,0.8,1.5,2,5]},
      {"key":"high","label":"Hoch","emoji":"🔴","multipliers":[10,3,1.5,0.5,0.2,0.5,1.5,3,10]}
    ]'::jsonb,
    max_win_cr integer NOT NULL DEFAULT 0,
    announce_big_wins boolean NOT NULL DEFAULT true,
    big_win_threshold integer NOT NULL DEFAULT 1000,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  // Insert default config row
  `INSERT INTO plinko_config (id) VALUES ('default') ON CONFLICT DO NOTHING`,
  // Plinko plays tracking
  `CREATE TABLE IF NOT EXISTS plinko_plays (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id uuid NOT NULL,
    risk_level text NOT NULL,
    ball_cost integer NOT NULL,
    result_multiplier numeric(8,2) NOT NULL,
    payout_cr integer NOT NULL,
    bucket_index integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_plinko_plays_user_time ON plinko_plays(user_id, created_at)`,
  `ALTER TABLE plinko_plays ENABLE ROW LEVEL SECURITY`,
];

async function run() {
  for (const sql of migrations) {
    try {
      await pool.query(sql);
      const name = sql.trim().split("\n")[0].slice(0, 80);
      console.log("OK   " + name);
    } catch (e) {
      const name = sql.trim().split("\n")[0].slice(0, 80);
      console.log("ERR  " + name + " :: " + e.message.split("\n")[0]);
    }
  }
  await pool.end();
}
run();
