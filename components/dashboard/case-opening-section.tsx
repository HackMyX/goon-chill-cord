"use client";

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { Coins, Zap, Layers, Minus, Plus, Package, X, Search } from "lucide-react";
import { CaseReel, type CaseReelHandle, type ReelEntry } from "@/components/dashboard/case-reel";
import { ChanceBar } from "@/components/dashboard/chance-bar";
import { RarityBadge } from "@/components/dashboard/rarity-badge";
import { CaseDropView } from "@/components/cases/case-item-3d";
import { UniversalPreviewModal, type PreviewSubject } from "@/components/ui/universal-preview-modal";
import { ItemStatBadges } from "@/components/items/item-stat-badges";
import { openCase, chargeSkipFee, openCaseBatch, type WonDrop } from "@/lib/actions/cases";
import { RARITY_ORDER, getTypeLabel, type CaseGroup, type CaseTier, type CaseExtraDrop, type CasePoolEntry, type Rarity } from "@/lib/cases";
import { needsCharacter, DEFAULT_CASE_DISPLAY_CONFIG, type CaseDisplayConfig } from "@/lib/case-display-config";
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

/** A won drop → the universal preview subject used by every case visual. */
function dropToSubject(d: WonDrop): PreviewSubject {
  switch (d.kind) {
    case "item":
      return {
        kind: "item",
        item: {
          id: d.item.id,
          name: d.item.name,
          rarity: d.item.rarity as Rarity,
          type: d.item.type,
          damage: d.item.damage,
          armor: d.item.armor,
          perk_type: d.item.perk_type,
          perk_magnitude: d.item.perk_magnitude,
          shield_hp: d.item.shield_hp,
          shield_regen_cooldown_sec: d.item.shield_regen_cooldown_sec,
        },
      };
    case "credits":    return { kind: "credits", amount: d.amount };
    case "name_style": return { kind: "name_style", styleKey: d.styleKey };
    case "ability":    return { kind: "ability", abilityKey: d.abilityKey, name: d.name, icon: d.icon, rarity: d.rarity };
    case "badge":      return { kind: "badge", badgeKey: d.badgeKey, badgeText: d.badgeText };
  }
}

/** A pool-gallery entry (item or extra) → the universal preview subject. */
function poolEntryToSubject(e: CasePoolEntry): PreviewSubject {
  if (!e.extra) {
    return { kind: "item", item: { id: `${e.type}-${e.name}`, name: e.name, rarity: e.rarity, type: e.type } };
  }
  const x = e.extra;
  switch (x.kind) {
    case "credits":    return { kind: "credits", amount: x.amount ?? 0 };
    case "name_style": return { kind: "name_style", styleKey: x.styleKey ?? "default" };
    case "ability":    return { kind: "ability", abilityKey: x.abilityKey ?? "", name: e.name, icon: x.abilityIcon, rarity: e.rarity };
    case "badge":      return { kind: "badge", badgeKey: x.badgeKey ?? "", badgeText: x.badgeText ?? e.name };
  }
}

const EXTRA_KIND_LABEL: Record<CaseExtraDrop["kind"], string> = {
  credits: "Credits",
  name_style: "Name-Style",
  ability: "Fähigkeit",
  badge: "Badge",
};

/** A tier's configured extra drop → a pool-gallery entry. */
function extraToPoolEntry(d: CaseExtraDrop): CasePoolEntry {
  const name =
    d.label ||
    (d.kind === "credits"
      ? `${(d.amount ?? 0).toLocaleString("de-DE")} Credits`
      : d.kind === "name_style"
      ? d.styleKey ?? "Name-Style"
      : d.kind === "ability"
      ? d.abilityKey ?? "Fähigkeit"
      : d.badgeText || d.badgeKey || "Badge");
  return {
    rarity: d.rarity,
    type: d.kind,
    name,
    extra: {
      kind: d.kind,
      styleKey: d.styleKey,
      abilityKey: d.abilityKey,
      badgeKey: d.badgeKey,
      badgeText: d.badgeText,
      amount: d.amount,
    },
  };
}

// ---------------------------------------------------------------------------
// Reel helpers
// ---------------------------------------------------------------------------

type PreviewItem = CasePoolEntry;

const PLACEHOLDER_COUNT = 13;

function buildPlaceholderReel(types: string[]): ReelEntry[] {
  const type = types[0] ?? "weapon";
  return Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => ({ key: `placeholder-${i}`, rarity: "normal" as Rarity, type }));
}

function randomFrom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function buildFiller(count: number, prefix: string, pool: PreviewItem[], types: string[]): ReelEntry[] {
  // Filler is purely decorative — only real catalogue items, never extra drops.
  const itemPool = pool.filter((p) => !p.extra);
  return Array.from({ length: count }, (_, i) => {
    if (itemPool.length > 0) { const p = randomFrom(itemPool); return { key: `${prefix}-${i}`, rarity: p.rarity, type: p.type, name: p.name }; }
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

function BatchResultGrid({
  items, onClose, viewBase, cfg, gender,
}: {
  items: WonDrop[];
  onClose: () => void;
  viewBase: number;
  cfg: CaseDisplayConfig;
  gender: "m" | "w";
}) {
  const CARD_W = cfg.batchCardWidth;
  const best = items.reduce((b, i) => RARITY_RANK[i.rarity as Rarity] > RARITY_RANK[b.rarity as Rarity] ? i : b, items[0]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex flex-col items-center justify-start bg-black/88 px-4 pt-8 pb-4 overflow-y-auto"
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
          {items.map((drop, idx) => (
            <motion.div
              key={`${drop.name}-${idx}`}
              initial={{ rotateY: 90, opacity: 0, scale: 0.75 }}
              animate={{ rotateY: 0, opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + idx * 0.055, type: "spring", stiffness: 320, damping: 24 }}
              className="relative flex flex-col items-center gap-1.5 rounded-xl border bg-black/70 p-3 text-center"
              style={{
                width: CARD_W,
                borderColor: `${RARITY_HEX[drop.rarity as Rarity]}55`,
                boxShadow: `0 0 14px ${RARITY_HEX[drop.rarity as Rarity]}22`,
              }}
            >
              <div
                className="pointer-events-none absolute inset-0 rounded-xl opacity-[0.18]"
                style={{ background: `radial-gradient(ellipse at 50% 25%, ${RARITY_HEX[drop.rarity as Rarity]} 0%, transparent 72%)` }}
              />
              <div className="relative z-10 flex flex-col items-center gap-1.5">
                <div className="relative w-full" style={{ height: cfg.batchCardHeight }}>
                  <CaseDropView
                    subject={dropToSubject(drop)}
                    viewIndex={viewBase + 1 + idx}
                    rotate={cfg.autoRotate}
                    rotateSpeed={cfg.rotateSpeed}
                    gender={gender}
                    character={drop.kind === "item" && needsCharacter(drop.item.type, cfg)}
                    scale={cfg.reelItemScale}
                  />
                </div>
                <p className="w-full text-[11px] font-bold leading-tight text-zinc-100 line-clamp-2 break-words">
                  {drop.name}
                </p>
                <RarityBadge rarity={drop.rarity as Rarity} />
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
// Pool popup — every winnable entry in the case, in 3D, in a filterable modal
// ---------------------------------------------------------------------------

function PoolPopup({
  pool, viewBase, cfg, gender, title, onClose,
}: {
  pool: PreviewItem[];
  viewBase: number;
  cfg: CaseDisplayConfig;
  gender: "m" | "w";
  title: string;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<Rarity | "all">("all");
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState<PreviewSubject | null>(null);
  const [mounted, setMounted] = useState(false);
  const [page, setPage] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 48;

  useEffect(() => { setMounted(true); }, []);
  // Reset to the first page whenever the filter/search changes.
  useEffect(() => { setPage(0); }, [filter, search]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const unique = useMemo(() => {
    const seen = new Set<string>();
    const out: PreviewItem[] = [];
    for (const p of pool) {
      const k = `${p.rarity}|${p.type}|${p.name}|${p.extra?.kind ?? ""}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
    out.sort(
      (a, b) =>
        RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] ||
        a.type.localeCompare(b.type) ||
        a.name.localeCompare(b.name),
    );
    return out;
  }, [pool]);

  const counts = useMemo(() => {
    const c: Record<Rarity, number> = { normal: 0, selten: 0, mythisch: 0, ultra: 0 };
    for (const p of unique) c[p.rarity]++;
    return c;
  }, [unique]);

  if (!mounted) return null;

  const q = search.trim().toLowerCase();
  const filtered = unique.filter(
    (p) =>
      (filter === "all" || p.rarity === filter) &&
      (!q || p.name.toLowerCase().includes(q) || p.type.toLowerCase().includes(q)),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const goPage = (p: number) => {
    setPage(Math.min(pageCount - 1, Math.max(0, p)));
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const pills: { key: Rarity | "all"; label: string; count: number }[] = [
    { key: "all", label: "Alle", count: unique.length },
    ...(["ultra", "mythisch", "selten", "normal"] as Rarity[])
      .filter((r) => counts[r] > 0)
      .map((r) => ({ key: r, label: RARITY_LABELS[r], count: counts[r] })),
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-4"
      style={{ background: "rgba(2,2,6,0.85)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 24, stiffness: 280 }}
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0814] shadow-[0_30px_90px_rgba(0,0,0,0.8)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-purple-300">Pool — {title}</p>
            <p className="text-sm font-extrabold text-zinc-50">
              {unique.length.toLocaleString("de-DE")} gewinnbare Einträge in 3D
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/40 text-zinc-300 transition-colors hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
          <div className="flex flex-wrap gap-1.5">
            {pills.map((p) => {
              const active = filter === p.key;
              const hex = p.key === "all" ? "#a855f7" : RARITY_HEX[p.key as Rarity];
              return (
                <button
                  key={p.key}
                  onClick={() => setFilter(p.key)}
                  className="rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors"
                  style={{ borderColor: active ? hex : `${hex}40`, color: active ? "#fff" : hex, background: active ? `${hex}28` : "transparent" }}
                >
                  {p.label} <span className="opacity-60">{p.count}</span>
                </button>
              );
            })}
          </div>
          <div className="relative ml-auto min-w-[160px] flex-1 sm:max-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Im Pool suchen…"
              className="w-full rounded-lg border border-white/10 bg-black/30 py-1.5 pl-8 pr-3 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
            />
          </div>
        </div>

        {/* Grid */}
        <div ref={scrollRef} className="grid gap-2.5 overflow-y-auto p-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cfg.poolMinColWidth}px, 1fr))` }}>
          {filtered.length === 0 ? (
            <p className="col-span-full py-10 text-center text-sm text-zinc-500">Keine Treffer.</p>
          ) : (
            paged.map((p, i) => {
              const hex = RARITY_HEX[p.rarity];
              const subj = poolEntryToSubject(p);
              // Pool cards stay light (isolated) so a big pool always loads fast
              // and smoothly — the full character view is one click away.
              return (
                <button
                  key={`${p.rarity}-${p.type}-${p.name}-${i}`}
                  onClick={() => setSubject(subj)}
                  className="group relative flex flex-col items-center gap-1 overflow-hidden rounded-xl border bg-black/30 p-2 text-center transition-all hover:scale-[1.04]"
                  style={{ borderColor: `${hex}45`, boxShadow: `0 0 12px ${hex}18` }}
                >
                  <div className="pointer-events-none absolute inset-0 opacity-[0.14]" style={{ background: `radial-gradient(ellipse at 50% 25%, ${hex} 0%, transparent 72%)` }} />
                  <div className="relative w-full" style={{ height: cfg.poolCardHeight }}>
                    <CaseDropView
                      subject={subj}
                      viewIndex={viewBase + (i % 80)}
                      rotate={cfg.autoRotate}
                      rotateSpeed={cfg.rotateSpeed}
                      lazy
                      rootRef={scrollRef}
                      gender={gender}
                      character={false}
                      scale={cfg.reelItemScale}
                      fallbackColor={hex}
                    />
                  </div>
                  <span className="relative w-full truncate text-[11px] font-semibold text-zinc-100">{p.name}</span>
                  <span className="relative flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: hex }} />
                    <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: hex }}>
                      {p.extra ? EXTRA_KIND_LABEL[p.extra.kind] : getTypeLabel(p.type)}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex items-center justify-center gap-3 border-t border-white/[0.06] px-4 py-2.5">
            <button
              onClick={() => goPage(safePage - 1)}
              disabled={safePage <= 0}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-bold text-zinc-200 transition-colors hover:border-purple-400/50 disabled:opacity-30"
            >
              ‹ Zurück
            </button>
            <span className="text-xs font-semibold text-zinc-400">
              Seite {safePage + 1} / {pageCount}
            </span>
            <button
              onClick={() => goPage(safePage + 1)}
              disabled={safePage >= pageCount - 1}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-bold text-zinc-200 transition-colors hover:border-purple-400/50 disabled:opacity-30"
            >
              Weiter ›
            </button>
          </div>
        )}
      </motion.div>

      {subject && <UniversalPreviewModal subject={subject} onClose={() => setSubject(null)} />}
    </div>,
    document.body,
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
  /** Section position — reserves a unique block of shared-Canvas View indices. */
  index?: number;
  gender?: "m" | "w";
  cfg?: CaseDisplayConfig;
  /** True when any section's modal/popup is open → suppress reel 3D (no bleed). */
  anyModalOpen?: boolean;
  /** Report this section's modal/popup open-state up to the shell. */
  onModalChange?: (index: number, open: boolean) => void;
}

type Phase = "idle" | "pending" | "spinning" | "result" | "batch_pending" | "batch_result";

export function CaseOpeningSection({
  group, credits, previewPool, poolSize, onCreditsChange, index = 0,
  gender = "m", cfg = DEFAULT_CASE_DISPLAY_CONFIG, anyModalOpen = false, onModalChange,
}: CaseOpeningSectionProps) {
  // Reserve a 4000-wide block of View indices for this section so reel slots,
  // the win reveal, the batch grid and the pool gallery never collide with
  // another case group rendering into the same shared Canvas.
  const viewBase = 2000 + index * 4000;
  const reelViewBase = viewBase;        // slots: reelViewBase + slotIndex  (0..~200)
  const winViewIndex = viewBase + 3000; // single win reveal
  const batchViewBase = viewBase + 3100; // + 1 + idx  (up to 10)
  const poolViewBase = viewBase + 3200;  // + idx      (pool gallery)
  const Icon = getCaseIcon(group.iconName);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [wonDrop, setWonDrop] = useState<WonDrop | null>(null);
  const [batchDrops, setBatchDrops] = useState<WonDrop[]>([]);
  const [spinToken, setSpinToken] = useState(0);
  const [activeTier, setActiveTier] = useState<CaseTier | null>(null);
  const [batchCount, setBatchCount] = useState(2);
  const [batchMode, setBatchMode] = useState(false);
  // sofortQueued: true when SOFORT was clicked during pending — gives visual feedback
  const [sofortQueued, setSofortQueued] = useState(false);
  const [poolOpen, setPoolOpen] = useState(false);
  const mounted = useRef(false);
  const fetchingRef = useRef(false);
  const caseReelRef = useRef<CaseReelHandle>(null);
  // skipOnResultRef: set when SOFORT is clicked during "pending" phase.
  // handleOpen checks it after await and jumps to result if true.
  const skipOnResultRef = useRef(false);
  // sofortFiredRef: spam-guard for handleSkip during "spinning" phase.
  const sofortFiredRef = useRef(false);
  const { currencyName } = useSiteConfig();
  const sound = useSoundManager();

  // Pool gallery = catalogue items + every configured extra drop (deduped).
  const poolWithExtras = useMemo(() => {
    const seen = new Set<string>();
    const extraEntries: CasePoolEntry[] = [];
    for (const tier of group.tiers) {
      for (const d of tier.extraDrops ?? []) {
        const k = `${d.kind}|${d.rarity}|${d.styleKey ?? ""}|${d.abilityKey ?? ""}|${d.badgeKey ?? ""}|${d.amount ?? ""}`;
        if (seen.has(k)) continue;
        seen.add(k);
        extraEntries.push(extraToPoolEntry(d));
      }
    }
    return [...previewPool, ...extraEntries];
  }, [previewPool, group.tiers]);

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

  // Tell the shell when a full-screen modal/popup is open so reel 3D from every
  // section can be suppressed (the shared canvas otherwise bleeds over modals).
  useEffect(() => {
    onModalChange?.(index, poolOpen || phase === "batch_result");
  }, [poolOpen, phase, index, onModalChange]);

  // Reel must not draw 3D when a modal is open OR while the win reveal overlay
  // covers it (otherwise reel items render on top of the overlay).
  const reelSuppressed = anyModalOpen || phase === "result";

  async function handleOpen(tier: CaseTier) {
    if (fetchingRef.current || phase !== "idle") return;
    fetchingRef.current = true;
    setActiveTier(tier);
    setPhase("pending");   // → warmup kicks in immediately in CaseReel
    setError(null);
    setWonDrop(null);
    sound.click();

    const result = await openCase(tier.id);
    fetchingRef.current = false;
    debugLog("CaseOpening", `server result for tier "${tier.id}"`, result);

    if (!result.success || !result.drop) {
      setError(result.error ?? "Unbekannter Fehler.");
      sound.error();
      setPhase("idle");
      return;
    }

    const drop = result.drop;
    setWonDrop(drop);
    onCreditsChange(result.newCredits!);

    // User clicked SOFORT while server was in-flight — skip spin entirely and
    // go straight to the result overlay. Charge the preview fee if applicable.
    // NOTE: skipOnResultRef may also be cleared by the useEffect when spinning
    // starts, so we read it here before any async gaps.
    if (skipOnResultRef.current) {
      skipOnResultRef.current = false;
      setSofortQueued(false);
      const cost = tier.previewCost ?? 0;
      if (cost > 0) {
        const feeRes = await chargeSkipFee(tier.id);
        if (feeRes.success && feeRes.newCredits !== undefined) onCreditsChange(feeRes.newCredits);
      }
      const r = drop.rarity as Rarity;
      if (r === "ultra") sound.ultraWin?.(); else sound.win?.();
      fireWinCelebration(r);
      setPhase("result");
      return;
    }

    const target: ReelEntry = {
      key: "target",
      rarity: drop.rarity as Rarity,
      type: drop.kind === "item" ? drop.item.type : drop.kind,
      name: drop.name,
      subject: dropToSubject(drop),
    };
    // CLEAN, POP-FREE START: prepend the EXACT current idle strip (twice) so the
    // items already visible during the warmup stay identical at the same indices
    // when we switch to the spin strip — no content swap, no flicker, no restart.
    // Then a long filler run + the target guarantees a long continuous spin.
    const idle = idleReelRef.current;
    const before = buildFiller(48, "before", previewPool, group.itemTypes);
    const after = buildFiller(8, "after", previewPool, group.itemTypes);
    const spinReel = [...idle, ...idle, ...before, target, ...after];
    setReel(spinReel);
    setTargetIndex(idle.length * 2 + before.length);
    sound.caseOpen();
    setPhase("spinning");
    setSpinToken((t) => t + 1);
  }

  async function handleBatchOpen(tier: CaseTier) {
    if (fetchingRef.current || phase !== "idle") return;
    fetchingRef.current = true;
    setActiveTier(tier);
    setPhase("batch_pending");
    setError(null);
    setBatchDrops([]);
    sound.click();

    const result = await openCaseBatch(tier.id, batchCount);
    fetchingRef.current = false;

    if (!result.success || !result.drops) {
      setError(result.error ?? "Unbekannter Fehler.");
      sound.error();
      setPhase("idle");
      return;
    }

    setBatchDrops(result.drops);
    setPhase("batch_result");
    onCreditsChange(result.newCredits!);

    const bestRarity = (["ultra", "mythisch", "selten", "normal"] as Rarity[]).find(
      (r) => result.drops!.some((d) => d.rarity === r)
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

  // When spinning starts and SOFORT was already clicked during pending,
  // fire the skip immediately via a tiny delay to let the reel render first.
  useEffect(() => {
    if (phase !== "spinning" || !skipOnResultRef.current || !activeTier) return;
    skipOnResultRef.current = false;
    setSofortQueued(false);
    const t = setTimeout(() => {
      void handleSkip(activeTier);
    }, 16); // one render frame
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function handleContinue() {
    skipOnResultRef.current = false;
    sofortFiredRef.current  = false;
    setSofortQueued(false);
    setReel(idleReelRef.current);
    setTargetIndex(Math.floor(PLACEHOLDER_COUNT / 2));
    setWonDrop(null);
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
    <section className="mx-auto w-full max-w-4xl px-3 py-5 sm:px-4 sm:py-10">
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
            warmup={false}
            spinToken={spinToken}
            viewBase={reelViewBase}
            cfg={cfg}
            gender={gender}
            suppressed={reelSuppressed}
            onTick={sound.tick}
            onSpinComplete={() => {
              setPhase((p) => (p === "spinning" ? "result" : p));
              if (!wonDrop) return;
              sound.caseReveal();
              if (wonDrop.rarity === "ultra") sound.ultraWin?.();
              else sound.win?.();
              fireWinCelebration(wonDrop.rarity as Rarity);
            }}
          />

          <AnimatePresence>
            {phase === "result" && wonDrop && (
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
                  style={{ background: `radial-gradient(circle, ${RARITY_HEX[wonDrop.rarity as Rarity]} 0%, transparent 65%)` }}
                />
                <motion.div
                  initial={{ scale: 0.7, y: 10 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18 }}
                  className="relative z-10 flex flex-col items-center gap-1"
                >
                  <div className="relative" style={{ width: 180 * cfg.revealScale, height: 150 * cfg.revealScale }}>
                    <CaseDropView
                      subject={dropToSubject(wonDrop)}
                      viewIndex={winViewIndex}
                      rotate={cfg.autoRotate}
                      rotateSpeed={cfg.rotateSpeed * 1.3}
                      shadow
                      gender={gender}
                      character={wonDrop.kind === "item" && needsCharacter(wonDrop.item.type, cfg)}
                      scale={cfg.reelItemScale}
                    />
                  </div>
                  <span className="glow-text text-lg font-bold text-zinc-50">{wonDrop.name}</span>
                  <span className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                    {wonDrop.kind === "item" ? getTypeLabel(wonDrop.item.type) : EXTRA_KIND_LABEL[wonDrop.kind]}
                  </span>
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <RarityBadge rarity={wonDrop.rarity as Rarity} />
                    {wonDrop.kind === "item" && (
                      <ItemStatBadges
                        damage={wonDrop.item.damage}
                        armor={wonDrop.item.armor}
                        perk_type={wonDrop.item.perk_type}
                        perk_magnitude={wonDrop.item.perk_magnitude}
                        shield_hp={wonDrop.item.shield_hp}
                        shield_regen_cooldown_sec={wonDrop.item.shield_regen_cooldown_sec}
                        itemName={wonDrop.item.name}
                        itemType={wonDrop.item.type}
                      />
                    )}
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
                if (!skipOnResultRef.current) {
                  skipOnResultRef.current = true;
                  setSofortQueued(true);
                  sound.click();
                }
                return;
              }
              if (isSpinning) { sound.click(); void handleSkip(group.standard); }
              else if (batchMode) { void handleBatchOpen(group.standard); }
              else { void handleOpen(group.standard); }
            }}
            disabled={
              isBusy || phase === "result" || phase === "batch_result" ||
              (isIdle && credits < group.standard.price * (batchMode ? batchCount : 1)) ||
              group.standard.enabled === false ||
              (isSpinning && sofortFiredRef.current)
            }
            className={`w-full rounded-xl border-2 border-[#3898ff] px-8 py-3 text-base font-black uppercase tracking-widest text-white shadow-[inset_0_0_16px_rgba(56,152,255,0.45)] transition-all hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100 sm:w-auto ${
              sofortQueued && isPending
                ? "animate-pulse bg-[linear-gradient(135deg,#5b21b6_0%,rgba(76,29,149,0.8)_100%)] border-purple-400"
                : "bg-[linear-gradient(135deg,#1e699e_0%,rgba(13,76,132,0.6)_100%)]"
            }`}
          >
            {group.standard.enabled === false
              ? "DEAKTIVIERT"
              : sofortQueued && isPending
                ? "⚡ WIRD ÜBERSPRUNGEN…"
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
                if (!skipOnResultRef.current) {
                  skipOnResultRef.current = true;
                  setSofortQueued(true);
                  sound.click();
                }
                return;
              }
              if (isSpinning) { sound.click(); void handleSkip(group.premium); }
              else if (batchMode) { void handleBatchOpen(group.premium); }
              else { void handleOpen(group.premium); }
            }}
            disabled={
              isBusy || phase === "result" || phase === "batch_result" ||
              (isIdle && credits < group.premium.price * (batchMode ? batchCount : 1)) ||
              group.premium.enabled === false ||
              (isSpinning && sofortFiredRef.current)
            }
            className="relative w-full rounded-xl bg-black/50 px-8 py-2.5 text-center transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100 sm:w-auto"
          >
            <span aria-hidden className="rainbow-border" />
            <span className="rainbow-text flex items-center justify-center gap-1.5 text-base font-black uppercase tracking-widest">
              <Zap className="h-4 w-4 text-amber-300" />
              {group.premium.enabled === false
                ? "DEAKTIVIERT"
                : sofortQueued && isPending
                  ? "⚡ WIRD ÜBERSPRUNGEN…"
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
        {phase === "batch_result" && batchDrops.length > 0 && (
          <BatchResultGrid
            items={batchDrops}
            viewBase={batchViewBase}
            cfg={cfg}
            gender={gender}
            onClose={() => {
              setBatchDrops([]);
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

      {/* Pool — opens a filterable 3D popup (kept off the page so cases stay compact) */}
      <div className="mt-4 flex justify-center">
        <button
          onMouseEnter={sound.hover}
          onClick={() => { sound.click(); setPoolOpen(true); }}
          className="flex items-center gap-2 rounded-xl border border-purple-400/40 bg-purple-500/10 px-5 py-2.5 text-sm font-bold text-purple-200 transition-all hover:scale-[1.03] hover:bg-purple-500/20"
        >
          <Package className="h-4 w-4" />
          Pool ansehen
          <span className="rounded-full bg-purple-500/25 px-2 py-0.5 text-xs">{poolSize.toLocaleString("de-DE")}</span>
        </button>
      </div>

      {poolOpen && (
        <PoolPopup
          pool={poolWithExtras}
          viewBase={poolViewBase}
          cfg={cfg}
          gender={gender}
          title={group.title}
          onClose={() => setPoolOpen(false)}
        />
      )}
    </section>
  );
}
