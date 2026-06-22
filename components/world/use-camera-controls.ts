"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

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
}

export const DEFAULT_YAW = 0;
export const DEFAULT_PITCH = 0.32;
const DEFAULT_DISTANCE = 6.5;

const YAW_SENSITIVITY = 0.0024;
const PITCH_SENSITIVITY = 0.0021;
const PITCH_MIN = -0.3;
const PITCH_MAX = 1.1;
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

// --- Camera-vs-world collision -------------------------------------------
//
// A single reused Raycaster (never allocated per-frame) backing
// `resolveCameraDistance` below, called once per frame from player.tsx's
// camera block. Walls/trees don't otherwise stop the camera from pulling
// in behind them, which used to mean zooming/orbiting near a tree let the
// camera clip straight through its trunk and see the inside of the
// world's geometry — not "premium" by any definition.

const cameraRaycaster = new THREE.Raycaster();

/** True if `obj` or any of its ancestors carries `userData.collidable`
 * (components/world/environment.tsx tags tree/crystal root groups this
 * way) — walking up the parent chain instead of requiring every individual
 * mesh to be tagged itself, since a tagged group's child meshes are what
 * the raycaster actually reports as hit. */
function isCollidable(obj: THREE.Object3D | null): boolean {
  let o = obj;
  while (o) {
    if (o.userData?.collidable) return true;
    o = o.parent;
  }
  return false;
}

const CAMERA_COLLISION_MARGIN = 0.3;
const CAMERA_COLLISION_MIN_DISTANCE = 0.6;

/**
 * Casts from `origin` (the player's chest/eye point, never their feet —
 * a ray from ground level would clip through the terrain itself) toward
 * the camera along `direction` (must already be unit length) for up to
 * `desiredDistance`, and returns the largest distance that doesn't end up
 * inside or behind a collidable object — `desiredDistance` itself if
 * nothing is in the way. A small margin keeps the camera from sitting
 * exactly on a tree's surface (which would still clip into it as the
 * player's own slight movement jitters the ray by sub-pixel amounts).
 */
export function resolveCameraDistance(
  scene: THREE.Object3D,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  desiredDistance: number
): number {
  cameraRaycaster.set(origin, direction);
  cameraRaycaster.far = desiredDistance;
  const hits = cameraRaycaster.intersectObject(scene, true);
  for (const hit of hits) {
    if (isCollidable(hit.object)) {
      return Math.max(CAMERA_COLLISION_MIN_DISTANCE, hit.distance - CAMERA_COLLISION_MARGIN);
    }
  }
  return desiredDistance;
}

export interface CameraControls {
  state: React.RefObject<CameraControlState>;
  /** True while the mouse is pointer-locked to the canvas, i.e. mouse-look
   * is actually active. The World shows a "click to play" overlay and
   * stops reading WASD/click input whenever this is false. */
  locked: boolean;
  /** Call from a user-gesture click handler (pointer lock requires one) to
   * engage mouse-look. */
  requestLock: () => void;
}

/**
 * Always-on pointer-lock mouse-look for the 3D World, replacing the old
 * "hold right-mouse-button to free-look, release to snap back" scheme.
 * Clicking the canvas locks the pointer; from then on every mouse-move
 * directly steers `yaw`/`pitch` (the crosshair's look direction) until
 * Escape (or losing focus) releases the lock again, at which point the
 * World shows a "click to resume" prompt rather than silently going
 * unresponsive. Scroll wheel still zooms regardless of lock state.
 *
 * Held in a ref (not React state) for yaw/pitch/distance so Player's
 * per-frame camera math can read it without ever triggering a re-render;
 * `locked` is the one piece that genuinely needs to be React state, since
 * the overlay UI in world-shell.tsx has to re-render when it changes.
 */
export function useCameraControls(
  canvasRef: React.RefObject<HTMLElement | null>
): CameraControls {
  const state = useRef<CameraControlState>({
    yaw: DEFAULT_YAW,
    pitch: DEFAULT_PITCH,
    distance: DEFAULT_DISTANCE,
  });
  const [locked, setLocked] = useState(false);
  // Set true the instant pointer lock engages, cleared after the very
  // first mousemove event is *seen* (not applied) — see
  // MAX_MOVEMENT_PER_EVENT's doc comment for why that first event is
  // dropped outright rather than just clamped.
  const justLocked = useRef(false);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== el) return;
      if (justLocked.current) {
        justLocked.current = false;
        return;
      }
      const movementX = Math.max(-MAX_MOVEMENT_PER_EVENT, Math.min(MAX_MOVEMENT_PER_EVENT, e.movementX));
      const movementY = Math.max(-MAX_MOVEMENT_PER_EVENT, Math.min(MAX_MOVEMENT_PER_EVENT, e.movementY));
      // Sign check (this app's forward convention is (sin(yaw), 0,
      // cos(yaw)), and Player.tsx derives "right" as (cos(yaw), 0,
      // -sin(yaw)) from it): increasing yaw sweeps forward *toward* that
      // right vector, i.e. increasing yaw turns the view right. Moving the
      // mouse right is a positive `movementX`, so yaw must increase for a
      // mouse-right move to turn the camera right — `+=`, not `-=`. The
      // previous `-=` here was backwards (mouse right turned the view
      // left), which is exactly the "rechts/links vertauscht" bug report.
      state.current.yaw += movementX * YAW_SENSITIVITY;
      state.current.pitch = Math.max(
        PITCH_MIN,
        Math.min(PITCH_MAX, state.current.pitch - movementY * PITCH_SENSITIVITY)
      );
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      state.current.distance = Math.max(
        DISTANCE_MIN,
        Math.min(DISTANCE_MAX, state.current.distance + e.deltaY * ZOOM_SENSITIVITY)
      );
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onLockChange = () => {
      const isLocked = document.pointerLockElement === el;
      if (isLocked) justLocked.current = true;
      setLocked(isLocked);
    };
    // Pointer lock can fail to engage (browser security throttling after
    // rapid request/exit cycles) — without listening for this, a failed
    // request would otherwise leave `locked` stuck `false` with no clear
    // next click given exactly the same chance to retry, since nothing
    // here would have errored loudly.
    const onLockError = () => setLocked(false);

    document.addEventListener("mousemove", onMouseMove);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("pointerlockerror", onLockError);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("pointerlockerror", onLockError);
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
    const result = canvasRef.current?.requestPointerLock();
    if (result && typeof result.catch === "function") {
      result.catch(() => {
        // Cosmetic failure — the overlay stays up, the user just clicks
        // again once the browser's cooldown has passed.
      });
    }
  }, [canvasRef]);

  return { state, locked, requestLock };
}
