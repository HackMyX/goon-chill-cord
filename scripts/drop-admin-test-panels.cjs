// Entfernt die ungenutzte (dormante) Spalte site_config.admin_test_panels, die
// vom Test-Panel-Zwischenstand übrig blieb. Kein Code referenziert sie mehr.
// Idempotent (IF EXISTS).
require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "", ssl: { rejectUnauthorized: false } });
(async () => {
  const c = await pool.connect();
  try {
    await c.query("ALTER TABLE site_config DROP COLUMN IF EXISTS admin_test_panels");
    const { rows } = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='site_config' AND column_name='admin_test_panels'");
    console.log(rows.length === 0 ? "✅ Spalte admin_test_panels entfernt (oder war nicht vorhanden)" : "⚠️ Spalte noch vorhanden!");
  } finally { c.release(); await pool.end(); }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
