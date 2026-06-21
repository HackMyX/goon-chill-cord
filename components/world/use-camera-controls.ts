"use client";

import { useEffect, useRef } from "react";

export interface CameraControlState {
  /** Free-look offset from the character's own heading, radians. The
   * character's heading itself lives in Player.tsx (driven by A/D turning,
   * not by the camera) — this is purely "how far the camera is currently
   * looking away from dead-ahead", changed by right-mouse-drag and eased
   * back to 0 on release. */
  yaw: number;
  /** Vertical look angle, radians, clamped so the camera can't flip
   * through the floor or straight overhead. */
  pitch: number;
  /** Distance from the player, world units, adjusted by the scroll wheel. */
  distance: number;
  /** True whenever the right mouse button is *not* currently held — tells
   * Player's per-frame loop to ease `yaw` back toward 0 instead of holding
   * the free-look angle indefinitely. */
  returning: boolean;
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

export interface CameraControls {
  state: React.RefObject<CameraControlState>;
  /** Call once per frame from Player's useFrame — eases `yaw` back toward
   * 0 while `returning` is true (i.e. RMB isn't held). */
  easeReturn: (delta: number) => void;
}

/**
 * Right-mouse-drag free look + scroll-wheel zoom for the 3D World — held
 * in a ref (not React state) so Player's per-frame camera math can read it
 * without ever triggering a re-render. Right-click is repurposed entirely
 * for the camera (no context menu), which is why `world-shell.tsx` also
 * suppresses `onContextMenu` on the canvas wrapper.
 */
export function useCameraControls(
  canvasRef: React.RefObject<HTMLElement | null>
): CameraControls {
  const state = useRef<CameraControlState>({
    yaw: DEFAULT_YAW,
    pitch: DEFAULT_PITCH,
    distance: DEFAULT_DISTANCE,
    returning: true,
  });

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 2) return;
      dragging = true;
      state.current.returning = false;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
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
      if (!dragging) return;
      dragging = false;
      state.current.returning = true;
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
    // still held forever, permanently disabling the ease-back.
    const onBlur = () => {
      dragging = false;
      state.current.returning = true;
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

  function easeReturn(delta: number) {
    if (!state.current.returning) return;
    const t = Math.min(1, delta * 4);
    state.current.yaw = state.current.yaw + (DEFAULT_YAW - state.current.yaw) * t;
  }

  return { state, easeReturn };
}
