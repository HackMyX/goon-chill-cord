"use client";

import { useEffect, useSyncExternalStore } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Globales „Spieler spielt gerade aktiv"-Signal.
//
// Spiele melden hier an/ab, wenn eine Runde / ein kritischer Moment läuft
// (z. B. Snake-Lauf, Plinko-Ball fällt, DON-Flip). Das Feedback-System nutzt das,
// um GROSSE, störende Feiern (Vollbild) NICHT mitten im Spiel aufzupoppen —
// sondern erst nach der Runde. So verliert niemand wegen eines Popups.
//
// Refcount über ein Set von Quellen → mehrere gleichzeitige Quellen sind sicher,
// und beim Unmount räumt jede Quelle sich selbst auf.
// ─────────────────────────────────────────────────────────────────────────────

const sources = new Set<string>();
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }

/** Eine Quelle als aktiv/inaktiv markieren. */
export function setGameplayActive(source: string, on: boolean): void {
  const was = sources.size > 0;
  if (on) sources.add(source);
  else sources.delete(source);
  if ((sources.size > 0) !== was) emit();
}

/** Spielt der Nutzer gerade aktiv (irgendeine Quelle aktiv)? */
export function isGameplayActive(): boolean {
  return sources.size > 0;
}

/** Auf Änderungen lauschen (für Nicht-React-Code / Refs). Gibt Unsubscribe zurück. */
export function subscribeGameplayActive(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** React-Hook: liefert live, ob gerade gespielt wird. */
export function useGameplayActive(): boolean {
  return useSyncExternalStore(
    (cb) => subscribeGameplayActive(cb),
    () => isGameplayActive(),
    () => false, // SSR
  );
}

/**
 * Komfort-Hook für Spiele: meldet `source` als aktiv, solange `active` true ist,
 * und räumt beim Unmount garantiert auf (verhindert „hängende" aktive Quellen).
 */
export function useGameplaySignal(source: string, active: boolean): void {
  useEffect(() => {
    setGameplayActive(source, active);
    return () => setGameplayActive(source, false);
  }, [source, active]);
}
