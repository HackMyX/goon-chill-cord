"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { RefObject } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { Canvas } from "@react-three/fiber";
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

  // Stable per-slot DOM refs. Each mounted slot's 3D-area box is the TRACK that
  // the dedicated reel <Canvas> below scissors its View to. WebGL clamps every
  // scissor to the canvas framebuffer (= the overflow-hidden reel box), so an
  // item sliding past the edge is physically cut at the box — no 3D ever leaks
  // outside the reel (the old shared-canvas + CSS-mask approach could bleed).
  const slotRefs = useRef<Map<number, RefObject<HTMLDivElement | null>>>(new Map());
  const getSlotRef = (i: number): RefObject<HTMLDivElement | null> => {
    let r = slotRefs.current.get(i);
    if (!r) { r = { current: null }; slotRefs.current.set(i, r); }
    return r;
  };

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
      // Draw every slot that OVERLAPS the reel box (incl. the ones sliding in at
      // the front and out at the back) so an item is always shown right to the
      // edge — no blinking in/out. The part that pokes outside the box is hidden
      // by the outer band masks below (drei can only scissor to the full-screen
      // canvas, not to the reel box, so the masks do the edge clipping).
      const lo = Math.floor((-ITEM_WIDTH - val) / STEP);
      const hi = Math.ceil((containerWidth - val) / STEP);
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

  // Per-slot render data, derived once and shared by the DOM chrome (borders,
  // labels, fallback glow) and the dedicated reel canvas (the 3D itself). A
  // MOUNT buffer beyond the visible box keeps 3D fully loaded BEFORE it scrolls
  // in (no empty-then-pop) and a little after it leaves; only slots actually
  // inside the box are DRAWN (visible).
  const MOUNT_BUF = 3;
  const slots = displayItems.map((entry, i) => {
    const isItem = (entry.subject?.kind ?? "item") === "item";
    return {
      entry,
      i,
      style: RARITY_STYLES[entry.rarity],
      isTarget: spinning && i === targetIndex,
      isMounted: i >= win[0] - MOUNT_BUF && i <= win[1] + MOUNT_BUF,
      isVisible: i >= win[0] && i <= win[1] && !suppressed,
      subject: entrySubject(entry),
      // Character bodies are heavy — only while the reel is calm (idle), not in
      // the fast warmup/spin where items whip past. Win reveal / pool / batch
      // use the character render where it actually matters.
      character: isItem && !spinning && !warmup && needsCharacter(entry.type, cfg),
    };
  });

  return (
    <div className="relative w-full" style={{ height: REEL_HEIGHT }}>
      <div
        ref={containerRef}
        className={`relative h-full w-full overflow-hidden rounded-2xl bg-black/20 ${justLanded ? "animate-case-shake" : ""}`}
      >
        {/* ── DOM chrome (z-10): slot box, border, rarity glow, label. Each
            mounted slot's 3D-area box is an empty TRACK <div> the canvas draws
            into; un-mounted slots show a cheap rarity-tinted fallback glow. ── */}
        <motion.div className="relative z-[10] flex h-full items-center" style={{ x, gap: GAP }}>
          {slots.map(({ entry, i, style, isTarget, isMounted }) => (
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

                <div ref={getSlotRef(i)} className="relative w-full" style={{ height: ITEM_3D_H }}>
                  {!isMounted && (
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

        {/* ── Dedicated, box-clipped 3D canvas (z-30). position:absolute inset-0
            inside the overflow-hidden box → physically clipped. Each mounted
            slot's View scissors to its track <div>, clamped by WebGL to this
            framebuffer (= the box). NOTHING can render outside the reel. Lives
            in normal flow, so fixed modals (z-120) always cover it. ── */}
        <Canvas
          style={{ position: "absolute", inset: 0, zIndex: 30, pointerEvents: "none" }}
          dpr={[1, 1.5]}
          gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        >
          {slots
            .filter((s) => s.isMounted)
            .map(({ i, subject, isVisible, isTarget, character }) => (
              <CaseDropView
                key={i}
                subject={subject}
                viewIndex={viewBase + i}
                visible={isVisible}
                rotate={cfg.autoRotate && (!spinning || isTarget)}
                rotateSpeed={cfg.rotateSpeed * (isTarget ? 1.5 : 1)}
                gender={gender}
                character={character}
                scale={cfg.reelItemScale}
                track={getSlotRef(i) as RefObject<HTMLElement | null>}
              />
            ))}
        </Canvas>

        {/* amber focus window (z-60) — above the reel canvas */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 left-1/2 z-[60] -translate-x-1/2 rounded-lg border-x-2 border-amber-400/70 bg-amber-400/[0.05] shadow-[inset_0_4px_10px_rgba(0,0,0,0.45)]"
          style={{ width: ITEM_WIDTH }}
        />
        <div className="pointer-events-none absolute -top-[2px] left-1/2 z-[60] h-0 w-0 -translate-x-1/2 border-x-[9px] border-t-[12px] border-x-transparent border-t-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.85)]" />
        <div className="pointer-events-none absolute -bottom-[2px] left-1/2 z-[60] h-0 w-0 -translate-x-1/2 border-x-[9px] border-b-[12px] border-x-transparent border-b-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.85)]" />

        {/* edge masks (z-58) — purely cosmetic fade now that clipping is physical:
            items melt softly into the box edges instead of a hard pixel cut. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-[58] w-20 bg-gradient-to-r from-[#08060f] via-[#08060f]/80 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-[58] w-20 bg-gradient-to-l from-[#08060f] via-[#08060f]/80 to-transparent" />

        {warmup && (
          <div
            className="pointer-events-none absolute inset-0 z-[59] animate-pulse rounded-2xl"
            style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(245,158,11,0.16) 0%, transparent 70%)" }}
          />
        )}
      </div>
    </div>
  );
});
