"use client";

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { Coins, Zap, Layers, Minus, Plus, Package } from "lucide-react";
import { CaseReel, type CaseReelHandle, type ReelEntry } from "@/components/dashboard/case-reel";
import { ChanceBar } from "@/components/dashboard/chance-bar";
import { RarityBadge } from "@/components/dashboard/rarity-badge";
import { ItemRenderer } from "@/components/items/item-renderer";
import { ItemStatBadges } from "@/components/items/item-stat-badges";
import { openCase, chargeSkipFee, openCaseBatch, type WonItem } from "@/lib/actions/cases";
import { RARITY_ORDER, getTypeLabel, type CaseGroup, type CaseTier, type Rarity } from "@/lib/cases";
import { getCaseIcon } from "@/lib/case-icons";
import { useSoundManager } from "@/lib/sound-manager";
import { debugLog } from "@/lib/debug";
import { RARITY_HEX } from "@/lib/rarity-colors";
import { RARITY_LABELS } from "@/lib/cases";
import { useSiteConfig } from "@/components/layout/site-config-provider";

// ---------------------------------------------------------------------------
// Confetti helpers
// ---------------------------------------------------------------------------

const CONFETTI_BY_RARITY: Record<Rarity, () => void> = {
  normal: () => confetti({ particleCount: 22, spread: 50, startVelocity: 22, origin: { y: 0.6 }, colors: ["#3b82f6", "#93c5fd", "#e0f2fe"] }),
  selten: () => confetti({ particleCount: 50, spread: 65, startVelocity: 32, origin: { y: 0.58 }, colors: ["#a855f7", "#d8b4fe", "#f3e8ff"] }),
  mythisch: () => {
    confetti({ particleCount: 85, spread: 80, startVelocity: 38, origin: { y: 0.56 }, colors: ["#f59e0b", "#fbbf24", "#fff7ed"] });
    setTimeout(() => confetti({ particleCount: 35, spread: 100, startVelocity: 28, origin: { y: 0.56 }, colors: ["#f59e0b", "#fde68a"] }), 150);
  },
  ultra: () => {
    const c = ["#ff3b3b", "#ff8a00", "#ffe600", "#3bff5e", "#00e5ff", "#b14bff"];
    confetti({ particleCount: 130, spread: 95, startVelocity: 45, origin: { y: 0.55 }, colors: c });
    setTimeout(() => confetti({ particleCount: 80, spread: 120, startVelocity: 50, origin: { y: 0.5 }, colors: c }), 180);
  },
};

function fireWinCelebration(rarity: Rarity) { CONFETTI_BY_RARITY[rarity](); }

// ---------------------------------------------------------------------------
// Reel helpers
// ---------------------------------------------------------------------------

interface PreviewItem { rarity: Rarity; type: string; name: string }

const PLACEHOLDER_COUNT = 13;

function buildPlaceholderReel(types: string[]): ReelEntry[] {
  const type = types[0] ?? "weapon";
  return Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => ({ key: `placeholder-${i}`, rarity: "normal" as Rarity, type }));
}

function randomFrom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function buildFiller(count: number, prefix: string, pool: PreviewItem[], types: string[]): ReelEntry[] {
  return Array.from({ length: count }, (_, i) => {
    if (pool.length > 0) { const p = randomFrom(pool); return { key: `${prefix}-${i}`, rarity: p.rarity, type: p.type, name: p.name }; }
    return { key: `${prefix}-${i}`, rarity: randomFrom(RARITY_ORDER), type: randomFrom(types) };
  });
}

// ---------------------------------------------------------------------------
// Multi-Case quantity selector
// ---------------------------------------------------------------------------

function QuantitySelector({
  value, min, max, onChange, disabled,
}: {
  value: number; min: number; max: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  const presets = [2, 3, 5, 10].filter((n) => n <= max);
  return (
    <div className="flex items-center gap-2">
      <button
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-zinc-400 hover:border-purple-400/50 hover:text-purple-300 disabled:opacity-30 transition-colors"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-[2ch] text-center text-base font-black text-zinc-50">{value}</span>
      <button
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-zinc-400 hover:border-purple-400/50 hover:text-purple-300 disabled:opacity-30 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <div className="ml-1 flex gap-1">
        {presets.map((n) => (
          <button
            key={n}
            disabled={disabled}
            onClick={() => onChange(n)}
            className={`h-7 min-w-[2rem] rounded-lg border px-2 text-xs font-bold transition-colors disabled:opacity-30 ${
              value === n
                ? "border-purple-400 bg-purple-500/20 text-purple-200"
                : "border-white/10 text-zinc-500 hover:border-white/30"
            }`}
          >
            ×{n}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Batch result grid
// ---------------------------------------------------------------------------

const RARITY_RANK: Record<Rarity, number> = { normal: 0, selten: 1, mythisch: 2, ultra: 3 };
const CARD_W = 148;

function BatchResultGrid({ items, onClose }: { items: WonItem[]; onClose: () => void }) {
  const best = items.reduce((b, i) => RARITY_RANK[i.rarity as Rarity] > RARITY_RANK[b.rarity as Rarity] ? i : b, items[0]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-start bg-black/88 px-4 pt-8 pb-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: `radial-gradient(ellipse at 50% 35%, ${RARITY_HEX[best.rarity as Rarity]}28 0%, transparent 60%)` }}
      />

      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.05, type: "spring", stiffness: 280, damping: 26 }}
        className="relative z-10 flex w-full max-w-2xl flex-col items-center gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center">
          <motion.p
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.08 }}
            className="text-xs font-bold tracking-widest text-zinc-500 uppercase"
          >
            {items.length} Cases geöffnet
          </motion.p>
          <motion.h3
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="mt-0.5 text-2xl font-extrabold text-zinc-50"
          >
            Deine Gewinne
          </motion.h3>
          {best && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.18 }}
              className="mt-0.5 text-sm text-zinc-400"
            >
              Bestes:{" "}
              <span style={{ color: RARITY_HEX[best.rarity as Rarity] }} className="font-bold">
                {best.name}
              </span>
              <span className="ml-1 text-zinc-500">({RARITY_LABELS[best.rarity as Rarity]})</span>
            </motion.p>
          )}
        </div>

        <div className="flex flex-wrap items-start justify-center gap-3">
          {items.map((item, idx) => (
            <motion.div
              key={`${item.id}-${idx}`}
              initial={{ rotateY: 90, opacity: 0, scale: 0.75 }}
              animate={{ rotateY: 0, opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + idx * 0.055, type: "spring", stiffness: 320, damping: 24 }}
              className="relative flex flex-col items-center gap-1.5 rounded-xl border bg-black/70 p-3 text-center"
              style={{
                width: CARD_W,
                borderColor: `${RARITY_HEX[item.rarity as Rarity]}55`,
                boxShadow: `0 0 14px ${RARITY_HEX[item.rarity as Rarity]}22`,
              }}
            >
              <div
                className="pointer-events-none absolute inset-0 rounded-xl opacity-[0.18]"
                style={{ background: `radial-gradient(ellipse at 50% 25%, ${RARITY_HEX[item.rarity as Rarity]} 0%, transparent 72%)` }}
              />
              <div className="relative z-10 flex flex-col items-center gap-1.5">
                <ItemRenderer type={item.type} rarity={item.rarity as Rarity} size="md" />
                <p className="w-full text-[11px] font-bold leading-tight text-zinc-100 line-clamp-2 break-words">
                  {item.name}
                </p>
                <RarityBadge rarity={item.rarity as Rarity} />
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + items.length * 0.055 + 0.1 }}
          className="flex flex-wrap items-center justify-center gap-2"
        >
          {(["ultra", "mythisch", "selten", "normal"] as Rarity[]).map((r) => {
            const cnt = items.filter((i) => i.rarity === r).length;
            if (cnt === 0) return null;
            return (
              <span
                key={r}
                className="rounded-full border px-3 py-1 text-xs font-bold"
                style={{ borderColor: `${RARITY_HEX[r]}55`, color: RARITY_HEX[r] }}
              >
                {cnt}× {RARITY_LABELS[r]}
              </span>
            );
          })}
        </motion.div>

        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 + items.length * 0.055 + 0.22 }}
          onClick={onClose}
          className="rounded-xl bg-purple-600 px-10 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(147,51,234,0.6)] hover:bg-purple-500 active:scale-95 transition-all"
        >
          Weiter
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CaseOpeningSectionProps {
  group: CaseGroup;
  credits: number;
  previewPool: PreviewItem[];
  poolSize: number;
  onCreditsChange: (newCredits: number) => void;
}

type Phase = "idle" | "pending" | "spinning" | "result" | "batch_pending" | "batch_result";

export function CaseOpeningSection({ group, credits, previewPool, poolSize, onCreditsChange }: CaseOpeningSectionProps) {
  const Icon = getCaseIcon(group.iconName);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [wonItem, setWonItem] = useState<WonItem | null>(null);
  const [batchItems, setBatchItems] = useState<WonItem[]>([]);
  const [spinToken, setSpinToken] = useState(0);
  const [activeTier, setActiveTier] = useState<CaseTier | null>(null);
  const [batchCount, setBatchCount] = useState(2);
  const [batchMode, setBatchMode] = useState(false);
  const mounted = useRef(false);
  const fetchingRef = useRef(false);
  const openCooldownUntil = useRef(0);
  const caseReelRef = useRef<CaseReelHandle>(null);
  // When the user clicks "Sofort anzeigen" while the server is still in-flight
  // (phase === "pending"), we can't call skipToResult() yet because the reel
  // isn't spinning yet. Queue the intent here; a useEffect fires the actual
  // skip the moment phase transitions to "spinning".
  // Set to true when the user clicks SOFORT while the server is still in-flight.
  // handleOpen checks this after await and jumps straight to result instead of
  // starting the spin — no fragile 30ms timing needed.
  const skipOnResultRef = useRef(false);
  // Spam-guard: prevents double-fire of handleSkip (e.g. rapid-click during spin).
  const sofortFiredRef  = useRef(false);
  const { currencyName } = useSiteConfig();
  const sound = useSoundManager();

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

  useEffect(() => {
    if (phase !== "spinning") return;
    document.documentElement.setAttribute("data-case-spinning", "true");
    return () => document.documentElement.removeAttribute("data-case-spinning");
  }, [phase]);

  async function handleOpen(tier: CaseTier) {
    if (fetchingRef.current || phase !== "idle") return;
    if (Date.now() < openCooldownUntil.current) return;
    fetchingRef.current = true;
    setActiveTier(tier);
    setPhase("pending");   // → warmup kicks in immediately in CaseReel
    setError(null);
    setWonItem(null);
    sound.click();

    const result = await openCase(tier.id);
    fetchingRef.current = false;
    debugLog("CaseOpening", `server result for tier "${tier.id}"`, result);

    if (!result.success || !result.item) {
      setError(result.error ?? "Unbekannter Fehler.");
      sound.error();
      setPhase("idle");
      return;
    }

    setWonItem(result.item);
    onCreditsChange(result.newCredits!);

    // User clicked SOFORT while server was in-flight — skip spin entirely and
    // go straight to the result overlay. Charge the preview fee if applicable.
    if (skipOnResultRef.current) {
      skipOnResultRef.current = false;
      const cost = tier.previewCost ?? 0;
      if (cost > 0) {
        const feeRes = await chargeSkipFee(tier.id);
        if (feeRes.success && feeRes.newCredits !== undefined) onCreditsChange(feeRes.newCredits);
      }
      const r = result.item.rarity as Rarity;
      if (r === "ultra") sound.ultraWin?.(); else sound.win?.();
      fireWinCelebration(r);
      setPhase("result");
      return;
    }

    const target: ReelEntry = { key: "target", rarity: result.item.rarity as Rarity, type: result.item.type, name: result.item.name };
    const before = buildFiller(40, "before", previewPool, group.itemTypes);
    const after = buildFiller(8, "after", previewPool, group.itemTypes);
    setReel([...before, target, ...after]);
    setTargetIndex(before.length);
    setPhase("spinning");
    setSpinToken((t) => t + 1);
  }

  async function handleBatchOpen(tier: CaseTier) {
    if (fetchingRef.current || phase !== "idle") return;
    if (Date.now() < openCooldownUntil.current) return;
    fetchingRef.current = true;
    setActiveTier(tier);
    setPhase("batch_pending");
    setError(null);
    setBatchItems([]);
    sound.click();

    const result = await openCaseBatch(tier.id, batchCount);
    fetchingRef.current = false;

    if (!result.success || !result.items) {
      setError(result.error ?? "Unbekannter Fehler.");
      sound.error();
      setPhase("idle");
      return;
    }

    setBatchItems(result.items);
    setPhase("batch_result");
    onCreditsChange(result.newCredits!);

    const bestRarity = (["ultra", "mythisch", "selten", "normal"] as Rarity[]).find(
      (r) => result.items!.some((i) => i.rarity === r)
    ) ?? "normal";
    fireWinCelebration(bestRarity);
    if (bestRarity === "ultra") sound.ultraWin?.();
    else sound.win?.();
  }

  async function handleSkip(tier: CaseTier) {
    if (sofortFiredRef.current) return;
    sofortFiredRef.current = true;
    const cost = tier.previewCost ?? 0;
    if (cost > 0) {
      const res = await chargeSkipFee(tier.id);
      if (!res.success) {
        setError(res.error ?? "Fehler beim Abbuchung.");
        sofortFiredRef.current = false;
        return;
      }
      if (res.newCredits !== undefined) onCreditsChange(res.newCredits);
    }
    caseReelRef.current?.skipToResult();
  }

  function handleContinue() {
    openCooldownUntil.current = Date.now() + 600;
    skipOnResultRef.current = false;
    sofortFiredRef.current  = false;
    setReel(idleReelRef.current);
    setTargetIndex(Math.floor(PLACEHOLDER_COUNT / 2));
    setWonItem(null);
    setPhase("idle");
    setActiveTier(null);
  }

  useEffect(() => {
    if (phase !== "result") return;
    const t = setTimeout(handleContinue, 1500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const isIdle     = phase === "idle";
  // isBusy only blocks the quantity selector and batch mode — NOT the single
  // open button, which must remain clickable during pending so the user can
  // queue a skip (skipQueuedRef) before the server even responds.
  const isBusy     = phase === "batch_pending";
  const isSpinning = phase === "spinning";
  // "pending" is treated as "in-flight" visually but NOT as disabled for the
  // single-open button — that button's click handler checks phase directly.
  const isPending  = phase === "pending";

  const maxBatch = Math.min(group.standard.multiOpenMax ?? 10, group.premium.multiOpenMax ?? 10);

  // From the moment the user clicks (pending) the layout switches immediately:
  // the other tier hides and the clicked tier shows "⚡ SOFORT" (disabled
  // until the server responds and spinning starts). This means the
  // pending→spinning transition only changes disabled→enabled — never layout.
  const inFlight = isSpinning || phase === "pending";
  const showStandard = !inFlight || activeTier?.id === group.standard.id;
  const showPremium  = !inFlight || activeTier?.id === group.premium.id;

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="text-center">
        <h2 className="flex items-center justify-center gap-2 text-2xl font-extrabold">
          {createElement(Icon, { className: "heading-icon-bob h-6 w-6 text-orange-400" })}
          <span className="heading-shimmer">{group.title}</span>
        </h2>
        {group.subtitle && <p className="mt-1 text-sm text-zinc-400">{group.subtitle}</p>}
        <p className="mt-2 flex items-center justify-center gap-1 text-sm text-purple-300">
          <Coins className="h-4 w-4" />
          <span className="font-bold">{credits.toLocaleString("de-DE")}</span> {currencyName}
        </p>
      </div>

      {/* Mode toggle + batch selector */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <div className="flex overflow-hidden rounded-xl border border-white/10">
          <button
            onClick={() => { sound.click(); setBatchMode(false); }}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold transition-colors ${!batchMode ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            <Package className="h-3.5 w-3.5" />
            Einzeln
          </button>
          <button
            onClick={() => { sound.click(); setBatchMode(true); }}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold transition-colors ${batchMode ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            <Layers className="h-3.5 w-3.5" />
            Mehrfach
          </button>
        </div>

        {batchMode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2"
          >
            <span className="text-xs text-zinc-500">Anzahl:</span>
            <QuantitySelector
              value={batchCount}
              min={2}
              max={maxBatch}
              onChange={setBatchCount}
              disabled={isBusy}
            />
          </motion.div>
        )}
      </div>

      {/* Reel — only shown in single mode */}
      {!batchMode && (
        <div className="relative mt-4">
          <CaseReel
            ref={caseReelRef}
            items={reel}
            targetIndex={targetIndex}
            spinning={isSpinning}
            warmup={phase === "pending"}
            spinToken={spinToken}
            onTick={sound.tick}
            onSpinComplete={() => {
              setPhase((p) => (p === "spinning" ? "result" : p));
              if (!wonItem) return;
              if (wonItem.rarity === "ultra") sound.ultraWin?.();
              else sound.win?.();
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
                  style={{ background: `radial-gradient(circle, ${RARITY_HEX[wonItem.rarity as Rarity]} 0%, transparent 65%)` }}
                />
                <motion.div
                  initial={{ scale: 0.7, y: 10 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18 }}
                  className="relative z-10 flex flex-col items-center gap-2"
                >
                  <ItemRenderer type={wonItem.type} rarity={wonItem.rarity as Rarity} size="lg" />
                  <span className="glow-text text-lg font-bold text-zinc-50">{wonItem.name}</span>
                  <span className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">{getTypeLabel(wonItem.type)}</span>
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <RarityBadge rarity={wonItem.rarity as Rarity} />
                    <ItemStatBadges
                      damage={wonItem.damage}
                      armor={wonItem.armor}
                      perk_type={wonItem.perk_type}
                      perk_magnitude={wonItem.perk_magnitude}
                      shield_hp={wonItem.shield_hp}
                      shield_regen_cooldown_sec={wonItem.shield_regen_cooldown_sec}
                      itemName={wonItem.name}
                      itemType={wonItem.type}
                    />
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Batch pending spinner */}
      {batchMode && phase === "batch_pending" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-6 flex flex-col items-center gap-3 py-8"
        >
          <div className="flex gap-2">
            {Array.from({ length: batchCount }).map((_, i) => (
              <motion.div
                key={i}
                animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 0.8, delay: i * 0.1, repeat: Infinity }}
                className="h-10 w-10 rounded-xl bg-purple-500/20 border border-purple-500/40"
              />
            ))}
          </div>
          <p className="text-sm font-semibold text-zinc-400">{batchCount} Cases werden geöffnet…</p>
        </motion.div>
      )}

      {error && <p className="mt-3 text-center text-sm font-medium text-red-400">{error}</p>}

      {/* Action buttons
          During a live spin: only the tier that was spun shows its "Sofort anzeigen" button.
          The other tier disappears entirely to avoid skip-fee confusion.
          Outside of spinning: both buttons show normally at all times. */}
      <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">

        {showStandard && (
          <button
            onMouseEnter={sound.hover}
            onClick={() => {
              if (isPending) {
                skipOnResultRef.current = true;
                return;
              }
              if (isSpinning) { void handleSkip(group.standard); }
              else if (batchMode) { void handleBatchOpen(group.standard); }
              else { void handleOpen(group.standard); }
            }}
            disabled={
              isBusy || phase === "result" || phase === "batch_result" ||
              (isIdle && credits < group.standard.price * (batchMode ? batchCount : 1)) ||
              group.standard.enabled === false
            }
            className="w-full rounded-xl border-2 border-[#3898ff] bg-[linear-gradient(135deg,#1e699e_0%,rgba(13,76,132,0.6)_100%)] px-8 py-3 text-base font-black uppercase tracking-widest text-white shadow-[inset_0_0_16px_rgba(56,152,255,0.45)] transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100 sm:w-auto"
          >
            {group.standard.enabled === false
              ? "DEAKTIVIERT"
              : inFlight
                ? `⚡ SOFORT${(group.standard.previewCost ?? 0) > 0 ? ` (${(group.standard.previewCost ?? 0).toLocaleString("de-DE")} ${currencyName})` : ""}`
                : batchMode
                  ? `${batchCount}× ${group.standard.label} — ${(group.standard.price * batchCount).toLocaleString("de-DE")} ${currencyName}`
                  : `${group.standard.label} — ${group.standard.price.toLocaleString("de-DE")} ${currencyName}`}
          </button>
        )}

        {showPremium && (
          <button
            onMouseEnter={sound.hover}
            onClick={() => {
              if (isPending) {
                skipOnResultRef.current = true;
                return;
              }
              if (isSpinning) { void handleSkip(group.premium); }
              else if (batchMode) { void handleBatchOpen(group.premium); }
              else { void handleOpen(group.premium); }
            }}
            disabled={
              isBusy || phase === "result" || phase === "batch_result" ||
              (isIdle && credits < group.premium.price * (batchMode ? batchCount : 1)) ||
              group.premium.enabled === false
            }
            className="relative w-full rounded-xl bg-black/50 px-8 py-2.5 text-center transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100 sm:w-auto"
          >
            <span aria-hidden className="rainbow-border" />
            <span className="rainbow-text flex items-center justify-center gap-1.5 text-base font-black uppercase tracking-widest">
              <Zap className="h-4 w-4 text-amber-300" />
              {group.premium.enabled === false
                ? "DEAKTIVIERT"
                : inFlight
                  ? `⚡ SOFORT${(group.premium.previewCost ?? 0) > 0 ? ` (${(group.premium.previewCost ?? 0).toLocaleString("de-DE")} ${currencyName})` : ""}`
                  : batchMode
                    ? `${batchCount}× ${group.premium.label} — ${(group.premium.price * batchCount).toLocaleString("de-DE")} ${currencyName}`
                    : `${group.premium.label} — ${group.premium.price.toLocaleString("de-DE")} ${currencyName}`}
            </span>
            {group.premium.sublabel && group.premium.enabled !== false && !inFlight && !batchMode && (
              <span className="block text-[11px] font-semibold tracking-widest text-zinc-400">{group.premium.sublabel}</span>
            )}
          </button>
        )}
      </div>

      {/* Batch result modal */}
      <AnimatePresence>
        {phase === "batch_result" && batchItems.length > 0 && (
          <BatchResultGrid
            items={batchItems}
            onClose={() => {
              setBatchItems([]);
              setPhase("idle");
              setActiveTier(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Chance bars */}
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
