// ── Theming Engine — Types & Catalog ────────────────────────────────────────
// A site-wide visual theme re-maps the purple brand scale + semantic tokens +
// ambient glow via <html data-theme="KEY">. The CSS lives in app/globals.css
// (:root[data-theme="KEY"] blocks). "default" = no data-theme attribute.

export type ThemeKey =
  | "default"
  | "cyber"
  | "matrix"
  | "sunset"
  | "vaporwave"
  | "bloodmoon"
  | "ice";

export interface ThemeDef {
  key: ThemeKey;
  /** German display name */
  label: string;
  /** German one-line description for tooltips/cards */
  description: string;
  /** Representative brand color (oklch/hex) — used for the preview swatch */
  brand: string;
  /** Background color — used for the preview card backdrop */
  bg: string;
  /** Secondary accent — used for the preview swatch gradient */
  accent: string;
}

// NOTE: keep keys in sync with the :root[data-theme="…"] blocks in globals.css.
export const THEME_CATALOG: ThemeDef[] = [
  {
    key: "default",
    label: "Goon Purple",
    description: "Das Original — violettes Neon auf tiefem Schwarz. Der Signature-Look.",
    brand: "oklch(62.7% 0.265 303.9)",
    bg: "#030305",
    accent: "#3B82F6",
  },
  {
    key: "cyber",
    label: "Cyber Neon",
    description: "Eiskaltes Cyan-Blau, Tron-Vibes. Tech, schnell, elektrisch.",
    brand: "oklch(62.7% 0.265 195)",
    bg: "#02050a",
    accent: "#22d3ee",
  },
  {
    key: "matrix",
    label: "Matrix",
    description: "Giftgrünes Terminal-Grün auf Schwarz. Hacker-Ästhetik.",
    brand: "oklch(62.7% 0.252 150)",
    bg: "#020604",
    accent: "#34d399",
  },
  {
    key: "sunset",
    label: "Sunset Arcade",
    description: "Warmes Orange & Bernstein. Retro-Arcade bei Sonnenuntergang.",
    brand: "oklch(62.7% 0.225 55)",
    bg: "#0a0603",
    accent: "#fb923c",
  },
  {
    key: "vaporwave",
    label: "Vaporwave",
    description: "Magenta-Pink trifft Cyan. 80er-Synthwave-Traum.",
    brand: "oklch(62.7% 0.265 350)",
    bg: "#070310",
    accent: "#38bdf8",
  },
  {
    key: "bloodmoon",
    label: "Blood Moon",
    description: "Aggressives Crimson-Rot auf fast schwarzem Grund. Gefährlich.",
    brand: "oklch(62.7% 0.265 22)",
    bg: "#0a0303",
    accent: "#f87171",
  },
  {
    key: "ice",
    label: "Ice",
    description: "Kühles Stahlblau, klar und ruhig. Minimalistisch-frostig.",
    brand: "oklch(62.7% 0.252 255)",
    bg: "#03060c",
    accent: "#60a5fa",
  },
];

export const THEME_KEYS: ThemeKey[] = THEME_CATALOG.map((t) => t.key);

export function getThemeDef(key: string | null | undefined): ThemeDef {
  return THEME_CATALOG.find((t) => t.key === key) ?? THEME_CATALOG[0];
}

export interface ThemeConfig {
  /** Globally active theme set by an admin */
  activeTheme: ThemeKey;
  /** If true, users may pick their own theme (stored in localStorage) */
  allowUserChoice: boolean;
}

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  activeTheme: "default",
  allowUserChoice: false,
};

/** localStorage key for a user's personal theme override */
export const USER_THEME_LS_KEY = "gn_theme";

export function isThemeKey(v: unknown): v is ThemeKey {
  return typeof v === "string" && THEME_KEYS.includes(v as ThemeKey);
}
