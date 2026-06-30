require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "", ssl: { rejectUnauthorized: false } });
(async () => {
  const c = await pool.connect();
  try {
    await c.query("ALTER TABLE monster_types ADD COLUMN IF NOT EXISTS spawn_anim text");
    await c.query("ALTER TABLE monster_types ADD COLUMN IF NOT EXISTS minion_type_id text");
    await c.query("ALTER TABLE monster_types ADD COLUMN IF NOT EXISTS minion_max_alive integer");
    await c.query("ALTER TABLE monster_types ADD COLUMN IF NOT EXISTS minion_interval_sec double precision");
    console.log("✅ monster_types: spawn_anim/minion_* Spalten sichergestellt.");
  } catch (e) { console.error("ERR:", e.message); process.exitCode = 1; }
  finally { c.release(); await pool.end(); }
})();
