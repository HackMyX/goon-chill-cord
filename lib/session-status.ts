"use client";

/**
 * Module-level singleton that tracks the SessionGuard status so that
 * non-React code (world-shell useEffect) and React hooks can both read
 * the current value without prop-drilling or a full context provider.
 *
 * SessionGuard writes via setSessionStatus().
 * world-shell.tsx reads via getSessionStatus() + onSessionStatusChange().
 */

export type GuardStatus = "idle" | "active" | "blocked" | "kicked" | "taking_over";

let _status: GuardStatus = "idle";
const _listeners = new Set<(s: GuardStatus) => void>();

export function setSessionStatus(s: GuardStatus) {
  if (_status === s) return;
  _status = s;
  for (const fn of _listeners) fn(s);
}

export function getSessionStatus(): GuardStatus {
  return _status;
}

/** Subscribe to status changes. Returns an unsubscribe function. */
export function onSessionStatusChange(fn: (s: GuardStatus) => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
