// ── Music System — Types & Defaults ─────────────────────────────────────────

export type MusicVibe = "arcade" | "chill" | "adventure";

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
  | "dashboard";

export interface MusicConfig {
  enabled: boolean;
  defaultVolume: number;
  fadeInMs: number;
  fadeOutMs: number;
  tracks: MusicTrack[];
  pageAssignments: Partial<Record<MusicPageKey, string | null>>;
}

export const PAGE_LABELS: Record<MusicPageKey, string> = {
  homepage:  "Startseite",
  snake:     "Snake",
  don:       "Double or Nothing",
  world:     "3D Farmwelt",
  cases:     "Cases",
  shop:      "Shop",
  community: "Community",
  dashboard: "Dashboard",
};

export const PAGE_ROUTES: MusicPageKey[] = [
  "homepage", "snake", "don", "world", "cases", "shop", "community", "dashboard",
];

export const VIBE_LABELS: Record<MusicVibe, string> = {
  arcade:    "Arcade",
  chill:     "Chill / Lo-Fi",
  adventure: "Abenteuer",
};

export const BUILT_IN_TRACKS: MusicTrack[] = [
  // ── Arcade ──
  { id: "arc_neon_rush",    name: "Neon Rush",      artist: "Royalty Free", vibe: "arcade",    url: "/music/arcade-neon-rush.mp3" },
  { id: "arc_pixel_chase",  name: "Pixel Chase",    artist: "Royalty Free", vibe: "arcade",    url: "/music/arcade-pixel-chase.mp3" },
  { id: "arc_8bit_fever",   name: "8-Bit Fever",    artist: "Royalty Free", vibe: "arcade",    url: "/music/arcade-8bit-fever.mp3" },
  { id: "arc_hyper_drive",  name: "Hyper Drive",    artist: "Royalty Free", vibe: "arcade",    url: "/music/arcade-hyper-drive.mp3" },
  // ── Chill ──
  { id: "chl_midnight",     name: "Midnight Lounge", artist: "Royalty Free", vibe: "chill",    url: "/music/chill-midnight-lounge.mp3" },
  { id: "chl_purple_rain",  name: "Purple Rain",    artist: "Royalty Free", vibe: "chill",    url: "/music/chill-purple-rain.mp3" },
  { id: "chl_crystal",      name: "Crystal Clear",  artist: "Royalty Free", vibe: "chill",    url: "/music/chill-crystal-clear.mp3" },
  { id: "chl_lofi_sat",     name: "Lo-Fi Saturday", artist: "Royalty Free", vibe: "chill",    url: "/music/chill-lofi-saturday.mp3" },
  // ── Adventure ──
  { id: "adv_into_wild",    name: "Into the Wild",  artist: "Royalty Free", vibe: "adventure", url: "/music/adventure-into-wild.mp3" },
  { id: "adv_ruins",        name: "Ancient Ruins",  artist: "Royalty Free", vibe: "adventure", url: "/music/adventure-ancient-ruins.mp3" },
  { id: "adv_mystic",       name: "Mystic Forest",  artist: "Royalty Free", vibe: "adventure", url: "/music/adventure-mystic-forest.mp3" },
  { id: "adv_journey",      name: "Endless Journey",artist: "Royalty Free", vibe: "adventure", url: "/music/adventure-endless-journey.mp3" },
];

export const DEFAULT_MUSIC_CONFIG: MusicConfig = {
  enabled:         false,
  defaultVolume:   0.12,
  fadeInMs:        1200,
  fadeOutMs:       500,
  tracks:          BUILT_IN_TRACKS,
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
