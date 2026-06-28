// ─────────────────────────────────────────────────────────────────────────────
// Bonus-Card-Themes — wie ein aktiver Gutschein-/Spiel-Bonus als Container-Karte
// visualisiert wird. Client-safe (keine Imports), damit Admin-Editor (Vorschau)
// UND In-Game-Dock dasselbe nutzen. Pro Gutschein/Reward wählbar.
// ⚠️ Neues Theme? Hier ergänzen → taucht überall automatisch auf (Vorschau + Dock).
// ─────────────────────────────────────────────────────────────────────────────

export type BonusCardThemeId =
  | "aurora" | "legendary" | "holographic" | "glass" | "inferno"
  | "frost" | "cyber" | "void" | "toxic" | "royal" | "rgb";

/** Spezial-Wert: Theme automatisch aus der Seltenheit ableiten. */
export const AUTO_THEME = "auto" as const;
/** Spezial-Wert: Seltenheit automatisch aus der Stärke/Menge ableiten. */
export const AUTO_RARITY = "auto" as const;

export interface BonusCardTheme {
  id: BonusCardThemeId;
  label: string;
  /** Kurzbeschreibung fürs Admin-Dropdown. */
  blurb: string;
  /** Haupt-Hintergrund (CSS background-Wert, inkl. Verläufe). */
  background: string;
  /** Rahmenfarbe. */
  border: string;
  /** Glow/Schatten (box-shadow). */
  glow: string;
  /** Akzentfarbe (Icon, Zahlen, Fortschritt). */
  accent: string;
  /** Primäre Textfarbe. */
  text: string;
  /** Sekundäre Textfarbe. */
  sub: string;
  /** Optionaler Glanz-/Sheen-Overlay-Verlauf (animiert). */
  sheen?: string;
  /** Optionaler dekorativer Muster-Overlay (CSS background). */
  pattern?: string;
  /** Animierter schimmernder Verlauf (z.B. holographic). */
  animated?: boolean;
  /** Optionale CSS-Klasse für Spezial-Animation (z.B. RGB-Spektrum). */
  animationClass?: string;
  /** Emoji/Glyph als Default-Kartensymbol. */
  glyph: string;
}

export const BONUS_CARD_THEMES: Record<BonusCardThemeId, BonusCardTheme> = {
  aurora: {
    id: "aurora", label: "Aurora", blurb: "Violett-Cyan Nordlicht mit Glow",
    background: "linear-gradient(135deg, #1e1b4b 0%, #4c1d95 45%, #0e7490 100%)",
    border: "rgba(139,92,246,0.55)", glow: "0 0 32px -6px rgba(124,58,237,0.65), inset 0 1px 0 rgba(255,255,255,0.08)",
    accent: "#a78bfa", text: "#f5f3ff", sub: "#c4b5fd",
    sheen: "linear-gradient(120deg, transparent 30%, rgba(167,139,250,0.18) 50%, transparent 70%)",
    animated: true, glyph: "🌌",
  },
  legendary: {
    id: "legendary", label: "Legendär", blurb: "Gold-Schimmer, episch",
    background: "linear-gradient(135deg, #422006 0%, #854d0e 45%, #b45309 100%)",
    border: "rgba(251,191,36,0.6)", glow: "0 0 34px -6px rgba(245,158,11,0.7), inset 0 1px 0 rgba(255,255,255,0.12)",
    accent: "#fcd34d", text: "#fffbeb", sub: "#fde68a",
    sheen: "linear-gradient(120deg, transparent 35%, rgba(252,211,77,0.28) 50%, transparent 65%)",
    animated: true, glyph: "👑",
  },
  holographic: {
    id: "holographic", label: "Holographisch", blurb: "Irisierend, regenbogen-animiert",
    background: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 30%, #06b6d4 60%, #10b981 100%)",
    border: "rgba(255,255,255,0.45)", glow: "0 0 36px -4px rgba(139,92,246,0.6), inset 0 1px 0 rgba(255,255,255,0.25)",
    accent: "#ffffff", text: "#ffffff", sub: "rgba(255,255,255,0.85)",
    sheen: "linear-gradient(120deg, transparent 25%, rgba(255,255,255,0.35) 50%, transparent 75%)",
    animated: true, glyph: "✨",
  },
  glass: {
    id: "glass", label: "Glas", blurb: "Frosted Glassmorphism, dezent",
    background: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.18)",
    glow: "0 8px 32px -8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.14)",
    accent: "#e2e8f0", text: "#f8fafc", sub: "#cbd5e1", glyph: "💎",
  },
  inferno: {
    id: "inferno", label: "Inferno", blurb: "Feurige Glut, rot-orange",
    background: "radial-gradient(circle at 28% 18%, #7f1d1d 0%, #450a0a 55%, #18181b 100%)",
    border: "rgba(239,68,68,0.55)", glow: "0 0 32px -6px rgba(220,38,38,0.7), inset 0 1px 0 rgba(255,180,120,0.12)",
    accent: "#fb923c", text: "#fff7ed", sub: "#fdba74",
    sheen: "linear-gradient(120deg, transparent 35%, rgba(251,146,60,0.22) 50%, transparent 65%)",
    animated: true, glyph: "🔥",
  },
  frost: {
    id: "frost", label: "Frost", blurb: "Eiskristall, kühles Cyan-Blau",
    background: "linear-gradient(160deg, #0c4a6e 0%, #155e75 50%, #1e293b 100%)",
    border: "rgba(56,189,248,0.5)", glow: "0 0 30px -6px rgba(14,165,233,0.6), inset 0 1px 0 rgba(186,230,253,0.15)",
    accent: "#7dd3fc", text: "#f0f9ff", sub: "#bae6fd", glyph: "❄️",
  },
  cyber: {
    id: "cyber", label: "Cyber", blurb: "Neon-Grid, magenta-türkis",
    background: "linear-gradient(135deg, #18181b 0%, #3b0764 55%, #083344 100%)",
    border: "rgba(217,70,239,0.55)", glow: "0 0 32px -6px rgba(217,70,239,0.6), inset 0 1px 0 rgba(34,211,238,0.15)",
    accent: "#22d3ee", text: "#fdf4ff", sub: "#f0abfc",
    pattern: "linear-gradient(rgba(34,211,238,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(217,70,239,0.07) 1px, transparent 1px)",
    glyph: "🌐",
  },
  void: {
    id: "void", label: "Void", blurb: "Minimal, elegant, dunkel",
    background: "linear-gradient(180deg, #09090b 0%, #18181b 100%)",
    border: "rgba(255,255,255,0.12)", glow: "0 8px 28px -10px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)",
    accent: "#a1a1aa", text: "#fafafa", sub: "#a1a1aa", glyph: "🖤",
  },
  toxic: {
    id: "toxic", label: "Toxisch", blurb: "Radioaktives Lime-Grün",
    background: "radial-gradient(circle at 70% 15%, #365314 0%, #14532d 50%, #0a0a0a 100%)",
    border: "rgba(132,204,22,0.55)", glow: "0 0 32px -6px rgba(132,204,22,0.65), inset 0 1px 0 rgba(190,242,100,0.12)",
    accent: "#a3e635", text: "#f7fee7", sub: "#bef264", glyph: "☢️",
  },
  royal: {
    id: "royal", label: "Königlich", blurb: "Tiefes Purpur mit Gold",
    background: "linear-gradient(135deg, #2e1065 0%, #4c1d95 50%, #1e1b4b 100%)",
    border: "rgba(251,191,36,0.45)", glow: "0 0 32px -6px rgba(126,34,206,0.6), inset 0 1px 0 rgba(252,211,77,0.15)",
    accent: "#fcd34d", text: "#faf5ff", sub: "#ddd6fe",
    sheen: "linear-gradient(120deg, transparent 35%, rgba(252,211,77,0.18) 50%, transparent 65%)",
    animated: true, glyph: "♛",
  },
  rgb: {
    id: "rgb", label: "RGB (Ultra)", blurb: "Animiertes RGB-Spektrum — höchste Stufe",
    // Animierter Regenbogen-Verlauf via CSS-Klasse `bonus-rgb-bg` (globals.css).
    background: "linear-gradient(120deg, #ff0080, #ff8c00, #ffe600, #00ff8c, #00cfff, #8a2be2, #ff0080)",
    border: "rgba(255,255,255,0.6)", glow: "0 0 40px -4px rgba(255,255,255,0.45), 0 0 60px -10px rgba(139,92,246,0.5)",
    accent: "#ffffff", text: "#ffffff", sub: "rgba(255,255,255,0.92)",
    sheen: "linear-gradient(120deg, transparent 25%, rgba(255,255,255,0.4) 50%, transparent 75%)",
    animated: true, glyph: "🌈", animationClass: "bonus-rgb-bg",
  },
};

export const BONUS_CARD_THEME_LIST: BonusCardTheme[] = Object.values(BONUS_CARD_THEMES);
export const DEFAULT_BONUS_CARD_THEME: BonusCardThemeId = "aurora";

export function getBonusCardTheme(id?: string | null): BonusCardTheme {
  return (id && BONUS_CARD_THEMES[id as BonusCardThemeId]) || BONUS_CARD_THEMES[DEFAULT_BONUS_CARD_THEME];
}

// ── Seltenheit (Akzent-Ribbon auf der Karte, unabhängig vom Theme) ─────────────

export type BonusCardRarity = "normal" | "selten" | "episch" | "mythisch" | "ultra";

export interface RarityStyle {
  id: BonusCardRarity;
  label: string;
  ribbon: string;   // Hintergrund des Ribbons
  ring: string;     // optionaler Ring/Outline
  text: string;
}

export const BONUS_CARD_RARITIES: Record<BonusCardRarity, RarityStyle> = {
  normal:   { id: "normal",   label: "Normal",   ribbon: "linear-gradient(90deg,#52525b,#71717a)", ring: "rgba(161,161,170,0.5)", text: "#fafafa" },
  selten:   { id: "selten",   label: "Selten",   ribbon: "linear-gradient(90deg,#0369a1,#0ea5e9)", ring: "rgba(56,189,248,0.6)",  text: "#f0f9ff" },
  episch:   { id: "episch",   label: "Episch",   ribbon: "linear-gradient(90deg,#7e22ce,#a855f7)", ring: "rgba(168,85,247,0.6)",  text: "#faf5ff" },
  mythisch: { id: "mythisch", label: "Mythisch", ribbon: "linear-gradient(90deg,#be185d,#ec4899)", ring: "rgba(236,72,153,0.6)",  text: "#fdf2f8" },
  ultra:    { id: "ultra",    label: "Ultra",    ribbon: "linear-gradient(90deg,#b45309,#fbbf24)", ring: "rgba(251,191,36,0.65)", text: "#fffbeb" },
};

export const BONUS_CARD_RARITY_LIST: RarityStyle[] = Object.values(BONUS_CARD_RARITIES);
export const DEFAULT_BONUS_CARD_RARITY: BonusCardRarity = "selten";

export function getBonusCardRarity(id?: string | null): RarityStyle {
  return (id && BONUS_CARD_RARITIES[id as BonusCardRarity]) || BONUS_CARD_RARITIES[DEFAULT_BONUS_CARD_RARITY];
}

// ── Auto: Seltenheit aus Stärke/Menge + Theme aus Seltenheit ───────────────────

/** Stärke→Seltenheit-Stufe. Aufsteigend; das letzte Tier mit minAmount<=amount gewinnt. */
export interface RarityTier { rarity: BonusCardRarity; minAmount: number; }

/** Standard-Stufen (überschreibbar). Anlehnung an „0-10 normal, 10-20 selten, …". */
export const DEFAULT_RARITY_TIERS: RarityTier[] = [
  { rarity: "normal",   minAmount: 0 },
  { rarity: "selten",   minAmount: 10 },
  { rarity: "episch",   minAmount: 20 },
  { rarity: "mythisch", minAmount: 35 },
  { rarity: "ultra",    minAmount: 50 },
];

/** Welche Seltenheit ergibt eine Menge/Stärke? */
export function rarityFromAmount(amount: number, tiers: RarityTier[] = DEFAULT_RARITY_TIERS): BonusCardRarity {
  let result: BonusCardRarity = "normal";
  for (const t of [...tiers].sort((a, b) => a.minAmount - b.minAmount)) {
    if (amount >= t.minAmount) result = t.rarity;
  }
  return result;
}

/** Auto-Theme je Seltenheit (Ultra = RGB-Spektrum). */
export const RARITY_THEME: Record<BonusCardRarity, BonusCardThemeId> = {
  normal:   "void",
  selten:   "frost",
  episch:   "royal",
  mythisch: "aurora",
  ultra:    "rgb",
};

/** Effektive Seltenheit: "auto"/leer → aus der Menge ableiten, sonst die gesetzte. */
export function resolveCardRarity(rarity: string | null | undefined, amount: number, tiers?: RarityTier[]): BonusCardRarity {
  if (rarity && rarity !== AUTO_RARITY && rarity in BONUS_CARD_RARITIES) return rarity as BonusCardRarity;
  return rarityFromAmount(amount, tiers);
}

/** Effektives Theme: "auto"/leer → aus der (aufgelösten) Seltenheit, sonst das gesetzte. */
export function resolveCardTheme(theme: string | null | undefined, resolvedRarity: BonusCardRarity): BonusCardTheme {
  if (theme && theme !== AUTO_THEME && theme in BONUS_CARD_THEMES) return BONUS_CARD_THEMES[theme as BonusCardThemeId];
  return BONUS_CARD_THEMES[RARITY_THEME[resolvedRarity]];
}
