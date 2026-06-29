// scripts/enable-realtime-daily-quests.cjs
// Macht `user_daily_quests` Realtime-fähig, damit der Daily-Quest-Badge in der
// Topbar LIVE korrekt bleibt (kein 5-Minuten-Lag, keine geisterhafte „(1)" mehr):
//
//   - INSERT  → neue Tagesquests generiert (Badge ggf. neu)
//   - UPDATE  → Fortschritt/abgeschlossen/eingelöst (Badge rauf/runter)
//   - DELETE  → Admin-Reset / Tageswechsel (Badge weg)
//
// REPLICA IDENTITY FULL ist nötig, damit die client-seitige Subscription mit
// `filter: user_id=eq.<id>` auch bei UPDATE/DELETE matcht (user_id liegt sonst
// nicht in der alten Zeile, da Default-Replica-Identity = nur PK = id).
// Idempotent (mehrfaches Ausführen ist gefahrlos).

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

const TABLE = "user_daily_quests";

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(`ALTER TABLE ${TABLE} REPLICA IDENTITY FULL;`);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_publication_tables
          WHERE pubname = 'supabase_realtime' AND tablename = '${TABLE}'
        ) THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE ${TABLE};
        END IF;
      END $$;
    `);
    const r = await client.query(`SELECT relreplident FROM pg_class WHERE relname = $1;`, [TABLE]);
    const inPub = await client.query(
      `SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename=$1;`, [TABLE]
    );
    console.log(`✅ ${TABLE}: replica_identity=${r.rows[0]?.relreplident} (f=full), in_publication=${inPub.rowCount > 0}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
