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

export const TIME_OF_DAY_PRESETS: Record<TimeOfDay, TimeOfDayPreset> = {
  abend: {
    label: "Abenddämmerung",
    sun: [-40, 5, -65], turbidity: 16, rayleigh: 1.6,
    fog: "#120a22", ambient: "#a78bfa", dir: "#ffd9b3", dirIntensity: 1.1,
    ground: "#253d28", groundInner: "#2c5530",
  },
  nacht: {
    label: "Nacht",
    sun: [-30, -6, -60], turbidity: 7, rayleigh: 0.45,
    fog: "#070512", ambient: "#5566b0", dir: "#9fb6ff", dirIntensity: 0.5,
    ground: "#16241c", groundInner: "#1c3a26",
  },
  morgen: {
    label: "Morgenröte",
    sun: [45, 7, -38], turbidity: 10, rayleigh: 2.6,
    fog: "#2a1d2e", ambient: "#fbcfe8", dir: "#ffe0c0", dirIntensity: 1.25,
    ground: "#2c4a32", groundInner: "#356b3a",
  },
  tag: {
    label: "Heller Tag",
    sun: [22, 42, 12], turbidity: 5, rayleigh: 1.0,
    fog: "#b8d4e6", ambient: "#e0e7ff", dir: "#fff6e8", dirIntensity: 1.5,
    ground: "#2f6b3a", groundInner: "#3c8048",
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
    fireflyDensity: num(raw?.fireflyDensity, d.fireflyDensity),
    monument: typeof raw?.monument === "boolean" ? raw.monument : d.monument,
  };
}
