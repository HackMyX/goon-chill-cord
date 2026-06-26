// scripts/add-can-use-admin-ai.cjs
// Adds can_use_admin_ai to mod_permissions (controls whether mods can access Admin-KI)
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query(`
      ALTER TABLE mod_permissions
      ADD COLUMN IF NOT EXISTS can_use_admin_ai boolean NOT NULL DEFAULT false;
    `);
    console.log('✅ can_use_admin_ai added to mod_permissions (DEFAULT false — mods cannot use Admin-KI by default)');
  } finally {
    await c.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
