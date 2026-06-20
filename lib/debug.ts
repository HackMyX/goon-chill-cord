"use client";

/**
 * Tagged, always-on console logger. The goal is purely diagnostic: when
 * something looks wrong in the browser, the user should be able to open
 * DevTools, copy the relevant `[Scope]` lines, and paste them back —
 * without needing to flip a flag or rebuild anything. Keep call sites to
 * state *transitions* (spin start/land, mount, resize) — never per-frame
 * (useFrame runs ~60/sec and would flood the console into uselessness).
 */
export function debugLog(scope: string, message: string, data?: unknown) {
  if (typeof window === "undefined") return;
  if (data !== undefined) {
    console.log(`[${scope}] ${message}`, data);
  } else {
    console.log(`[${scope}] ${message}`);
  }
}

export function debugWarn(scope: string, message: string, data?: unknown) {
  if (typeof window === "undefined") return;
  console.warn(`[${scope}] ${message}`, data ?? "");
}

export function debugError(scope: string, message: string, data?: unknown) {
  if (typeof window === "undefined") return;
  console.error(`[${scope}] ${message}`, data ?? "");
}
