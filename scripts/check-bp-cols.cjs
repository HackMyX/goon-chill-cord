// node scripts/check-bp-cols.cjs
const { Pool } = require("pg");
require("dotenv").config({ path: ".env.local" });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query(
  `SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('battle_passes','battle_pass_tiers','user_battle_passes','profiles') ORDER BY table_name, ordinal_position`
).then(r => {
  r.rows.forEach(row => console.log(`${row.table_name}.${row.column_name}`));
  pool.end();
}).catch(e => { console.error(e.message); pool.end(); });
