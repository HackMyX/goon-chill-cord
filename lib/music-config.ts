// ── Music System — Types & Defaults ─────────────────────────────────────────

export type MusicVibe = "arcade" | "chill" | "adventure" | "electronic" | "retro" | "ambient" | "epic";

export interface MusicTrack {
  id: string;
  name: string;
  artist: string;
  vibe: MusicVibe;
  url: string;
}

export type MusicPageKey =
  | "homepage"
  | "snake"
  | "don"
  | "world"
  | "cases"
  | "shop"
  | "community"
  | "dashboard"
  | "plinko"
  | "battlepass"
  | "garderobe"
  | "auctions"
  | "trading"
  | "surveys"
  | "account"
  | "mine"
  | "mod"
  | "admin";

export interface MusicConfig {
  enabled: boolean;
  defaultVolume: number;
  fadeInMs: number;
  fadeOutMs: number;
  /** Show the floating player widget to users */
  showPlayerUI: boolean;
  /** If false, player widget is completely hidden from users (music still plays) */
  userCanControl: boolean;
  /** If false, the mute button is hidden from users */
  userCanMute: boolean;
  /** If false, the volume slider is hidden from users */
  userCanAdjustVolume: boolean;
  /** Maximum volume users are allowed to set (0–1) */
  maxUserVolume: number;
  tracks: MusicTrack[];
  pageAssignments: Partial<Record<MusicPageKey, string | null>>;
}

export const PAGE_LABELS: Record<MusicPageKey, string> = {
  homepage:   "Startseite",
  snake:      "Snake",
  don:        "Double or Nothing",
  world:      "3D Farmwelt",
  cases:      "Cases",
  shop:       "Shop",
  community:  "Community",
  dashboard:  "Dashboard",
  plinko:     "Plinko",
  battlepass: "Battle Pass",
  garderobe:  "Garderobe",
  auctions:   "Auktionshaus",
  trading:    "Trading",
  surveys:    "Umfragen",
  account:    "Account / Profil",
  mine:       "Mine",
  mod:        "Mod-Panel",
  admin:      "Admin-Panel",
};

export const PAGE_ROUTES: MusicPageKey[] = [
  "homepage", "snake", "don", "world", "cases", "shop", "community", "dashboard",
  "plinko", "battlepass", "garderobe", "auctions", "trading", "surveys", "account",
  "mine", "mod", "admin",
];

export const VIBE_LABELS: Record<MusicVibe, string> = {
  arcade:     "Arcade",
  chill:      "Chill / Lo-Fi",
  adventure:  "Abenteuer",
  electronic: "Electronic",
  retro:      "Retro / 8-Bit",
  ambient:    "Ambient",
  epic:       "Epic",
};

export const BUILT_IN_TRACKS: MusicTrack[] = [
  // ── Arcade ──
  { id: "arc_neon_rush",    name: "Neon Rush",        artist: "Royalty Free", vibe: "arcade",     url: "/music/arcade-neon-rush.mp3" },
  { id: "arc_pixel_chase",  name: "Pixel Chase",      artist: "Royalty Free", vibe: "arcade",     url: "/music/arcade-pixel-chase.mp3" },
  { id: "arc_8bit_fever",   name: "8-Bit Fever",      artist: "Royalty Free", vibe: "arcade",     url: "/music/arcade-8bit-fever.mp3" },
  { id: "arc_hyper_drive",  name: "Hyper Drive",      artist: "Royalty Free", vibe: "arcade",     url: "/music/arcade-hyper-drive.mp3" },
  { id: "arc_turbo_boost",  name: "Turbo Boost",      artist: "Royalty Free", vibe: "arcade",     url: "/music/arcade-turbo-boost.mp3" },
  // ── Chill / Lo-Fi ──
  { id: "chl_midnight",     name: "Midnight Lounge",  artist: "Royalty Free", vibe: "chill",      url: "/music/chill-midnight-lounge.mp3" },
  { id: "chl_purple_rain",  name: "Purple Rain",      artist: "Royalty Free", vibe: "chill",      url: "/music/chill-purple-rain.mp3" },
  { id: "chl_crystal",      name: "Crystal Clear",    artist: "Royalty Free", vibe: "chill",      url: "/music/chill-crystal-clear.mp3" },
  { id: "chl_lofi_sat",     name: "Lo-Fi Saturday",   artist: "Royalty Free", vibe: "chill",      url: "/music/chill-lofi-saturday.mp3" },
  { id: "chl_cozy_sunday",  name: "Cozy Sunday",      artist: "Royalty Free", vibe: "chill",      url: "/music/chill-cozy-sunday.mp3" },
  // ── Abenteuer ──
  { id: "adv_into_wild",    name: "Into the Wild",    artist: "Royalty Free", vibe: "adventure",  url: "/music/adventure-into-wild.mp3" },
  { id: "adv_ruins",        name: "Ancient Ruins",    artist: "Royalty Free", vibe: "adventure",  url: "/music/adventure-ancient-ruins.mp3" },
  { id: "adv_mystic",       name: "Mystic Forest",    artist: "Royalty Free", vibe: "adventure",  url: "/music/adventure-mystic-forest.mp3" },
  { id: "adv_journey",      name: "Endless Journey",  artist: "Royalty Free", vibe: "adventure",  url: "/music/adventure-endless-journey.mp3" },
  // ── Electronic ──
  { id: "ele_synthwave",    name: "Synthwave City",   artist: "Royalty Free", vibe: "electronic", url: "/music/electronic-synthwave-city.mp3" },
  { id: "ele_digital",      name: "Digital Dreams",   artist: "Royalty Free", vibe: "electronic", url: "/music/electronic-digital-dreams.mp3" },
  { id: "ele_neon_pulse",   name: "Neon Pulse",       artist: "Royalty Free", vibe: "electronic", url: "/music/electronic-neon-pulse.mp3" },
  { id: "ele_grid_runner",  name: "Grid Runner",      artist: "Royalty Free", vibe: "electronic", url: "/music/electronic-grid-runner.mp3" },
  { id: "ele_cyber_rain",   name: "Cyber Rain",       artist: "Royalty Free", vibe: "electronic", url: "/music/electronic-cyber-rain.mp3" },
  // ── Retro / 8-Bit ──
  { id: "ret_space",        name: "Space Invaders",   artist: "Royalty Free", vibe: "retro",      url: "/music/retro-space-invaders.mp3" },
  { id: "ret_game_over",    name: "Game Over",        artist: "Royalty Free", vibe: "retro",      url: "/music/retro-game-over.mp3" },
  { id: "ret_level_up",     name: "Level Up",         artist: "Royalty Free", vibe: "retro",      url: "/music/retro-level-up.mp3" },
  { id: "ret_insert_coin",  name: "Insert Coin",      artist: "Royalty Free", vibe: "retro",      url: "/music/retro-insert-coin.mp3" },
  // ── Ambient ──
  { id: "amb_ocean",        name: "Ocean Drift",      artist: "Royalty Free", vibe: "ambient",    url: "/music/ambient-ocean-drift.mp3" },
  { id: "amb_deep_space",   name: "Deep Space",       artist: "Royalty Free", vibe: "ambient",    url: "/music/ambient-deep-space.mp3" },
  { id: "amb_morning_mist", name: "Morning Mist",     artist: "Royalty Free", vibe: "ambient",    url: "/music/ambient-morning-mist.mp3" },
  { id: "amb_void_walker",  name: "Void Walker",      artist: "Royalty Free", vibe: "ambient",    url: "/music/ambient-void-walker.mp3" },
  // ── Epic ──
  { id: "epc_dragon",       name: "Dragon's Peak",    artist: "Royalty Free", vibe: "epic",       url: "/music/epic-dragons-peak.mp3" },
  { id: "epc_battle",       name: "Battle Hymn",      artist: "Royalty Free", vibe: "epic",       url: "/music/epic-battle-hymn.mp3" },
  { id: "epc_storm",        name: "Storm Bringer",    artist: "Royalty Free", vibe: "epic",       url: "/music/epic-storm-bringer.mp3" },
  { id: "epc_last_stand",   name: "Last Stand",       artist: "Royalty Free", vibe: "epic",       url: "/music/epic-last-stand.mp3" },
];

export const DEFAULT_MUSIC_CONFIG: MusicConfig = {
  enabled:             false,
  defaultVolume:       0.12,
  fadeInMs:            1200,
  fadeOutMs:           500,
  showPlayerUI:        true,
  userCanControl:      true,
  userCanMute:         true,
  userCanAdjustVolume: true,
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
