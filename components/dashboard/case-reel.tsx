"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { RARITY_STYLES, type Rarity } from "@/lib/cases";
import { CaseItem3D } from "@/components/cases/case-item-3d";
import { debugLog } from "@/lib/debug";

export const ITEM_WIDTH = 116;
const GAP = 8;
const STEP = ITEM_WIDTH + GAP;

const IDLE_SEC_PER_ITEM = 1.25;
// Warmup speed: 10× faster than idle — gives immediate visual feedback while
// the server call is in flight.
const WARMUP_SEC_PER_ITEM = IDLE_SEC_PER_ITEM * 0.1;

export interface ReelEntry {
  key: string;
  rarity: Rarity;
  type: string;
  name?: string;
}

export interface CaseReelHandle {
  skipToResult: () => void;
}

interface CaseReelProps {
  items: ReelEntry[];
  targetIndex: number;
  spinning: boolean;
  /** True while the server call is in flight — speeds up the idle scroll so
   *  it feels like the machine is "charging up" before the real spin lands. */
  warmup?: boolean;
  spinToken?: number;
  /** Base offset for the shared-Canvas View indices (unique per case group). */
  viewBase?: number;
  onTick?: () => void;
  onSpinComplete?: () => void;
}

function toPreview(entry: ReelEntry) {
  return {
    id: entry.key,
    name: entry.name ?? "",
    rarity: entry.rarity as string,
    type: entry.type,
  };
}

export const CaseReel = forwardRef<CaseReelHandle, CaseReelProps>(function CaseReel(
  { items, targetIndex, spinning, warmup = false, spinToken = 0, viewBase = 1, onTick, onSpinComplete },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(700);
  const x = useMotionValue(0);
  const [justLanded, setJustLanded] = useState(false);

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

    // Always kill whatever was driving x before — idle, warmup and spin must
    // never run two competing tweens on the same motion value (that overlap is
    // exactly what made the warmup→spin handoff stutter / jump).
    activeControlsRef.current?.stop();

    if (spinning) {
      // ── Spin animation ────────────────────────────────────────────────────
      // SEAMLESS HANDOFF: do NOT reset x. We continue from wherever the warmup
      // left the strip and simply decelerate into the winning slot. The parent
      // always puts ~40 filler items BEFORE the target, so translateX is always
      // well to the left of the current position — the motion is one continuous
      // leftward spin with no teleport, no restart and no pause, and it always
      // lands exactly on items[targetIndex] (the real server result).
      const xNow = x.get();
      const dest = translateX;

      debugLog("CaseReel", "spin start", {
        targetIndex,
        itemAtTarget: items[targetIndex]?.name,
        xNow,
        translateX,
        dest,
        containerWidth,
        reelLength: items.length,
      });

      let lastTickIndex = Math.round(x.get() / -STEP);
      const trackTicks = (latest: number) => {
        const idx = Math.round(latest / -STEP);
        if (idx !== lastTickIndex) { lastTickIndex = idx; onTick?.(); }
      };

      // Single continuous deceleration: a strong ease-out carries the bulk of
      // the distance, a soft spring settles the final fraction onto the slot.
      const SNAP_DISTANCE = STEP * 0.12;
      const bulkTarget = dest + SNAP_DISTANCE;

      activeControlsRef.current = animate(x, bulkTarget, {
        duration: 4.0,
        ease: [0.16, 0.84, 0.24, 1],
        onUpdate: trackTicks,
        onComplete: () => {
          if (cancelled) return;
          activeControlsRef.current = animate(x, dest, {
            type: "spring",
            stiffness: 240,
            damping: 30,
            mass: 1,
            onUpdate: trackTicks,
            onComplete: () => {
              if (cancelled) return;
              debugLog("CaseReel", "spin landed", {
                targetIndex,
                itemAtTarget: items[targetIndex]?.name,
                finalX: x.get(),
                expectedX: dest,
              });
              setJustLanded(true);
              onSpinComplete?.();
              setTimeout(() => setJustLanded(false), 520);
            },
          });
        },
      });

      return () => {
        cancelled = true;
        activeControlsRef.current?.stop();
      };
    }

    if (warmup) {
      // ── Warmup: fast scroll continuing from the current x position ──────────
      // displayItems is doubled, so wrapping just means resetting x by loopDist
      // to the visually identical spot. The spin above then picks up from here.
      let fromX = x.get();

      function loopFast() {
        if (cancelled) return;
        const toX = fromX - loopDist;
        activeControlsRef.current = animate(x, toX, {
          duration: items.length * WARMUP_SEC_PER_ITEM,
          ease: "linear",
          onComplete: () => {
            if (cancelled) return;
            fromX = toX + loopDist; // wrap: visually same position (doubled list)
            x.set(fromX);
            loopFast();
          },
        });
      }
      loopFast();

      return () => {
        cancelled = true;
        activeControlsRef.current?.stop();
      };
    }

    // ── Normal idle scroll ────────────────────────────────────────────────
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

    return () => {
      cancelled = true;
      activeControlsRef.current?.stop();
    };
    // items.length is in deps so the idle loop resets with correct loopDist
    // after a spin (when the spin reel is swapped back to the idle reel).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, spinToken, warmup, items.length]);

  return (
    <div
      ref={containerRef}
      className={`relative h-[130px] w-full overflow-hidden rounded-xl bg-transparent ${
        justLanded ? "animate-case-shake" : ""
      }`}
    >
      {/* amber focus window — kept above the shared 3D canvas (z-[60]) */}
      <div
        className="pointer-events-none absolute top-0 bottom-0 left-1/2 z-[60] -translate-x-1/2 border-x-2 border-amber-400/70 bg-amber-400/[0.05] shadow-[inset_0_4px_10px_rgba(0,0,0,0.45)]"
        style={{ width: ITEM_WIDTH }}
      />
      <div className="pointer-events-none absolute -top-[2px] left-1/2 z-[60] h-0 w-0 -translate-x-1/2 border-x-[8px] border-t-[10px] border-x-transparent border-t-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.8)]" />
      <div className="pointer-events-none absolute -bottom-[2px] left-1/2 z-[60] h-0 w-0 -translate-x-1/2 border-x-[8px] border-b-[10px] border-x-transparent border-b-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.8)]" />

      {/* vignette fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#030305] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#030305] to-transparent" />

      {/* warmup glow pulse — amber scanline that signals "charging" */}
      {warmup && (
        <div
          className="pointer-events-none absolute inset-0 z-[60] animate-pulse rounded-xl"
          style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(245,158,11,0.16) 0%, transparent 70%)" }}
        />
      )}

      <motion.div className="flex h-full items-center" style={{ x, gap: GAP }}>
        {displayItems.map((entry, i) => {
          const style = RARITY_STYLES[entry.rarity];
          const isTarget = spinning && i === targetIndex;

          return (
            <div
              key={`${entry.key}-${i}`}
              style={{ width: ITEM_WIDTH }}
              className="flex h-full shrink-0 items-center justify-center"
            >
              <div
                className={`relative flex h-[112px] w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border bg-black/25 backdrop-blur-[2px] transition-all duration-300 ${
                  style.rainbow ? "border-transparent" : style.border
                } ${
                  spinning
                    ? isTarget
                      ? `opacity-100 ${justLanded ? "scale-[1.18]" : "scale-[1.06]"}`
                      : "opacity-60"
                    : "opacity-90 scale-100"
                }`}
              >
                {isTarget && justLanded && style.pulseGlow && (
                  <span aria-hidden className={`absolute inset-0 rounded-lg ${style.pulseGlow}`} />
                )}
                {style.rainbow && <span aria-hidden className="rainbow-border" />}

                {/* 3D item — renders into the shared Canvas mounted in cases-shell */}
                <div className="relative w-full" style={{ height: 76 }}>
                  <CaseItem3D
                    item={toPreview(entry)}
                    viewIndex={viewBase + i}
                    rotate={!spinning || isTarget}
                    rotateSpeed={isTarget ? 0.9 : 0.5}
                  />
                </div>

                <span
                  className={`px-1 text-center text-[10px] font-semibold leading-tight line-clamp-2 ${
                    style.rainbow ? "rainbow-text" : style.text
                  }`}
                >
                  {entry.name ?? "???"}
                </span>
              </div>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
});
