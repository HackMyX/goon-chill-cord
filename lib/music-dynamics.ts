"use client";

/**
 * Live "musical intensity" channel: a game (e.g. Snake) pushes a 0–1 value as
 * it speeds up, and the global <MusicPlayer/> maps it to a tempo multiplier so
 * the background music accelerates with the action. Tiny pub/sub, deduped so a
 * per-frame game loop can call it freely without spamming subscribers.
 */
let _level = 0;
const listeners = new Set<(n: number) => void>();

export function getMusicIntensity(): number {
  return _level;
}

/** Push the current intensity (0 = calm, 1 = max). Ignored if barely changed. */
export function setMusicIntensity(level: number): void {
  const v = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));
  if (Math.abs(v - _level) < 0.02) return;
  _level = v;
  for (const fn of listeners) fn(v);
}

/** Snap back to calm (call on game end / leaving the page). */
export function resetMusicIntensity(): void {
  if (_level === 0) return;
  _level = 0;
  for (const fn of listeners) fn(0);
}

export function subscribeMusicIntensity(fn: (n: number) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// ── Active game mode (drives per-mode track selection) ───────────────────────
let _mode: string | null = null;
const modeListeners = new Set<(m: string | null) => void>();

export function getMusicMode(): string | null {
  return _mode;
}

/** A game sets its current mode (e.g. "x2") so the player can pick a per-mode track. */
export function setMusicMode(mode: string | null): void {
  if (_mode === mode) return;
  _mode = mode;
  for (const fn of modeListeners) fn(mode);
}

export function subscribeMusicMode(fn: (m: string | null) => void): () => void {
  modeListeners.add(fn);
  return () => {
    modeListeners.delete(fn);
  };
}
