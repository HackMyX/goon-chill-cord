/**
 * Adds ticket_rewards table for per-ticket multi-reward tracking.
 * Supports immediate and deferred payouts, cumulative limits, and full history.
 */
const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS ticket_rewards (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id    UUID        NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      granted_by   UUID        NOT NULL,
      credits      INTEGER     NOT NULL DEFAULT 0 CHECK (credits >= 0),
      note         TEXT,
      deferred     BOOLEAN     NOT NULL DEFAULT true,
      granted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      paid_at      TIMESTAMPTZ
    );
  `);
  console.log("ticket_rewards table created (or already existed)");

  await client.query(`
    CREATE INDEX IF NOT EXISTS ticket_rewards_ticket_idx ON ticket_rewards(ticket_id);
    CREATE INDEX IF NOT EXISTS ticket_rewards_granted_by_idx ON ticket_rewards(granted_by);
  `);
  console.log("Indexes created");

  await client.query(`ALTER TABLE ticket_rewards ENABLE ROW LEVEL SECURITY;`);

  // Drop & recreate so this is idempotent
  await client.query(`DROP POLICY IF EXISTS "ticket_rewards_staff" ON ticket_rewards;`);
  await client.query(`DROP POLICY IF EXISTS "ticket_rewards_user_read" ON ticket_rewards;`);

  await client.query(`
    CREATE POLICY "ticket_rewards_staff" ON ticket_rewards
      FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('mod', 'admin')
      ));
  `);
  await client.query(`
    CREATE POLICY "ticket_rewards_user_read" ON ticket_rewards
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM tickets
        WHERE tickets.id = ticket_rewards.ticket_id
          AND tickets.user_id = auth.uid()
      ));
  `);
  console.log("RLS policies created");

  await client.end();
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
