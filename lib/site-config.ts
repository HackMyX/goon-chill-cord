import { DEFAULT_SITE_LOGO_ICON } from "@/lib/site-logo-icons";

export type HomepageCardId =
  | "shop" | "cases" | "garderobe" | "world" | "snake" | "mine"
  | "don" | "community" | "trading" | "auctions" | "surveys" | "battlepass" | "plinko";

export interface HomepageConfig {
  heroTitle: string;
  heroSubtitle: string;
  showStats: boolean;
  showLeaderboard: boolean;
  showFeatureCards: boolean;
  /** Ordered list of ALL card IDs — both enabled and disabled. */
  cardOrder: HomepageCardId[];
  /** IDs that are currently hidden from the homepage. */
  disabledCards: HomepageCardId[];
  announcementEnabled: boolean;
  announcementText: string;
  announcementColor: "purple" | "amber" | "sky" | "emerald" | "red";
  /** Show streak leaderboard tab alongside credits leaderboard */
  showStreakLeaderboard: boolean;
  /** Visual style for leaderboards: "podium" = top-3 podium + list, "list" = compact list only */
  leaderboardStyle: "podium" | "list";
}

export const ALL_HOMEPAGE_CARDS: HomepageCardId[] = [
  "shop", "cases", "garderobe", "world", "snake", "mine",
  "don", "community", "trading", "auctions", "surveys", "battlepass", "plinko",
];

export const DEFAULT_HOMEPAGE_CONFIG: HomepageConfig = {
  heroTitle: "",
  heroSubtitle: "Tritt der Community bei, sammle Credits, öffne Cases und levele deinen Charakter hoch.",
  showStats: true,
  showLeaderboard: true,
  showFeatureCards: true,
  cardOrder: [...ALL_HOMEPAGE_CARDS],
  disabledCards: [],
  announcementEnabled: false,
  announcementText: "",
  announcementColor: "purple",
  showStreakLeaderboard: true,
  leaderboardStyle: "podium",
};

export interface SiteConfig {
  siteName: string;
  /** Takes priority over `logoIconName` when set — a custom hosted image URL. */
  logoUrl: string | null;
  /** One of lib/site-logo-icons.ts' SITE_LOGO_ICONS keys. */
  logoIconName: string;
  /** Credits awarded to a new user upon first signup. */
  startingCredits: number;
  /** Currency label shown after every credit amount sitewide — e.g. "CR", "Coins". */
  currencyName: string;
  /** Weapon-damage stat abbreviation — e.g. "DMG", "ATK". */
  damageLabel: string;
  /** Armor stat abbreviation — e.g. "AP", "DEF". */
  armorLabel: string;
  /** Custom display names for the four rarity tiers. */
  rarityLabels: { normal: string; selten: string; mythisch: string; ultra: string };
  /** Display labels for the three perk types. */
  perkLabels: { speed: string; jump: string; regen: string };
  /** Ordered list of right-side TopBar slot keys. */
  topbarRightSlots: string[];
  /** Current site version string shown as badge in the TopBar. */
  siteVersion: string;
  /** Whether to show button labels in the TopBar (icon + text vs icon only). */
  topbarShowLabels: boolean;
  /** Visual style of TopBar buttons: 'icon' = circle icon only, 'pill' = icon + label. */
  topbarButtonStyle: "icon" | "pill";
  /** Full homepage / landing page configuration. */
  homepageConfig: HomepageConfig;
  /** Max number of "Prio-Badges" a player can pin globally (default 2). */
  maxPrioBadges: number;
}

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  siteName: "Goon'n Chill Cord",
  logoUrl: null,
  logoIconName: DEFAULT_SITE_LOGO_ICON,
  startingCredits: 20000,
  currencyName: "CR",
  damageLabel: "DMG",
  armorLabel: "AP",
  rarityLabels: { normal: "Normal", selten: "Selten", mythisch: "Mythisch", ultra: "Ultra" },
  perkLabels: { speed: "Tempo", jump: "Sprung", regen: "Regen" },
  topbarRightSlots: ["games", "shop", "auctions", "trading", "community", "wardrobe", "notifications", "profile", "logout"],
  siteVersion: "v1.0.0",
  topbarShowLabels: false,
  topbarButtonStyle: "icon",
  homepageConfig: DEFAULT_HOMEPAGE_CONFIG,
  maxPrioBadges: 2,
};

export const DEFAULT_TOPBAR_RIGHT_SLOTS = [
  "games", "shop", "auctions", "trading", "community", "surveys", "wardrobe", "notifications", "profile", "logout",
] as const;

export type TopbarSlotKey = typeof DEFAULT_TOPBAR_RIGHT_SLOTS[number];
