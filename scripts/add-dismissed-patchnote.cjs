/**
 * Adds dismissed_patchnote_id column to profiles table.
 * Run: node scripts/add-dismissed-patchnote.cjs
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
    ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS dismissed_patchnote_id text
  `);
  console.log('Column profiles.dismissed_patchnote_id added (or already existed).');

  await client.end();
  console.log('Done.');
}

run().catch(e => { console.error(e); process.exit(1); });
