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

// ─────────────────────────────────────────────────────────────────────────────
// Badges (pre-start info pills) — fully admin-editable per mode
// ─────────────────────────────────────────────────────────────────────────────

/** Colour preset for a badge. Mapped to fixed Tailwind classes in BADGE_COLORS
 *  (never build dynamic class strings → Tailwind purge would drop them). */
export type SnakeBadgeColor =
  | "emerald" | "amber" | "yellow" | "red" | "cyan" | "violet"
  | "rose" | "sky" | "lime" | "orange" | "fuchsia" | "zinc";

/** A single pre-start info pill. `icon` is a free emoji/short text, `label`
 *  supports template tokens like `{creditsPerApple}` (see formatSnakeText). */
export interface SnakeBadge {
  icon: string;
  label: string;
  color: SnakeBadgeColor;
}

/** Fixed Tailwind class sets per badge colour (client-safe, purge-proof). */
export const BADGE_COLORS: Record<SnakeBadgeColor, { border: string; bg: string; text: string }> = {
  emerald: { border: "border-emerald-500/30", bg: "bg-emerald-500/10", text: "text-emerald-300" },
  amber:   { border: "border-amber-400/30",   bg: "bg-amber-500/10",   text: "text-amber-300" },
  yellow:  { border: "border-yellow-400/30",  bg: "bg-yellow-500/10",  text: "text-yellow-300" },
  red:     { border: "border-red-400/30",     bg: "bg-red-500/10",     text: "text-red-300" },
  cyan:    { border: "border-cyan-400/30",    bg: "bg-cyan-500/10",    text: "text-cyan-300" },
  violet:  { border: "border-violet-400/30",  bg: "bg-violet-500/10",  text: "text-violet-300" },
  rose:    { border: "border-rose-400/30",    bg: "bg-rose-500/10",    text: "text-rose-300" },
  sky:     { border: "border-sky-400/30",     bg: "bg-sky-500/10",     text: "text-sky-300" },
  lime:    { border: "border-lime-400/30",    bg: "bg-lime-500/10",    text: "text-lime-300" },
  orange:  { border: "border-orange-400/30",  bg: "bg-orange-500/10",  text: "text-orange-300" },
  fuchsia: { border: "border-fuchsia-400/30", bg: "bg-fuchsia-500/10", text: "text-fuchsia-300" },
  zinc:    { border: "border-zinc-400/20",    bg: "bg-zinc-500/10",    text: "text-zinc-300" },
};

export const BADGE_COLOR_KEYS = Object.keys(BADGE_COLORS) as SnakeBadgeColor[];

/** Replace `{token}` placeholders in admin-editable strings. Unknown tokens are
 *  left verbatim so a typo is visible instead of silently vanishing. */
export function formatSnakeText(tpl: string, vars: Record<string, string | number>): string {
  if (!tpl) return "";
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export interface SnakeModeConfig {
  /** Mode display name on the selection card (admin-editable). */
  label: string;
  /** Short tagline under the name on the card (admin-editable). */
  sublabel: string;
  /** Start button label on the idle screen (admin-editable, e.g. "Grind starten"). */
  startButtonLabel: string;
  /** Pre-start info pills (admin-editable: add/remove/reorder). */
  badges: SnakeBadge[];
  /** Toast template shown when a bonus triggers. Tokens: {bonusCrFlat} {comboInfo} {bonusEveryN}. */
  bonusMessage: string;
  /** Toast template shown when a golden apple is eaten. Tokens: {goldenMult} {creditsPerApple}. */
  goldenMessage: string;
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
  // ── Music dynamics (per mode) — STEPPED & HELD ─────────────────────────────
  // The music tempo is a pure step function of apples eaten: each apple raises
  // the tempo by `musicTempoPerApple` and it HOLDS there until the next apple,
  // capped at `musicTempoMax`. No per-frame drift, no spikes that decay back.
  /** Master switch: does this mode drive the background-music tempo at all? */
  musicDynamicsEnabled: boolean;
  /** Hard ceiling for the tempo multiplier (e.g. 1.45 = never faster than +45%, 2 = 2×). */
  musicTempoMax: number;
  /** Tempo increase added PER APPLE eaten, as a multiplier step (e.g. 0.01 = +1%
   *  per apple → reaches +45% after 45 apples, then holds at musicTempoMax). */
  musicTempoPerApple: number;
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

/** All shared (non per-mode) UI strings, fully admin-editable. Many support
 *  template tokens — see the comment on each field. */
export interface SnakeTexts {
  // Header
  backLabel: string;            // "Zurück"
  crChip: string;               // "{creditsPerApple} CR / Apfel"
  // HUD labels
  hudScore: string;             // "Score"
  hudEarned: string;            // "Verdient"
  hudNextBonus: string;         // "Nächster Bonus"
  hudNextBonusNow: string;      // "JETZT!"
  hudNextBonusAt: string;       // "Apfel {apple}"
  hudShrinkIn: string;          // "Shrink in"
  hudShrinkValue: string;       // "{apples} Äpfel"
  hudComboLabel: string;        // "2× COMBO"
  hudDailyRemaining: string;    // "Heute noch"
  hudDailyCrValue: string;      // "{cr} CR"
  hudGamesRemaining: string;    // "{remaining} / {limit} Spiele übrig"
  hudGamesToday: string;        // "Spiele heute"
  hudGamesTodayValue: string;   // "{remaining} / {limit} übrig"
  abortLabel: string;           // "Abbrechen"
  // Idle overlay
  controlsHintDesktop: string;  // "← → ↑ ↓ oder WASD · Swipe auf Handy"
  controlsHintMobile: string;   // "Swipe oder D-Pad zum Steuern"
  dailyCrLimitReached: string;  // "CR-Tageslimit erreicht"
  dailyGameLimitReached: string;// "Tageslimit: {limit} Spiele gespielt — komm morgen wieder!"
  // Dead overlay
  gameOverTitle: string;        // "Game Over"
  gameOverStats: string;        // "{score} Äpfel · {credits} CR"
  shrinkSurvived: string;       // "{count}× Shrink überlebt!"
  saving: string;               // "Wird gespeichert…"
  newRecord: string;            // "Neuer Rekord! (vorher: {previousBest})"
  earnedLine: string;           // "+{credits} CR"
  playAgain: string;            // "Nochmal"
  // Leaderboard
  leaderboardTitle: string;     // "Highscores"
  leaderboardEmpty: string;     // "Noch keine Scores"
  leaderboardYou: string;       // "Du"
  myBestLabel: string;          // "Dein Best"
  // Floating toasts (grind shrink warnings)
  shrinkWarning: string;        // "⚠ ACHTUNG — Wände schließen sich in {apples} Apfel{plural}!"
  shrinkLastWarning: string;    // "🔴 LETZTE WARNUNG — NÄCHSTER APFEL SHRINK!"
}

export const DEFAULT_SNAKE_TEXTS: SnakeTexts = {
  backLabel: "Zurück",
  crChip: "{creditsPerApple} CR / Apfel",
  hudScore: "Score",
  hudEarned: "Verdient",
  hudNextBonus: "Nächster Bonus",
  hudNextBonusNow: "JETZT!",
  hudNextBonusAt: "Apfel {apple}",
  hudShrinkIn: "Shrink in",
  hudShrinkValue: "{apples} Äpfel",
  hudComboLabel: "2× COMBO",
  hudDailyRemaining: "Heute noch",
  hudDailyCrValue: "{cr} CR",
  hudGamesRemaining: "{remaining} / {limit} Spiele übrig",
  hudGamesToday: "Spiele heute",
  hudGamesTodayValue: "{remaining} / {limit} übrig",
  abortLabel: "Abbrechen",
  controlsHintDesktop: "← → ↑ ↓ oder WASD · Swipe auf Handy",
  controlsHintMobile: "Swipe oder D-Pad zum Steuern",
  dailyCrLimitReached: "CR-Tageslimit erreicht",
  dailyGameLimitReached: "Tageslimit: {limit} Spiele gespielt — komm morgen wieder!",
  gameOverTitle: "Game Over",
  gameOverStats: "{score} Äpfel · {credits} CR",
  shrinkSurvived: "{count}× Shrink überlebt!",
  saving: "Wird gespeichert…",
  newRecord: "Neuer Rekord! (vorher: {previousBest})",
  earnedLine: "+{credits} CR",
  playAgain: "Nochmal",
  leaderboardTitle: "Highscores",
  leaderboardEmpty: "Noch keine Scores",
  leaderboardYou: "Du",
  myBestLabel: "Dein Best",
  shrinkWarning: "⚠ ACHTUNG — Wände schließen sich in {apples} Apfel{plural}!",
  shrinkLastWarning: "🔴 LETZTE WARNUNG — NÄCHSTER APFEL SHRINK!",
};

export interface SnakeConfig {
  enabled: boolean;
  sectionTitle: string;
  sectionSubtitle: string;
  texts: SnakeTexts;
  x1: SnakeModeConfig;
  x2: SnakeModeConfig;
  grind: SnakeGrindConfig;
  farm: SnakeModeConfig;
}

export const DEFAULT_X1_CONFIG: SnakeModeConfig = {
  label: "Classic",
  sublabel: "Der Klassiker — ruhiges Tempo, fairer Einstieg.",
  startButtonLabel: "Spielen",
  badges: [
    { icon: "🪙", label: "{creditsPerApple} CR/Apfel", color: "emerald" },
    { icon: "🎁", label: "Bonus alle {bonusEveryN} Äpfel", color: "amber" },
    { icon: "⭐", label: "Goldener Apfel ×{goldenMult}", color: "yellow" },
  ],
  bonusMessage: "🎉 BONUS! +{bonusCrFlat} CR{comboInfo}",
  goldenMessage: "⭐ Goldener Apfel! ×{goldenMult} CR",
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
  musicTempoMax: 1.45,
  musicTempoPerApple: 0.01,
};

export const DEFAULT_X2_CONFIG: SnakeModeConfig = {
  label: "Turbo",
  sublabel: "Doppeltes Tempo, doppelte Credits — für Profis.",
  startButtonLabel: "Turbo starten",
  badges: [
    { icon: "🪙", label: "{creditsPerApple} CR/Apfel", color: "cyan" },
    { icon: "🎁", label: "Bonus alle {bonusEveryN} Äpfel", color: "amber" },
    { icon: "⭐", label: "Goldener Apfel ×{goldenMult}", color: "yellow" },
  ],
  bonusMessage: "🎉 BONUS! +{bonusCrFlat} CR{comboInfo}",
  goldenMessage: "⭐ Goldener Apfel! ×{goldenMult} CR",
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
  musicTempoMax: 1.6,
  musicTempoPerApple: 0.015,
};

export const DEFAULT_GRIND_CONFIG: SnakeGrindConfig = {
  label: "Grind",
  sublabel: "Die Arena schrumpft mit jedem Apfel. Nervenkrieg.",
  startButtonLabel: "Grind starten",
  badges: [
    { icon: "🪙", label: "{creditsPerApple} CR/Apfel", color: "amber" },
    { icon: "🎁", label: "Bonus alle {bonusEveryN} Äpfel", color: "yellow" },
    { icon: "⭐", label: "Goldener Apfel ×{goldenMult}", color: "orange" },
    { icon: "🔥", label: "Shrink alle {shrinkEveryN} Äpfel", color: "red" },
  ],
  bonusMessage: "🎉 BONUS! +{bonusCrFlat} CR{comboInfo}",
  goldenMessage: "⭐ Goldener Apfel! ×{goldenMult} CR",
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
  musicTempoMax: 1.5,
  musicTempoPerApple: 0.012,
  shrinkEveryN: 10,
  minBoardSize: 8,
  bonusCrPerShrink: 50,
  shrinkBorderWarnApples: 3,
  shrinkBlinkApples: 1,
};

export const DEFAULT_FARM_CONFIG: SnakeModeConfig = {
  label: "Endless",
  sublabel: "Kein Wachstum, kein Risiko — entspanntes Farmen.",
  startButtonLabel: "Spielen",
  badges: [
    { icon: "🪙", label: "{creditsPerApple} CR/Apfel", color: "violet" },
  ],
  bonusMessage: "🎉 BONUS! +{bonusCrFlat} CR{comboInfo}",
  goldenMessage: "⭐ Goldener Apfel! ×{goldenMult} CR",
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
  musicTempoPerApple: 0,
};

export const DEFAULT_SNAKE_CONFIG: SnakeConfig = {
  enabled: true,
  sectionTitle: "Snake",
  sectionSubtitle: "Sammle Äpfel, verdiene Credits",
  texts: DEFAULT_SNAKE_TEXTS,
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
