"use client";

import { useEffect, useRef } from "react";

export interface KeyboardState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jumpPressed: boolean;
}

export interface KeyboardControls {
  state: React.RefObject<KeyboardState>;
  /** Reads-and-clears the one-shot jump flag atomically, fully encapsulated
   * here rather than letting a consumer reach into `state.current` and
   * mutate it directly (React Compiler's immutability lint flags external
   * mutation of a hook's returned ref — this method is the hook's own
   * sanctioned way of consuming that flag). */
  consumeJump: () => boolean;
}

const KEY_MAP: Record<string, keyof Omit<KeyboardState, "jumpPressed">> = {
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
export function useKeyboardControls(): KeyboardControls {
  const state = useRef<KeyboardState>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    jumpPressed: false,
  });

  useEffect(() => {
    let spaceHeld = false;
    const onDown = (e: KeyboardEvent) => {
      const key = KEY_MAP[e.code];
      if (key) state.current[key] = true;
      if (e.code === "Space" && !spaceHeld) {
        spaceHeld = true;
        state.current.jumpPressed = true;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const key = KEY_MAP[e.code];
      if (key) state.current[key] = false;
      if (e.code === "Space") spaceHeld = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  function consumeJump(): boolean {
    if (state.current.jumpPressed) {
      state.current.jumpPressed = false;
      return true;
    }
    return false;
  }

  return { state, consumeJump };
}
