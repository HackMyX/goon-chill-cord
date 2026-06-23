"use client";

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { Coins, Zap } from "lucide-react";
import { CaseReel, type CaseReelHandle, type ReelEntry } from "@/components/dashboard/case-reel";
import { ChanceBar } from "@/components/dashboard/chance-bar";
import { RarityBadge } from "@/components/dashboard/rarity-badge";
import { ItemRenderer } from "@/components/items/item-renderer";
import { ItemStatBadges } from "@/components/items/item-stat-badges";
import { openCase, type WonItem } from "@/lib/actions/cases";
import { RARITY_ORDER, getTypeLabel, type CaseGroup, type CaseTier, type Rarity } from "@/lib/cases";
import { getCaseIcon } from "@/lib/case-icons";
import { useSoundManager } from "@/lib/sound-manager";
import { debugLog } from "@/lib/debug";
import { RARITY_HEX } from "@/lib/rarity-colors";
import { useSiteConfig } from "@/components/layout/site-config-provider";

const CONFETTI_BY_RARITY: Record<Rarity, () => void> = {
  normal: () => {
    confetti({
      particleCount: 22,
      spread: 50,
      startVelocity: 22,
      origin: { y: 0.6 },
      colors: ["#3b82f6", "#93c5fd", "#e0f2fe"],
    });
  },
  selten: () => {
    confetti({
      particleCount: 50,
      spread: 65,
      startVelocity: 32,
      origin: { y: 0.58 },
      colors: ["#a855f7", "#d8b4fe", "#f3e8ff"],
    });
  },
  mythisch: () => {
    confetti({
      particleCount: 85,
      spread: 80,
      startVelocity: 38,
      origin: { y: 0.56 },
      colors: ["#f59e0b", "#fbbf24", "#fff7ed"],
    });
    setTimeout(
      () =>
        confetti({
          particleCount: 35,
          spread: 100,
          startVelocity: 28,
          origin: { y: 0.56 },
          colors: ["#f59e0b", "#fde68a"],
        }),
      150
    );
  },
  ultra: () => {
    confetti({
      particleCount: 130,
      spread: 95,
      startVelocity: 45,
      origin: { y: 0.55 },
      colors: ["#ff3b3b", "#ff8a00", "#ffe600", "#3bff5e", "#00e5ff", "#b14bff"],
    });
    setTimeout(
      () =>
        confetti({
          particleCount: 80,
          spread: 120,
          startVelocity: 50,
          origin: { y: 0.5 },
          colors: ["#ff3b3b", "#ff8a00", "#ffe600", "#3bff5e", "#00e5ff", "#b14bff"],
        }),
      180
    );
  },
};

function fireWinCelebration(rarity: Rarity) {
  CONFETTI_BY_RARITY[rarity]();
}

interface PreviewItem {
  rarity: Rarity;
  type: string;
  name: string;
}

interface CaseOpeningSectionProps {
  group: CaseGroup;
  credits: number;
  previewPool: PreviewItem[];
  poolSize: number;
  onCreditsChange: (newCredits: number) => void;
}

type Phase = "idle" | "pending" | "spinning" | "result";

const PLACEHOLDER_COUNT = 13;

/** Deterministic — identical on server and client, so the very first paint
 * never depends on Math.random() and can never hydration-mismatch. */
function buildPlaceholderReel(types: string[]): ReelEntry[] {
  const type = types[0] ?? "weapon";
  return Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => ({
    key: `placeholder-${i}`,
    rarity: "normal" as Rarity,
    type,
  }));
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildFiller(count: number, prefix: string, pool: PreviewItem[], types: string[]): ReelEntry[] {
  return Array.from({ length: count }, (_, i) => {
    if (pool.length > 0) {
      const p = randomFrom(pool);
      return { key: `${prefix}-${i}`, rarity: p.rarity, type: p.type, name: p.name };
    }
    return {
      key: `${prefix}-${i}`,
      rarity: randomFrom(RARITY_ORDER),
      type: randomFrom(types),
    };
  });
}

export function CaseOpeningSection({
  group,
  credits,
  previewPool,
  poolSize,
  onCreditsChange,
}: CaseOpeningSectionProps) {
  const Icon = getCaseIcon(group.iconName);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [wonItem, setWonItem] = useState<WonItem | null>(null);
  const [spinToken, setSpinToken] = useState(0);
  const mounted = useRef(false);
  const fetchingRef = useRef(false);
  const caseReelRef = useRef<CaseReelHandle>(null);
  const { currencyName } = useSiteConfig();
  const sound = useSoundManager();

  // SSR + first client paint render the exact same placeholder reel. Real,
  // randomized preview items are only generated client-side after mount —
  // this is the fix for the hydration mismatch (Math.random() must never
  // run during the render that produces the initial HTML).
  const placeholderReel = useMemo(() => buildPlaceholderReel(group.itemTypes), [group.itemTypes]);
  const [reel, setReel] = useState<ReelEntry[]>(placeholderReel);
  const [targetIndex, setTargetIndex] = useState(Math.floor(PLACEHOLDER_COUNT / 2));

  const idleReelRef = useRef<ReelEntry[]>(placeholderReel);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    const randomized = buildFiller(PLACEHOLDER_COUNT, "idle", previewPool, group.itemTypes);
    idleReelRef.current = randomized;
    setReel(randomized);
  }, [previewPool, group.itemTypes]);

  // Let the ambient background react to an active spin (see globals.css'
  // `[data-case-spinning]` rules on the mesh-gradient blobs) without needing
  // a global state manager for something this small.
  useEffect(() => {
    if (phase !== "spinning") return;
    document.documentElement.setAttribute("data-case-spinning", "true");
    return () => document.documentElement.removeAttribute("data-case-spinning");
  }, [phase]);

  async function handleOpen(tier: CaseTier) {
    // Only allow a new open when the UI is fully idle — spin and result phases
    // both lock the button so the player always sees what they won before the
    // next spin can start. The fetchingRef guards against the rare race where
    // the button is clicked twice before the first React re-render disables it.
    if (fetchingRef.current || phase !== "idle") return;
    fetchingRef.current = true;
    setPhase("pending"); // lock buttons immediately, before server roundtrip
    setError(null);
    setWonItem(null);
    sound.click();

    const result = await openCase(tier.id);
    fetchingRef.current = false;
    debugLog("CaseOpening", `server result for tier "${tier.id}"`, result);

    if (!result.success || !result.item) {
      setError(result.error ?? "Unbekannter Fehler.");
      sound.error();
      setPhase("idle"); // always return to idle on error so buttons unlock
      return;
    }

    const target: ReelEntry = {
      key: "target",
      rarity: result.item.rarity as Rarity,
      type: result.item.type,
      name: result.item.name,
    };

    const before = buildFiller(40, "before", previewPool, group.itemTypes);
    const after = buildFiller(8, "after", previewPool, group.itemTypes);

    setReel([...before, target, ...after]);
    setTargetIndex(before.length);
    setWonItem(result.item);
    setPhase("spinning");
    setSpinToken((t) => t + 1);
    onCreditsChange(result.newCredits!);
    debugLog("CaseOpening", "reel built", {
      targetIndex: before.length,
      target,
      reelLength: before.length + 1 + after.length,
    });
  }

  function handleContinue() {
    setReel(idleReelRef.current);
    setTargetIndex(Math.floor(PLACEHOLDER_COUNT / 2));
    setWonItem(null);
    setPhase("idle");
  }

  // Auto-dismiss the result overlay after 3 s so the player can spin again
  // without having to click anything. They can also tap the overlay to skip.
  useEffect(() => {
    if (phase !== "result") return;
    const t = setTimeout(handleContinue, 3000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);


  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="text-center">
        <h2 className="flex items-center justify-center gap-2 text-2xl font-extrabold">
          {createElement(Icon, { className: "heading-icon-bob h-6 w-6 text-orange-400" })}
          <span className="heading-shimmer">{group.title}</span>
        </h2>
        {group.subtitle && (
          <p className="mt-1 text-sm text-zinc-400">{group.subtitle}</p>
        )}
        <p className="mt-2 flex items-center justify-center gap-1 text-sm text-purple-300">
          <Coins className="h-4 w-4" />
          <span className="font-bold">{credits.toLocaleString("de-DE")}</span> Credits
        </p>
      </div>

      <div className="relative mt-4">
        <CaseReel
          ref={caseReelRef}
          items={reel}
          targetIndex={targetIndex}
          spinning={phase === "spinning"}
          spinToken={spinToken}
          onTick={sound.tick}
          onSpinComplete={() => {
            setPhase((p) => (p === "spinning" ? "result" : p));
            if (!wonItem) return;
            if (wonItem.rarity === "ultra") {
              sound.ultraWin();
            } else {
              sound.win();
            }
            fireWinCelebration(wonItem.rarity as Rarity);
          }}
        />

        <AnimatePresence>
          {phase === "result" && wonItem && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleContinue}
              className="absolute inset-0 z-30 flex cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-[#030305]/90"
            >
              <motion.div
                initial={{ opacity: 0.9, scale: 0.3 }}
                animate={{ opacity: 0, scale: 1.8 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                className="pointer-events-none absolute inset-0"
                style={{
                  background: `radial-gradient(circle, ${RARITY_HEX[wonItem.rarity as Rarity]} 0%, transparent 65%)`,
                }}
              />
              <motion.div
                initial={{ scale: 0.7, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 18 }}
                className="relative z-10 flex flex-col items-center gap-2"
              >
                <ItemRenderer type={wonItem.type} rarity={wonItem.rarity as Rarity} size="lg" />
                <span className="glow-text text-lg font-bold text-zinc-50">{wonItem.name}</span>
                <span className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                  {getTypeLabel(wonItem.type)}
                </span>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <RarityBadge rarity={wonItem.rarity as Rarity} />
                  <ItemStatBadges
                    damage={wonItem.damage}
                    armor={wonItem.armor}
                    perk_type={wonItem.perk_type}
                    perk_magnitude={wonItem.perk_magnitude}
                    shield_hp={wonItem.shield_hp}
                    shield_regen_cooldown_sec={wonItem.shield_regen_cooldown_sec}
                  />
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {error && (
        <p className="mt-3 text-center text-sm font-medium text-red-400">{error}</p>
      )}

      <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <button
          onMouseEnter={sound.hover}
          onClick={() => {
            if (phase === "spinning") {
              caseReelRef.current?.skipToResult();
            } else {
              handleOpen(group.standard);
            }
          }}
          disabled={
            phase === "pending" ||
            phase === "result" ||
            (phase === "idle" && credits < group.standard.price) ||
            group.standard.enabled === false
          }
          className="w-full rounded-xl border-2 border-[#3898ff] bg-[linear-gradient(135deg,#1e699e_0%,rgba(13,76,132,0.6)_100%)] px-8 py-3 text-base font-black uppercase tracking-widest text-white shadow-[inset_0_0_16px_rgba(56,152,255,0.45)] transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100 sm:w-auto"
        >
          {group.standard.enabled === false
            ? "DEAKTIVIERT"
            : phase === "spinning"
              ? "⚡ SOFORT ZEIGEN"
              : `${group.standard.label} — ${group.standard.price.toLocaleString("de-DE")} ${currencyName}`}
        </button>

        <button
          onMouseEnter={sound.hover}
          onClick={() => {
            if (phase === "spinning") {
              caseReelRef.current?.skipToResult();
            } else {
              handleOpen(group.premium);
            }
          }}
          disabled={
            phase === "pending" ||
            phase === "result" ||
            (phase === "idle" && credits < group.premium.price) ||
            group.premium.enabled === false
          }
          className="relative w-full rounded-xl bg-black/50 px-8 py-2.5 text-center transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100 sm:w-auto"
        >
          <span aria-hidden className="rainbow-border" />
          <span className="rainbow-text flex items-center justify-center gap-1.5 text-base font-black uppercase tracking-widest">
            <Zap className="h-4 w-4 text-amber-300" />
            {group.premium.enabled === false
              ? "DEAKTIVIERT"
              : phase === "spinning"
                ? "⚡ SOFORT ZEIGEN"
                : `${group.premium.label} — ${group.premium.price.toLocaleString("de-DE")} ${currencyName}`}
          </span>
          {group.premium.sublabel && group.premium.enabled !== false && phase !== "spinning" && (
            <span className="block text-[11px] font-semibold tracking-widest text-zinc-400">
              {group.premium.sublabel}
            </span>
          )}
        </button>
      </div>

      <div className="glow-border-purple mt-6 space-y-3 p-4">
        <p className="text-center text-xs font-semibold tracking-wide text-purple-300">
          GEWINNCHANCEN — {poolSize.toLocaleString("de-DE")} ITEMS IM POOL
        </p>
        <ChanceBar weights={group.standard.rarityWeights} />

        <p className="flex items-center justify-center gap-1 text-center text-xs font-semibold tracking-wide text-amber-300">
          <Zap className="h-3 w-3" />
          PREMIUM-CHANCEN
        </p>
        <ChanceBar weights={group.premium.rarityWeights} />
      </div>
    </section>
  );
}
