"use client";

/**
 * Module-level aim state for the 3D World's mouse-driven crosshair.
 * Written every frame by Player (components/world/player.tsx) inside useFrame,
 * read by the fixed screen-space <Crosshair> overlay (components/world/
 * crosshair.tsx) via its own requestAnimationFrame poll. Plain mutable object,
 * no React state (same reasoning as lib/mobile-input.ts) so per-frame writes
 * never trigger a re-render — the crosshair updates itself imperatively.
 */
export interface WorldAimState {
  /** Shown at all only while actually in-game (entered + look/touch active +
   * alive) — false the instant the player dies or leaves. */
  active: boolean;
  /** True whenever a swing right now would connect with a target in the aim
   * cone — drives the crosshair's red "locked" look. */
  targetAcquired: boolean;
}

export const aimState: WorldAimState = {
  active: false,
  targetAcquired: false,
};
