"use client";

/**
 * Client-only, per-device user preferences (audio levels), persisted in
 * localStorage and shared LIVE across the three places that care about them:
 *   - the floating <MusicPlayer/> (music volume / mute)
 *   - the global SoundManager singleton (SFX master volume / mute)
 *   - the profile's Client-Settings panel (reads + writes all of them)
 *
 * A tiny pub/sub keeps them in sync without a reload: any setter writes
 * localStorage and notifies every subscriber. These never round-trip to the
 * DB — they're deliberately per-device (a phone and a desktop can differ).
 *
 * Music keys reuse the legacy `gn_music_*` names the player already reads, so
 * nothing breaks for existing users; SFX keys are new.
 */

export interface ClientSettings {
  /** Music player volume (user override), 0–1. */
  musicVolume: number;
  musicMuted: boolean;
  /** Global SFX master volume applied to the SoundManager, 0–1. */
  sfxVolume: number;
  sfxMuted: boolean;
  /** Accessibility: minimize animations/transitions site-wide. */
  reducedMotion: boolean;
}

const LS = {
  musicVolume: "gn_music_vol",
  musicMuted: "gn_music_muted",
  sfxVolume: "gn_sfx_vol",
  sfxMuted: "gn_sfx_muted",
  reducedMotion: "gn_reduced_motion",
} as const;

export const CLIENT_SETTINGS_DEFAULTS: ClientSettings = {
  musicVolume: 0.12,
  musicMuted: false,
  sfxVolume: 1,
  sfxMuted: false,
  reducedMotion: false,
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function read(): ClientSettings {
  if (typeof window === "undefined") return { ...CLIENT_SETTINGS_DEFAULTS };
  const num = (k: string, d: number) => {
    const v = parseFloat(localStorage.getItem(k) ?? "");
    return Number.isFinite(v) ? clamp01(v) : d;
  };
  const bool = (k: string, d: boolean) => {
    const v = localStorage.getItem(k);
    return v === null ? d : v === "true";
  };
  return {
    musicVolume: num(LS.musicVolume, CLIENT_SETTINGS_DEFAULTS.musicVolume),
    musicMuted: bool(LS.musicMuted, CLIENT_SETTINGS_DEFAULTS.musicMuted),
    sfxVolume: num(LS.sfxVolume, CLIENT_SETTINGS_DEFAULTS.sfxVolume),
    sfxMuted: bool(LS.sfxMuted, CLIENT_SETTINGS_DEFAULTS.sfxMuted),
    reducedMotion: bool(LS.reducedMotion, CLIENT_SETTINGS_DEFAULTS.reducedMotion),
  };
}

const listeners = new Set<(s: ClientSettings) => void>();

export function getClientSettings(): ClientSettings {
  return read();
}

export function subscribeClientSettings(fn: (s: ClientSettings) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function write(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / quota — purely cosmetic, ignore */
  }
}

function notify() {
  const s = read();
  for (const fn of listeners) fn(s);
}

export function setMusicVolume(v: number) {
  write(LS.musicVolume, String(clamp01(v)));
  notify();
}
export function setMusicMuted(b: boolean) {
  write(LS.musicMuted, String(b));
  notify();
}
export function setSfxVolume(v: number) {
  write(LS.sfxVolume, String(clamp01(v)));
  notify();
}
export function setSfxMuted(b: boolean) {
  write(LS.sfxMuted, String(b));
  notify();
}
export function setReducedMotion(b: boolean) {
  write(LS.reducedMotion, String(b));
  notify();
}
