/**
 * Migration: create snake_config and snake_best_scores tables.
 * Run once: node scripts/migrate-snake.mjs
 */
import pg from "pg";
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

const statements = [
  `CREATE TABLE IF NOT EXISTS snake_config (
    id                      text        PRIMARY KEY DEFAULT 'default',
    enabled                 boolean     NOT NULL DEFAULT true,
    board_size              integer     NOT NULL DEFAULT 20,
    credits_per_apple_x1    integer     NOT NULL DEFAULT 5,
    credits_per_apple_x2    integer     NOT NULL DEFAULT 10,
    x2_apple_threshold      integer     NOT NULL DEFAULT 30,
    wall_wrap               boolean     NOT NULL DEFAULT true,
    initial_speed_ms        integer     NOT NULL DEFAULT 150,
    speed_increase_per_apple real       NOT NULL DEFAULT 2.0,
    min_speed_ms            integer     NOT NULL DEFAULT 60,
    x2_initial_speed_ms     integer     NOT NULL DEFAULT 100,
    daily_cr_limit          integer,
    leaderboard_size        integer     NOT NULL DEFAULT 20,
    section_title           text        NOT NULL DEFAULT 'Snake',
    section_subtitle        text        NOT NULL DEFAULT 'Sammle Äpfel, verdiene Credits',
    updated_at              timestamptz DEFAULT now()
  )`,
  `ALTER TABLE snake_config ENABLE ROW LEVEL SECURITY`,

  `CREATE TABLE IF NOT EXISTS snake_best_scores (
    user_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    speed_mode   text        NOT NULL DEFAULT 'x1',
    best_score   integer     NOT NULL DEFAULT 0,
    total_cr_earned integer  NOT NULL DEFAULT 0,
    games_played integer     NOT NULL DEFAULT 0,
    updated_at   timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, speed_mode)
  )`,
  `ALTER TABLE snake_best_scores ENABLE ROW LEVEL SECURITY`,
  `CREATE POLICY IF NOT EXISTS "allow_read_snake_scores" ON snake_best_scores FOR SELECT USING (true)`,
  `CREATE POLICY IF NOT EXISTS "allow_self_upsert_snake_scores" ON snake_best_scores FOR ALL USING (auth.uid() = user_id)`,

  `INSERT INTO snake_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING`,

  `ALTER PUBLICATION supabase_realtime ADD TABLE snake_best_scores`,
];

for (const sql of statements) {
  try {
    await client.query(sql);
    console.log("OK:", sql.trim().slice(0, 80));
  } catch (e) {
    console.error("SKIP:", sql.trim().slice(0, 80), "\n →", e.message);
  }
}

await client.end();
console.log("\nDone.");
