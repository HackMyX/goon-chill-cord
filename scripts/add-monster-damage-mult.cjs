require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "", ssl: { rejectUnauthorized: false } });
(async () => {
  const c = await pool.connect();
  try {
    await c.query("ALTER TABLE world_config ADD COLUMN IF NOT EXISTS monster_damage_multiplier double precision");
    await c.query("UPDATE world_config SET monster_damage_multiplier = COALESCE(monster_damage_multiplier, 0.8) WHERE id='default'");
    // Schwierigkeit etwas runter: Mindest-Angreifer 3→2 (nur wenn aktuell >2).
    await c.query("UPDATE world_config SET min_aggressors = 2 WHERE id='default' AND COALESCE(min_aggressors,3) > 2");
    const r = await c.query("SELECT monster_damage_multiplier, min_aggressors FROM world_config WHERE id='default'");
    console.log("✅", r.rows[0]);
  } catch (e) { console.error("ERR:", e.message); process.exitCode = 1; }
  finally { c.release(); await pool.end(); }
})();
