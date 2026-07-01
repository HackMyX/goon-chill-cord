"use client";

/**
 * Module-level aim/targeting state for the 3D World's third-person crosshair.
 * Written every frame by Player (components/world/player.tsx) inside its
 * useFrame tick, read by the fixed screen-space <Crosshair> overlay
 * (components/world/crosshair.tsx) via its own requestAnimationFrame poll.
 *
 * Same reasoning as lib/mobile-input.ts: a plain mutable object, no React
 * state, so the per-frame writes never trigger a re-render — the crosshair
 * updates itself imperatively off this instead. Owned by nobody; both sides
 * just import the singleton.
 */
export interface WorldAimState {
  /** True whenever a swing right now would connect with *some* target —
   * either the one the crosshair is directly over (screen-space acquisition)
   * or, failing that, anything inside the forward attack cone. Drives the
   * crosshair's "locked" (red, tightened) vs idle (white) look. */
  targetAcquired: boolean;
  /** True while the crosshair should be shown at all — set false the instant
   * the player dies / leaves so a stale reticle never lingers over a menu. */
  active: boolean;
}

export const aimState: WorldAimState = {
  targetAcquired: false,
  active: false,
};
