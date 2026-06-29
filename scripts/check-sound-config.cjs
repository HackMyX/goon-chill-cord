require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "", ssl: { rejectUnauthorized: false } });
(async () => {
  const c = await pool.connect();
  try {
    const { rows } = await c.query("SELECT config FROM sound_config WHERE id='default'");
    if (!rows.length) { console.log("KEIN sound_config-Row → Code-Defaults greifen ✅"); return; }
    const cfg = rows[0].config || {};
    const src = cfg.src || cfg.sources || cfg;
    ["levelUp","xpGain","questComplete","bpTierClaim","bpUnlock","achievementUnlock"].forEach((k) => {
      const v = (cfg.src && cfg.src[k]) ?? (cfg[k]) ?? "(nicht gesetzt)";
      console.log(`  ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
    });
    console.log("keys:", Object.keys(cfg).slice(0,8).join(","));
  } finally { c.release(); await pool.end(); }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
