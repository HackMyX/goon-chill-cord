"use client";

import { useEffect, useRef } from "react";
import { aimState } from "@/lib/world-aim";

/**
 * Fixed screen-space third-person crosshair for the 3D World.
 *
 * Rendered dead-center of the viewport. An over-the-shoulder camera offset in
 * player.tsx shifts the character off to the left third, so this center is
 * always over clear world rather than the player's own back — that was the
 * whole "aiming at your own chest" problem this fixes. player.tsx's per-frame
 * screen-space target acquisition projects nearby monsters/players to NDC and
 * sets `aimState.targetAcquired` when one sits under this reticle; we poll
 * that flag on our own requestAnimationFrame loop and only write the DOM when
 * it actually changes — no per-frame React re-render, no per-frame style
 * thrash. Purely presentational + `pointer-events: none`, so it never eats a
 * canvas click, a pointer-lock request, or a mobile touch.
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
        top: "50%",
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
        .gnc-xhair[data-locked="1"] { transform: scale(1.15); }
        .gnc-xhair i {
          position: absolute;
          left: 50%;
          top: 50%;
          background: rgba(255,255,255,0.92);
          box-shadow: 0 0 3px rgba(0,0,0,0.85), 0 0 6px rgba(0,0,0,0.5);
          border-radius: 1px;
          transition: background 0.09s ease, box-shadow 0.09s ease, transform 0.09s ease;
        }
        .gnc-xhair[data-locked="1"] i {
          background: #ff3b3b;
          box-shadow: 0 0 5px rgba(255,59,59,0.95), 0 0 11px rgba(255,59,59,0.55);
        }
        /* Four ticks with a center gap; the gap widens when locked so the
           tightened red state reads as "on target" at a glance. */
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
          opacity: 0.85;
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
