export interface WorldSettings {
  sensitivityX: number;
  sensitivityY: number;
  volume: number;
}

export const DEFAULT_WORLD_SETTINGS: WorldSettings = {
  sensitivityX: 1,
  sensitivityY: 1,
  volume: 1,
};

export const SETTINGS_BOUNDS = {
  sensitivityX: { min: 0.25, max: 4, step: 0.05 },
  sensitivityY: { min: 0.25, max: 4, step: 0.05 },
  volume:       { min: 0,    max: 1, step: 0.01  },
} as const;

const KEY = "goon-world-v2";
const LEGACY_KEY = "goon-world-v1";

function clamp(v: unknown, min: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : (min + max) / 2;
}

export function loadWorldSettings(): WorldSettings {
  if (typeof window === "undefined") return { ...DEFAULT_WORLD_SETTINGS };
  try {
    // Try new key first, fall back to legacy key (old saves only had `sensitivity`)
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return { ...DEFAULT_WORLD_SETTINGS };
    const p = JSON.parse(raw) as Record<string, unknown>;
    // If old save: use `sensitivity` as fallback for both axes
    const legacySens = p.sensitivity != null
      ? clamp(p.sensitivity, SETTINGS_BOUNDS.sensitivityX.min, SETTINGS_BOUNDS.sensitivityX.max)
      : DEFAULT_WORLD_SETTINGS.sensitivityX;
    return {
      sensitivityX: clamp(p.sensitivityX ?? legacySens, SETTINGS_BOUNDS.sensitivityX.min, SETTINGS_BOUNDS.sensitivityX.max),
      sensitivityY: clamp(p.sensitivityY ?? legacySens, SETTINGS_BOUNDS.sensitivityY.min, SETTINGS_BOUNDS.sensitivityY.max),
      volume:       clamp(p.volume,       SETTINGS_BOUNDS.volume.min,       SETTINGS_BOUNDS.volume.max),
    };
  } catch {
    return { ...DEFAULT_WORLD_SETTINGS };
  }
}

export function saveWorldSettings(s: WorldSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}
