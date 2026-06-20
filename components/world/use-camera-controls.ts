"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export interface CameraControlState {
  /** Horizontal orbit offset from "directly behind the player", radians. */
  yaw: number;
  /** Vertical orbit offset, radians, clamped so the camera can't flip
   * through the floor or straight overhead. */
  pitch: number;
  /** Distance from the player, world units, adjusted by the scroll wheel. */
  distance: number;
  /** True whenever the right mouse button is *not* currently held — tells
   * Player's per-frame loop to ease yaw/pitch back toward DEFAULT_YAW/
   * DEFAULT_PITCH instead of holding the free-look angle indefinitely.
   * Zoom distance is a separate preference and is deliberately left alone
   * on release. */
  returning: boolean;
}

export const DEFAULT_YAW = 0;
export const DEFAULT_PITCH = 0.35;
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
  /** Call once per frame from Player's useFrame — eases yaw/pitch back
   * toward the default look direction while `returning` is true (i.e. RMB
   * isn't held). Defined here, not in Player, so Player never has to
   * mutate `state.current` directly from outside the hook. */
  easeReturn: (delta: number) => void;
}

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

    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onContextMenu);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onContextMenu);
    };
  }, [canvasRef]);

  function easeReturn(delta: number) {
    if (!state.current.returning) return;
    const t = Math.min(1, delta * 4);
    state.current.yaw = THREE.MathUtils.lerp(state.current.yaw, DEFAULT_YAW, t);
    state.current.pitch = THREE.MathUtils.lerp(state.current.pitch, DEFAULT_PITCH, t);
  }

  return { state, easeReturn };
}
