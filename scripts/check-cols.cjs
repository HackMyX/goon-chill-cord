const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
c.connect().then(async () => {
  const tables = ['monster_types', 'case_groups', 'shop_listings'];
  for (const t of tables) {
    const q = await c.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position', ['public', t]);
    console.log(t + ': ' + q.rows.map(r => r.column_name).join(', '));
  }
  // check profiles for any dismiss/patch column
  const q4 = await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' ORDER BY ordinal_position");
  const cols = q4.rows.map(r => r.column_name);
  console.log('profiles dismiss/patch cols:', cols.filter(c => c.includes('dismiss') || c.includes('patch')).join(', ') || 'NONE');
  await c.end();
}).catch(e => { console.error(e); process.exit(1); });
