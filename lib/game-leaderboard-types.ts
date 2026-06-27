export type GameLeaderboardListId =
  | "snake_x1" | "snake_x2" | "snake_grind" | "snake_farm"
  | "mine" | "plinko" | "world" | "cases" | "xp";

/**
 * Steuert, für welche Plätze auf der STARTSEITE Profilbilder angezeigt werden.
 * - "top3": nur die ersten 3 Plätze bekommen ein Profilbild, ab Platz 4 ohne.
 * - "all":  alle Plätze bekommen ein Profilbild.
 * Gilt ausschließlich für die Startseite — die Bestenlisten in den Spielen
 * selbst zeigen grundsätzlich keine Profilbilder.
 */
export type HomepageAvatarMode = "top3" | "all";

export const DEFAULT_HOMEPAGE_AVATAR_MODE: HomepageAvatarMode = "top3";

export function isHomepageAvatarMode(v: unknown): v is HomepageAvatarMode {
  return v === "top3" || v === "all";
}

export interface GameLeaderboardItem {
  id: GameLeaderboardListId;
  label: string;
  enabled: boolean;
  limit: number;
  sort: number;
}

export interface UnifiedGameEntry {
  rank: number;
  userId: string;
  username: string;
  nameStyleKey?: string;
  avatarUrl?: string;
  prioBadges: string[];
  primaryValue: number;
  secondaryLabel: string;
}

export interface GameLeaderboardSection {
  item: GameLeaderboardItem;
  entries: UnifiedGameEntry[];
}

export const DEFAULT_GAME_LEADERBOARD_CONFIG: GameLeaderboardItem[] = [
  { id: "snake_x1",    label: "Snake Classic ×1", enabled: true,  limit: 10, sort: 0 },
  { id: "snake_x2",    label: "Snake Turbo ×2",   enabled: true,  limit: 10, sort: 1 },
  { id: "snake_grind", label: "Snake Grind",       enabled: false, limit: 10, sort: 2 },
  { id: "snake_farm",  label: "Snake Endless",     enabled: false, limit: 10, sort: 3 },
  { id: "mine",        label: "Mine",              enabled: true,  limit: 10, sort: 4 },
  { id: "plinko",      label: "Plinko",            enabled: true,  limit: 10, sort: 5 },
  { id: "world",       label: "Farmwelt",          enabled: true,  limit: 10, sort: 6 },
  { id: "cases",       label: "Cases",             enabled: false, limit: 10, sort: 7 },
  { id: "xp",          label: "Level & XP",        enabled: false, limit: 10, sort: 8 },
];
