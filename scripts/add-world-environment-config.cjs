require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "", ssl: { rejectUnauthorized: false } });
(async () => {
  const c = await pool.connect();
  try {
    await c.query("ALTER TABLE world_config ADD COLUMN IF NOT EXISTS environment_config jsonb");
    console.log("✅ world_config.environment_config (jsonb) sichergestellt.");
    const { rows } = await c.query("SELECT environment_config FROM world_config WHERE id='default'");
    console.log("Aktueller Wert:", rows.length ? JSON.stringify(rows[0].environment_config) : "(keine default-Zeile)");
  } catch (e) { console.error("ERR:", e.message); process.exitCode = 1; }
  finally { c.release(); await pool.end(); }
})();
