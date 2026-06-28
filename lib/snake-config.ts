export type SnakeMode = "x1" | "x2" | "grind" | "farm";

/** Per-mode visual theme — every colour is a hex value so the admin can edit
 * it with a colour picker. The engine derives grid/glow/particle tints from
 * these at runtime. */
export interface SnakeModeTheme {
  bg: string;          // Spielfeld-Hintergrund
  gridColor: string;   // Gitterlinien-Grundton
  snakeHead: string;   // Schlangenkopf
  snakeTail: string;   // Schlangenschwanz (Verlauf-Ende)
  snakeGlow: string;   // Schlangen-Glow / Aura
  appleColor: string;  // normaler Apfel
  appleGlow: string;   // Apfel-Glow
  goldenColor: string; // goldener Apfel
  borderColor: string; // Rahmen / Akzent
}

export const DEFAULT_THEME_X1: SnakeModeTheme = {
  bg: "#030a06", gridColor: "#10b981", snakeHead: "#34d399", snakeTail: "#064e3b",
  snakeGlow: "#10b981", appleColor: "#ef4444", appleGlow: "#ef4444", goldenColor: "#fbbf24", borderColor: "#10b981",
};
export const DEFAULT_THEME_X2: SnakeModeTheme = {
  bg: "#020510", gridColor: "#06b6d4", snakeHead: "#22d3ee", snakeTail: "#0c4a6e",
  snakeGlow: "#06b6d4", appleColor: "#eab308", appleGlow: "#fbbf24", goldenColor: "#f59e0b", borderColor: "#06b6d4",
};
export const DEFAULT_THEME_GRIND: SnakeModeTheme = {
  bg: "#080503", gridColor: "#78350f", snakeHead: "#fbbf24", snakeTail: "#92400e",
  snakeGlow: "#f59e0b", appleColor: "#c084fc", appleGlow: "#a855f7", goldenColor: "#f97316", borderColor: "#f59e0b",
};
export const DEFAULT_THEME_FARM: SnakeModeTheme = {
  bg: "#030508", gridColor: "#8b5cf6", snakeHead: "#a78bfa", snakeTail: "#2e1065",
  snakeGlow: "#8b5cf6", appleColor: "#34d399", appleGlow: "#10b981", goldenColor: "#fbbf24", borderColor: "#8b5cf6",
};

export interface SnakeModeConfig {
  /** Mode display name on the selection card (admin-editable). */
  label: string;
  /** Short tagline under the name on the card (admin-editable). */
  sublabel: string;
  /** Per-mode colours (admin-editable). */
  theme: SnakeModeTheme;
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
  /** A golden apple spawns after EXACTLY this many normal apples are eaten
   *  (deterministic, per mode, decoupled from the bonus system). Min 1.
   *  An equipped snake_gold_apple_rate ability shortens this interval
   *  deterministically — it never injects random extra spawns. */
  goldenAppleEveryN: number;
  goldenAppleCrMultiplier: number;
  goldenAppleLifeApples: number;
  goldenAppleTailLoss: number;       // snake blocks removed when golden apple eaten (0 = none)
  goldenAppleSpeedReduction: number; // ms added to speed interval after eating golden apple (0 = no change)
  startLength: number;
  particlesEnabled: boolean;
  leaderboardSize: number;
  // ── Music dynamics (per mode) ──────────────────────────────────────────────
  /** Master switch: does this mode drive the background-music tempo at all? */
  musicDynamicsEnabled: boolean;
  /** Max tempo multiplier at full intensity (e.g. 1.45 = up to +45% speed, 2 = 2×). */
  musicTempoMax: number;
  /** Intensity gained PER APPLE eaten (0 = use the speed-based curve instead). e.g.
   *  0.02 → music reaches full intensity at 50 apples. This is the "pro Apfel" control. */
  musicIntensityPerApple: number;
  /** Extra intensity spike when a golden apple / bonus is collected (0–1). */
  musicEventSpike: number;
  /** How long (ms) the event spike takes to fade back out. */
  musicEventSpikeMs: number;
}

export interface SnakeGrindConfig extends SnakeModeConfig {
  shrinkEveryN: number;
  minBoardSize: number;
  bonusCrPerShrink: number;
  /** Static red warning border appears when this many apples remain before the next
   *  shrink (no blinking). 0 = never show the static warning border. */
  shrinkBorderWarnApples: number;
  /** Border + counter start PULSING (blinking) when this many apples remain before the
   *  next shrink. Should be ≤ shrinkBorderWarnApples. 0 = never blink. */
  shrinkBlinkApples: number;
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
  label: "Classic",
  sublabel: "Der Klassiker — ruhiges Tempo, fairer Einstieg.",
  theme: DEFAULT_THEME_X1,
  enabled: true,
  boardSize: 20,
  creditsPerApple: 12,
  initialSpeedMs: 150,
  speedIncreasePerApple: 0.6,
  minSpeedMs: 70,
  wallWrap: true,
  dailyCrLimit: 20000,
  dailyGameLimit: null,
  bonusEveryN: 10,
  bonusCrFlat: 80,
  bonusMultiplierApples: 5,
  goldenAppleEnabled: true,
  goldenAppleEveryN: 5,
  goldenAppleCrMultiplier: 5,
  goldenAppleLifeApples: 8,
  goldenAppleTailLoss: 0,
  goldenAppleSpeedReduction: 0,
  startLength: 3,
  particlesEnabled: true,
  leaderboardSize: 20,
  musicDynamicsEnabled: true,
  musicTempoMax: 1.35,
  musicIntensityPerApple: 0.007,
  musicEventSpike: 0.3,
  musicEventSpikeMs: 700,
};

export const DEFAULT_X2_CONFIG: SnakeModeConfig = {
  label: "Turbo",
  sublabel: "Doppeltes Tempo, doppelte Credits — für Profis.",
  theme: DEFAULT_THEME_X2,
  enabled: true,
  boardSize: 20,
  creditsPerApple: 28,
  initialSpeedMs: 105,
  speedIncreasePerApple: 0.55,
  minSpeedMs: 55,
  wallWrap: false,
  dailyCrLimit: 40000,
  dailyGameLimit: null,
  bonusEveryN: 10,
  bonusCrFlat: 150,
  bonusMultiplierApples: 5,
  goldenAppleEnabled: true,
  goldenAppleEveryN: 5,
  goldenAppleCrMultiplier: 5,
  goldenAppleLifeApples: 6,
  goldenAppleTailLoss: 0,
  goldenAppleSpeedReduction: 0,
  startLength: 3,
  particlesEnabled: true,
  leaderboardSize: 20,
  musicDynamicsEnabled: true,
  musicTempoMax: 1.45,
  musicIntensityPerApple: 0.011,
  musicEventSpike: 0.32,
  musicEventSpikeMs: 800,
};

export const DEFAULT_GRIND_CONFIG: SnakeGrindConfig = {
  label: "Grind",
  sublabel: "Die Arena schrumpft mit jedem Apfel. Nervenkrieg.",
  theme: DEFAULT_THEME_GRIND,
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
  goldenAppleEveryN: 6,
  goldenAppleCrMultiplier: 4,
  goldenAppleLifeApples: 15,
  goldenAppleTailLoss: 0,
  goldenAppleSpeedReduction: 0,
  startLength: 3,
  particlesEnabled: true,
  leaderboardSize: 20,
  musicDynamicsEnabled: true,
  musicTempoMax: 1.4,
  musicIntensityPerApple: 0.018,
  musicEventSpike: 0.3,
  musicEventSpikeMs: 700,
  shrinkEveryN: 10,
  minBoardSize: 8,
  bonusCrPerShrink: 50,
  shrinkBorderWarnApples: 3,
  shrinkBlinkApples: 1,
};

export const DEFAULT_FARM_CONFIG: SnakeModeConfig = {
  label: "Endless",
  sublabel: "Kein Wachstum, kein Risiko — entspanntes Farmen.",
  theme: DEFAULT_THEME_FARM,
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
  goldenAppleEveryN: 5,
  goldenAppleCrMultiplier: 1,
  goldenAppleLifeApples: 0,
  goldenAppleTailLoss: 0,
  goldenAppleSpeedReduction: 0,
  startLength: 5,
  particlesEnabled: true,
  leaderboardSize: 20,
  musicDynamicsEnabled: false,
  musicTempoMax: 1.0,
  musicIntensityPerApple: 0,
  musicEventSpike: 0,
  musicEventSpikeMs: 700,
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
