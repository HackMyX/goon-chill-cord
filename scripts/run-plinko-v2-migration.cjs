const { Pool } = require("pg");
// Run: DATABASE_URL="postgresql://..." node scripts/run-plinko-v2-migration.cjs

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "",
  ssl: { rejectUnauthorized: false },
});

const migrations = [
  `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS daily_ball_limit integer NOT NULL DEFAULT 0`,
  `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS show_history boolean NOT NULL DEFAULT true`,
  `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS show_leaderboard boolean NOT NULL DEFAULT true`,
  `ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS leaderboard_size integer NOT NULL DEFAULT 10`,
];

async function run() {
  for (const sql of migrations) {
    try {
      await pool.query(sql);
      console.log("OK   " + sql.trim().slice(0, 80));
    } catch (e) {
      console.log("ERR  " + sql.trim().slice(0, 80) + " :: " + e.message.split("\n")[0]);
    }
  }
  await pool.end();
}
run();
