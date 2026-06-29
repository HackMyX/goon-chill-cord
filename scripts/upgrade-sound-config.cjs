// Hebt die Feier-Sounds in der gespeicherten sound_config auf die reichen
// Dateien (fanfare/levelup-epic/cheer/achievement). Behält volume/enabled.
// Idempotent — überschreibt nur die file-Pfade dieser Events.
require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "", ssl: { rejectUnauthorized: false } });
const NEW = {
  levelUp:           "/sounds/levelup-epic.wav",
  achievementUnlock: "/sounds/achievement.wav",
  questComplete:     "/sounds/cheer.wav",
  bpTierClaim:       "/sounds/fanfare.wav",
  bpUnlock:          "/sounds/fanfare.wav",
  bpEliteUnlock:     "/sounds/levelup-epic.wav",
};
(async () => {
  const c = await pool.connect();
  try {
    const { rows } = await c.query("SELECT config FROM sound_config WHERE id='default'");
    if (!rows.length) { console.log("kein sound_config → Code-Defaults greifen, nichts zu tun ✅"); return; }
    const cfg = rows[0].config || {};
    let changed = 0;
    for (const [k, file] of Object.entries(NEW)) {
      if (cfg[k] && typeof cfg[k] === "object") {
        if (cfg[k].file !== file) { cfg[k].file = file; changed++; }
      } else {
        cfg[k] = { file, volume: 0.4, enabled: true }; changed++;
      }
    }
    await c.query("UPDATE sound_config SET config=$1, updated_at=now() WHERE id='default'", [JSON.stringify(cfg)]);
    console.log(`✅ sound_config aktualisiert (${changed} Feier-Sounds auf reiche Dateien):`);
    Object.keys(NEW).forEach((k) => console.log(`  ${k}: ${cfg[k].file} (vol ${cfg[k].volume})`));
  } finally { c.release(); await pool.end(); }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
