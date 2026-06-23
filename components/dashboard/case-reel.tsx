"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { RARITY_STYLES, type Rarity } from "@/lib/cases";
import { ItemRenderer } from "@/components/items/item-renderer";
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
  onTick?: () => void;
  onSpinComplete?: () => void;
}

export const CaseReel = forwardRef<CaseReelHandle, CaseReelProps>(function CaseReel(
  { items, targetIndex, spinning, warmup = false, spinToken = 0, onTick, onSpinComplete },
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

    if (spinning) {
      // ── Spin animation ────────────────────────────────────────────────────
      // Backtrack a little so every spin visually "starts" from the left even
      // if the target is close to where we are now.
      const BACKTRACK_ITEMS = 18 + Math.floor(Math.random() * 6);
      x.set(translateX + BACKTRACK_ITEMS * STEP);

      debugLog("CaseReel", "spin start", {
        targetIndex,
        itemAtTarget: items[targetIndex]?.name,
        translateX,
        backtrackItems: BACKTRACK_ITEMS,
        containerWidth,
        reelLength: items.length,
      });

      let lastTickIndex = Math.round(x.get() / -STEP);
      const trackTicks = (latest: number) => {
        const idx = Math.round(latest / -STEP);
        if (idx !== lastTickIndex) { lastTickIndex = idx; onTick?.(); }
      };

      const SNAP_DISTANCE = STEP * 0.12;
      const bulkTarget = translateX + SNAP_DISTANCE;

      activeControlsRef.current = animate(x, bulkTarget, {
        duration: 2.2,
        ease: [0.12, 1, 0.28, 1],
        onUpdate: trackTicks,
        onComplete: () => {
          if (cancelled) return;
          activeControlsRef.current = animate(x, translateX, {
            type: "spring",
            stiffness: 260,
            damping: 30,
            mass: 1,
            onUpdate: trackTicks,
            onComplete: () => {
              if (cancelled) return;
              debugLog("CaseReel", "spin landed", {
                targetIndex,
                itemAtTarget: items[targetIndex]?.name,
                finalX: x.get(),
                expectedX: translateX,
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
      // ── Warmup: fast scroll from current x position (no jarring reset) ───
      // displayItems is doubled so wrapping just means setting x += loopDist.
      let fromX = x.get();

      function loopFast() {
        if (cancelled) return;
        const toX = fromX - loopDist;
        animate(x, toX, {
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

      return () => { cancelled = true; };
    }

    // ── Normal idle scroll ────────────────────────────────────────────────
    x.set(0);
    function loopIdle() {
      if (cancelled) return;
      animate(x, -loopDist, {
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

    return () => { cancelled = true; };
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
      {/* amber focus window */}
      <div
        className="pointer-events-none absolute top-0 bottom-0 left-1/2 z-20 -translate-x-1/2 border-x-2 border-amber-400/60 bg-amber-400/[0.06] shadow-[inset_0_4px_10px_rgba(0,0,0,0.45)]"
        style={{ width: ITEM_WIDTH }}
      />
      <div className="pointer-events-none absolute -top-[2px] left-1/2 z-20 h-0 w-0 -translate-x-1/2 border-x-[8px] border-t-[10px] border-x-transparent border-t-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.8)]" />
      <div className="pointer-events-none absolute -bottom-[2px] left-1/2 z-20 h-0 w-0 -translate-x-1/2 border-x-[8px] border-b-[10px] border-x-transparent border-b-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.8)]" />

      {/* vignette fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#030305] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#030305] to-transparent" />

      {/* warmup glow pulse — amber scanline that signals "charging" */}
      {warmup && (
        <div
          className="pointer-events-none absolute inset-0 z-25 animate-pulse rounded-xl"
          style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(245,158,11,0.18) 0%, transparent 70%)" }}
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
                className={`relative flex h-[112px] w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-lg border bg-black/25 backdrop-blur-[2px] transition-all duration-300 ${
                  style.rainbow ? "border-transparent" : style.border
                } ${
                  spinning
                    ? isTarget
                      ? `opacity-100 ${justLanded ? "scale-[1.18]" : "scale-[1.06]"}`
                      : "opacity-55"
                    : "opacity-80 scale-100"
                }`}
              >
                {isTarget && justLanded && style.pulseGlow && (
                  <span aria-hidden className={`absolute inset-0 rounded-lg ${style.pulseGlow}`} />
                )}
                {style.rainbow && <span aria-hidden className="rainbow-border" />}
                <ItemRenderer type={entry.type} rarity={entry.rarity} size="md" />
                <span
                  className={`px-1 text-center text-[10px] font-semibold leading-tight ${
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
