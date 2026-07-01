"use client";

import { useEffect, useRef } from "react";
import { aimState } from "@/lib/world-aim";

/**
 * Fixed screen-space crosshair for the 3D World — a normal mouse-aim reticle.
 *
 * It lives at a fixed spot on the SCREEN (horizontal center, a touch above the
 * vertical middle so it clears the character's head rather than sitting on it),
 * and the mouse-look moves the whole view under it — so dragging the mouse
 * sweeps the reticle across the world exactly like any third-person shooter /
 * Roblox shift-lock. The over-the-shoulder camera offset in player.tsx slides
 * the character off to the side so this center is over open world.
 *
 * player.tsx sets `aimState.targetAcquired` when a swing would connect; we poll
 * it on our own rAF loop and only write the DOM when it changes — no per-frame
 * React re-render. Purely presentational + `pointer-events: none`.
 */
export function Crosshair() {
  const rootRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let lastAcquired: boolean | null = null;
    let lastActive: boolean | null = null;
    const tick = () => {
      const root = rootRef.current;
      const mark = markRef.current;
      if (root && mark) {
        if (aimState.active !== lastActive) {
          lastActive = aimState.active;
          root.style.opacity = aimState.active ? "1" : "0";
        }
        if (aimState.targetAcquired !== lastAcquired) {
          lastAcquired = aimState.targetAcquired;
          mark.dataset.locked = aimState.targetAcquired ? "1" : "0";
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden
      style={{
        position: "absolute",
        top: "44%", // slightly above center so it rides above the character
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 12,
        pointerEvents: "none",
        opacity: 0,
        transition: "opacity 0.2s ease",
      }}
    >
      <style>{`
        .gnc-xhair {
          position: relative;
          width: 34px;
          height: 34px;
          transition: transform 0.09s ease;
        }
        .gnc-xhair[data-locked="1"] { transform: scale(1.18); }
        .gnc-xhair i {
          position: absolute;
          left: 50%;
          top: 50%;
          background: rgba(255,255,255,0.95);
          box-shadow: 0 0 3px rgba(0,0,0,0.9), 0 0 7px rgba(0,0,0,0.55);
          border-radius: 1px;
          transition: background 0.09s ease, box-shadow 0.09s ease, transform 0.09s ease;
        }
        .gnc-xhair[data-locked="1"] i {
          background: #ff3b3b;
          box-shadow: 0 0 5px rgba(255,59,59,0.95), 0 0 12px rgba(255,59,59,0.6);
        }
        /* Four ticks with a center gap; gap widens when locked. */
        .gnc-xhair .t { width: 2px; height: 9px; transform: translate(-50%, calc(-50% - 11px)); }
        .gnc-xhair .b { width: 2px; height: 9px; transform: translate(-50%, calc(-50% + 11px)); }
        .gnc-xhair .l { width: 9px; height: 2px; transform: translate(calc(-50% - 11px), -50%); }
        .gnc-xhair .r { width: 9px; height: 2px; transform: translate(calc(-50% + 11px), -50%); }
        .gnc-xhair[data-locked="1"] .t { transform: translate(-50%, calc(-50% - 13px)); }
        .gnc-xhair[data-locked="1"] .b { transform: translate(-50%, calc(-50% + 13px)); }
        .gnc-xhair[data-locked="1"] .l { transform: translate(calc(-50% - 13px), -50%); }
        .gnc-xhair[data-locked="1"] .r { transform: translate(calc(-50% + 13px), -50%); }
        .gnc-xhair .dot {
          width: 3px; height: 3px; border-radius: 50%;
          transform: translate(-50%, -50%);
          opacity: 0.9;
        }
      `}</style>
      <div className="gnc-xhair" data-locked="0" ref={markRef}>
        <i className="t" />
        <i className="b" />
        <i className="l" />
        <i className="r" />
        <i className="dot" />
      </div>
    </div>
  );
}
