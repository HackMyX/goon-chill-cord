// Run: node scripts/reset-music-config-synth.cjs
//
// WHY: The music_config DB row was seeded (add-music-config.cjs) with file-based
// tracks pointing at /music/*.mp3 files that never existed (public/music/ is absent),
// plus a YouTube page URL. <audio> 404s on all of them -> the admin "Test" button
// goes red instantly and background music plays nowhere.
//
// The app ships a fully procedural Web Audio synthesizer (lib/music-synth.ts) that
// needs ZERO files and ZERO network. This script overwrites the stored config with
// the synth-based defaults so every track plays instantly and offline-safe.
//
// Track IDs match the ones already referenced by pageAssignments, so nothing breaks.
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

// ── Synth track library (mirror of BUILT_IN_TRACKS in lib/music-config.ts) ──────
const BUILT_IN_TRACKS = [
  // Arcade
  { id: "arc_neon_rush",   name: "Neon Rush",       artist: "Synth", vibe: "arcade",     url: "synth://arcade/1" },
  { id: "arc_pixel_chase", name: "Pixel Chase",     artist: "Synth", vibe: "arcade",     url: "synth://arcade/2" },
  { id: "arc_8bit_fever",  name: "8-Bit Fever",     artist: "Synth", vibe: "arcade",     url: "synth://arcade/3" },
  { id: "arc_hyper_drive", name: "Hyper Drive",     artist: "Synth", vibe: "arcade",     url: "synth://arcade/4" },
  { id: "arc_turbo_boost", name: "Turbo Boost",     artist: "Synth", vibe: "arcade",     url: "synth://arcade/5" },
  // Chill
  { id: "chl_midnight",    name: "Midnight Lounge", artist: "Synth", vibe: "chill",      url: "synth://chill/1" },
  { id: "chl_purple_rain", name: "Purple Rain",     artist: "Synth", vibe: "chill",      url: "synth://chill/2" },
  { id: "chl_crystal",     name: "Crystal Clear",   artist: "Synth", vibe: "chill",      url: "synth://chill/3" },
  { id: "chl_lofi_sat",    name: "Lo-Fi Saturday",  artist: "Synth", vibe: "chill",      url: "synth://chill/4" },
  { id: "chl_cozy_sunday", name: "Cozy Sunday",     artist: "Synth", vibe: "chill",      url: "synth://chill/5" },
  // Adventure
  { id: "adv_into_wild",   name: "Into the Wild",   artist: "Synth", vibe: "adventure",  url: "synth://adventure/1" },
  { id: "adv_ruins",       name: "Ancient Ruins",   artist: "Synth", vibe: "adventure",  url: "synth://adventure/2" },
  { id: "adv_mystic",      name: "Mystic Forest",   artist: "Synth", vibe: "adventure",  url: "synth://adventure/3" },
  { id: "adv_journey",     name: "Endless Journey", artist: "Synth", vibe: "adventure",  url: "synth://adventure/4" },
  { id: "adv_highland",    name: "Highland Run",    artist: "Synth", vibe: "adventure",  url: "synth://adventure/5" },
  // Electronic
  { id: "ele_synthwave",   name: "Synthwave City",  artist: "Synth", vibe: "electronic", url: "synth://electronic/1" },
  { id: "ele_digital",     name: "Digital Dreams",  artist: "Synth", vibe: "electronic", url: "synth://electronic/2" },
  { id: "ele_neon_pulse",  name: "Neon Pulse",      artist: "Synth", vibe: "electronic", url: "synth://electronic/3" },
  { id: "ele_grid_runner", name: "Grid Runner",     artist: "Synth", vibe: "electronic", url: "synth://electronic/4" },
  { id: "ele_cyber_rain",  name: "Cyber Rain",      artist: "Synth", vibe: "electronic", url: "synth://electronic/5" },
  // Retro
  { id: "ret_space",       name: "Space Invaders",  artist: "Synth", vibe: "retro",      url: "synth://retro/1" },
  { id: "ret_game_over",   name: "Game Over",       artist: "Synth", vibe: "retro",      url: "synth://retro/2" },
  { id: "ret_level_up",    name: "Level Up",        artist: "Synth", vibe: "retro",      url: "synth://retro/3" },
  { id: "ret_insert_coin", name: "Insert Coin",     artist: "Synth", vibe: "retro",      url: "synth://retro/4" },
  { id: "ret_boss_fight",  name: "Boss Fight",      artist: "Synth", vibe: "retro",      url: "synth://retro/5" },
  // Ambient
  { id: "amb_ocean",       name: "Ocean Drift",     artist: "Synth", vibe: "ambient",    url: "synth://ambient/1" },
  { id: "amb_deep_space",  name: "Deep Space",      artist: "Synth", vibe: "ambient",    url: "synth://ambient/2" },
  { id: "amb_morning_mist",name: "Morning Mist",    artist: "Synth", vibe: "ambient",    url: "synth://ambient/3" },
  { id: "amb_void_walker", name: "Void Walker",     artist: "Synth", vibe: "ambient",    url: "synth://ambient/4" },
  { id: "amb_starfield",   name: "Starfield",       artist: "Synth", vibe: "ambient",    url: "synth://ambient/5" },
  // Epic
  { id: "epc_dragon",      name: "Dragon's Peak",   artist: "Synth", vibe: "epic",       url: "synth://epic/1" },
  { id: "epc_battle",      name: "Battle Hymn",     artist: "Synth", vibe: "epic",       url: "synth://epic/2" },
  { id: "epc_storm",       name: "Storm Bringer",   artist: "Synth", vibe: "epic",       url: "synth://epic/3" },
  { id: "epc_last_stand",  name: "Last Stand",      artist: "Synth", vibe: "epic",       url: "synth://epic/4" },
  { id: "epc_glory",       name: "Glory Awaits",    artist: "Synth", vibe: "epic",       url: "synth://epic/5" },
];

const SYNTH_CONFIG = {
  enabled:             true,
  defaultVolume:       0.12,
  fadeInMs:            1200,
  fadeOutMs:           500,
  showPlayerUI:        true,
  userCanControl:      false,
  userCanMute:         false,
  userCanAdjustVolume: false,
  maxUserVolume:       1.0,
  tracks:              BUILT_IN_TRACKS,
  pageAssignments: {
    homepage:   "chl_midnight",
    snake:      "arc_neon_rush",
    don:        "arc_8bit_fever",
    world:      "adv_into_wild",
    cases:      "chl_purple_rain",
    shop:       "chl_crystal",
    community:  "chl_lofi_sat",
    dashboard:  "chl_midnight",
    plinko:     "arc_pixel_chase",
    battlepass: "epc_battle",
    garderobe:  "chl_crystal",
    auctions:   "ele_synthwave",
    trading:    "ele_digital",
    surveys:    "amb_morning_mist",
    account:    "chl_cozy_sunday",
    mine:       "ret_insert_coin",
    mod:        "amb_deep_space",
    admin:      "amb_deep_space",
  },
};

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // Preserve the admin's chosen volume / UI flags if a row already exists.
    const { rows } = await client.query(`SELECT config FROM music_config WHERE id = 'default'`);
    const prev = rows[0] && rows[0].config ? rows[0].config : {};
    const merged = {
      ...SYNTH_CONFIG,
      enabled:             prev.enabled             ?? SYNTH_CONFIG.enabled,
      defaultVolume:       prev.defaultVolume       ?? SYNTH_CONFIG.defaultVolume,
      fadeInMs:            prev.fadeInMs            ?? SYNTH_CONFIG.fadeInMs,
      fadeOutMs:           prev.fadeOutMs           ?? SYNTH_CONFIG.fadeOutMs,
      showPlayerUI:        prev.showPlayerUI        ?? SYNTH_CONFIG.showPlayerUI,
      userCanControl:      prev.userCanControl      ?? SYNTH_CONFIG.userCanControl,
      userCanMute:         prev.userCanMute         ?? SYNTH_CONFIG.userCanMute,
      userCanAdjustVolume: prev.userCanAdjustVolume ?? SYNTH_CONFIG.userCanAdjustVolume,
      maxUserVolume:       prev.maxUserVolume       ?? SYNTH_CONFIG.maxUserVolume,
      // tracks + pageAssignments are intentionally REPLACED with the working synth set
    };

    await client.query(
      `INSERT INTO music_config (id, config, updated_at)
       VALUES ('default', $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = now()`,
      [JSON.stringify(merged)]
    );

    const synthCount = merged.tracks.filter((t) => t.url.startsWith('synth://')).length;
    console.log(`OK   music_config reset to synth engine`);
    console.log(`     ${merged.tracks.length} tracks (${synthCount} synth://), enabled=${merged.enabled}`);
    console.log(`     ${Object.keys(merged.pageAssignments).length} page assignments`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
