"use client";

import { useEffect, useRef } from "react";

export interface AttackInput {
  /** Reads-and-clears the one-shot attack flag atomically — same
   * encapsulation reasoning as useKeyboardControls' consumeJump(): a
   * per-frame consumer shouldn't reach into a ref and mutate it itself. */
  consumeAttack: () => boolean;
}

/**
 * Left-click-to-attack for the 3D World. Only arms once the pointer is
 * actually locked to the canvas (components/world/use-camera-controls.ts)
 * — the very first click on the canvas engages mouse-look via the "click
 * to play" overlay in world-shell.tsx, and that click must never also
 * register as a punch the instant the world becomes interactive.
 *
 * Listens on `mousedown`, not `pointerdown` — confirmed via an isolated
 * Playwright repro: per the Pointer Events spec, a `pointerdown` only
 * fires when a pointer goes from "no buttons held" to "at least one
 * button held". With the right mouse button already held for free-look
 * (use-camera-controls.ts), that pointer is already "down", so pressing
 * left *never fires a second pointerdown at all* — confirmed reproducibly,
 * not a one-off. `mousedown` fires per physical button regardless of what
 * else is already held (exactly why use-camera-controls.ts' own free-look
 * toggle already uses it for the right button), so it's the only reliable
 * source of "did left-click just happen" while another button is held.
 */
export function useAttackInput(canvasRef: React.RefObject<HTMLElement | null>): AttackInput {
  const attackPressed = useRef(false);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (document.pointerLockElement !== el) return;
      attackPressed.current = true;
    };

    el.addEventListener("mousedown", onMouseDown);
    return () => el.removeEventListener("mousedown", onMouseDown);
  }, [canvasRef]);

  function consumeAttack(): boolean {
    if (attackPressed.current) {
      attackPressed.current = false;
      return true;
    }
    return false;
  }

  return { consumeAttack };
}
