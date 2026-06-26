/**
 * Creates the homepage_chat_config table and seeds the default singleton row.
 * Run: node scripts/create-homepage-chat-config.cjs
 */
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const DB = process.env.DATABASE_URL;
if (!DB) { console.error('DATABASE_URL not set'); process.exit(1); }

async function run() {
  const client = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  await client.query(`
    CREATE TABLE IF NOT EXISTS homepage_chat_config (
      id                      text PRIMARY KEY DEFAULT 'default',
      enabled                 boolean NOT NULL DEFAULT true,
      default_open_desktop    boolean NOT NULL DEFAULT true,
      default_open_mobile     boolean NOT NULL DEFAULT false,
      sidebar_width           integer NOT NULL DEFAULT 320,
      sidebar_position        text    NOT NULL DEFAULT 'left',
      bg_opacity              integer NOT NULL DEFAULT 20,
      blur_intensity          text    NOT NULL DEFAULT 'md',
      show_avatars            boolean NOT NULL DEFAULT true,
      show_badges             boolean NOT NULL DEFAULT true,
      show_timestamps         boolean NOT NULL DEFAULT true,
      show_timestamps_relative boolean NOT NULL DEFAULT true,
      show_input              boolean NOT NULL DEFAULT true,
      max_messages            integer NOT NULL DEFAULT 50,
      max_badge_count         integer NOT NULL DEFAULT 3,
      font_size               text    NOT NULL DEFAULT 'sm',
      message_animation       boolean NOT NULL DEFAULT true,
      input_placeholder       text    NOT NULL DEFAULT 'Nachricht...',
      tab_title               text    NOT NULL DEFAULT 'Community Chat',
      header_visible          boolean NOT NULL DEFAULT true,
      show_online_count       boolean NOT NULL DEFAULT true,
      compact_mode            boolean NOT NULL DEFAULT false,
      highlight_mentions      boolean NOT NULL DEFAULT true,
      mention_sound           boolean NOT NULL DEFAULT false,
      auto_scroll             boolean NOT NULL DEFAULT true,
      updated_at              timestamptz
    )
  `);
  console.log('Table created (or already exists).');

  await client.query(`ALTER TABLE homepage_chat_config ENABLE ROW LEVEL SECURITY`);

  // Policies (ignore errors if they already exist)
  const policies = [
    `CREATE POLICY "admins_all" ON homepage_chat_config FOR ALL USING (
       EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','moderator'))
     )`,
    `CREATE POLICY "public_read" ON homepage_chat_config FOR SELECT USING (true)`,
  ];
  for (const sql of policies) {
    try { await client.query(sql); } catch { /* already exists */ }
  }
  console.log('RLS + policies applied.');

  await client.query(`INSERT INTO homepage_chat_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING`);
  console.log('Default singleton row seeded.');

  await client.end();
  console.log('Done.');
}

run().catch(e => { console.error(e); process.exit(1); });
