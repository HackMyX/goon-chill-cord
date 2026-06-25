export type SnakeMode = "x1" | "x2" | "grind" | "farm";

export interface SnakeModeConfig {
  enabled: boolean;
  boardSize: number;
  creditsPerApple: number;
  initialSpeedMs: number;
  speedIncreasePerApple: number;
  minSpeedMs: number;
  wallWrap: boolean;
  dailyCrLimit: number | null;
  /** Max number of game sessions per day. null = no limit. */
  dailyGameLimit: number | null;
  bonusEveryN: number;
  bonusCrFlat: number;
  bonusMultiplierApples: number;
  goldenAppleEnabled: boolean;
  goldenAppleCrMultiplier: number;
  goldenAppleLifeApples: number;
  goldenAppleTailLoss: number;       // snake blocks removed when golden apple eaten (0 = none)
  goldenAppleSpeedReduction: number; // ms added to speed interval after eating golden apple (0 = no change)
  startLength: number;
  particlesEnabled: boolean;
  leaderboardSize: number;
}

export interface SnakeGrindConfig extends SnakeModeConfig {
  shrinkEveryN: number;
  minBoardSize: number;
  bonusCrPerShrink: number;
}

export interface SnakeConfig {
  enabled: boolean;
  sectionTitle: string;
  sectionSubtitle: string;
  x1: SnakeModeConfig;
  x2: SnakeModeConfig;
  grind: SnakeGrindConfig;
  farm: SnakeModeConfig;
}

export const DEFAULT_X1_CONFIG: SnakeModeConfig = {
  enabled: true,
  boardSize: 20,
  creditsPerApple: 12,
  initialSpeedMs: 150,
  speedIncreasePerApple: 2,
  minSpeedMs: 60,
  wallWrap: true,
  dailyCrLimit: 20000,
  dailyGameLimit: null,
  bonusEveryN: 10,
  bonusCrFlat: 80,
  bonusMultiplierApples: 5,
  goldenAppleEnabled: true,
  goldenAppleCrMultiplier: 5,
  goldenAppleLifeApples: 8,
  goldenAppleTailLoss: 0,
  goldenAppleSpeedReduction: 0,
  startLength: 3,
  particlesEnabled: true,
  leaderboardSize: 20,
};

export const DEFAULT_X2_CONFIG: SnakeModeConfig = {
  enabled: true,
  boardSize: 20,
  creditsPerApple: 28,
  initialSpeedMs: 90,
  speedIncreasePerApple: 2,
  minSpeedMs: 40,
  wallWrap: false,
  dailyCrLimit: 40000,
  dailyGameLimit: null,
  bonusEveryN: 10,
  bonusCrFlat: 150,
  bonusMultiplierApples: 5,
  goldenAppleEnabled: true,
  goldenAppleCrMultiplier: 5,
  goldenAppleLifeApples: 6,
  goldenAppleTailLoss: 0,
  goldenAppleSpeedReduction: 0,
  startLength: 3,
  particlesEnabled: true,
  leaderboardSize: 20,
};

export const DEFAULT_GRIND_CONFIG: SnakeGrindConfig = {
  enabled: true,
  boardSize: 64,
  creditsPerApple: 5,
  initialSpeedMs: 160,
  speedIncreasePerApple: 0.5,
  minSpeedMs: 70,
  wallWrap: false,
  dailyCrLimit: 45000,
  dailyGameLimit: null,
  bonusEveryN: 10,
  bonusCrFlat: 100,
  bonusMultiplierApples: 5,
  goldenAppleEnabled: true,
  goldenAppleCrMultiplier: 4,
  goldenAppleLifeApples: 15,
  goldenAppleTailLoss: 0,
  goldenAppleSpeedReduction: 0,
  startLength: 3,
  particlesEnabled: true,
  leaderboardSize: 20,
  shrinkEveryN: 10,
  minBoardSize: 8,
  bonusCrPerShrink: 50,
};

export const DEFAULT_FARM_CONFIG: SnakeModeConfig = {
  enabled: true,
  boardSize: 20,
  creditsPerApple: 4,
  initialSpeedMs: 140,
  speedIncreasePerApple: 0,
  minSpeedMs: 140,
  wallWrap: true,
  dailyCrLimit: 8000,
  dailyGameLimit: 8,
  bonusEveryN: 0,
  bonusCrFlat: 0,
  bonusMultiplierApples: 0,
  goldenAppleEnabled: false,
  goldenAppleCrMultiplier: 1,
  goldenAppleLifeApples: 0,
  goldenAppleTailLoss: 0,
  goldenAppleSpeedReduction: 0,
  startLength: 5,
  particlesEnabled: true,
  leaderboardSize: 20,
};

export const DEFAULT_SNAKE_CONFIG: SnakeConfig = {
  enabled: true,
  sectionTitle: "Snake",
  sectionSubtitle: "Sammle Äpfel, verdiene Credits",
  x1: DEFAULT_X1_CONFIG,
  x2: DEFAULT_X2_CONFIG,
  grind: DEFAULT_GRIND_CONFIG,
  farm: DEFAULT_FARM_CONFIG,
};

export function getModeConfig(config: SnakeConfig, mode: SnakeMode): SnakeModeConfig | SnakeGrindConfig {
  if (mode === "grind") return config.grind;
  if (mode === "x2") return config.x2;
  if (mode === "farm") return config.farm;
  return config.x1;
}
