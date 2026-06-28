// scripts/update-snake-tuning.cjs
// Re-tunes the LIVE snake config (snake_config.modes_config JSONB singleton) so the
// speed curve and music dynamics match the new code defaults. The stored config
// overrides code defaults, so changing the code alone is not enough — this patches
// the persisted per-mode fields:
//   • speed curve stretched so classic ~130 / turbo ~80 / grind ~50 apples are
//     comfortably reachable (and beyond) instead of maxing out at 25-45 apples.
//   • music intensity now driven per-apple (gradual) and tempo cap lowered so the
//     track never "overshoots" already at 10-20 apples.
// Only these tuning fields are touched; all other admin customisations are kept.
// Idempotent.

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

// Per-mode tuning patches (only the speed + music fields).
const PATCH = {
  x1:   { initialSpeedMs: 150, speedIncreasePerApple: 0.6,  minSpeedMs: 70, musicTempoMax: 1.35, musicIntensityPerApple: 0.007, musicEventSpike: 0.3  },
  x2:   { initialSpeedMs: 105, speedIncreasePerApple: 0.55, minSpeedMs: 55, musicTempoMax: 1.45, musicIntensityPerApple: 0.011, musicEventSpike: 0.32 },
  grind:{ musicTempoMax: 1.4, musicIntensityPerApple: 0.018, musicEventSpike: 0.3 },
  // farm (endless) intentionally left unchanged.
};

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      "SELECT modes_config FROM snake_config WHERE id = 'default'"
    );
    if (!rows.length) {
      console.log("ℹ️  No snake_config row — code defaults already apply, nothing to patch.");
      return;
    }
    const mc = rows[0].modes_config && typeof rows[0].modes_config === "object" ? rows[0].modes_config : {};
    for (const mode of Object.keys(PATCH)) {
      mc[mode] = { ...(mc[mode] && typeof mc[mode] === "object" ? mc[mode] : {}), ...PATCH[mode] };
    }
    await client.query(
      "UPDATE snake_config SET modes_config = $1 WHERE id = 'default'",
      [JSON.stringify(mc)]
    );
    console.log("✅ Snake speed + music tuning patched into live config (x1, x2, grind).");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
