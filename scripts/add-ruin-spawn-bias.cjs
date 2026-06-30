require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "", ssl: { rejectUnauthorized: false } });
(async () => {
  const c = await pool.connect();
  try {
    await c.query("ALTER TABLE world_config ADD COLUMN IF NOT EXISTS ruin_spawn_bias double precision");
    await c.query("UPDATE world_config SET ruin_spawn_bias = COALESCE(ruin_spawn_bias, 0.5) WHERE id='default'");
    console.log("✅ ruin_spawn_bias-Spalte + Default (0.5) gesetzt.");
  } catch (e) { console.error("ERR:", e.message); process.exitCode = 1; }
  finally { c.release(); await pool.end(); }
})();
