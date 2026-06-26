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

// All tracks use procedural Web Audio synthesis — no audio files needed.
// URL format: "synth://<vibe>/<variant>"
export const BUILT_IN_TRACKS: MusicTrack[] = [
  // ── Arcade ──────────────────────────────────────────────────────────────────
  { id: "arc_neon_rush",      name: "Neon Rush",          artist: "Synth", vibe: "arcade",     url: "synth://arcade/1" },
  { id: "arc_pixel_chase",    name: "Pixel Chase",        artist: "Synth", vibe: "arcade",     url: "synth://arcade/2" },
  { id: "arc_8bit_fever",     name: "8-Bit Fever",        artist: "Synth", vibe: "arcade",     url: "synth://arcade/3" },
  { id: "arc_hyper_drive",    name: "Hyper Drive",        artist: "Synth", vibe: "arcade",     url: "synth://arcade/4" },
  { id: "arc_turbo_boost",    name: "Turbo Boost",        artist: "Synth", vibe: "arcade",     url: "synth://arcade/5" },
  // ── Chill / Lo-Fi ───────────────────────────────────────────────────────────
  { id: "chl_midnight",       name: "Midnight Lounge",    artist: "Synth", vibe: "chill",      url: "synth://chill/1" },
  { id: "chl_purple_rain",    name: "Purple Rain",        artist: "Synth", vibe: "chill",      url: "synth://chill/2" },
  { id: "chl_crystal",        name: "Crystal Clear",      artist: "Synth", vibe: "chill",      url: "synth://chill/3" },
  { id: "chl_lofi_sat",       name: "Lo-Fi Saturday",     artist: "Synth", vibe: "chill",      url: "synth://chill/4" },
  { id: "chl_cozy_sunday",    name: "Cozy Sunday",        artist: "Synth", vibe: "chill",      url: "synth://chill/5" },
  // ── Abenteuer ───────────────────────────────────────────────────────────────
  { id: "adv_into_wild",      name: "Into the Wild",      artist: "Synth", vibe: "adventure",  url: "synth://adventure/1" },
  { id: "adv_ruins",          name: "Ancient Ruins",      artist: "Synth", vibe: "adventure",  url: "synth://adventure/2" },
  { id: "adv_mystic",         name: "Mystic Forest",      artist: "Synth", vibe: "adventure",  url: "synth://adventure/3" },
  { id: "adv_journey",        name: "Endless Journey",    artist: "Synth", vibe: "adventure",  url: "synth://adventure/4" },
  { id: "adv_highland",       name: "Highland Run",       artist: "Synth", vibe: "adventure",  url: "synth://adventure/5" },
  // ── Electronic ──────────────────────────────────────────────────────────────
  { id: "ele_synthwave",      name: "Synthwave City",     artist: "Synth", vibe: "electronic", url: "synth://electronic/1" },
  { id: "ele_digital",        name: "Digital Dreams",     artist: "Synth", vibe: "electronic", url: "synth://electronic/2" },
  { id: "ele_neon_pulse",     name: "Neon Pulse",         artist: "Synth", vibe: "electronic", url: "synth://electronic/3" },
  { id: "ele_grid_runner",    name: "Grid Runner",        artist: "Synth", vibe: "electronic", url: "synth://electronic/4" },
  { id: "ele_cyber_rain",     name: "Cyber Rain",         artist: "Synth", vibe: "electronic", url: "synth://electronic/5" },
  // ── Retro / 8-Bit ───────────────────────────────────────────────────────────
  { id: "ret_space",          name: "Space Invaders",     artist: "Synth", vibe: "retro",      url: "synth://retro/1" },
  { id: "ret_game_over",      name: "Game Over",          artist: "Synth", vibe: "retro",      url: "synth://retro/2" },
  { id: "ret_level_up",       name: "Level Up",           artist: "Synth", vibe: "retro",      url: "synth://retro/3" },
  { id: "ret_insert_coin",    name: "Insert Coin",        artist: "Synth", vibe: "retro",      url: "synth://retro/4" },
  { id: "ret_boss_fight",     name: "Boss Fight",         artist: "Synth", vibe: "retro",      url: "synth://retro/5" },
  // ── Ambient ─────────────────────────────────────────────────────────────────
  { id: "amb_ocean",          name: "Ocean Drift",        artist: "Synth", vibe: "ambient",    url: "synth://ambient/1" },
  { id: "amb_deep_space",     name: "Deep Space",         artist: "Synth", vibe: "ambient",    url: "synth://ambient/2" },
  { id: "amb_morning_mist",   name: "Morning Mist",       artist: "Synth", vibe: "ambient",    url: "synth://ambient/3" },
  { id: "amb_void_walker",    name: "Void Walker",        artist: "Synth", vibe: "ambient",    url: "synth://ambient/4" },
  { id: "amb_starfield",      name: "Starfield",          artist: "Synth", vibe: "ambient",    url: "synth://ambient/5" },
  // ── Epic ────────────────────────────────────────────────────────────────────
  { id: "epc_dragon",         name: "Dragon's Peak",      artist: "Synth", vibe: "epic",       url: "synth://epic/1" },
  { id: "epc_battle",         name: "Battle Hymn",        artist: "Synth", vibe: "epic",       url: "synth://epic/2" },
  { id: "epc_storm",          name: "Storm Bringer",      artist: "Synth", vibe: "epic",       url: "synth://epic/3" },
  { id: "epc_last_stand",     name: "Last Stand",         artist: "Synth", vibe: "epic",       url: "synth://epic/4" },
  { id: "epc_glory",          name: "Glory Awaits",       artist: "Synth", vibe: "epic",       url: "synth://epic/5" },
];

export const DEFAULT_MUSIC_CONFIG: MusicConfig = {
  enabled:             true,
  defaultVolume:       0.12,
  fadeInMs:            1200,
  fadeOutMs:           500,
  showPlayerUI:        true,
  userCanControl:      false,  // Dictator-Modus: User haben standardmäßig keine Kontrolle
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
