"use client";

import { useEffect, useRef } from "react";

export interface CameraControlState {
  /** Absolute world yaw the camera currently *looks toward* (i.e. the
   * direction from the camera to the player) — not a delta from the
   * player's facing. Changed directly by right-mouse-drag, and (only while
   * moving and not currently being dragged) eased slowly toward the
   * player's movement direction by Player's own useFrame loop. Keeping
   * this as one persistent absolute value — instead of a delta re-applied
   * on top of the player's every-frame-changing rotation, which is what
   * this used to be — is what stops the camera from violently swinging
   * every time the player's heading changes quickly. */
  yaw: number;
  /** Vertical look angle, radians, clamped so the camera can't flip
   * through the floor or straight overhead. Purely manual — unlike yaw,
   * nothing ever auto-adjusts this, so the camera never fights a pitch the
   * player explicitly set. */
  pitch: number;
  /** Distance from the player, world units, adjusted by the scroll wheel. */
  distance: number;
  /** True exactly while the right mouse button is held. Player's auto-
   * follow (easing yaw toward the movement direction) is fully suspended
   * whenever this is true, so manual control always wins outright and
   * never fights the auto-follow for the same frame. */
  dragging: boolean;
}

export const DEFAULT_YAW = 0;
export const DEFAULT_PITCH = 0.32;
const DEFAULT_DISTANCE = 6.5;

const YAW_SENSITIVITY = 0.006;
const PITCH_SENSITIVITY = 0.005;
const PITCH_MIN = -0.3;
const PITCH_MAX = 1.1;
const DISTANCE_MIN = 3;
const DISTANCE_MAX = 14;
const ZOOM_SENSITIVITY = 0.0025;

/**
 * Right-mouse-drag free look + scroll-wheel zoom for the 3D World — held
 * in a ref (not React state) so Player's per-frame camera math can read it
 * without ever triggering a re-render. Right-click is repurposed entirely
 * for the camera (no context menu), which is why `world-shell.tsx` also
 * suppresses `onContextMenu` on the canvas wrapper.
 */
export interface CameraControls {
  state: React.RefObject<CameraControlState>;
}

export function useCameraControls(
  canvasRef: React.RefObject<HTMLElement | null>
): CameraControls {
  const state = useRef<CameraControlState>({
    yaw: DEFAULT_YAW,
    pitch: DEFAULT_PITCH,
    distance: DEFAULT_DISTANCE,
    dragging: false,
  });

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 2) return;
      state.current.dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!state.current.dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      state.current.yaw -= dx * YAW_SENSITIVITY;
      state.current.pitch = Math.max(
        PITCH_MIN,
        Math.min(PITCH_MAX, state.current.pitch + dy * PITCH_SENSITIVITY)
      );
    };
    const onPointerUp = () => {
      state.current.dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      state.current.distance = Math.max(
        DISTANCE_MIN,
        Math.min(DISTANCE_MAX, state.current.distance + e.deltaY * ZOOM_SENSITIVITY)
      );
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    // Losing focus mid-drag (alt-tab, a browser permission popup, etc.)
    // never fires `pointerup` — without this the camera would think RMB is
    // still held forever, permanently disabling auto-follow.
    const onBlur = () => {
      state.current.dragging = false;
    };

    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("blur", onBlur);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("blur", onBlur);
    };
  }, [canvasRef]);

  return { state };
}
