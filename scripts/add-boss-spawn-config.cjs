require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "", ssl: { rejectUnauthorized: false } });
(async () => {
  const c = await pool.connect();
  try {
    await c.query("ALTER TABLE world_config ADD COLUMN IF NOT EXISTS boss_spawn_interval_min_sec double precision");
    await c.query("ALTER TABLE world_config ADD COLUMN IF NOT EXISTS boss_spawn_interval_max_sec double precision");
    await c.query("ALTER TABLE world_config ADD COLUMN IF NOT EXISTS boss_active_alive_cap_factor double precision");
    await c.query(`UPDATE world_config SET
      boss_spawn_interval_min_sec = COALESCE(boss_spawn_interval_min_sec, 90),
      boss_spawn_interval_max_sec = COALESCE(boss_spawn_interval_max_sec, 180),
      boss_active_alive_cap_factor = COALESCE(boss_active_alive_cap_factor, 0.5)
      WHERE id='default'`);
    console.log("✅ Boss-Spawn-Spalten + Defaults gesetzt.");
  } catch (e) { console.error("ERR:", e.message); process.exitCode = 1; }
  finally { c.release(); await pool.end(); }
})();
