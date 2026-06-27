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
  // Draw window — only slots inside the reel box render real 3D (no leak).
  const [win, setWin] = useState<[number, number]>([0, 9]);
  const winRef = useRef<[number, number]>([0, 9]);
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
      // Only slots FULLY inside the reel box draw 3D — so nothing ever renders
      // in the empty bands left/right of the reel (the reported leak).
      const lo = Math.ceil((4 - val) / STEP);
      const hi = Math.floor((containerWidth - ITEM_WIDTH - 4 - val) / STEP);
      const prev = winRef.current;
      if (prev[0] !== lo || prev[1] !== hi) {
        winRef.current = [lo, hi];
        setWin([lo, hi]);
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
        // Smooth wind-up from the idle scroll, long satisfying deceleration —
        // one continuous motion (no separate warmup, no restart).
        duration: 5.0,
        ease: [0.4, 0, 0.18, 1],
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

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-2xl bg-black/20 ${justLanded ? "animate-case-shake" : ""}`}
      style={{ height: REEL_HEIGHT }}
    >
      {/* amber focus window — above the shared 3D canvas */}
      <div
        className="pointer-events-none absolute top-0 bottom-0 left-1/2 z-[60] -translate-x-1/2 rounded-lg border-x-2 border-amber-400/70 bg-amber-400/[0.05] shadow-[inset_0_4px_10px_rgba(0,0,0,0.45)]"
        style={{ width: ITEM_WIDTH }}
      />
      <div className="pointer-events-none absolute -top-[2px] left-1/2 z-[60] h-0 w-0 -translate-x-1/2 border-x-[9px] border-t-[12px] border-x-transparent border-t-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.85)]" />
      <div className="pointer-events-none absolute -bottom-[2px] left-1/2 z-[60] h-0 w-0 -translate-x-1/2 border-x-[9px] border-b-[12px] border-x-transparent border-b-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.85)]" />

      {/* edge masks — sit ABOVE the canvas (z-[58]) to hide any item straddling
          the reel boundary, so nothing ever appears outside the reel box */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-[58] w-20 bg-gradient-to-r from-[#08060f] via-[#08060f]/80 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-[58] w-20 bg-gradient-to-l from-[#08060f] via-[#08060f]/80 to-transparent" />

      {warmup && (
        <div
          className="pointer-events-none absolute inset-0 z-[59] animate-pulse rounded-2xl"
          style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(245,158,11,0.16) 0%, transparent 70%)" }}
        />
      )}

      <motion.div className="flex h-full items-center" style={{ x, gap: GAP }}>
        {displayItems.map((entry, i) => {
          const style = RARITY_STYLES[entry.rarity];
          const isTarget = spinning && i === targetIndex;
          // MOUNT a buffer of slots beyond the visible box so 3D is fully loaded
          // BEFORE it scrolls in (no empty-then-pop) and stays loaded a little
          // after it leaves. Only slots actually inside the box are DRAWN
          // (visible) — so nothing ever renders outside the reel (no leak).
          const MOUNT_BUF = 3;
          const isMounted = i >= win[0] - MOUNT_BUF && i <= win[1] + MOUNT_BUF;
          const isVisible = i >= win[0] && i <= win[1] && !suppressed;
          const subject = entrySubject(entry);
          const isItem = subject.kind === "item";
          // Character bodies are heavy — only while the reel is calm (idle), not
          // during the fast warmup/spin where items whip past (the win reveal,
          // pool and batch use the character render where it matters).
          const character = isItem && !spinning && !warmup && needsCharacter(entry.type, cfg);

          return (
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
          );
        })}
      </motion.div>
    </div>
  );
});
