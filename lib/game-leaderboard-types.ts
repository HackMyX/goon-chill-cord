export type GameLeaderboardListId =
  | "snake_x1" | "snake_x2" | "snake_grind" | "snake_farm" | "mine";

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
];
