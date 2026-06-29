// Read-only: zeigt, ob feedback_config gespeichert ist + welche Stile pro Event.
require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "", ssl: { rejectUnauthorized: false } });
(async () => {
  const c = await pool.connect();
  try {
    const { rows } = await c.query("SELECT config FROM feedback_config WHERE id='default'");
    if (!rows.length) { console.log("KEIN gespeicherter feedback_config-Row → neue Defaults greifen automatisch ✅"); return; }
    const cfg = rows[0].config || {};
    console.log("GESPEICHERTER feedback_config gefunden. Stile pro Event:");
    const ev = cfg.events || {};
    Object.keys(ev).forEach((k) => {
      const e = ev[k] || {};
      console.log(`  ${k}: style=${e.style} intensity=${e.intensity ?? "(fehlt→default)"} confetti=${e.confetti} screenFlash=${e.screenFlash ?? "(fehlt)"} particleType=${e.particleType ?? "(fehlt)"}`);
    });
    console.log("limitMeter:", cfg.limitMeter ? "vorhanden" : "(fehlt→default)");
  } finally { c.release(); await pool.end(); }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
