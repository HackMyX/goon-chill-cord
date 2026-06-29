// Run: node scripts/add-feedback-config.cjs
// Creates the feedback_config singleton table — controls every reward/progression
// celebration popup (XP, level-up, milestone, quests, battle-pass tier, rewards).
// Idempotent: safe to re-run. Defaults live in lib/feedback-config.ts and are
// merged at read time, so we only need to ensure the row exists.
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const FALLBACK_DB = process.env.DATABASE_URL;

async function main() {
  const client = new Client({ connectionString: FALLBACK_DB });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS feedback_config (
        id         TEXT        PRIMARY KEY DEFAULT 'default',
        config     JSONB       NOT NULL    DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL    DEFAULT now()
      )
    `);
    console.log('OK   Created feedback_config');

    await client.query(`ALTER TABLE feedback_config ENABLE ROW LEVEL SECURITY`);
    console.log('OK   RLS enabled');

    // Read access for everyone (the global feedback host needs it client-side via
    // the admin client server-action; but allow authenticated read too for safety).
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'feedback_config' AND policyname = 'feedback_config_read') THEN
          CREATE POLICY feedback_config_read ON feedback_config FOR SELECT USING (true);
        END IF;
      END $$;
    `);
    console.log('OK   Read policy ensured');

    const { rowCount } = await client.query(`
      INSERT INTO feedback_config (id, config)
      VALUES ('default', '{}'::jsonb)
      ON CONFLICT (id) DO NOTHING
    `);
    console.log(`OK   Default row ${rowCount > 0 ? 'inserted' : 'already exists'}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
