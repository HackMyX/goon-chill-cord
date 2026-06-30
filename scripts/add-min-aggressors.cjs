require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "", ssl: { rejectUnauthorized: false } });
(async () => {
  const c = await pool.connect();
  try {
    await c.query("ALTER TABLE world_config ADD COLUMN IF NOT EXISTS min_aggressors integer");
    await c.query("UPDATE world_config SET min_aggressors = COALESCE(min_aggressors, 3) WHERE id='default'");
    console.log("✅ world_config.min_aggressors sichergestellt (Default 3).");
  } catch (e) { console.error("ERR:", e.message); process.exitCode = 1; }
  finally { c.release(); await pool.end(); }
})();
