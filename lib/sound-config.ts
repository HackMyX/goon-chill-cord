// ─── Sound Config — Types ──────────────────────────────────────────────────────

export type SoundEventKey =
  | "tick" | "hover" | "hit" | "click"
  | "win" | "ultraWin" | "error" | "flip" | "save"
  | "levelUp" | "xpGain" | "abilityEquip";

export interface SoundEventConfig {
  file: string;
  volume: number;
  enabled: boolean;
}

export type SoundConfig = Record<SoundEventKey, SoundEventConfig>;

export interface SoundEventMeta {
  key: SoundEventKey;
  label: string;
  group: string;
  defaultFile: string;
  defaultVolume: number;
}

export const SOUND_EVENT_META: SoundEventMeta[] = [
  // ── Reel / tick sounds ──
  { key: "tick",         label: "Reel-Tick",          group: "Reel",   defaultFile: "/sounds/tick.wav",      defaultVolume: 0.18 },
  { key: "hover",        label: "Hover",               group: "UI",     defaultFile: "/sounds/hover.wav",     defaultVolume: 0.10 },
  { key: "hit",          label: "Treffer (Welt)",      group: "Welt",   defaultFile: "/sounds/hit.wav",       defaultVolume: 0.28 },
  { key: "click",        label: "Click",               group: "UI",     defaultFile: "/sounds/click.wav",     defaultVolume: 0.18 },
  { key: "win",          label: "Gewinn",              group: "Spiele", defaultFile: "/sounds/win.wav",       defaultVolume: 0.35 },
  { key: "ultraWin",     label: "Ultra-Gewinn",        group: "Spiele", defaultFile: "/sounds/ultra-win.wav", defaultVolume: 0.35 },
  { key: "error",        label: "Fehler",              group: "UI",     defaultFile: "/sounds/error.wav",     defaultVolume: 0.35 },
  { key: "flip",         label: "Flip (DON/Cases)",    group: "Spiele", defaultFile: "/sounds/flip.wav",      defaultVolume: 0.35 },
  { key: "save",         label: "Speichern",           group: "UI",     defaultFile: "/sounds/save.wav",      defaultVolume: 0.20 },
  // ── New events ──
  { key: "levelUp",      label: "Level-Up",            group: "Level",  defaultFile: "/sounds/win.wav",       defaultVolume: 0.40 },
  { key: "xpGain",       label: "XP-Gewinn",           group: "Level",  defaultFile: "/sounds/tick.wav",      defaultVolume: 0.15 },
  { key: "abilityEquip", label: "Fähigkeit ausrüsten", group: "Level",  defaultFile: "/sounds/save.wav",      defaultVolume: 0.25 },
];

/** All sound files the admin can choose from. */
export const AVAILABLE_SOUND_FILES: { file: string; label: string }[] = [
  { file: "/sounds/tick.wav",      label: "Tick" },
  { file: "/sounds/hover.wav",     label: "Hover" },
  { file: "/sounds/hit.wav",       label: "Hit" },
  { file: "/sounds/click.wav",     label: "Click" },
  { file: "/sounds/win.wav",       label: "Win" },
  { file: "/sounds/ultra-win.wav", label: "Ultra-Win" },
  { file: "/sounds/error.wav",     label: "Error" },
  { file: "/sounds/flip.wav",      label: "Flip" },
  { file: "/sounds/save.wav",      label: "Save" },
];

export const DEFAULT_SOUND_CONFIG: SoundConfig = Object.fromEntries(
  SOUND_EVENT_META.map((m) => [
    m.key,
    { file: m.defaultFile, volume: m.defaultVolume, enabled: true },
  ])
) as SoundConfig;
