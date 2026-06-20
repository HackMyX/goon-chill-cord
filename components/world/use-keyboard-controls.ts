"use client";

import { useEffect, useRef } from "react";

export interface KeyboardState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
}

const KEY_MAP: Record<string, keyof KeyboardState> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "backward",
  ArrowDown: "backward",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

/** Mutable ref (not state) so useFrame can read pressed keys every render
 * without triggering a React re-render on every keydown/keyup. */
export function useKeyboardControls() {
  const state = useRef<KeyboardState>({
    forward: false,
    backward: false,
    left: false,
    right: false,
  });

  useEffect(() => {
    const handleKey = (pressed: boolean) => (e: KeyboardEvent) => {
      const key = KEY_MAP[e.code];
      if (key) state.current[key] = pressed;
    };
    const onDown = handleKey(true);
    const onUp = handleKey(false);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  return state;
}
