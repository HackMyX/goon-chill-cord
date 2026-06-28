"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  Wand2, Trash2, Sparkles, GripVertical, Plus, Crown, Gem, Info,
  Coins, Package, Trophy, TrendingUp, Palette, Search, X, Zap,
} from "lucide-react";
import { useSoundManager } from "@/lib/sound-manager";
import {
  adminPlaceBpReward, adminClearBpTier, adminUpsertBpTier, searchBpItems,
  type AdminTierInput,
} from "@/lib/actions/battle-pass";
import { getAllAbilityDefinitions } from "@/lib/actions/abilities";
import { getNameStyleCatalog } from "@/lib/actions/name-styles";
import { getBadgeDefinitions } from "@/lib/actions/badges";
import { RARITY_ORDER, RARITY_LABELS } from "@/lib/cases";
import type { BattlePassTier, BpRewardType } from "@/lib/battle-pass";
import type { Rarity } from "@/lib/cases";

type Track = "free" | "premium";

const TRACK_META: Record<Track, { label: string; short: string; color: string; glow: string; emoji: string }> = {
  premium: { label: "Premium",   short: "PRO",   color: "#fbbf24", glow: "rgba(251,191,36,0.45)",  emoji: "👑" },
  free:    { label: "Kostenlos", short: "FREE",  color: "#a78bfa", glow: "rgba(167,139,250,0.45)", emoji: "✦" },
};

const REWARD_EMOJI: Record<BpRewardType, string> = {
  credits: "💰", item: "📦", random_item: "🎲", badge: "🏆", xp_boost: "⚡", name_style: "🎨", ability: "✨",
  case_voucher: "🎟️", game_bonus: "🎮",
};

const RARITY_HEX: Record<string, string> = {
  normal: "#9ca3af", selten: "#3b82f6", mythisch: "#a855f7", ultra: "#f59e0b",
};

function trackOf(t: BattlePassTier): Track {
  return t.isPremium ? "premium" : "free";
}

function rewardSummary(t: BattlePassTier): string {
  switch (t.rewardType) {
    case "credits":     return `${(t.rewardCredits ?? 0).toLocaleString("de-DE")} CR`;
    case "item":        return t.rewardItemName ?? "Item";
    case "random_item": return `Zufall${t.rewardItemRarity ? ` · ${t.rewardItemRarity}` : ""}`;
    case "badge":       return t.rewardBadgeText || "Badge";
    case "xp_boost":    return `+${t.rewardXpBoost ?? 1} Tag(e)`;
    case "name_style":  return t.rewardNameStyleKey || "Name-Style";
    case "ability":     return t.rewardAbilityName || t.rewardAbilityKey || "Fähigkeits-Gutschein";
    default:            return "Belohnung";
  }
}

function rewardColor(t: BattlePassTier): string | null {
  if ((t.rewardType === "item" || t.rewardType === "random_item") && t.rewardItemRarity) {
    return RARITY_HEX[t.rewardItemRarity] ?? null;
  }
  return null;
}

function ChipFace({ icon, summary, type }: { icon: string; summary: string; type: BpRewardType }) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5">
      <span className="text-lg leading-none">{icon || REWARD_EMOJI[type]}</span>
      <span className="px-0.5 text-center text-[8px] font-semibold leading-tight text-zinc-100 line-clamp-2">{summary}</span>
      <span className="text-[7px]">{REWARD_EMOJI[type]}</span>
    </div>
  );
}

// ── Pool reward blueprint ─────────────────────────────────────────────────────
interface PoolItem {
  rewardType: BpRewardType;
  label: string;
  emoji: string;
  color: string;
  rewardCredits?: number;
  rewardItemId?: string;
  rewardItemName?: string;
  rewardItemType?: string;
  rewardItemRarity?: Rarity | null;
  rewardBadgeKey?: string;
  rewardBadgeText?: string;
  rewardXpBoost?: number;
  rewardNameStyleKey?: string;
  rewardAbilityKey?: string;
}

function buildInput(p: PoolItem, tierNumber: number, track: Track): AdminTierItem {
  return {
    tierNumber,
    name: p.label,
    isPremium: track === "premium",
    rewardType: p.rewardType,
    rewardCredits: p.rewardCredits ?? null,
    rewardItemId: p.rewardItemId ?? null,
    rewardItemType: p.rewardItemType ?? null,
    rewardItemName: p.rewardItemName ?? null,
    rewardBadgeKey: p.rewardBadgeKey ?? null,
    rewardBadgeText: p.rewardBadgeText ?? null,
    rewardItemRarity: p.rewardItemRarity ?? null,
    rewardXpBoost: p.rewardXpBoost ?? null,
    rewardNameStyleKey: p.rewardNameStyleKey ?? null,
    rewardAbilityKey: p.rewardAbilityKey ?? null,
    rewardQuantity: 1,
    highlightTier: false,
    description: null,
    icon: p.emoji,
    displayMode: p.rewardType === "credits" || p.rewardType === "badge" ? "auto" : "3d",
    showTierName: true,
    showTierDescription: true,
  };
}
type AdminTierItem = AdminTierInput;

type DragState =
  | { src: "tile"; from: number; tier: BattlePassTier; x: number; y: number; over: { tier: number; track: Track } | null }
  | { src: "pool"; item: PoolItem; x: number; y: number; over: { tier: number; track: Track } | null };

type ItemHit = { id: string; name: string; rarity: Rarity; type: string };

export function BpRewardStudio({
  passId,
  tiers,
  tierCount,
  onEditTier,
  onOpenSmartGen,
  onChanged,
}: {
  passId: string;
  tiers: BattlePassTier[];
  tierCount: number;
  onEditTier: (tierNumber: number, existing: BattlePassTier | null, track?: Track) => void;
  onOpenSmartGen: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const sound = useSoundManager();
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ msg: string; ok: boolean } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Pool controls
  const [creditAmt, setCreditAmt] = useState(2500);
  const [boostDays, setBoostDays] = useState(2);
  const [randomRarity, setRandomRarity] = useState<Rarity | null>(null);
  const [itemQuery, setItemQuery] = useState("");
  const [itemResults, setItemResults] = useState<ItemHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [abilities, setAbilities] = useState<{ key: string; name: string; icon: string; rarity: string }[]>([]);
  const [nameStyles, setNameStyles] = useState<{ key: string; label: string; rarity: string }[]>([]);
  const [badges, setBadges] = useState<{ key: string; label: string; icon: string; color: string }[]>([]);

  const tierMap = useMemo(() => new Map(tiers.map((t) => [t.tierNumber, t])), [tiers]);
  const lanes: Track[] = ["premium", "free"];
  const tierNumbers = useMemo(
    () => Array.from({ length: Math.max(1, Math.min(50, tierCount)) }, (_, i) => i + 1),
    [tierCount],
  );
  const counts = useMemo(() => {
    const c = { free: 0, premium: 0, total: tiers.length };
    for (const t of tiers) c[trackOf(t)]++;
    return c;
  }, [tiers]);

  // Lesbares Label statt rohem Key (Name-Style/Badge/Fähigkeit) — aus den live geladenen Listen.
  const labelFor = useCallback((t: BattlePassTier): string => {
    if (t.rewardType === "name_style" && t.rewardNameStyleKey)
      return nameStyles.find((n) => n.key === t.rewardNameStyleKey)?.label ?? t.rewardNameStyleKey;
    if (t.rewardType === "ability" && t.rewardAbilityKey)
      return abilities.find((a) => a.key === t.rewardAbilityKey)?.name ?? (t.rewardAbilityName || t.rewardAbilityKey);
    if (t.rewardType === "badge")
      return t.rewardBadgeText || badges.find((b) => b.key === t.rewardBadgeKey)?.label || "Badge";
    return rewardSummary(t);
  }, [nameStyles, abilities, badges]);

  useEffect(() => () => { cleanupRef.current?.(); }, []);

  // Fähigkeiten LIVE aus ability_definitions laden → wächst automatisch mit, sobald im
  // Fähigkeiten-Admin neue angelegt werden (kein hartcodierter Katalog).
  useEffect(() => {
    let alive = true;
    getAllAbilityDefinitions()
      .then((defs) => { if (alive) setAbilities(defs.map((d) => ({ key: d.key, name: d.name, icon: d.icon, rarity: d.rarity }))); })
      .catch(() => { /* leer lassen */ });
    getNameStyleCatalog()
      .then((defs) => { if (alive) setNameStyles(defs.map((d) => ({ key: d.key, label: d.label, rarity: String(d.rarity) }))); })
      .catch(() => {});
    getBadgeDefinitions()
      .then((defs) => { if (alive) setBadges(defs.map((d) => ({ key: d.key, label: d.label, icon: d.icon, color: d.color }))); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Debounced item search
  useEffect(() => {
    const q = itemQuery.trim();
    if (!q) { setItemResults([]); setSearching(false); return; }
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const res = await searchBpItems(q);
        setItemResults((res as ItemHit[]).slice(0, 24));
      } catch { setItemResults([]); }
      setSearching(false);
    }, 300);
    return () => clearTimeout(id);
  }, [itemQuery]);

  const notify = useCallback((msg: string, ok: boolean) => {
    setFlash({ msg, ok });
    setTimeout(() => setFlash(null), 2200);
  }, []);

  const finish = useCallback(async (ok: boolean, msg: string) => {
    if (ok) { sound.save(); notify(`✓ ${msg}`, true); await onChanged(); }
    else { sound.error(); notify(msg, false); }
  }, [sound, notify, onChanged]);

  const dropTile = useCallback(async (from: number, to: number, track: Track) => {
    setBusy(true);
    const res = await adminPlaceBpReward(passId, from, to, track);
    setBusy(false);
    await finish(res.success, res.success ? (from === to ? "Track gewechselt" : tierMap.has(to) ? "Getauscht" : "Verschoben") : (res.error ?? "Fehler"));
  }, [passId, finish, tierMap]);

  const dropPool = useCallback(async (item: PoolItem, to: number, track: Track) => {
    setBusy(true);
    const res = await adminUpsertBpTier(passId, buildInput(item, to, track));
    setBusy(false);
    await finish(res.success, res.success ? `${item.label} → Tier ${to}` : (res.error ?? "Fehler"));
  }, [passId, finish]);

  const clear = useCallback(async (tierNumber: number) => {
    setBusy(true);
    const res = await adminClearBpTier(passId, tierNumber);
    setBusy(false);
    await finish(res.success, res.success ? "Stufe geleert" : (res.error ?? "Fehler"));
  }, [passId, finish]);

  function cellUnder(x: number, y: number): { tier: number; track: Track } | null {
    if (typeof document === "undefined") return null;
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const raw = el?.closest("[data-bpcell]")?.getAttribute("data-bpcell");
    if (!raw) return null;
    const [track, tierStr] = raw.split(":");
    const tier = Number(tierStr);
    if (!tier || (track !== "free" && track !== "premium")) return null;
    return { tier, track };
  }

  // Unified pointer drag for pool blueprints AND existing tiles.
  function startDrag(seed: { src: "tile"; from: number; tier: BattlePassTier } | { src: "pool"; item: PoolItem }, e: React.PointerEvent) {
    if (busy) return;
    if (e.button !== undefined && e.button !== 0) return;
    const startX = e.clientX, startY = e.clientY;
    let moved = false;

    const setFromSeed = (x: number, y: number, over: { tier: number; track: Track } | null): DragState =>
      seed.src === "tile"
        ? { src: "tile", from: seed.from, tier: seed.tier, x, y, over }
        : { src: "pool", item: seed.item, x, y, over };

    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
      moved = true;
      ev.preventDefault();
      setDrag(setFromSeed(ev.clientX, ev.clientY, cellUnder(ev.clientX, ev.clientY)));
    };
    const up = (ev: PointerEvent) => {
      cleanup();
      if (moved) {
        const target = cellUnder(ev.clientX, ev.clientY);
        if (target) {
          if (seed.src === "tile") {
            const same = target.tier === seed.from && trackOf(seed.tier) === target.track;
            if (!same) void dropTile(seed.from, target.tier, target.track);
          } else {
            void dropPool(seed.item, target.tier, target.track);
          }
        }
      } else if (seed.src === "tile") {
        onEditTier(seed.from, seed.tier, trackOf(seed.tier));
      }
      setDrag(null);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      cleanupRef.current = null;
    };
    cleanupRef.current = cleanup;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  // Pool blueprint chips (drag source)
  const poolChips: { item: PoolItem; icon: React.ReactNode; hint: string; control?: React.ReactNode }[] = [
    {
      item: { rewardType: "credits", label: `${creditAmt.toLocaleString("de-DE")} Credits`, emoji: "💰", color: "#fbbf24", rewardCredits: creditAmt },
      icon: <Coins className="h-4 w-4" style={{ color: "#fbbf24" }} />,
      hint: "Credits direkt auf eine Stufe ziehen.",
      control: (
        <input
          type="number" min={1} value={creditAmt}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => setCreditAmt(Math.max(1, Number(e.target.value) || 0))}
          className="w-full rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-[10px] text-zinc-200 outline-none focus:border-amber-400/60"
        />
      ),
    },
    {
      item: { rewardType: "random_item", label: "Zufalls-Item", emoji: "🎲", color: "#a855f7", rewardItemRarity: randomRarity },
      icon: <Sparkles className="h-4 w-4" style={{ color: "#a855f7" }} />,
      hint: "Zufälliges Item — optional auf eine Seltenheit beschränken.",
      control: (
        <select
          value={randomRarity ?? ""}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => setRandomRarity((e.target.value || null) as Rarity | null)}
          className="w-full rounded border border-white/10 bg-black/40 px-1 py-0.5 text-[10px] text-zinc-200 outline-none focus:border-purple-400/60"
        >
          <option value="">alle Seltenheiten</option>
          {RARITY_ORDER.map((r) => <option key={r} value={r}>{RARITY_LABELS[r]}</option>)}
        </select>
      ),
    },
    {
      item: { rewardType: "xp_boost", label: `+${boostDays} Fortschrittstag(e)`, emoji: "⚡", color: "#38bdf8", rewardXpBoost: boostDays },
      icon: <TrendingUp className="h-4 w-4" style={{ color: "#38bdf8" }} />,
      hint: "XP-Boost: schenkt Fortschrittstage.",
      control: (
        <input
          type="number" min={1} value={boostDays}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => setBoostDays(Math.max(1, Number(e.target.value) || 1))}
          className="w-full rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-[10px] text-zinc-200 outline-none focus:border-sky-400/60"
        />
      ),
    },
  ];

  const ghostNode = drag ? (
    drag.src === "tile"
      ? <ChipFace icon={drag.tier.icon} summary={labelFor(drag.tier)} type={drag.tier.rewardType} />
      : <ChipFace icon={drag.item.emoji} summary={drag.item.label} type={drag.item.rewardType} />
  ) : null;
  const ghostColor = drag
    ? (drag.src === "tile" ? (rewardColor(drag.tier) ?? TRACK_META[trackOf(drag.tier)].color) : drag.item.color)
    : "#a78bfa";

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-black/40 p-3">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-purple-400" />
        <span className="text-sm font-bold text-zinc-100">Reward-Studio</span>
        <div className="group/tip relative">
          <Info className="h-3.5 w-3.5 cursor-help text-zinc-500 hover:text-zinc-300" />
          <div className="pointer-events-none absolute left-0 top-5 z-30 hidden w-80 rounded-lg border border-white/10 bg-[#15101f] p-2.5 text-[11px] leading-relaxed text-zinc-300 shadow-xl group-hover/tip:block">
            <b className="text-zinc-100">Pool → Timeline:</b> Belohnung aus dem Pool links anpacken und auf eine
            Stufe/Spur ziehen (Maus oder Finger). <br />
            <b className="text-zinc-100">Timeline:</b> bestehende Kachel ziehen → andere Spur = Track-Wechsel,
            belegte Stufe = Tausch, leere Stufe = Verschieben. <br />
            <b className="text-zinc-100">Tippen</b> auf eine Kachel öffnet den Detail-Editor; <b>Papierkorb</b> leert die Stufe.
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[11px] text-zinc-500 sm:inline">
            {counts.total}/{tierNumbers.length} belegt · {counts.free}·F {counts.premium}·P
          </span>
          <button
            onClick={onOpenSmartGen}
            className="flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-gradient-to-r from-purple-500/25 to-fuchsia-500/10 px-3 py-1.5 text-xs font-semibold text-purple-100 transition-colors hover:border-purple-400/70 hover:from-purple-500/40"
            title="Smart-Generator: füllt anhand von Budget, Seltenheits-Kurve & Verteilung automatisch den kompletten Pass."
          >
            <Wand2 className="h-3.5 w-3.5" />
            Smart-Generator KI
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        {/* ── Reward Pool ── */}
        <div className="shrink-0 rounded-xl border border-white/10 bg-black/30 p-2 lg:w-56">
          <p className="mb-1.5 px-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-400">Belohnungs-Pool</p>
          <div className="space-y-1.5">
            {poolChips.map((c, i) => (
              <div
                key={i}
                className="rounded-lg border border-white/10 bg-white/[0.02] p-1.5 transition-colors hover:border-purple-400/40"
              >
                <div
                  onPointerDown={(e) => startDrag({ src: "pool", item: c.item }, e)}
                  title={`${c.hint} — ziehen auf eine Stufe`}
                  className="flex cursor-grab select-none items-center gap-1.5 active:cursor-grabbing"
                  style={{ touchAction: "none" }}
                >
                  <GripVertical className="h-3 w-3 shrink-0 text-white/25" />
                  {c.icon}
                  <span className="flex-1 truncate text-[11px] font-semibold text-zinc-200">{c.item.label}</span>
                </div>
                {c.control && <div className="mt-1">{c.control}</div>}
              </div>
            ))}
          </div>

          {/* Item search */}
          <p className="mb-1 mt-3 px-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-400">Items</p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
            <input
              value={itemQuery}
              onChange={(e) => setItemQuery(e.target.value)}
              placeholder="Item suchen…"
              className="w-full rounded-lg border border-white/10 bg-black/40 py-1 pl-7 pr-6 text-[11px] text-zinc-200 outline-none focus:border-purple-400/60"
            />
            {itemQuery && (
              <button onClick={() => setItemQuery("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="mt-1.5 max-h-44 space-y-1 overflow-y-auto pr-0.5" style={{ scrollbarWidth: "thin" }}>
            {searching && <p className="px-1 py-1 text-[10px] text-zinc-500">Suche…</p>}
            {!searching && itemQuery && itemResults.length === 0 && <p className="px-1 py-1 text-[10px] text-zinc-500">Nichts gefunden.</p>}
            {itemResults.map((it) => {
              const col = RARITY_HEX[it.rarity] ?? "#9ca3af";
              const item: PoolItem = {
                rewardType: "item", label: it.name, emoji: "📦", color: col,
                rewardItemId: it.id, rewardItemName: it.name, rewardItemType: it.type, rewardItemRarity: it.rarity,
              };
              return (
                <div
                  key={it.id}
                  onPointerDown={(e) => startDrag({ src: "pool", item }, e)}
                  title={`${it.name} (${it.rarity}) — auf eine Stufe ziehen`}
                  className="flex cursor-grab select-none items-center gap-1.5 rounded-lg border px-1.5 py-1 active:cursor-grabbing"
                  style={{ touchAction: "none", borderColor: `${col}40`, background: `${col}0f` }}
                >
                  <GripVertical className="h-3 w-3 shrink-0 text-white/25" />
                  <Package className="h-3.5 w-3.5 shrink-0" style={{ color: col }} />
                  <span className="flex-1 truncate text-[10px] font-semibold text-zinc-200">{it.name}</span>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: col }} />
                </div>
              );
            })}
          </div>

          {/* Fähigkeiten — Liste aus ability_definitions, synct automatisch */}
          <p className="mb-1 mt-3 px-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
            Fähigkeits-Gutscheine <span className="text-zinc-600">({abilities.length})</span>
          </p>
          <div className="max-h-44 space-y-1 overflow-y-auto pr-0.5" style={{ scrollbarWidth: "thin" }}>
            {abilities.length === 0 && (
              <p className="px-1 py-1 text-[10px] text-zinc-500">Keine Fähigkeits-Gutscheine angelegt — lege im Fähigkeits-Gutschein-Admin welche an.</p>
            )}
            {abilities.map((ab) => {
              const col = RARITY_HEX[ab.rarity] ?? "#22d3ee";
              const item: PoolItem = { rewardType: "ability", label: ab.name, emoji: ab.icon || "✨", color: col, rewardAbilityKey: ab.key };
              return (
                <div
                  key={ab.key}
                  onPointerDown={(e) => startDrag({ src: "pool", item }, e)}
                  title={`${ab.name} (${ab.rarity}) — auf eine Stufe ziehen`}
                  className="flex cursor-grab select-none items-center gap-1.5 rounded-lg border px-1.5 py-1 active:cursor-grabbing"
                  style={{ touchAction: "none", borderColor: `${col}40`, background: `${col}0f` }}
                >
                  <GripVertical className="h-3 w-3 shrink-0 text-white/25" />
                  <span className="text-sm leading-none">{ab.icon || "✨"}</span>
                  <span className="flex-1 truncate text-[10px] font-semibold text-zinc-200">{ab.name}</span>
                  <Zap className="h-3 w-3 shrink-0" style={{ color: col }} />
                </div>
              );
            })}
          </div>

          {/* Name-Styles — Liste aus dem Katalog, synct automatisch */}
          <p className="mb-1 mt-3 px-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
            Name-Styles <span className="text-zinc-600">({nameStyles.length})</span>
          </p>
          <div className="max-h-44 space-y-1 overflow-y-auto pr-0.5" style={{ scrollbarWidth: "thin" }}>
            {nameStyles.length === 0 && <p className="px-1 py-1 text-[10px] text-zinc-500">Keine Name-Styles.</p>}
            {nameStyles.map((ns) => {
              const col = RARITY_HEX[ns.rarity] ?? "#e879f9";
              const item: PoolItem = { rewardType: "name_style", label: ns.label, emoji: "🎨", color: col, rewardNameStyleKey: ns.key };
              return (
                <div
                  key={ns.key}
                  onPointerDown={(e) => startDrag({ src: "pool", item }, e)}
                  title={`${ns.label} (${ns.rarity}) — auf eine Stufe ziehen`}
                  className="flex cursor-grab select-none items-center gap-1.5 rounded-lg border px-1.5 py-1 active:cursor-grabbing"
                  style={{ touchAction: "none", borderColor: `${col}40`, background: `${col}0f` }}
                >
                  <GripVertical className="h-3 w-3 shrink-0 text-white/25" />
                  <Palette className="h-3.5 w-3.5 shrink-0" style={{ color: col }} />
                  <span className="flex-1 truncate text-[10px] font-semibold text-zinc-200">{ns.label}</span>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: col }} />
                </div>
              );
            })}
          </div>

          {/* Badges — Liste aus badge_definitions, synct automatisch */}
          <p className="mb-1 mt-3 px-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
            Badges <span className="text-zinc-600">({badges.length})</span>
          </p>
          <div className="max-h-44 space-y-1 overflow-y-auto pr-0.5" style={{ scrollbarWidth: "thin" }}>
            {badges.length === 0 && <p className="px-1 py-1 text-[10px] text-zinc-500">Keine Badges.</p>}
            {badges.map((bd) => {
              const col = bd.color || "#f59e0b";
              const item: PoolItem = { rewardType: "badge", label: bd.label, emoji: bd.icon || "🏆", color: col, rewardBadgeKey: bd.key, rewardBadgeText: bd.label };
              return (
                <div
                  key={bd.key}
                  onPointerDown={(e) => startDrag({ src: "pool", item }, e)}
                  title={`${bd.label} — auf eine Stufe ziehen`}
                  className="flex cursor-grab select-none items-center gap-1.5 rounded-lg border px-1.5 py-1 active:cursor-grabbing"
                  style={{ touchAction: "none", borderColor: `${col}40`, background: `${col}0f` }}
                >
                  <GripVertical className="h-3 w-3 shrink-0 text-white/25" />
                  <span className="text-sm leading-none">{bd.icon || "🏆"}</span>
                  <span className="flex-1 truncate text-[10px] font-semibold text-zinc-200">{bd.label}</span>
                  <Trophy className="h-3 w-3 shrink-0" style={{ color: col }} />
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Timeline ── */}
        <div className="min-w-0 flex-1">
          <div className="overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
            <div className="flex min-w-min flex-col gap-1.5">
              {lanes.map((lane) => {
                const meta = TRACK_META[lane];
                return (
                  <div key={lane} className="flex items-stretch gap-1.5">
                    <div
                      className="sticky left-0 z-10 flex w-16 shrink-0 flex-col items-center justify-center rounded-lg border px-1 py-1.5 text-center"
                      style={{ borderColor: `${meta.color}55`, background: `linear-gradient(180deg, ${meta.color}1f, ${meta.color}08)` }}
                    >
                      <span className="text-base leading-none">{meta.emoji}</span>
                      <span className="mt-0.5 text-[9px] font-bold tracking-wide" style={{ color: meta.color }}>{meta.short}</span>
                    </div>

                    {tierNumbers.map((n) => {
                      const tier = tierMap.get(n);
                      const onThisLane = tier && trackOf(tier) === lane;
                      const cellKey = `${lane}:${n}`;
                      const isOver = drag?.over?.tier === n && drag?.over?.track === lane;
                      const isSource = drag?.src === "tile" && drag.from === n && onThisLane;
                      const rColor = onThisLane ? rewardColor(tier) : null;
                      const accent = rColor ?? meta.color;
                      return (
                        <div
                          key={cellKey}
                          data-bpcell={cellKey}
                          className="relative h-[68px] w-[68px] shrink-0 rounded-lg border transition-all"
                          style={{
                            borderColor: isOver ? accent : onThisLane ? `${accent}66` : "rgba(255,255,255,0.07)",
                            background: isOver
                              ? `${accent}26`
                              : onThisLane
                                ? `linear-gradient(170deg, ${accent}26 0%, ${accent}0c 60%, rgba(0,0,0,0.4) 100%)`
                                : "rgba(255,255,255,0.015)",
                            boxShadow: isOver
                              ? `0 0 16px ${meta.glow}`
                              : onThisLane && tier?.highlightTier ? `0 0 10px ${accent}55` : "none",
                          }}
                        >
                          {lane === lanes[0] && (
                            <span className="absolute -top-[7px] left-1/2 z-10 -translate-x-1/2 rounded bg-[#0e0b18] px-1 text-[8px] font-bold text-zinc-500">{n}</span>
                          )}

                          {onThisLane ? (
                            <div
                              onPointerDown={(e) => startDrag({ src: "tile", from: n, tier }, e)}
                              title={`Tier ${n} · ${meta.label} · ${labelFor(tier)} — Tippen: bearbeiten, Ziehen: verschieben/tauschen`}
                              className={`group flex h-full w-full cursor-grab select-none flex-col items-center justify-center rounded-lg px-0.5 active:cursor-grabbing ${isSource ? "opacity-30" : ""}`}
                              style={{ touchAction: "none" }}
                            >
                              <GripVertical className="absolute left-0.5 top-0.5 h-2.5 w-2.5 text-white/20 group-hover:text-white/50" />
                              {tier.highlightTier && <Crown className="absolute right-0.5 top-0.5 h-2.5 w-2.5" style={{ color: accent }} />}
                              <ChipFace icon={tier.icon} summary={labelFor(tier)} type={tier.rewardType} />
                              <span
                                role="button" tabIndex={-1}
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); void clear(n); }}
                                className="absolute bottom-0 right-0.5 hidden rounded p-0.5 text-zinc-500 hover:text-rose-400 group-hover:block"
                                title="Stufe leeren"
                              >
                                <Trash2 className="h-2.5 w-2.5" />
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onEditTier(n, tier ?? null, lane)}
                              title={tier ? `Tier ${n} liegt auf einer anderen Spur — Klick: bearbeiten` : `Tier ${n} auf "${meta.label}" erstellen`}
                              className="flex h-full w-full items-center justify-center rounded-lg text-white/15 transition-colors hover:bg-white/[0.03] hover:text-white/40"
                            >
                              {tier ? <span className="h-1 w-1 rounded-full bg-white/15" /> : <Plus className="h-4 w-4" />}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {flash && (
            <div className={`mt-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${flash.ok ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-rose-400/30 bg-rose-500/10 text-rose-300"}`}>
              <Gem className="h-3 w-3" />
              {flash.msg}
            </div>
          )}
        </div>
      </div>

      {/* Floating drag ghost */}
      {drag && (
        <div
          className="pointer-events-none fixed z-[60] flex h-[64px] w-[64px] items-center justify-center rounded-lg border shadow-2xl"
          style={{
            left: drag.x, top: drag.y,
            transform: "translate(-50%, -50%) rotate(-4deg)",
            borderColor: ghostColor,
            background: "linear-gradient(170deg, rgba(20,16,31,0.97), rgba(10,8,18,0.97))",
            boxShadow: `0 8px 28px ${ghostColor}66`,
          }}
        >
          {ghostNode}
        </div>
      )}
    </div>
  );
}

// Backwards-compatible alias (older import name).
export { BpRewardStudio as BpTimelineEditor };
