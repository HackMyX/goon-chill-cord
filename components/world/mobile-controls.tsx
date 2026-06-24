"use client";

import { useCallback, useEffect, useRef } from "react";
import { Sword, ArrowUp, Zap, Wind } from "lucide-react";
import { VirtualJoystick } from "@/components/world/virtual-joystick";
import { mobileInput } from "@/lib/mobile-input";
import type { CameraControlState } from "@/components/world/use-camera-controls";

const LOOK_SENSITIVITY_X = 0.004;
const LOOK_SENSITIVITY_Y = 0.0015;
const PITCH_MIN = -0.3;
const PITCH_MAX = 1.1;

interface MobileControlsProps {
  /** Direct reference to the camera state so touch-look can write yaw/pitch. */
  cameraState: React.RefObject<CameraControlState>;
}

/**
 * Full mobile HUD for the 3D World:
 * - Virtual joystick (bottom-left) for movement
 * - Right-half transparent drag area for camera look
 * - Action buttons (bottom-right): Attack, Jump, Slide
 *
 * All writes go to the module-level `mobileInput` ref or directly into
 * `cameraState.current` — no React state, so no re-renders per frame.
 */
export function MobileControls({ cameraState }: MobileControlsProps) {
  const lookTouchId = useRef<number | null>(null);
  const lookLastPos = useRef({ x: 0, y: 0 });
  const lookAreaRef = useRef<HTMLDivElement>(null);

  const onAttackPress = useCallback(() => {
    mobileInput.attackPressed = true;
  }, []);

  const onJumpPress = useCallback(() => {
    mobileInput.jumpPressed = true;
  }, []);

  const onSlidePress = useCallback(() => {
    mobileInput.slidePressed = true;
  }, []);

  // Right-side touch-look: tracks the first touch that starts in the look area
  // and accumulates delta into yaw/pitch exactly as mouse movement does on desktop.
  useEffect(() => {
    const el = lookAreaRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      if (lookTouchId.current !== null) return;
      const touch = e.changedTouches[0];
      lookTouchId.current = touch.identifier;
      lookLastPos.current = { x: touch.clientX, y: touch.clientY };
    };

    const onMove = (e: TouchEvent) => {
      if (lookTouchId.current === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier !== lookTouchId.current) continue;
        e.preventDefault();
        const dx = touch.clientX - lookLastPos.current.x;
        const dy = touch.clientY - lookLastPos.current.y;
        lookLastPos.current = { x: touch.clientX, y: touch.clientY };
        const cc = cameraState.current;
        if (!cc) break;
        cc.yaw -= dx * LOOK_SENSITIVITY_X * cc.sensitivityXMult;
        // Normalise yaw to (-π, π)
        cc.yaw = cc.yaw % (Math.PI * 2);
        if (cc.yaw < -Math.PI) cc.yaw += Math.PI * 2;
        else if (cc.yaw > Math.PI) cc.yaw -= Math.PI * 2;
        cc.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, cc.pitch + dy * LOOK_SENSITIVITY_Y * cc.sensitivityYMult));
        break;
      }
    };

    const onEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === lookTouchId.current) {
          lookTouchId.current = null;
          break;
        }
      }
    };

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);

    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [cameraState]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 15,
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      {/* Look area — right 55 % of screen, transparent, intercepts touch */}
      <div
        ref={lookAreaRef}
        style={{
          position: "absolute",
          top: 0,
          left: "45%",
          right: 0,
          bottom: "180px",
          pointerEvents: "auto",
          // Debug: very faint to confirm placement without obscuring world
          // background: "rgba(255,0,0,0.04)",
        }}
      />

      {/* Bottom row: joystick left, buttons right */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          padding: "0 20px 24px",
          pointerEvents: "none",
        }}
      >
        {/* Joystick */}
        <div style={{ pointerEvents: "auto" }}>
          <VirtualJoystick />
        </div>

        {/* Action buttons */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 12,
            pointerEvents: "auto",
          }}
        >
          {/* Top row: Slide */}
          <div style={{ display: "flex", gap: 10 }}>
            <ActionButton
              icon={<Wind size={20} />}
              label="Slide"
              color="rgba(6,182,212,0.75)"
              glow="rgba(6,182,212,0.4)"
              onPress={onSlidePress}
            />
          </div>
          {/* Bottom row: Jump + Attack */}
          <div style={{ display: "flex", gap: 10 }}>
            <ActionButton
              icon={<ArrowUp size={22} />}
              label="Jump"
              color="rgba(234,179,8,0.75)"
              glow="rgba(234,179,8,0.4)"
              onPress={onJumpPress}
              size={64}
            />
            <ActionButton
              icon={<Sword size={24} />}
              label="Angriff"
              color="rgba(239,68,68,0.8)"
              glow="rgba(239,68,68,0.5)"
              onPress={onAttackPress}
              size={72}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  color,
  glow,
  onPress,
  size = 58,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  glow: string;
  onPress: () => void;
  size?: number;
}) {
  const pressedRef = useRef(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      if (!pressedRef.current) {
        pressedRef.current = true;
        onPress();
      }
    },
    [onPress]
  );

  const handleTouchEnd = useCallback(() => {
    pressedRef.current = false;
  }, []);

  return (
    <button
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      aria-label={label}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        border: `2px solid ${glow}`,
        boxShadow: `0 0 18px ${glow}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "manipulation",
        cursor: "pointer",
        transition: "transform 0.08s ease, box-shadow 0.08s ease",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {icon}
    </button>
  );
}
