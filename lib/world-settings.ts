export interface KeyBindings {
  forward: string;
  backward: string;
  strafeLeft: string;
  strafeRight: string;
  sprint: string;
  jump: string;
  slide: string;
}

export const DEFAULT_KEYBINDINGS: KeyBindings = {
  forward: "KeyW",
  backward: "KeyS",
  strafeLeft: "KeyA",
  strafeRight: "KeyD",
  sprint: "ShiftLeft",
  jump: "Space",
  slide: "KeyC",
};

export const KEYBIND_LABELS: Record<keyof KeyBindings, string> = {
  forward: "Vorwärts",
  backward: "Rückwärts",
  strafeLeft: "Links strafen",
  strafeRight: "Rechts strafen",
  sprint: "Sprint",
  jump: "Springen",
  slide: "Slide",
};

export interface WorldSettings {
  sensitivityX: number;
  sensitivityY: number;
  volume: number;
  keybinds: KeyBindings;
}

export const DEFAULT_WORLD_SETTINGS: WorldSettings = {
  sensitivityX: 1,
  sensitivityY: 1,
  volume: 1,
  keybinds: { ...DEFAULT_KEYBINDINGS },
};

export const SETTINGS_BOUNDS = {
  sensitivityX: { min: 0.25, max: 4, step: 0.05 },
  sensitivityY: { min: 0.25, max: 4, step: 0.05 },
  volume:       { min: 0,    max: 1, step: 0.01  },
} as const;

const KEY = "goon-world-v3";
const LEGACY_KEYS = ["goon-world-v2", "goon-world-v1"];

function clamp(v: unknown, min: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : (min + max) / 2;
}

/** Human-readable display for a KeyboardEvent.code string. */
export function formatKeyCode(code: string): string {
  const MAP: Record<string, string> = {
    Space: "Leertaste", ShiftLeft: "Shift L", ShiftRight: "Shift R",
    ControlLeft: "Strg L", ControlRight: "Strg R", AltLeft: "Alt L", AltRight: "Alt R",
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
    Enter: "Enter", Escape: "Escape", Backspace: "Backspace", Tab: "Tab",
  };
  if (MAP[code]) return MAP[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "Num" + code.slice(6);
  return code;
}

export function loadWorldSettings(): WorldSettings {
  if (typeof window === "undefined") return { ...DEFAULT_WORLD_SETTINGS };
  try {
    let raw = localStorage.getItem(KEY);
    let isLegacy = false;
    if (!raw) {
      for (const k of LEGACY_KEYS) {
        raw = localStorage.getItem(k);
        if (raw) { isLegacy = true; break; }
      }
    }
    if (!raw) return { ...DEFAULT_WORLD_SETTINGS };
    const p = JSON.parse(raw) as Record<string, unknown>;
    const legacySens = p.sensitivity != null
      ? clamp(p.sensitivity, SETTINGS_BOUNDS.sensitivityX.min, SETTINGS_BOUNDS.sensitivityX.max)
      : DEFAULT_WORLD_SETTINGS.sensitivityX;
    const savedBinds = (!isLegacy && p.keybinds && typeof p.keybinds === "object")
      ? p.keybinds as Partial<KeyBindings>
      : {};
    return {
      sensitivityX: clamp(p.sensitivityX ?? legacySens, SETTINGS_BOUNDS.sensitivityX.min, SETTINGS_BOUNDS.sensitivityX.max),
      sensitivityY: clamp(p.sensitivityY ?? legacySens, SETTINGS_BOUNDS.sensitivityY.min, SETTINGS_BOUNDS.sensitivityY.max),
      volume:       clamp(p.volume, SETTINGS_BOUNDS.volume.min, SETTINGS_BOUNDS.volume.max),
      keybinds: { ...DEFAULT_KEYBINDINGS, ...savedBinds },
    };
  } catch {
    return { ...DEFAULT_WORLD_SETTINGS };
  }
}

export function saveWorldSettings(s: WorldSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}
