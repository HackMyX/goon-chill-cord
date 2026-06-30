// ─────────────────────────────────────────────────────────────────────────────
// Welt-Umgebungs-Konfiguration (Optik der 3D-Farmwelt) — voll admin-konfigurierbar.
// Tageszeit-Preset treibt Sonne/Himmel/Nebel/Licht-Farben; die Multiplikatoren
// feintunen Nebel-Dichte, Lichtstärke, Sterne und die Struktur-Dichte der Map.
// Gelesen von components/world/scene.tsx + environment.tsx.
// ─────────────────────────────────────────────────────────────────────────────

export type TimeOfDay = "abend" | "nacht" | "morgen" | "tag";

export interface WorldEnvironmentConfig {
  /** Tageszeit — bündelt Sonne, Himmel, Nebelfarbe und Lichtfarben. */
  timeOfDay: TimeOfDay;
  /** Nebel-Dichte (höher = dichter/näher). 0.4–2.0 */
  fogDensity: number;
  /** Umgebungslicht-Stärke. 0–2 */
  ambientIntensity: number;
  /** Akzent-Punktlichter (lila/blau/rot). 0–2 */
  accentIntensity: number;
  /** Sterne-Menge/Helligkeit. 0–2 */
  starIntensity: number;
  /** Struktur-Dichten (Multiplikator auf die Basismengen). 0–2 */
  treeDensity: number;
  grassDensity: number;
  rockDensity: number;
  ruinDensity: number;
  mushroomDensity: number;
  /** Dichte der verlassenen Stadt (Ruinen-Häuser + Laternen + Kisten). */
  buildingDensity: number;
  /** Schwebende Glühpartikel (Fireflies) in der Luft. 0 = aus. */
  fireflyDensity: number;
  /** Leuchtendes Monument + Runen-Kreis nahe Spawn. */
  monument: boolean;
}

export const DEFAULT_WORLD_ENVIRONMENT: WorldEnvironmentConfig = {
  timeOfDay: "abend",
  fogDensity: 1,
  ambientIntensity: 1,
  accentIntensity: 1,
  starIntensity: 1,
  treeDensity: 1,
  grassDensity: 1,
  rockDensity: 1,
  ruinDensity: 1,
  mushroomDensity: 1,
  buildingDensity: 1,
  fireflyDensity: 1,
  monument: true,
};

export interface TimeOfDayPreset {
  label: string;
  /** Drei-Sky sunPosition. */
  sun: [number, number, number];
  turbidity: number;
  rayleigh: number;
  /** Nebelfarbe. */
  fog: string;
  /** Umgebungslicht-Farbe. */
  ambient: string;
  /** Richtungslicht (Sonne). */
  dir: string;
  dirIntensity: number;
  /** Boden-Tönung. */
  ground: string;
  groundInner: string;
}

// Post-apokalyptische Paletten: kein lila Magie-Look mehr. Verseuchter, schmutzig-
// gelber Smog am Abend, erstickende Dunkelheit nachts, aschiger Dunst am Morgen,
// fahler Overcast-Tag. Boden = totes Gras/Dreck/Asche statt sattes Grün.
export const TIME_OF_DAY_PRESETS: Record<TimeOfDay, TimeOfDayPreset> = {
  abend: {
    label: "Verseuchte Dämmerung",
    sun: [-40, 5, -65], turbidity: 18, rayleigh: 2.0,
    fog: "#46402c", ambient: "#d8c590", dir: "#f0d49a", dirIntensity: 1.35,
    ground: "#46402a", groundInner: "#544c34",
  },
  nacht: {
    label: "Tote Nacht",
    sun: [-30, -6, -60], turbidity: 8, rayleigh: 0.6,
    fog: "#1c2016", ambient: "#8a957a", dir: "#b8c498", dirIntensity: 0.85,
    ground: "#2a2c1e", groundInner: "#363a28",
  },
  morgen: {
    label: "Aschiger Morgen",
    sun: [45, 7, -38], turbidity: 12, rayleigh: 1.8,
    fog: "#564c3a", ambient: "#e6d8b8", dir: "#f4e2b4", dirIntensity: 1.45,
    ground: "#44402c", groundInner: "#524c34",
  },
  tag: {
    label: "Fahler Smog-Tag",
    sun: [22, 42, 12], turbidity: 7, rayleigh: 1.2,
    fog: "#bdb798", ambient: "#ece4c8", dir: "#fbf4dc", dirIntensity: 1.55,
    ground: "#56503a", groundInner: "#625a40",
  },
};

/** Defensive: füllt fehlende/ungültige Felder mit Defaults (für DB-Drift). */
export function normalizeEnvironmentConfig(
  raw: Partial<WorldEnvironmentConfig> | null | undefined
): WorldEnvironmentConfig {
  const d = DEFAULT_WORLD_ENVIRONMENT;
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const tod = raw?.timeOfDay;
  return {
    timeOfDay: tod === "nacht" || tod === "morgen" || tod === "tag" || tod === "abend" ? tod : d.timeOfDay,
    fogDensity: num(raw?.fogDensity, d.fogDensity),
    ambientIntensity: num(raw?.ambientIntensity, d.ambientIntensity),
    accentIntensity: num(raw?.accentIntensity, d.accentIntensity),
    starIntensity: num(raw?.starIntensity, d.starIntensity),
    treeDensity: num(raw?.treeDensity, d.treeDensity),
    grassDensity: num(raw?.grassDensity, d.grassDensity),
    rockDensity: num(raw?.rockDensity, d.rockDensity),
    ruinDensity: num(raw?.ruinDensity, d.ruinDensity),
    mushroomDensity: num(raw?.mushroomDensity, d.mushroomDensity),
    buildingDensity: num(raw?.buildingDensity, d.buildingDensity),
    fireflyDensity: num(raw?.fireflyDensity, d.fireflyDensity),
    monument: typeof raw?.monument === "boolean" ? raw.monument : d.monument,
  };
}
