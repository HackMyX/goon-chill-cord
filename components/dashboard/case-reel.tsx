"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { RARITY_STYLES, type Rarity } from "@/lib/cases";
import { ItemRenderer } from "@/components/items/item-renderer";

export const ITEM_WIDTH = 116;

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

  const translateX = -(targetIndex * ITEM_WIDTH) + (containerWidth / 2 - ITEM_WIDTH / 2);

  useEffect(() => {
    if (!spinning) {
      x.set(translateX);
      return;
    }

    let lastTickIndex = Math.round(x.get() / -ITEM_WIDTH);
    let activeControls: ReturnType<typeof animate> | null = null;

    const trackTicks = (latest: number) => {
      const idx = Math.round(latest / -ITEM_WIDTH);
      if (idx !== lastTickIndex) {
        lastTickIndex = idx;
        onTick?.();
      }
    };

    // Stage 1: high-speed bulk travel, decelerating to just short of the
    // target so stage 2 always has a real (small) distance left to snap.
    const SNAP_DISTANCE = ITEM_WIDTH * 0.9;
    const bulkTarget = translateX + SNAP_DISTANCE;

    activeControls = animate(x, bulkTarget, {
      duration: 4.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: trackTicks,
      onComplete: () => {
        // Stage 2: short, slightly bouncy spring snap onto the exact pixel
        // target — the tactile "click" feel, without sacrificing precision.
        activeControls = animate(x, translateX, {
          type: "spring",
          stiffness: 320,
          damping: 22,
          mass: 0.9,
          onUpdate: trackTicks,
          onComplete: () => {
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
      className={`relative h-[130px] w-full overflow-hidden rounded-xl border border-white/10 bg-[#08081e] shadow-[inset_0_2px_12px_rgba(0,0,0,0.6),inset_0_0_0_1px_rgba(255,255,255,0.03)] ${
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

      <motion.div ref={trackRef} className="flex h-full items-center gap-2 px-1" style={{ x }}>
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
                className={`relative flex h-[112px] w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-lg border bg-[#0d0c1c] transition-all duration-300 ${
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
