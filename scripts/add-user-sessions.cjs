const { Pool } = require("pg");
// Run: DATABASE_URL="..." node scripts/add-user-sessions.cjs
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "",
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        session_token   text        NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
        created_at      timestamptz NOT NULL DEFAULT now(),
        last_ping       timestamptz NOT NULL DEFAULT now(),
        invalidated_at  timestamptz,
        device_hint     text
      );
    `);
    console.log("✅  user_sessions table created (or already exists)");

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active
        ON user_sessions (user_id, invalidated_at, last_ping);
    `);
    console.log("✅  index on user_sessions created");

    await client.query(`ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;`);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'user_sessions' AND policyname = 'users_see_own_sessions'
        ) THEN
          CREATE POLICY users_see_own_sessions ON user_sessions
            FOR SELECT USING (user_id = auth.uid());
        END IF;
      END $$;
    `);
    console.log("✅  RLS policy applied");

    // Clean up any stale sessions older than 30 days
    const { rowCount } = await client.query(`
      DELETE FROM user_sessions WHERE created_at < now() - interval '30 days';
    `);
    console.log(`✅  Cleaned ${rowCount} stale sessions`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e) => { console.error("❌", e.message); process.exit(1); });
