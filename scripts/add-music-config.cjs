// Run: node scripts/add-music-config.cjs
// Creates the music_config singleton table for per-page background music.
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

// NOTE: tracks use the built-in Web Audio synthesizer (lib/music-synth.ts) via
// "synth://" URLs — no audio files required. Earlier this seed pointed at
// /music/*.mp3 files that never existed, which 404'd and broke the whole player.
const DEFAULT_CONFIG = {
  enabled: true,
  defaultVolume: 0.12,
  fadeInMs: 1200,
  fadeOutMs: 500,
  tracks: [
    { id: "arc_neon_rush",   name: "Neon Rush",       artist: "Synth", vibe: "arcade",    url: "synth://arcade/1" },
    { id: "arc_pixel_chase", name: "Pixel Chase",     artist: "Synth", vibe: "arcade",    url: "synth://arcade/2" },
    { id: "arc_8bit_fever",  name: "8-Bit Fever",     artist: "Synth", vibe: "arcade",    url: "synth://arcade/3" },
    { id: "arc_hyper_drive", name: "Hyper Drive",     artist: "Synth", vibe: "arcade",    url: "synth://arcade/4" },
    { id: "chl_midnight",    name: "Midnight Lounge", artist: "Synth", vibe: "chill",     url: "synth://chill/1" },
    { id: "chl_purple_rain", name: "Purple Rain",     artist: "Synth", vibe: "chill",     url: "synth://chill/2" },
    { id: "chl_crystal",     name: "Crystal Clear",   artist: "Synth", vibe: "chill",     url: "synth://chill/3" },
    { id: "chl_lofi_sat",    name: "Lo-Fi Saturday",  artist: "Synth", vibe: "chill",     url: "synth://chill/4" },
    { id: "adv_into_wild",   name: "Into the Wild",   artist: "Synth", vibe: "adventure", url: "synth://adventure/1" },
    { id: "adv_ruins",       name: "Ancient Ruins",   artist: "Synth", vibe: "adventure", url: "synth://adventure/2" },
    { id: "adv_mystic",      name: "Mystic Forest",   artist: "Synth", vibe: "adventure", url: "synth://adventure/3" },
    { id: "adv_journey",     name: "Endless Journey", artist: "Synth", vibe: "adventure", url: "synth://adventure/4" },
  ],
  pageAssignments: {
    homepage:  "chl_midnight",
    snake:     "arc_neon_rush",
    don:       "arc_8bit_fever",
    world:     "adv_into_wild",
    cases:     "chl_purple_rain",
    shop:      "chl_crystal",
    community: "chl_lofi_sat",
    dashboard: "chl_midnight",
  },
};

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS music_config (
        id         TEXT        PRIMARY KEY DEFAULT 'default',
        config     JSONB       NOT NULL    DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL    DEFAULT now()
      )
    `);
    console.log('OK   Created music_config');

    await client.query(`ALTER TABLE music_config ENABLE ROW LEVEL SECURITY`);
    console.log('OK   RLS enabled');

    const { rowCount } = await client.query(`
      INSERT INTO music_config (id, config)
      VALUES ('default', $1::jsonb)
      ON CONFLICT (id) DO NOTHING
    `, [JSON.stringify(DEFAULT_CONFIG)]);
    console.log(`OK   Default row ${rowCount > 0 ? 'inserted' : 'already exists'}`);

  } finally {
    await client.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
