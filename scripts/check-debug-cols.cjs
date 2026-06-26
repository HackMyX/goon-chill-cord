const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
c.connect().then(async () => {
  const q = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='debug_logs' ORDER BY ordinal_position");
  console.log('debug_logs columns:');
  q.rows.forEach(r => console.log('  ' + r.column_name + ' (' + r.data_type + ')'));
  await c.end();
}).catch(e => { console.error(e); process.exit(1); });
