export interface WorldSettings {
  sensitivity: number;
  moveSpeed: number;
  volume: number;
}

export const DEFAULT_WORLD_SETTINGS: WorldSettings = {
  sensitivity: 1,
  moveSpeed: 1,
  volume: 1,
};

export const SETTINGS_BOUNDS = {
  sensitivity: { min: 0.25, max: 4,   step: 0.05 },
  moveSpeed:   { min: 0.5,  max: 2.5, step: 0.05 },
  volume:      { min: 0,    max: 1,   step: 0.01  },
} as const;

const KEY = "goon-world-v1";

function clamp(v: unknown, min: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : (min + max) / 2;
}

export function loadWorldSettings(): WorldSettings {
  if (typeof window === "undefined") return { ...DEFAULT_WORLD_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_WORLD_SETTINGS };
    const p = JSON.parse(raw) as Record<string, unknown>;
    return {
      sensitivity: clamp(p.sensitivity, SETTINGS_BOUNDS.sensitivity.min, SETTINGS_BOUNDS.sensitivity.max),
      moveSpeed:   clamp(p.moveSpeed,   SETTINGS_BOUNDS.moveSpeed.min,   SETTINGS_BOUNDS.moveSpeed.max),
      volume:      clamp(p.volume,      SETTINGS_BOUNDS.volume.min,      SETTINGS_BOUNDS.volume.max),
    };
  } catch {
    return { ...DEFAULT_WORLD_SETTINGS };
  }
}

export function saveWorldSettings(s: WorldSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}
