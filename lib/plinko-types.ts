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
  ballCostCr: number;
  rows: number;
  riskLevels: PlinkoRiskLevel[];
  maxWinCr: number;
  announceBigWins: boolean;
  bigWinThreshold: number;
  showHistory: boolean;
  showLeaderboard: boolean;
  leaderboardSize: number;
}

export const DEFAULT_PLINKO_CONFIG: PlinkoConfig = {
  enabled: true,
  hourlyBallLimit: 30,
  dailyBallLimit: 0,
  ballCostCr: 500,
  rows: 8,
  riskLevels: [
    { key: "low",    label: "Niedrig", emoji: "🟢", multipliers: [1.5, 1.3, 1.1, 0.9, 0.8, 0.9, 1.1, 1.3, 1.5] },
    { key: "medium", label: "Mittel",  emoji: "🟡", multipliers: [5,   2,   1.5, 0.8, 0.5, 0.8, 1.5, 2,   5  ] },
    { key: "high",   label: "Hoch",    emoji: "🔴", multipliers: [10,  3,   1.5, 0.5, 0.2, 0.5, 1.5, 3,   10 ] },
  ],
  maxWinCr: 0,
  announceBigWins: true,
  bigWinThreshold: 10000,
  showHistory: true,
  showLeaderboard: true,
  leaderboardSize: 10,
};
