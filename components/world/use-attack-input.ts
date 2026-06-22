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
 */
export function useAttackInput(canvasRef: React.RefObject<HTMLElement | null>): AttackInput {
  const attackPressed = useRef(false);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (document.pointerLockElement !== el) return;
      attackPressed.current = true;
    };

    el.addEventListener("pointerdown", onPointerDown);
    return () => el.removeEventListener("pointerdown", onPointerDown);
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
