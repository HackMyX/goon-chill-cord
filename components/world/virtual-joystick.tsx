"use client";

import { useCallback, useEffect, useRef } from "react";
import { mobileInput } from "@/lib/mobile-input";

/** Radius of the draggable knob travel zone (px). */
const MAX_RADIUS = 52;
/** Joystick displacement fraction above which sprint activates. */
const SPRINT_THRESHOLD = 0.82;

interface VirtualJoystickProps {
  /** Called every time normalized axes change — [x, y] both in [-1, 1]. */
  onChange?: (x: number, y: number) => void;
}

/**
 * Fixed-position virtual joystick for the 3D World on touch devices.
 * The outer ring stays in place; the inner knob follows the active
 * touch within MAX_RADIUS. Displacement is normalised to [-1, 1] on
 * both axes and written to the global `mobileInput` ref so Player.tsx
 * can read it every frame without a React re-render.
 */
export function VirtualJoystick({ onChange }: VirtualJoystickProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const activeTouchId = useRef<number | null>(null);
  const centerRef = useRef({ x: 0, y: 0 });

  const resetKnob = useCallback(() => {
    if (knobRef.current) {
      knobRef.current.style.transform = "translate(-50%, -50%)";
    }
    mobileInput.forward = false;
    mobileInput.backward = false;
    mobileInput.strafeLeft = false;
    mobileInput.strafeRight = false;
    mobileInput.sprint = false;
    onChange?.(0, 0);
  }, [onChange]);

  const updateFromTouch = useCallback(
    (clientX: number, clientY: number) => {
      const cx = centerRef.current.x;
      const cy = centerRef.current.y;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clamped = Math.min(dist, MAX_RADIUS);
      const nx = dist > 0 ? (dx / dist) * clamped : 0;
      const ny = dist > 0 ? (dy / dist) * clamped : 0;
      const normX = nx / MAX_RADIUS; // -1..1, right = +1
      const normY = ny / MAX_RADIUS; // -1..1, down = +1

      if (knobRef.current) {
        knobRef.current.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
      }

      const fraction = clamped / MAX_RADIUS;
      mobileInput.forward = normY < -0.3;
      mobileInput.backward = normY > 0.3;
      mobileInput.strafeLeft = normX < -0.3;
      mobileInput.strafeRight = normX > 0.3;
      mobileInput.sprint = fraction > SPRINT_THRESHOLD;
      onChange?.(normX, normY);
    },
    [onChange]
  );

  useEffect(() => {
    const el = baseRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (activeTouchId.current !== null) return;
      const touch = e.changedTouches[0];
      activeTouchId.current = touch.identifier;
      const rect = el.getBoundingClientRect();
      centerRef.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      updateFromTouch(touch.clientX, touch.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (activeTouchId.current === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === activeTouchId.current) {
          e.preventDefault();
          updateFromTouch(touch.clientX, touch.clientY);
          break;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchId.current) {
          activeTouchId.current = null;
          resetKnob();
          break;
        }
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [updateFromTouch, resetKnob]);

  return (
    <div
      ref={baseRef}
      style={{
        position: "relative",
        width: 128,
        height: 128,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.06)",
        border: "2px solid rgba(255,255,255,0.18)",
        boxShadow: "0 0 24px rgba(147,51,234,0.25)",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      {/* Inner deadzone ring */}
      <div
        style={{
          position: "absolute",
          inset: "30%",
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      />
      {/* Knob */}
      <div
        ref={knobRef}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "radial-gradient(circle at 35% 35%, rgba(168,85,247,0.9), rgba(109,40,217,0.75))",
          border: "2px solid rgba(168,85,247,0.7)",
          boxShadow: "0 0 16px rgba(168,85,247,0.55)",
          transform: "translate(-50%, -50%)",
          transition: "box-shadow 0.1s ease",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
