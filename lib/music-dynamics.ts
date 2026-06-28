"use client";

/**
 * ── Stepped, HELD background-music tempo ─────────────────────────────────────
 *
 * The ONE source of truth for how fast the background music plays. A game sets
 * an absolute playback multiplier (1 = normal, 1.45 = +45 %) and the global
 * <MusicPlayer/> applies it. The contract is deliberately strict so the music
 * can never "overshoot then fall back":
 *
 *   • The value is set ONLY on a defined in-game event (e.g. an apple eaten),
 *     never per animation frame.
 *   • Once set, it is HELD verbatim until the next event sets a new value —
 *     there is no decay, no transient spike, no automatic settle-back.
 *   • The synth applies a change at its next bar boundary (smooth, in-time);
 *     file audio applies it instantly via playbackRate. Either way the tempo
 *     then stays put until the next event.
 *
 * This replaces the old per-frame intensity + event-spike model, whose decaying
 * spikes were exactly the "tempo surges then drops" symptom.
 */
let _tempo = 1;
const tempoListeners = new Set<(n: number) => void>();

/** The current absolute tempo multiplier (1 = normal speed). */
export function getMusicTempoMult(): number {
  return _tempo;
}

/**
 * Set the absolute tempo multiplier. Call this ONLY on a real game event so the
 * value steps and then holds. Clamped to a musical 0.5×–3× range. Ignored when
 * the value is effectively unchanged (so re-emitting the same step is free).
 */
export function setMusicTempoMult(mult: number): void {
  const v = Math.max(0.5, Math.min(3, Number.isFinite(mult) ? mult : 1));
  if (Math.abs(v - _tempo) < 0.0005) return;
  _tempo = v;
  for (const fn of tempoListeners) fn(v);
}

/** Snap the tempo back to normal (call on game start / end / leaving a page). */
export function resetMusicTempoMult(): void {
  if (_tempo === 1) return;
  _tempo = 1;
  for (const fn of tempoListeners) fn(1);
}

export function subscribeMusicTempoMult(fn: (n: number) => void): () => void {
  tempoListeners.add(fn);
  return () => {
    tempoListeners.delete(fn);
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
