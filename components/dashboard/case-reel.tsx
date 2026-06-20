"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { RARITY_STYLES, type Rarity } from "@/lib/cases";
import { ItemRenderer } from "@/components/items/item-renderer";
import { debugLog } from "@/lib/debug";

export const ITEM_WIDTH = 116;
// Must match the track's actual flex `gap` below — every prior version of
// this component computed translateX/tick-index using ITEM_WIDTH alone
// while the track also had a `gap-2` (8px) between items. That mismatch
// grows with the target's index (up to ~400px off at index 48), which
// visually misaligned the amber focus window from the mathematically
// correct target — i.e. the bug where "the item under the arrow isn't the
// one you actually get". STEP is now the single source of truth for both
// the visual gap and all position math; there is no separate leading
// padding on the track to avoid a second, harder-to-see fudge factor.
const GAP = 8;
const STEP = ITEM_WIDTH + GAP;

export interface ReelEntry {
  key: string;
  rarity: Rarity;
  type: string;
  name?: string;
}

interface CaseReelProps {
  items: ReelEntry[];
  targetIndex: number;
  spinning: boolean;
  /** Bump on every new spin request, even while already spinning — lets a
   * rapid re-click smoothly redirect the in-flight animation toward the new
   * target instead of being ignored until the current spin fully lands. */
  spinToken?: number;
  onTick?: () => void;
  onSpinComplete?: () => void;
}

export function CaseReel({
  items,
  targetIndex,
  spinning,
  spinToken = 0,
  onTick,
  onSpinComplete,
}: CaseReelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(700);
  const x = useMotionValue(0);
  const [justLanded, setJustLanded] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.offsetWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const translateX = -(targetIndex * STEP) + (containerWidth / 2 - ITEM_WIDTH / 2);

  useEffect(() => {
    if (!spinning) {
      x.set(translateX);
      return;
    }

    // `targetIndex` is always the same constant (the filler array is always
    // built the same length), so translateX is identical on every spin —
    // meaning x is usually *already sitting exactly there* from the last
    // landing. Without this jump, stage 1 would have ~0px left to travel
    // and the whole "spin" would collapse into the small stage-2 snap: a
    // tiny jiggle that "suddenly" reveals an item instead of a real spin.
    // Jumping backward by a randomized number of items first (instantly,
    // no animation — happens before the browser paints this frame)
    // guarantees a real, satisfying travel distance every single time,
    // regardless of where the previous spin happened to land.
    const BACKTRACK_ITEMS = 30 + Math.floor(Math.random() * 8); // 30..37
    x.set(translateX + BACKTRACK_ITEMS * STEP);

    debugLog("CaseReel", "spin start", {
      targetIndex,
      itemAtTarget: items[targetIndex]?.name,
      translateX,
      startX: x.get(),
      backtrackItems: BACKTRACK_ITEMS,
      containerWidth,
      reelLength: items.length,
    });

    let lastTickIndex = Math.round(x.get() / -STEP);
    let activeControls: ReturnType<typeof animate> | null = null;

    const trackTicks = (latest: number) => {
      const idx = Math.round(latest / -STEP);
      if (idx !== lastTickIndex) {
        lastTickIndex = idx;
        onTick?.();
      }
    };

    // Stage 1: high-speed bulk travel, decelerating to *just barely* short
    // of the target. This used to stop short by 0.9 of an item-width —
    // visually that's basically a whole neighboring item, so stage 1's slow
    // deceleration would settle on index (target-1) for long enough that
    // the eye reads *that* as the winner, and then stage 2 would slide one
    // more item over to reveal the real target — exactly the "it grants
    // the item to the right of the arrow, not the one under it" bug. A
    // small fraction of an item-width still gives stage 2 a real distance
    // to snap (so it doesn't feel like a hard cut), but it's now too small
    // for any neighboring item to ever look "settled" in the window.
    const SNAP_DISTANCE = STEP * 0.12;
    const bulkTarget = translateX + SNAP_DISTANCE;

    activeControls = animate(x, bulkTarget, {
      duration: 4.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: trackTicks,
      onComplete: () => {
        // Stage 2: short, near-critically-damped spring snap onto the exact
        // pixel target — a crisp stop with a faint tactile "give", but no
        // visible bounce/oscillation past the target (that bounce was the
        // other half of the "it jumps around" complaint).
        activeControls = animate(x, translateX, {
          type: "spring",
          stiffness: 260,
          damping: 30,
          mass: 1,
          onUpdate: trackTicks,
          onComplete: () => {
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

    return () => activeControls?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only re-run when a new spin starts (spinToken bump covers rapid re-clicks)
  }, [spinning, spinToken]);

  return (
    <div
      ref={containerRef}
      className={`relative h-[130px] w-full overflow-hidden rounded-xl bg-transparent ${
        justLanded ? "animate-case-shake" : ""
      }`}
    >
      {/* focus window: amber side-rails + inset shadow, layered above the strip */}
      <div
        className="pointer-events-none absolute top-0 bottom-0 left-1/2 z-20 -translate-x-1/2 border-x-2 border-amber-400/60 bg-amber-400/[0.06] shadow-[inset_0_4px_10px_rgba(0,0,0,0.45)] transition-shadow duration-500"
        style={{ width: ITEM_WIDTH }}
      />
      <div className="pointer-events-none absolute -top-[2px] left-1/2 z-20 h-0 w-0 -translate-x-1/2 border-x-[8px] border-t-[10px] border-x-transparent border-t-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.8)]" />
      <div className="pointer-events-none absolute -bottom-[2px] left-1/2 z-20 h-0 w-0 -translate-x-1/2 border-x-[8px] border-b-[10px] border-x-transparent border-b-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.8)]" />

      <motion.div ref={trackRef} className="flex h-full items-center" style={{ x, gap: GAP }}>
        {items.map((entry, i) => {
          const style = RARITY_STYLES[entry.rarity];
          const isTarget = i === targetIndex;

          return (
            <div
              key={entry.key}
              style={{ width: ITEM_WIDTH }}
              className="flex h-full shrink-0 items-center justify-center"
            >
              <div
                className={`relative flex h-[112px] w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-lg border bg-black/25 backdrop-blur-[2px] transition-all duration-300 ${
                  style.rainbow ? "border-transparent" : style.border
                } ${
                  isTarget
                    ? `opacity-100 ${justLanded ? "scale-[1.18]" : "scale-[1.06]"}`
                    : "opacity-55"
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
}
