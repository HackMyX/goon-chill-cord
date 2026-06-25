export interface DonUpgradeTier {
  tier: number;
  name: string;
  bonusHourlyFlips: number;
  costCr: number;
}

export interface DonConfig {
  enabled: boolean;
  /** Maximum flips per calendar day (UTC) per user. null = no daily limit. */
  dailyFlipLimit: number | null;
  /** Maximum flips per rolling 60-minute window. null = no hourly limit. */
  hourlyFlipLimit: number | null;
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
  /** When true, an "ALL IN" quick-select button lets players stake their full balance. */
  allowAllIn: boolean;
  /** Whether users can purchase hourly-flip upgrades. */
  upgradeEnabled: boolean;
  /** Upgrade tiers that grant bonus hourly flips, purchasable with CR. */
  upgradeTiers: DonUpgradeTier[];
}

export const DEFAULT_UPGRADE_TIERS: DonUpgradeTier[] = [
  { tier: 1, name: "Bronze-Upgrade", bonusHourlyFlips: 5,  costCr: 1000  },
  { tier: 2, name: "Silber-Upgrade", bonusHourlyFlips: 10, costCr: 2500  },
  { tier: 3, name: "Gold-Upgrade",   bonusHourlyFlips: 15, costCr: 5000  },
  { tier: 4, name: "Platin-Upgrade", bonusHourlyFlips: 20, costCr: 10000 },
];

export const DEFAULT_DON_CONFIG: DonConfig = {
  enabled: true,
  dailyFlipLimit: 50,
  hourlyFlipLimit: null,
  cooldownSec: 0,
  winChance: 0.5,
  minBet: 1,
  maxBet: null,
  quickAmounts: [100, 500, 1000, 5000, 10000],
  sectionTitle: "Double or Nothing",
  sectionSubtitle: "Riskiere deine Credits — 50/50 Chance auf das Doppelte",
  showRemainingSpins: true,
  allowAllIn: false,
  upgradeEnabled: false,
  upgradeTiers: DEFAULT_UPGRADE_TIERS,
};
