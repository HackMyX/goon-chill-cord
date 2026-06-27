// scripts/enable-chat-realtime.cjs
// Adds global_chat_messages to the supabase_realtime publication so every
// client receives INSERT/DELETE events live (the chat was only updating via
// the global panel's polling fallback before). REPLICA IDENTITY FULL so DELETE
// events carry enough data. Idempotent.

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(`ALTER TABLE global_chat_messages REPLICA IDENTITY FULL;`);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_publication_tables
          WHERE pubname = 'supabase_realtime' AND tablename = 'global_chat_messages'
        ) THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE global_chat_messages;
        END IF;
      END $$;
    `);
    const r = await client.query(
      `SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='global_chat_messages';`
    );
    console.log(r.rowCount ? "✅ global_chat_messages is now realtime-enabled." : "❌ still not enabled.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
