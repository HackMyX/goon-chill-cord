// Hebt eine ALT gespeicherte feedback_config auf die neuen "krassen" Defaults
// (Vollbild-Feiern, Konfetti, Intensität, Partikel, Screen-Blitz, Limit-Meter).
// Behält pro Event die admin-anpassbaren Felder accent/icon/enabled/sound,
// erzwingt die neuen Präsentations-Felder. Idempotent.
require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "", ssl: { rejectUnauthorized: false } });

const DEF = {
  xp_gain:         { enabled:true, style:"toast",      accent:"#34d399", animation:"slide-up", durationMs:2200, sound:true, icon:"✨",  confetti:false, intensity:"subtle", particleType:"confetti",  screenFlash:false },
  level_up:        { enabled:true, style:"popup",      accent:"#a78bfa", animation:"pop",      durationMs:3800, sound:true, icon:"⬆️",  confetti:true,  intensity:"normal", particleType:"stars",     screenFlash:true  },
  level_milestone: { enabled:true, style:"confetti",   accent:"#fbbf24", animation:"zoom",     durationMs:6000, sound:true, icon:"🏆",  confetti:true,  intensity:"epic",   particleType:"fireworks", screenFlash:true  },
  daily_quest:     { enabled:true, style:"fullscreen", accent:"#22d3ee", animation:"drop",     durationMs:5200, sound:true, icon:"✅",  confetti:true,  intensity:"normal", particleType:"confetti",  screenFlash:true  },
  bp_quest:        { enabled:true, style:"fullscreen", accent:"#e879f9", animation:"drop",     durationMs:5200, sound:true, icon:"🎯",  confetti:true,  intensity:"epic",   particleType:"stars",     screenFlash:true  },
  bp_tier:         { enabled:true, style:"fullscreen", accent:"#fb923c", animation:"bounce",   durationMs:5200, sound:true, icon:"🎁",  confetti:true,  intensity:"epic",   particleType:"fireworks", screenFlash:true  },
  reward:          { enabled:true, style:"popup",      accent:"#facc15", animation:"rubber",   durationMs:3400, sound:true, icon:"🎉",  confetti:true,  intensity:"normal", particleType:"streamers", screenFlash:false },
};
const LIMIT = { enabled:true, style:"bar", highColor:"#34d399", midColor:"#fbbf24", lowColor:"#f87171", midThreshold:0.5, lowThreshold:0.25, animate:true, pulseWhenLow:true };

(async () => {
  const c = await pool.connect();
  try {
    const { rows } = await c.query("SELECT config FROM feedback_config WHERE id='default'");
    const stored = rows.length ? (rows[0].config || {}) : {};
    const se = stored.events || {};
    const events = {};
    for (const k of Object.keys(DEF)) {
      const s = se[k] || {};
      events[k] = {
        ...DEF[k],
        // admin-anpassbare Felder behalten, falls vorhanden:
        enabled: typeof s.enabled === "boolean" ? s.enabled : DEF[k].enabled,
        accent:  s.accent || DEF[k].accent,
        icon:    s.icon || DEF[k].icon,
        sound:   typeof s.sound === "boolean" ? s.sound : DEF[k].sound,
      };
    }
    const config = {
      enabled: typeof stored.enabled === "boolean" ? stored.enabled : true,
      position: stored.position || "top",
      events,
      limitMeter: stored.limitMeter || LIMIT,
    };
    await c.query(
      "INSERT INTO feedback_config (id, config, updated_at) VALUES ('default', $1, now()) ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = now()",
      [JSON.stringify(config)]
    );
    console.log("✅ feedback_config auf krasse Defaults gehoben. Neue Stile:");
    Object.keys(events).forEach((k) => console.log(`  ${k}: ${events[k].style} / ${events[k].intensity} / confetti=${events[k].confetti} / flash=${events[k].screenFlash}`));
  } finally { c.release(); await pool.end(); }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
