"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Wand2, Trash2, Sparkles, GripVertical, Plus, Crown, Gem, Info } from "lucide-react";
import { useSoundManager } from "@/lib/sound-manager";
import { adminPlaceBpReward, adminClearBpTier } from "@/lib/actions/battle-pass";
import type { BattlePass, BattlePassTier, BpRewardType } from "@/lib/battle-pass";

type Track = "free" | "premium" | "elite";

const TRACK_META: Record<Track, { label: string; short: string; color: string; glow: string; emoji: string }> = {
  elite:   { label: "Elite",     short: "ELITE", color: "#f472b6", glow: "rgba(244,114,182,0.45)", emoji: "💎" },
  premium: { label: "Premium",   short: "PRO",   color: "#fbbf24", glow: "rgba(251,191,36,0.45)",  emoji: "👑" },
  free:    { label: "Kostenlos", short: "FREE",  color: "#a78bfa", glow: "rgba(167,139,250,0.45)", emoji: "✦" },
};

const REWARD_EMOJI: Record<BpRewardType, string> = {
  credits: "💰", item: "📦", random_item: "🎲", badge: "🏆", xp_boost: "⚡", name_style: "🎨", ability: "✨",
};

const RARITY_HEX: Record<string, string> = {
  normal: "#9ca3af", selten: "#3b82f6", mythisch: "#a855f7", ultra: "#f59e0b",
};

function trackOf(t: BattlePassTier): Track {
  return t.isElite ? "elite" : t.isPremium ? "premium" : "free";
}

function rewardSummary(t: BattlePassTier): string {
  switch (t.rewardType) {
    case "credits":     return `${(t.rewardCredits ?? 0).toLocaleString("de-DE")} CR`;
    case "item":        return t.rewardItemName ?? "Item";
    case "random_item": return `Zufall${t.rewardItemRarity ? ` · ${t.rewardItemRarity}` : ""}`;
    case "badge":       return t.rewardBadgeText || "Badge";
    case "xp_boost":    return `+${t.rewardXpBoost ?? 1} Tag(e)`;
    case "name_style":  return t.rewardNameStyleKey || "Name-Style";
    case "ability":     return t.rewardAbilityName || t.rewardAbilityKey || "Fähigkeit";
    default:            return "Belohnung";
  }
}

function rewardColor(t: BattlePassTier): string | null {
  if ((t.rewardType === "item" || t.rewardType === "random_item") && t.rewardItemRarity) {
    return RARITY_HEX[t.rewardItemRarity] ?? null;
  }
  return null;
}

function ChipFace({ tier }: { tier: BattlePassTier }) {
  const accent = rewardColor(tier) ?? TRACK_META[trackOf(tier)].color;
  return (
    <div className="flex flex-col items-center justify-center gap-0.5">
      <span className="text-lg leading-none">{tier.icon || REWARD_EMOJI[tier.rewardType]}</span>
      <span className="px-0.5 text-center text-[8px] font-semibold leading-tight text-zinc-100 line-clamp-2">
        {rewardSummary(tier)}
      </span>
      <span className="text-[7px]">{REWARD_EMOJI[tier.rewardType]}</span>
      <span className="sr-only">{accent}</span>
    </div>
  );
}

type DragState = { from: number; x: number; y: number; over: { tier: number; track: Track } | null };

export function BpTimelineEditor({
  passId,
  tiers,
  tierCount,
  eliteEnabled,
  onEditTier,
  onOpenSmartGen,
  onChanged,
}: {
  passId: string;
  tiers: BattlePassTier[];
  tierCount: number;
  eliteEnabled: boolean;
  onEditTier: (tierNumber: number, existing: BattlePassTier | null, track?: Track) => void;
  onOpenSmartGen: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const sound = useSoundManager();
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ msg: string; ok: boolean } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const tierMap = useMemo(() => new Map(tiers.map((t) => [t.tierNumber, t])), [tiers]);
  const lanes: Track[] = eliteEnabled ? ["elite", "premium", "free"] : ["premium", "free"];

  const tierNumbers = useMemo(
    () => Array.from({ length: Math.max(1, Math.min(50, tierCount)) }, (_, i) => i + 1),
    [tierCount],
  );

  const counts = useMemo(() => {
    const c = { free: 0, premium: 0, elite: 0, total: tiers.length };
    for (const t of tiers) c[trackOf(t)]++;
    return c;
  }, [tiers]);

  // Clean up any in-flight pointer listeners if the editor unmounts mid-drag.
  useEffect(() => () => { cleanupRef.current?.(); }, []);

  const notify = useCallback((msg: string, ok: boolean) => {
    setFlash({ msg, ok });
    setTimeout(() => setFlash(null), 2200);
  }, []);

  const place = useCallback(
    async (from: number, to: number, toTrack: Track) => {
      if (busy) return;
      setBusy(true);
      const res = await adminPlaceBpReward(passId, from, to, toTrack);
      setBusy(false);
      if (res.success) {
        sound.save();
        const verb = from === to ? "Track gewechselt" : tierMap.has(to) ? "Getauscht" : "Verschoben";
        notify(`✓ ${verb}`, true);
        await onChanged();
      } else {
        sound.error();
        notify(res.error ?? "Fehler", false);
      }
    },
    [busy, passId, sound, tierMap, notify, onChanged],
  );

  const clear = useCallback(
    async (tierNumber: number) => {
      if (busy) return;
      setBusy(true);
      const res = await adminClearBpTier(passId, tierNumber);
      setBusy(false);
      if (res.success) {
        sound.save();
        notify("✓ Stufe geleert", true);
        await onChanged();
      } else {
        sound.error();
        notify(res.error ?? "Fehler", false);
      }
    },
    [busy, passId, sound, notify, onChanged],
  );

  // Resolve the timeline cell under a screen coordinate (works for mouse + touch).
  function cellUnder(x: number, y: number): { tier: number; track: Track } | null {
    if (typeof document === "undefined") return null;
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const cell = el?.closest("[data-bpcell]") as HTMLElement | null;
    const raw = cell?.getAttribute("data-bpcell");
    if (!raw) return null;
    const [track, tierStr] = raw.split(":");
    const tier = Number(tierStr);
    if (!tier || (track !== "free" && track !== "premium" && track !== "elite")) return null;
    return { tier, track };
  }

  // Unified pointer drag (mouse, pen, touch). Below the move-threshold it counts as a click.
  function startPointerDrag(n: number, e: React.PointerEvent) {
    if (busy) return;
    if (e.button !== undefined && e.button !== 0) return; // ignore non-primary mouse buttons
    const startX = e.clientX, startY = e.clientY;
    let moved = false;

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      moved = true;
      ev.preventDefault();
      setDrag({ from: n, x: ev.clientX, y: ev.clientY, over: cellUnder(ev.clientX, ev.clientY) });
    };
    const up = (ev: PointerEvent) => {
      cleanup();
      if (moved) {
        const target = cellUnder(ev.clientX, ev.clientY);
        if (target && !(target.tier === n && tierMap.get(n) && trackOf(tierMap.get(n)!) === target.track)) {
          void place(n, target.tier, target.track);
        }
      } else {
        const tier = tierMap.get(n);
        if (tier) onEditTier(n, tier, trackOf(tier));
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

  const draggedTier = drag ? tierMap.get(drag.from) ?? null : null;

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.03] to-black/30 p-3">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-bold text-zinc-100">Visuelle Timeline</span>
        </div>
        <div className="group/tip relative">
          <Info className="h-3.5 w-3.5 cursor-help text-zinc-500 hover:text-zinc-300" />
          <div className="pointer-events-none absolute left-0 top-5 z-30 hidden w-72 rounded-lg border border-white/10 bg-[#15101f] p-2.5 text-[11px] leading-relaxed text-zinc-300 shadow-xl group-hover/tip:block">
            <b className="text-zinc-100">Ziehen (Maus oder Finger):</b> Belohnungs-Kachel auf eine andere
            Spur (Free/Premium/Elite) oder Stufe ziehen. <br />
            • Andere Spur, gleiche Stufe → <b>Track-Wechsel</b>. <br />
            • Belegte Stufe → beide Belohnungen werden <b>getauscht</b>. <br />
            • Leere Stufe → Belohnung wird <b>verschoben</b>. <br />
            <b className="text-zinc-100">Tippen/Klick</b> auf eine Kachel öffnet den Detail-Editor, das
            <b> +</b> erstellt eine neue Stufe auf der angeklickten Spur.
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[11px] text-zinc-500 sm:inline">
            {counts.total}/{tierNumbers.length} belegt · {counts.free}·F {counts.premium}·P{eliteEnabled ? ` ${counts.elite}·E` : ""}
          </span>
          <button
            onClick={onOpenSmartGen}
            className="flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-gradient-to-r from-purple-500/20 to-fuchsia-500/10 px-3 py-1.5 text-xs font-semibold text-purple-200 transition-colors hover:border-purple-400/70 hover:from-purple-500/30"
            title="Smart-Generator: berechnet anhand von Budget, Seltenheit & Mix automatisch einen kompletten Pass."
          >
            <Wand2 className="h-3.5 w-3.5" />
            Smart-Generator
          </button>
        </div>
      </div>

      {/* Timeline grid */}
      <div className="overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
        <div className="flex min-w-min flex-col gap-1.5">
          {lanes.map((lane) => {
            const meta = TRACK_META[lane];
            return (
              <div key={lane} className="flex items-stretch gap-1.5">
                {/* Lane label */}
                <div
                  className="sticky left-0 z-10 flex w-16 shrink-0 flex-col items-center justify-center rounded-lg border px-1 py-1.5 text-center"
                  style={{
                    borderColor: `${meta.color}55`,
                    background: `linear-gradient(180deg, ${meta.color}1f, ${meta.color}08)`,
                  }}
                >
                  <span className="text-base leading-none">{meta.emoji}</span>
                  <span className="mt-0.5 text-[9px] font-bold tracking-wide" style={{ color: meta.color }}>
                    {meta.short}
                  </span>
                </div>

                {/* Cells per tier */}
                {tierNumbers.map((n) => {
                  const tier = tierMap.get(n);
                  const onThisLane = tier && trackOf(tier) === lane;
                  const cellKey = `${lane}:${n}`;
                  const isOver = drag?.over?.tier === n && drag?.over?.track === lane;
                  const isSource = drag?.from === n && onThisLane;
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
                          ? `${accent}22`
                          : onThisLane
                            ? `linear-gradient(170deg, ${accent}26 0%, ${accent}0c 60%, rgba(0,0,0,0.4) 100%)`
                            : "rgba(255,255,255,0.015)",
                        boxShadow: isOver
                          ? `0 0 14px ${meta.glow}`
                          : onThisLane && tier?.highlightTier
                            ? `0 0 10px ${accent}55`
                            : "none",
                      }}
                    >
                      {/* tier number tag on the top lane row */}
                      {lane === lanes[0] && (
                        <span className="absolute -top-[7px] left-1/2 z-10 -translate-x-1/2 rounded bg-[#0e0b18] px-1 text-[8px] font-bold text-zinc-500">
                          {n}
                        </span>
                      )}

                      {onThisLane ? (
                        <div
                          onPointerDown={(e) => startPointerDrag(n, e)}
                          title={`Tier ${n} · ${meta.label} · ${rewardSummary(tier)} — Tippen: bearbeiten, Ziehen: verschieben/tauschen`}
                          className={`group flex h-full w-full cursor-grab select-none flex-col items-center justify-center rounded-lg px-0.5 active:cursor-grabbing ${
                            isSource ? "opacity-30" : ""
                          }`}
                          style={{ touchAction: "none" }}
                        >
                          <GripVertical className="absolute left-0.5 top-0.5 h-2.5 w-2.5 text-white/20 group-hover:text-white/50" />
                          {tier.highlightTier && (
                            <Crown className="absolute right-0.5 top-0.5 h-2.5 w-2.5" style={{ color: accent }} />
                          )}
                          <ChipFace tier={tier} />
                          <span
                            role="button"
                            tabIndex={-1}
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

      {/* Flash feedback */}
      {flash && (
        <div
          className={`mt-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
            flash.ok
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
              : "border-rose-400/30 bg-rose-500/10 text-rose-300"
          }`}
        >
          <Gem className="h-3 w-3" />
          {flash.msg}
        </div>
      )}

      {/* Floating drag ghost (follows mouse/finger) */}
      {drag && draggedTier && (
        <div
          className="pointer-events-none fixed z-[60] flex h-[64px] w-[64px] items-center justify-center rounded-lg border shadow-2xl"
          style={{
            left: drag.x,
            top: drag.y,
            transform: "translate(-50%, -50%) rotate(-4deg)",
            borderColor: (rewardColor(draggedTier) ?? TRACK_META[trackOf(draggedTier)].color),
            background: "linear-gradient(170deg, rgba(20,16,31,0.96), rgba(10,8,18,0.96))",
            boxShadow: `0 8px 24px ${TRACK_META[trackOf(draggedTier)].glow}`,
          }}
        >
          <ChipFace tier={draggedTier} />
        </div>
      )}
    </div>
  );
}
