"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface CameraControlState {
  /** Absolute world-space look yaw, radians — this *is* the crosshair's
   * direction, driven directly by mouse movement while pointer-locked.
   * Player.tsx eases the character's own heading toward this every frame
   * (see CHARACTER_TURN_RATE there) instead of the camera ever following
   * the character — aim leads, body catches up, the way a third-person
   * shooter actually feels. */
  yaw: number;
  /** Vertical look angle, radians, clamped so the camera can't flip
   * through the floor or straight overhead. */
  pitch: number;
  /** Distance from the player, world units, adjusted by the scroll wheel. */
  distance: number;
  /** Right-mouse-held free-look offset on top of `yaw`/`pitch` — see the
   * `onMouseMove` doc comment below. Zero whenever the button isn't held
   * and eases back to zero (in Player.tsx's per-frame camera block) once
   * it's released. */
  freeLookYaw: number;
  freeLookPitch: number;
  /** True for exactly as long as the right mouse button is held down while
   * pointer-locked — Player.tsx reads this to decide whether to keep
   * easing `freeLookYaw`/`freeLookPitch` back toward 0. */
  freeLookActive: boolean;
  /** World-settings camera sensitivity multiplier (0.25–4, default 1).
   * Written by world-shell.tsx when settings change; multiplied into
   * YAW/PITCH_SENSITIVITY in onMouseMove so it takes effect immediately. */
  sensitivityMult: number;
  /** World-settings movement speed multiplier (0.5–2.5, default 1).
   * Written by world-shell.tsx when settings change; read by player.tsx
   * every frame to scale horizontal velocity. */
  moveSpeedMult: number;
}

export const DEFAULT_YAW = 0;
export const DEFAULT_PITCH = 0.32;
const DEFAULT_DISTANCE = 6.5;

const YAW_SENSITIVITY = 0.0024;
const PITCH_SENSITIVITY = 0.0021;
export const PITCH_MIN = -0.3;
export const PITCH_MAX = 1.1;
const DISTANCE_MIN = 3;
const DISTANCE_MAX = 14;
const ZOOM_SENSITIVITY = 0.0025;
/** Defensive ceiling on a *single* mousemove event's movementX/Y, in
 * pixels — browsers occasionally report one spurious oversized delta
 * right when pointer lock first engages (the OS/browser's own cursor
 * warp-to-lock-point getting reported as if it were real mouse motion),
 * which without this reads as the view snapping/spinning the instant you
 * so much as twitch the mouse after clicking "Klicken zum Spielen". A
 * genuine fast real flick still arrives as many normal-sized events in
 * quick succession, not one giant one, so clamping a single event's
 * magnitude costs nothing for real input. */
const MAX_MOVEMENT_PER_EVENT = 80;

// --- Camera-vs-world collision (removed) ---------------------------------
//
// This used to hold a per-frame raycast (`resolveCameraDistance`) that
// pulled the camera in front of any tree/crystal it would otherwise clip
// through (environment.tsx's `userData.collidable` tagging). Removed
// entirely: environment.tsx scatters 70 trees across nearly the *entire*
// playable radius, so in normal play the ray grazed a tree silhouette
// constantly while walking or turning — not occasional noise, a genuinely
// continuously-changing obstruction distance — and any amount of easing
// toward a continuously-moving target reads as exactly the "camera keeps
// zooming in and out while walking" bug, no matter how the easing itself
// was tuned (several rounds of adjusting it never fixed the complaint,
// because the *input* never stopped moving). Player.tsx's camera distance
// is now just the player's own scroll-wheel `cc.distance`, full stop — at
// the cost of occasionally clipping slightly into a tree trunk up close,
// a far smaller and rarer artifact than continuous zoom breathing across
// most of the map. environment.tsx's `userData.collidable` tag is now
// vestigial (nothing reads it) but harmless to leave in place.

export interface CameraControls {
  state: React.RefObject<CameraControlState>;
  /** True while the mouse is pointer-locked to the canvas, i.e. mouse-look
   * is actually active. The World shows a "click to play" overlay and
   * stops reading WASD/click input whenever this is false. */
  locked: boolean;
  /** Call from a user-gesture click handler (pointer lock requires one) to
   * engage mouse-look. */
  requestLock: () => void;
  /** Programmatically releases the pointer lock (no user gesture needed,
   * unlike `requestLock`) — a no-op if this canvas isn't the currently
   * locked element. world-shell.tsx calls this the instant the player
   * dies so the death screen's buttons are immediately clickable. */
  releaseLock: () => void;
}

/**
 * Always-on pointer-lock mouse-look for the 3D World. Clicking the canvas
 * locks the pointer; from then on every mouse-move directly steers
 * `yaw`/`pitch` (the crosshair's look direction, and the basis WASD moves
 * along) until Escape (or losing focus) releases the lock again, at which
 * point the World shows a "click to resume" prompt rather than silently
 * going unresponsive. Scroll wheel still zooms regardless of lock state.
 *
 * Holding the right mouse button re-engages a separate "free-look" on top
 * of that: mouse-move while held steers `freeLookYaw`/`freeLookPitch`
 * instead (an offset, not a replacement) so the camera can swing around to
 * look elsewhere without changing `yaw`/`pitch` themselves — and therefore
 * without changing which way WASD walks or which way the body (Player.tsx
 * eases its heading toward `yaw` alone) is facing. Releasing the button
 * eases that offset back to 0 every frame (Player.tsx's camera block),
 * which is what "resets to standard" actually is: the camera swings back to
 * directly behind the committed aim direction.
 *
 * Held in a ref (not React state) for yaw/pitch/distance/free-look so
 * Player's per-frame camera math can read it without ever triggering a
 * re-render; `locked` is the one piece that genuinely needs to be React
 * state, since the overlay UI in world-shell.tsx has to re-render when it
 * changes.
 */
export function useCameraControls(
  canvasRef: React.RefObject<HTMLElement | null>
): CameraControls {
  const state = useRef<CameraControlState>({
    yaw: DEFAULT_YAW,
    pitch: DEFAULT_PITCH,
    distance: DEFAULT_DISTANCE,
    freeLookYaw: 0,
    freeLookPitch: 0,
    freeLookActive: false,
    sensitivityMult: 1,
    moveSpeedMult: 1,
  });
  const [locked, setLocked] = useState(false);
  // How many mousemove events to discard immediately after pointer lock
  // engages — browsers typically send the OS's cursor-warp-to-lock-point
  // as one OR MORE large mousemove events that must not be interpreted as
  // deliberate look input (the original bool dropped only the very first
  // one, which wasn't enough on some platforms and produced a brief
  // "spin-on-click" jerk). Three is conservative and costs nothing for
  // real play (genuine flicks arrive as many normal-sized events at the
  // mouse's poll rate, not a single event at the start of a session).
  const justLocked = useRef(0);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== el) return;
      if (justLocked.current > 0) {
        justLocked.current--;
        return;
      }
      const movementX = Math.max(-MAX_MOVEMENT_PER_EVENT, Math.min(MAX_MOVEMENT_PER_EVENT, e.movementX));
      const movementY = Math.max(-MAX_MOVEMENT_PER_EVENT, Math.min(MAX_MOVEMENT_PER_EVENT, e.movementY));
      // Sign check, re-derived properly this time (a previous version of
      // this comment got it backwards): this app's forward convention is
      // F(yaw) = (sin(yaw), 0, cos(yaw)). This camera sits *behind* the
      // player along -F and looks back along +F — which, run through
      // three.js's own lookAt basis convention (camera-right = F × up,
      // validated against the standard OpenGL default camera looking down
      // -Z, where +X is screen-right), works out to a screen-right axis of
      // (-cos(yaw), 0, sin(yaw)). At yaw=0 that's world -X — and dF/dyaw at
      // yaw=0 is (cos(0), -sin(0)) = +X, the *opposite* of screen-right.
      // So increasing yaw sweeps the view toward screen-*left*, not right
      // — meaning a mouse-right move (positive movementX) must *decrease*
      // yaw to turn the view right: `-=`, not `+=`. (The previous `+=` here
      // was tuned to match player.tsx's strafe-right vector *before* that
      // vector's own sign got fixed in a later pass — once that flipped,
      // this should have flipped too, but didn't, which is exactly the
      // "drag mouse right, view goes left" regression that fix quietly
      // introduced.)
      const ySens = YAW_SENSITIVITY   * state.current.sensitivityMult;
      const pSens = PITCH_SENSITIVITY * state.current.sensitivityMult;
      if (state.current.freeLookActive) {
        // Right-mouse-held free-look: steers an *offset* on top of the
        // committed aim/movement yaw/pitch instead of the yaw/pitch
        // themselves — so you can look around without your walk direction
        // (or the character's body heading, which eases toward `yaw` alone
        // in Player.tsx) changing underneath you. Released, Player.tsx eases
        // this back to 0 every frame, which is what "resets to standard"
        // actually is: the camera swinging back to directly behind the
        // committed aim direction. Clamped to ±π so a stray right-click
        // during rapid mouse movement can never accumulate to an absurd
        // offset that reads as a long lingering spin when released.
        state.current.freeLookYaw = Math.max(
          -Math.PI,
          Math.min(Math.PI, state.current.freeLookYaw - movementX * ySens)
        );
        state.current.freeLookPitch = Math.max(
          PITCH_MIN - state.current.pitch,
          Math.min(PITCH_MAX - state.current.pitch, state.current.freeLookPitch + movementY * pSens)
        );
      } else {
        state.current.yaw -= movementX * ySens;
        // Normalise to (−π, π) to prevent floating-point growth and keep
        // all downstream sin/cos/angleDelta calls on small, precise values.
        state.current.yaw = state.current.yaw % (Math.PI * 2);
        if (state.current.yaw < -Math.PI) state.current.yaw += Math.PI * 2;
        else if (state.current.yaw > Math.PI) state.current.yaw -= Math.PI * 2;
        state.current.pitch = Math.max(
          PITCH_MIN,
          Math.min(PITCH_MAX, state.current.pitch + movementY * pSens)
        );
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      state.current.distance = Math.max(
        DISTANCE_MIN,
        Math.min(DISTANCE_MAX, state.current.distance + e.deltaY * ZOOM_SENSITIVITY)
      );
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    // Right mouse button (button 2) toggles free-look for as long as it's
    // held — mousedown on the canvas (must already be pointer-locked,
    // same gate as the attack click), mouseup on `document` rather than
    // `el` so dragging the mouse off the canvas before releasing still
    // clears it (otherwise it could get stuck "active" with no further
    // mousemove ever arriving on `el` to undo it).
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2 && document.pointerLockElement === el) {
        // Belt-and-suspenders alongside the `contextmenu` handler below —
        // suppressing the *mousedown* for the right button too, not just
        // the menu it would otherwise open on mouseup, so there's no
        // window at all for a browser-default action on this button (text
        // selection, drag-start, etc.) to ever interfere with attack/jump/
        // movement input firing normally while it's held. Left-click
        // attack (use-attack-input.ts) and Space jump are independently
        // gated only on pointer-lock state and their own cooldowns —
        // neither one reads `freeLookActive` at all — so this is pure
        // insurance, not a fix for an actual found block.
        e.preventDefault();
        state.current.freeLookActive = true;
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) state.current.freeLookActive = false;
    };
    const onLockChange = () => {
      const isLocked = document.pointerLockElement === el;
      if (isLocked) justLocked.current = 3;
      // Losing the lock mid-free-look (Escape, alt-tab) must drop it too —
      // otherwise it stays "active" with no mouseup ever coming to clear
      // it, leaving the next click-to-resume permanently stuck in free-look.
      else state.current.freeLookActive = false;
      setLocked(isLocked);
    };
    // Pointer lock can fail to engage (browser security throttling after
    // rapid request/exit cycles) — without listening for this, a failed
    // request would otherwise leave `locked` stuck `false` with no clear
    // next click given exactly the same chance to retry, since nothing
    // here would have errored loudly.
    const onLockError = () => setLocked(false);
    // Same alt-tab reasoning as useKeyboardControls' onBlur — a held right
    // button never fires its mouseup if focus is lost while it's down.
    const onBlur = () => {
      state.current.freeLookActive = false;
    };

    document.addEventListener("mousemove", onMouseMove);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onContextMenu);
    el.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("pointerlockerror", onLockError);
    window.addEventListener("blur", onBlur);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onContextMenu);
      el.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("pointerlockerror", onLockError);
      window.removeEventListener("blur", onBlur);
    };
  }, [canvasRef]);

  const requestLock = useCallback(() => {
    // requestPointerLock() returns a Promise that rejects with a
    // SecurityError when called too soon after the user just exited a
    // lock (a fixed, undocumented-length browser cooldown meant to stop
    // sites from re-trapping the cursor the instant Escape is pressed) —
    // entirely expected if someone Escapes and immediately clicks again,
    // not a bug to fix here. Without this `.catch`, that rejection was
    // unhandled and surfaced as a loud console error; swallowing it is
    // correct since the only "recovery" is just clicking again a moment
    // later, which the still-visible "Klicken zum Spielen" overlay
    // already invites.
    // unadjustedMovement: true requests raw hardware counts from the OS,
    // bypassing any pointer-acceleration or smoothing curve. That curve is
    // the primary source of "camera feels jittery even at steady mouse speed"
    // in WebGL pointer-lock games — with it off, movementX/Y values are
    // linear with actual mouse velocity and the camera tracks exactly 1:1.
    // Supported in Chromium 88+ / Edge 88+; Firefox silently ignores the
    // option and still engages the lock normally, so no harm done there.
    // Falls back to the no-options call on browsers that outright throw on
    // an unrecognised options object (Chromium < 88, very rare in 2025).
    let result: Promise<void> | void | undefined;
    try {
      result = (canvasRef.current as (HTMLElement & { requestPointerLock(opts?: { unadjustedMovement?: boolean }): Promise<void> | void }) | null)
        ?.requestPointerLock({ unadjustedMovement: true });
    } catch {
      result = canvasRef.current?.requestPointerLock();
    }
    if (result && typeof result.catch === "function") {
      result.catch(() => {
        // Cosmetic failure — the overlay stays up, the user just clicks
        // again once the browser's cooldown has passed.
      });
    }
  }, [canvasRef]);

  // Programmatic release — used by world-shell.tsx the instant the player
  // dies, so the death screen's buttons are immediately clickable with a
  // visible cursor instead of requiring an Escape press first just to get
  // the mouse back. A no-op if nothing is locked (or something other than
  // this canvas is), so it's always safe to call defensively.
  const releaseLock = useCallback(() => {
    if (document.pointerLockElement === canvasRef.current) {
      document.exitPointerLock();
    }
  }, [canvasRef]);

  return { state, locked, requestLock, releaseLock };
}
