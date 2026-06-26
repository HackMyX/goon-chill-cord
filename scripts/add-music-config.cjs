// Run: node scripts/add-music-config.cjs
// Creates the music_config singleton table for per-page background music.
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const DEFAULT_CONFIG = {
  enabled: false,
  defaultVolume: 0.12,
  fadeInMs: 1200,
  fadeOutMs: 500,
  tracks: [
    { id: "arc_neon_rush",   name: "Neon Rush",       artist: "Royalty Free", vibe: "arcade",    url: "/music/arcade-neon-rush.mp3" },
    { id: "arc_pixel_chase", name: "Pixel Chase",     artist: "Royalty Free", vibe: "arcade",    url: "/music/arcade-pixel-chase.mp3" },
    { id: "arc_8bit_fever",  name: "8-Bit Fever",     artist: "Royalty Free", vibe: "arcade",    url: "/music/arcade-8bit-fever.mp3" },
    { id: "arc_hyper_drive", name: "Hyper Drive",     artist: "Royalty Free", vibe: "arcade",    url: "/music/arcade-hyper-drive.mp3" },
    { id: "chl_midnight",    name: "Midnight Lounge", artist: "Royalty Free", vibe: "chill",     url: "/music/chill-midnight-lounge.mp3" },
    { id: "chl_purple_rain", name: "Purple Rain",     artist: "Royalty Free", vibe: "chill",     url: "/music/chill-purple-rain.mp3" },
    { id: "chl_crystal",     name: "Crystal Clear",   artist: "Royalty Free", vibe: "chill",     url: "/music/chill-crystal-clear.mp3" },
    { id: "chl_lofi_sat",    name: "Lo-Fi Saturday",  artist: "Royalty Free", vibe: "chill",     url: "/music/chill-lofi-saturday.mp3" },
    { id: "adv_into_wild",   name: "Into the Wild",   artist: "Royalty Free", vibe: "adventure", url: "/music/adventure-into-wild.mp3" },
    { id: "adv_ruins",       name: "Ancient Ruins",   artist: "Royalty Free", vibe: "adventure", url: "/music/adventure-ancient-ruins.mp3" },
    { id: "adv_mystic",      name: "Mystic Forest",   artist: "Royalty Free", vibe: "adventure", url: "/music/adventure-mystic-forest.mp3" },
    { id: "adv_journey",     name: "Endless Journey", artist: "Royalty Free", vibe: "adventure", url: "/music/adventure-endless-journey.mp3" },
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
