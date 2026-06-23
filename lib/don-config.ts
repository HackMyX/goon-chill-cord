export interface DonConfig {
  enabled: boolean;
  /** Maximum flips per calendar day (UTC) per user. */
  dailyFlipLimit: number;
  /** Minimum cooldown between flips in seconds. 0 = no cooldown. */
  cooldownSec: number;
  /** Win probability 0.0–1.0. Default 0.5 = 50/50. */
  winChance: number;
  /** Minimum bet in credits. */
  minBet: number;
  /** Maximum bet in credits. null = limited only by user balance. */
  maxBet: number | null;
  /** Quick-select bet amounts shown as buttons. */
  quickAmounts: number[];
  /** Section heading shown to users. */
  sectionTitle: string;
  /** Section sub-text shown to users. */
  sectionSubtitle: string;
  /** Whether to show the remaining-spins bar/counter. */
  showRemainingSpins: boolean;
}

export const DEFAULT_DON_CONFIG: DonConfig = {
  enabled: true,
  dailyFlipLimit: 50,
  cooldownSec: 0,
  winChance: 0.5,
  minBet: 1,
  maxBet: null,
  quickAmounts: [100, 500, 1000, 5000, 10000],
  sectionTitle: "Double or Nothing",
  sectionSubtitle: "Riskiere deine Credits — 50/50 Chance auf das Doppelte",
  showRemainingSpins: true,
};
