"use client";

import { useEffect, useRef } from "react";

export interface KeyboardState {
  forward: boolean;
  backward: boolean;
  /** A/D now strafe sideways relative to the camera's look direction —
   * turning itself is automatic (Player.tsx eases the character's heading
   * toward the camera yaw every frame), not a manual A/D action anymore. */
  strafeLeft: boolean;
  strafeRight: boolean;
  sprint: boolean;
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
  KeyA: "strafeLeft",
  ArrowLeft: "strafeLeft",
  KeyD: "strafeRight",
  ArrowRight: "strafeRight",
};

/** Mutable ref (not state) so useFrame can read pressed keys every render
 * without triggering a React re-render on every keydown/keyup. */
export function useKeyboardControls(): KeyboardControls {
  const state = useRef<KeyboardState>({
    forward: false,
    backward: false,
    strafeLeft: false,
    strafeRight: false,
    sprint: false,
    jumpPressed: false,
  });

  useEffect(() => {
    let spaceHeld = false;
    const onDown = (e: KeyboardEvent) => {
      const key = KEY_MAP[e.code];
      if (key) state.current[key] = true;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") state.current.sprint = true;
      if (e.code === "Space" && !spaceHeld) {
        spaceHeld = true;
        state.current.jumpPressed = true;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const key = KEY_MAP[e.code];
      if (key) state.current[key] = false;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") state.current.sprint = false;
      if (e.code === "Space") spaceHeld = false;
    };
    // Alt-tabbing (or any focus loss) away while a key is physically held
    // never fires its `keyup` — without this, that key reads as permanently
    // pressed until tapped again, which on `forward`/`sprint` means the
    // character silently keeps running the instant focus returns.
    const onBlur = () => {
      state.current.forward = false;
      state.current.backward = false;
      state.current.strafeLeft = false;
      state.current.strafeRight = false;
      state.current.sprint = false;
      spaceHeld = false;
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
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
