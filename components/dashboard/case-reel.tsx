"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { RARITY_STYLES, type Rarity } from "@/lib/cases";
import { RARITY_HEX } from "@/lib/rarity-colors";
import { CaseDropView } from "@/components/cases/case-item-3d";
import type { PreviewSubject } from "@/components/ui/universal-preview-modal";
import {
  DEFAULT_CASE_DISPLAY_CONFIG,
  needsCharacter,
  type CaseDisplayConfig,
} from "@/lib/case-display-config";
import { debugLog } from "@/lib/debug";

const GAP = 10;

const IDLE_SEC_PER_ITEM = 1.25;
// Warmup speed: fast scroll while the server call is in flight.
const WARMUP_SEC_PER_ITEM = IDLE_SEC_PER_ITEM * 0.1;

export interface ReelEntry {
  key: string;
  rarity: Rarity;
  type: string;
  name?: string;
  /** Non-item drops carry an explicit preview subject (name style, ability, …). */
  subject?: PreviewSubject;
}

export interface CaseReelHandle {
  skipToResult: () => void;
}

interface CaseReelProps {
  items: ReelEntry[];
  targetIndex: number;
  spinning: boolean;
  warmup?: boolean;
  spinToken?: number;
  viewBase?: number;
  cfg?: CaseDisplayConfig;
  gender?: "m" | "w";
  /** When true (a modal/popup is open) the reel draws NO 3D so it can't bleed
   *  over the modal via the shared full-viewport canvas. */
  suppressed?: boolean;
  onTick?: () => void;
  onSpinComplete?: () => void;
}

function entrySubject(entry: ReelEntry): PreviewSubject {
  return (
    entry.subject ?? {
      kind: "item",
      item: { id: entry.key, name: entry.name ?? "", rarity: entry.rarity, type: entry.type },
    }
  );
}

export const CaseReel = forwardRef<CaseReelHandle, CaseReelProps>(function CaseReel(
  {
    items, targetIndex, spinning, warmup = false, spinToken = 0, viewBase = 1,
    cfg = DEFAULT_CASE_DISPLAY_CONFIG, gender = "m", suppressed = false, onTick, onSpinComplete,
  },
  ref,
) {
  const ITEM_WIDTH = cfg.reelItemWidth;
  const STEP = ITEM_WIDTH + GAP;
  const REEL_HEIGHT = cfg.reelHeight;
  const ITEM_BOX_H = REEL_HEIGHT - 18;
  const ITEM_3D_H = ITEM_BOX_H - 30;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(700);
  const x = useMotionValue(0);
  const [justLanded, setJustLanded] = useState(false);
  // Two windows over the shared full-viewport 3D canvas:
  //  • win      = slots OVERLAPPING the box (generous) → used for MOUNTING (the
  //    scene loads a touch before it scrolls in so there is no empty-then-pop).
  //  • winDraw  = slots FULLY CONTAINED in the box → used for DRAWING (visible).
  // drei scissors a slot's View to that slot's own rect; a slot that is fully
  // inside the box therefore scissors entirely inside the box → it can NEVER
  // render outside the reel. That is the hard anti-leak guarantee (no canvas
  // tricks needed) — the only cost is items pop at the very edge, hidden under
  // the edge masks below.
  const [win, setWin] = useState<[number, number]>([0, 9]);
  const winRef = useRef<[number, number]>([0, 9]);
  const [winDraw, setWinDraw] = useState<[number, number]>([0, 9]);
  const winDrawRef = useRef<[number, number]>([0, 9]);
  const lastWinAt = useRef(0);

  const activeControlsRef = useRef<ReturnType<typeof animate> | null>(null);
  const translateXRef = useRef(0);
  const onSpinCompleteRef = useRef(onSpinComplete);
  onSpinCompleteRef.current = onSpinComplete;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.offsetWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const displayItems = spinning ? items : [...items, ...items];

  const translateX = -(targetIndex * STEP) + (containerWidth / 2 - ITEM_WIDTH / 2);
  translateXRef.current = translateX;

  // ── Draw-window tracking (cull everything outside the reel box) ─────────────
  useEffect(() => {
    const compute = (val: number) => {
      // Overlap window (mount): every slot that touches the box, plus the ones
      // just sliding in/out, so the scene is ready before it is shown.
      const lo = Math.floor((-ITEM_WIDTH - val) / STEP);
      const hi = Math.ceil((containerWidth - val) / STEP);
      const prev = winRef.current;
      if (prev[0] !== lo || prev[1] !== hi) {
        winRef.current = [lo, hi];
        setWin([lo, hi]);
      }
      // Containment window (draw): a slot i occupies [i*STEP + val, +ITEM_WIDTH]
      // in container space. Fully inside ⇒ left ≥ 0 AND right ≤ containerWidth.
      const dLo = Math.ceil(-val / STEP);
      const dHi = Math.floor((containerWidth - ITEM_WIDTH - val) / STEP);
      const prevD = winDrawRef.current;
      if (prevD[0] !== dLo || prevD[1] !== dHi) {
        winDrawRef.current = [dLo, dHi];
        setWinDraw([dLo, dHi]);
      }
    };
    compute(x.get());
    const unsub = x.on("change", (v) => {
      const now = performance.now();
      if (now - lastWinAt.current < 40) return;
      lastWinAt.current = now;
      compute(v);
    });
    return () => unsub();
  }, [containerWidth, STEP, ITEM_WIDTH, x]);

  useImperativeHandle(
    ref,
    () => ({
      skipToResult: () => {
        activeControlsRef.current?.stop();
        x.set(translateXRef.current);
        setJustLanded(true);
        onSpinCompleteRef.current?.();
        setTimeout(() => setJustLanded(false), 520);
      },
    }),
    [x],
  );

  useEffect(() => {
    let cancelled = false;
    const loopDist = items.length * STEP;
    activeControlsRef.current?.stop();

    if (spinning) {
      // Seamless deceleration from the current position to the winning slot.
      const dest = translateX;
      debugLog("CaseReel", "spin start", { targetIndex, xNow: x.get(), dest });

      let lastTickIndex = Math.round(x.get() / -STEP);
      const trackTicks = (latest: number) => {
        const idx = Math.round(latest / -STEP);
        if (idx !== lastTickIndex) { lastTickIndex = idx; onTick?.(); }
      };

      const SNAP_DISTANCE = STEP * 0.12;
      activeControlsRef.current = animate(x, dest + SNAP_DISTANCE, {
        // Fast start (continues the warmup speed → seamless, no restart) into a
        // long satisfying deceleration onto the winning slot.
        duration: 4.2,
        ease: [0.16, 0.84, 0.24, 1],
        onUpdate: trackTicks,
        onComplete: () => {
          if (cancelled) return;
          activeControlsRef.current = animate(x, dest, {
            type: "spring", stiffness: 240, damping: 30, mass: 1,
            onUpdate: trackTicks,
            onComplete: () => {
              if (cancelled) return;
              setJustLanded(true);
              onSpinComplete?.();
              setTimeout(() => setJustLanded(false), 520);
            },
          });
        },
      });

      return () => { cancelled = true; activeControlsRef.current?.stop(); };
    }

    if (warmup) {
      let fromX = x.get();
      function loopFast() {
        if (cancelled) return;
        const toX = fromX - loopDist;
        activeControlsRef.current = animate(x, toX, {
          duration: items.length * WARMUP_SEC_PER_ITEM,
          ease: "linear",
          onComplete: () => {
            if (cancelled) return;
            fromX = toX + loopDist;
            x.set(fromX);
            loopFast();
          },
        });
      }
      loopFast();
      return () => { cancelled = true; activeControlsRef.current?.stop(); };
    }

    // Idle scroll
    x.set(0);
    function loopIdle() {
      if (cancelled) return;
      activeControlsRef.current = animate(x, -loopDist, {
        duration: items.length * IDLE_SEC_PER_ITEM,
        ease: "linear",
        onComplete: () => {
          if (cancelled) return;
          x.set(0);
          loopIdle();
        },
      });
    }
    loopIdle();
    return () => { cancelled = true; activeControlsRef.current?.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, spinToken, warmup, items.length, STEP]);

  // Per-slot render data. MOUNT on the generous overlap window (+buffer) so the
  // scene preloads; DRAW only when the slot is fully inside the box (winDraw) so
  // its View scissor can never reach outside the reel — the hard no-leak rule.
  const MOUNT_BUF = 3;
  const slots = displayItems.map((entry, i) => {
    const isItem = (entry.subject?.kind ?? "item") === "item";
    return {
      entry,
      i,
      style: RARITY_STYLES[entry.rarity],
      isTarget: spinning && i === targetIndex,
      isMounted: i >= win[0] - MOUNT_BUF && i <= win[1] + MOUNT_BUF,
      isVisible: i >= winDraw[0] && i <= winDraw[1] && !suppressed,
      subject: entrySubject(entry),
      // Character bodies are heavy — only while the reel is calm (idle), not in
      // the fast warmup/spin where items whip past. Win reveal / pool / batch
      // use the character render where it actually matters.
      character: isItem && !spinning && !warmup && needsCharacter(entry.type, cfg),
    };
  });

  return (
    <div className="relative w-full" style={{ height: REEL_HEIGHT }}>
      {/* Outer band masks — cover the area just LEFT/RIGHT of the reel box and
          fade to the page colour. With full-containment culling nothing is drawn
          outside the box anyway; these stay as a safety belt + clean page blend. */}
      <div
        className="pointer-events-none absolute top-0 bottom-0 z-[45]"
        style={{ right: "100%", width: ITEM_WIDTH + 48, background: "linear-gradient(to right, transparent, #08060f 78%)" }}
      />
      <div
        className="pointer-events-none absolute top-0 bottom-0 z-[45]"
        style={{ left: "100%", width: ITEM_WIDTH + 48, background: "linear-gradient(to left, transparent, #08060f 78%)" }}
      />

      <div
        ref={containerRef}
        className={`relative h-full w-full overflow-hidden rounded-2xl bg-black/20 ${justLanded ? "animate-case-shake" : ""}`}
      >
        {/* amber focus window — above the shared 3D canvas */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 left-1/2 z-[60] -translate-x-1/2 rounded-lg border-x-2 border-amber-400/70 bg-amber-400/[0.05] shadow-[inset_0_4px_10px_rgba(0,0,0,0.45)]"
          style={{ width: ITEM_WIDTH }}
        />
        <div className="pointer-events-none absolute -top-[2px] left-1/2 z-[60] h-0 w-0 -translate-x-1/2 border-x-[9px] border-t-[12px] border-x-transparent border-t-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.85)]" />
        <div className="pointer-events-none absolute -bottom-[2px] left-1/2 z-[60] h-0 w-0 -translate-x-1/2 border-x-[9px] border-b-[12px] border-x-transparent border-b-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.85)]" />

        {/* edge masks — sit ABOVE the canvas (z-58) so the slot that is popping
            in/out right at the boundary is hidden under a soft fade. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-[58] w-20 bg-gradient-to-r from-[#08060f] via-[#08060f]/80 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-[58] w-20 bg-gradient-to-l from-[#08060f] via-[#08060f]/80 to-transparent" />

        {warmup && (
          <div
            className="pointer-events-none absolute inset-0 z-[59] animate-pulse rounded-2xl"
            style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(245,158,11,0.16) 0%, transparent 70%)" }}
          />
        )}

        <motion.div className="flex h-full items-center" style={{ x, gap: GAP }}>
          {slots.map(({ entry, i, style, isTarget, isMounted, isVisible, subject, character }) => (
            <div key={`${entry.key}-${i}`} style={{ width: ITEM_WIDTH }} className="flex h-full shrink-0 items-center justify-center">
              <div
                className={`relative flex w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border bg-black/25 backdrop-blur-[2px] transition-all duration-300 ${
                  style.rainbow ? "border-transparent" : style.border
                } ${
                  spinning
                    ? isTarget
                      ? `opacity-100 ${justLanded ? "scale-[1.16]" : "scale-[1.05]"}`
                      : "opacity-60"
                    : "opacity-95 scale-100"
                }`}
                style={{ height: ITEM_BOX_H }}
              >
                {isTarget && justLanded && style.pulseGlow && (
                  <span aria-hidden className={`absolute inset-0 rounded-xl ${style.pulseGlow}`} />
                )}
                {style.rainbow && <span aria-hidden className="rainbow-border" />}

                <div className="relative w-full" style={{ height: ITEM_3D_H }}>
                  {isMounted ? (
                    <CaseDropView
                      subject={subject}
                      viewIndex={viewBase + i}
                      visible={isVisible}
                      rotate={cfg.autoRotate && (!spinning || isTarget)}
                      rotateSpeed={cfg.rotateSpeed * (isTarget ? 1.5 : 1)}
                      gender={gender}
                      character={character}
                      scale={cfg.reelItemScale}
                    />
                  ) : (
                    <div
                      className="absolute inset-0 rounded-md"
                      style={{ background: `radial-gradient(circle at 50% 45%, ${RARITY_HEX[entry.rarity]}18 0%, transparent 72%)` }}
                    />
                  )}
                </div>

                <span className={`px-1 text-center text-[11px] font-semibold leading-tight line-clamp-2 ${style.rainbow ? "rainbow-text" : style.text}`}>
                  {entry.name ?? "???"}
                </span>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
});
