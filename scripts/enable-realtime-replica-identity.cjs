// scripts/enable-realtime-replica-identity.cjs
// Sets REPLICA IDENTITY FULL on tables whose filtered Realtime subscriptions need
// the OLD row of a DELETE/UPDATE to carry non-PK columns (e.g. user_id), so the
// server-side `filter: user_id=eq.<id>` actually matches DELETE events.
//
//   inventory     — top-bar live item counter only ever INCREMENTED; DELETE events
//                   never matched the user_id filter (default REPLICA IDENTITY = PK = id),
//                   so consuming/selling/trading an item left the counter too high.
//   notifications — cross-tab read/delete sync (DELETE listener) needs user_id in the
//                   old row too.
//
// Also ensures both tables are members of the supabase_realtime publication. Idempotent.

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

const TABLES = ["inventory", "notifications"];

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    for (const table of TABLES) {
      await client.query(`ALTER TABLE ${table} REPLICA IDENTITY FULL;`);
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND tablename = '${table}'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE ${table};
          END IF;
        END $$;
      `);
      const r = await client.query(
        `SELECT relreplident FROM pg_class WHERE relname = $1;`, [table]
      );
      const inPub = await client.query(
        `SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename=$1;`, [table]
      );
      console.log(`✅ ${table}: replica_identity=${r.rows[0]?.relreplident} (f=full), in_publication=${inPub.rowCount > 0}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
