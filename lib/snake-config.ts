export interface SnakeConfig {
  enabled: boolean;
  boardSize: number;
  creditsPerAppleX1: number;
  creditsPerAppleX2: number;
  x2AppleThreshold: number;
  wallWrap: boolean;
  initialSpeedMs: number;
  speedIncreasePerApple: number;
  minSpeedMs: number;
  x2InitialSpeedMs: number;
  dailyCrLimit: number | null;
  leaderboardSize: number;
  sectionTitle: string;
  sectionSubtitle: string;
}

export const DEFAULT_SNAKE_CONFIG: SnakeConfig = {
  enabled: true,
  boardSize: 20,
  creditsPerAppleX1: 5,
  creditsPerAppleX2: 10,
  x2AppleThreshold: 30,
  wallWrap: true,
  initialSpeedMs: 150,
  speedIncreasePerApple: 2,
  minSpeedMs: 60,
  x2InitialSpeedMs: 100,
  dailyCrLimit: 10000,
  leaderboardSize: 20,
  sectionTitle: "Snake",
  sectionSubtitle: "Sammle Äpfel, verdiene Credits",
};
