"use client";

import { useEffect, useRef } from "react";
import { DEFAULT_KEYBINDINGS, type KeyBindings } from "@/lib/world-settings";

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
  slidePressed: boolean;
}

export interface KeyboardControls {
  state: React.RefObject<KeyboardState>;
  /** Reads-and-clears the one-shot jump flag atomically. */
  consumeJump: () => boolean;
  /** Reads-and-clears the one-shot slide flag atomically. */
  consumeSlide: () => boolean;
}

// Module-level keybinds ref — updated by world-shell.tsx when settings
// change. There is at most one World session active per tab, so module
// scope is correct here (same pattern as player.tsx's slashEffectSeq).
let _keybinds: KeyBindings = { ...DEFAULT_KEYBINDINGS };

export function setActiveKeybinds(k: KeyBindings): void {
  _keybinds = k;
}

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
    slidePressed: false,
  });

  useEffect(() => {
    let jumpHeld = false;
    let slideHeld = false;

    const onDown = (e: KeyboardEvent) => {
      const k = _keybinds;
      // Movement (also support arrow keys as permanent aliases)
      if (e.code === k.forward   || e.code === "ArrowUp")    state.current.forward     = true;
      if (e.code === k.backward  || e.code === "ArrowDown")  state.current.backward    = true;
      if (e.code === k.strafeLeft || e.code === "ArrowLeft") state.current.strafeLeft  = true;
      if (e.code === k.strafeRight || e.code === "ArrowRight") state.current.strafeRight = true;
      // Sprint (support both Shift keys regardless of which one is bound)
      if (e.code === k.sprint || (k.sprint === "ShiftLeft" && e.code === "ShiftRight") || (k.sprint === "ShiftRight" && e.code === "ShiftLeft")) {
        state.current.sprint = true;
      }
      // Jump — one-shot (held Space must not keep re-triggering)
      if (e.code === k.jump && !jumpHeld) {
        jumpHeld = true;
        state.current.jumpPressed = true;
      }
      // Slide — one-shot (tap only, holding C doesn't re-slide every frame)
      if (e.code === k.slide && !slideHeld) {
        slideHeld = true;
        state.current.slidePressed = true;
      }
    };

    const onUp = (e: KeyboardEvent) => {
      const k = _keybinds;
      if (e.code === k.forward   || e.code === "ArrowUp")    state.current.forward     = false;
      if (e.code === k.backward  || e.code === "ArrowDown")  state.current.backward    = false;
      if (e.code === k.strafeLeft || e.code === "ArrowLeft") state.current.strafeLeft  = false;
      if (e.code === k.strafeRight || e.code === "ArrowRight") state.current.strafeRight = false;
      if (e.code === k.sprint || e.code === "ShiftLeft" || e.code === "ShiftRight") {
        // Release sprint only if neither Shift is held
        state.current.sprint = false;
      }
      if (e.code === k.jump)  jumpHeld  = false;
      if (e.code === k.slide) slideHeld = false;
    };

    // Alt-tabbing (or any focus loss) away while a key is physically held
    // never fires its `keyup` — without this, that key reads as permanently
    // pressed until tapped again.
    const onBlur = () => {
      state.current.forward     = false;
      state.current.backward    = false;
      state.current.strafeLeft  = false;
      state.current.strafeRight = false;
      state.current.sprint      = false;
      state.current.slidePressed = false;
      jumpHeld  = false;
      slideHeld = false;
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup",   onUp);
    window.addEventListener("blur",    onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup",   onUp);
      window.removeEventListener("blur",    onBlur);
    };
  }, []);

  function consumeJump(): boolean {
    if (state.current.jumpPressed) { state.current.jumpPressed = false; return true; }
    return false;
  }

  function consumeSlide(): boolean {
    if (state.current.slidePressed) { state.current.slidePressed = false; return true; }
    return false;
  }

  return { state, consumeJump, consumeSlide };
}
