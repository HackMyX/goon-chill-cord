"use client";

/**
 * Module-level touch input state for the 3D World on mobile.
 * Written by MobileControls (components/world/mobile-controls.tsx),
 * read by Player (components/world/player.tsx) every useFrame tick.
 * Pure mutable object — no React state, intentionally so that reads
 * inside useFrame never trigger re-renders.
 */
export interface MobileInput {
  forward: boolean;
  backward: boolean;
  strafeLeft: boolean;
  strafeRight: boolean;
  sprint: boolean;
  attackPressed: boolean;
  jumpPressed: boolean;
  slidePressed: boolean;
}

export const mobileInput: MobileInput = {
  forward: false,
  backward: false,
  strafeLeft: false,
  strafeRight: false,
  sprint: false,
  attackPressed: false,
  jumpPressed: false,
  slidePressed: false,
};

/** Reads-and-clears the one-shot attack flag. */
export function consumeMobileAttack(): boolean {
  if (mobileInput.attackPressed) {
    mobileInput.attackPressed = false;
    return true;
  }
  return false;
}

/** Reads-and-clears the one-shot jump flag. */
export function consumeMobileJump(): boolean {
  if (mobileInput.jumpPressed) {
    mobileInput.jumpPressed = false;
    return true;
  }
  return false;
}

/** Reads-and-clears the one-shot slide flag. */
export function consumeMobileSlide(): boolean {
  if (mobileInput.slidePressed) {
    mobileInput.slidePressed = false;
    return true;
  }
  return false;
}
