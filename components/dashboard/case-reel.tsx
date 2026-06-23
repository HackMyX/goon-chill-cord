"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { RARITY_STYLES, type Rarity } from "@/lib/cases";
import { ItemRenderer } from "@/components/items/item-renderer";
import { debugLog } from "@/lib/debug";

export const ITEM_WIDTH = 116;
// Single source of truth for item + gap step (px) used for all position math.
const GAP = 8;
const STEP = ITEM_WIDTH + GAP;

// Idle scroll: seconds per item passing the center window.
const IDLE_SEC_PER_ITEM = 1.25;

export interface ReelEntry {
  key: string;
  rarity: Rarity;
  type: string;
  name?: string;
}

export interface CaseReelHandle {
  /** Skip the running spin animation and snap immediately to the result. */
  skipToResult: () => void;
}

interface CaseReelProps {
  items: ReelEntry[];
  targetIndex: number;
  spinning: boolean;
  /** Bump on every new spin request to trigger the animation effect. */
  spinToken?: number;
  onTick?: () => void;
  onSpinComplete?: () => void;
}

export const CaseReel = forwardRef<CaseReelHandle, CaseReelProps>(function CaseReel(
  { items, targetIndex, spinning, spinToken = 0, onTick, onSpinComplete },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(700);
  const x = useMotionValue(0);
  const [justLanded, setJustLanded] = useState(false);

  // Refs for stable access from useImperativeHandle (avoids stale closures).
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

  // During idle: display doubled items for seamless looping.
  // During spinning: display the full spin reel (single copy, 40+1+8 items).
  const displayItems = spinning ? items : [...items, ...items];

  const translateX = -(targetIndex * STEP) + (containerWidth / 2 - ITEM_WIDTH / 2);
  // Keep ref current so skipToResult always snaps to the right position.
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
    if (!spinning) {
      // Idle infinite scroll: animate from x=0 → x=-(items.length*STEP),
      // then instantly reset to 0 (seamless because displayItems is doubled).
      x.set(0);
      const loopDist = items.length * STEP;
      const duration = items.length * IDLE_SEC_PER_ITEM;
      let cancelled = false;

      function loop() {
        if (cancelled) return;
        animate(x, -loopDist, {
          duration,
          ease: "linear",
          onComplete: () => {
            if (cancelled) return;
            x.set(0);
            loop();
          },
        });
      }
      loop();

      return () => {
        cancelled = true;
      };
    }

    // Spinning: jump back then fast-travel to target, spring-snap to exact pixel.
    // The backtrack makes every spin feel like a real spin even when the target
    // mathematically lands near where the previous spin ended.
    const BACKTRACK_ITEMS = 30 + Math.floor(Math.random() * 8); // 30–37
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

    const trackTicks = (latest: number) => {
      const idx = Math.round(latest / -STEP);
      if (idx !== lastTickIndex) {
        lastTickIndex = idx;
        onTick?.();
      }
    };

    // Stage 1: high-speed bulk travel with strong deceleration, stopping just
    // short of the target so stage 2 has a real (short) snap to add tactile
    // weight without the neighboring item ever looking "settled".
    const SNAP_DISTANCE = STEP * 0.12;
    const bulkTarget = translateX + SNAP_DISTANCE;

    activeControlsRef.current = animate(x, bulkTarget, {
      duration: 4.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: trackTicks,
      onComplete: () => {
        // Stage 2: spring snap — crisp landing, faint tactile "give", zero bounce.
        activeControlsRef.current = animate(x, translateX, {
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

    return () => {
      activeControlsRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- spinToken bump re-triggers on each new spin; items.length dep not needed (spinning flag change is what matters)
  }, [spinning, spinToken]);

  return (
    <div
      ref={containerRef}
      className={`relative h-[130px] w-full overflow-hidden rounded-xl bg-transparent ${
        justLanded ? "animate-case-shake" : ""
      }`}
    >
      {/* amber focus window — center guide rail + pointer arrows */}
      <div
        className="pointer-events-none absolute top-0 bottom-0 left-1/2 z-20 -translate-x-1/2 border-x-2 border-amber-400/60 bg-amber-400/[0.06] shadow-[inset_0_4px_10px_rgba(0,0,0,0.45)]"
        style={{ width: ITEM_WIDTH }}
      />
      <div className="pointer-events-none absolute -top-[2px] left-1/2 z-20 h-0 w-0 -translate-x-1/2 border-x-[8px] border-t-[10px] border-x-transparent border-t-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.8)]" />
      <div className="pointer-events-none absolute -bottom-[2px] left-1/2 z-20 h-0 w-0 -translate-x-1/2 border-x-[8px] border-b-[10px] border-x-transparent border-b-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.8)]" />

      {/* left/right vignette fades — smooth the strip into the background */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#030305] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#030305] to-transparent" />

      <motion.div className="flex h-full items-center" style={{ x, gap: GAP }}>
        {displayItems.map((entry, i) => {
          const style = RARITY_STYLES[entry.rarity];
          // Only mark a target during a real spin — never during the idle scroll.
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
