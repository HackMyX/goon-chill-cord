/**
 * Creates the ai_chat_sessions table for persistent KI-chat history.
 * Run: DATABASE_URL="..." node scripts/add-ai-chat-sessions.cjs
 */
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "",
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_chat_sessions (
        id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        context     text        NOT NULL DEFAULT 'user',
        messages    jsonb       NOT NULL DEFAULT '[]'::jsonb,
        updated_at  timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, context)
      );
    `);
    console.log("✅  ai_chat_sessions table created (or already exists)");

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_user
        ON ai_chat_sessions (user_id, context);
    `);
    console.log("✅  index created");

    await client.query(`ALTER TABLE ai_chat_sessions ENABLE ROW LEVEL SECURITY;`);

    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename='ai_chat_sessions' AND policyname='ai_chat_sessions_own'
        ) THEN
          CREATE POLICY ai_chat_sessions_own ON ai_chat_sessions
            FOR ALL USING (user_id = auth.uid());
        END IF;
      END $$;
    `);
    console.log("✅  RLS policy applied");

    console.log("\n✅  Done. AI chat sessions will now persist across page closes.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e) => { console.error("❌", e.message); process.exit(1); });
