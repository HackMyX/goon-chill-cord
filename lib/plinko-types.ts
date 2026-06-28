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
  hourlyBallLimit: 50,
  dailyBallLimit: 0,
  minBetCr: 500,
  maxBetCr: 0,
  quickBetAmounts: [500, 2000, 10000, 50000, 250000],
  rows: 12,
  // 12 rows → 13 buckets. Multipliers are indexed by the binomial bucket
  // (center is FAR more likely than the edges: P(center)=924/4096, P(edge)=1/4096).
  // These arrays are tuned so the binomial-weighted RTP is ~94–96 % (a healthy
  // 4–6 % house edge), with variance rising low→high. NEVER set a center value
  // ≥1 without re-checking RTP — the center carries almost all the weight.
  riskLevels: [
    { key: "low",    label: "Niedrig", emoji: "🟢", multipliers: [4,   1.9, 1.4, 1.15, 1.0, 0.9, 0.8, 0.9, 1.0, 1.15, 1.4, 1.9, 4  ] },
    { key: "medium", label: "Mittel",  emoji: "🟡", multipliers: [25,  6,   2.6, 1.5,  1.1, 0.7, 0.5, 0.7, 1.1, 1.5,  2.6, 6,   25 ] },
    { key: "high",   label: "Hoch",    emoji: "🔴", multipliers: [120, 22,  6,   2.5,  0.6, 0.3, 0.2, 0.3, 0.6, 2.5,  6,   22,  120] },
  ],
  maxWinCr: 0,
  announceBigWins: true,
  bigWinThreshold: 25000,
  showHistory: true,
  showLeaderboard: true,
  leaderboardSize: 10,
  particlesEnabled: true,
  trailLength: 8,
  glowIntensity: 1.8,
  animationSpeed: 1.0,
  autoBetEnabled: true,
};
