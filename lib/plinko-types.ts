export interface PlinkoRiskLevel {
  key: string;
  label: string;
  emoji: string;
  multipliers: number[];
}

export interface PlinkoConfig {
  enabled: boolean;
  hourlyBallLimit: number;
  dailyBallLimit: number;
  // Variable betting
  minBetCr: number;
  maxBetCr: number;           // 0 = no limit (bounded by credits)
  quickBetAmounts: number[];  // Quick-select buttons
  // Board
  rows: number;
  riskLevels: PlinkoRiskLevel[];
  maxWinCr: number;
  announceBigWins: boolean;
  bigWinThreshold: number;
  // Display
  showHistory: boolean;
  showLeaderboard: boolean;
  leaderboardSize: number;
  // Visuals
  particlesEnabled: boolean;
  trailLength: number;        // 1-12
  glowIntensity: number;      // 0.0-3.0
  animationSpeed: number;     // 0.5=slow, 1.0=normal, 2.0=fast, 3.0=instant
  // Auto-bet
  autoBetEnabled: boolean;
}

export const DEFAULT_PLINKO_CONFIG: PlinkoConfig = {
  enabled: true,
  hourlyBallLimit: 30,
  dailyBallLimit: 0,
  minBetCr: 500,
  maxBetCr: 0,
  quickBetAmounts: [500, 2000, 10000, 50000, 250000],
  rows: 12,
  riskLevels: [
    { key: "low",    label: "Niedrig", emoji: "🟢", multipliers: [1.8, 1.5, 1.3, 1.1, 0.9, 0.8, 0.9, 1.1, 1.3, 1.5, 1.8] },
    { key: "medium", label: "Mittel",  emoji: "🟡", multipliers: [8,   4,   2,   1.5, 0.8, 0.5, 0.8, 1.5, 2,   4,   8  ] },
    { key: "high",   label: "Hoch",    emoji: "🔴", multipliers: [20,  8,   3,   1.5, 0.5, 0.2, 0.5, 1.5, 3,   8,   20 ] },
  ],
  maxWinCr: 0,
  announceBigWins: true,
  bigWinThreshold: 25000,
  showHistory: true,
  showLeaderboard: true,
  leaderboardSize: 10,
  particlesEnabled: true,
  trailLength: 7,
  glowIntensity: 1.8,
  animationSpeed: 1.0,
  autoBetEnabled: true,
};
