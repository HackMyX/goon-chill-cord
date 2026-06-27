"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Pause, Play, Crown, Sparkles, Gift, Star, Lock, CheckCircle2 } from "lucide-react";
import { CaseDropView } from "@/components/cases/case-item-3d";
import { WORN_TYPES } from "@/lib/case-display-config";
import { RARITY_LABELS } from "@/lib/cases";
import type { BattlePassTier, UserBpStatus } from "@/lib/battle-pass";
import type { PreviewSubject } from "@/components/ui/universal-preview-modal";
import type { Rarity } from "@/lib/cases";

const RARITY_HEX: Record<string, string> = {
  normal: "#9ca3af", selten: "#3b82f6", mythisch: "#a855f7", ultra: "#f59e0b",
};
const TRACK = {
  elite: { label: "Elite", color: "#a78bfa", icon: Sparkles },
  premium: { label: "Premium", color: "#f59e0b", icon: Crown },
  free: { label: "Kostenlos", color: "#94a3b8", icon: Gift },
} as const;

function trackOf(t: BattlePassTier): "elite" | "premium" | "free" {
  return t.isElite ? "elite" : t.isPremium ? "premium" : "free";
}

function subjectOf(t: BattlePassTier): PreviewSubject | null {
  switch (t.rewardType) {
    case "item":
      if (!t.rewardItemName || !t.rewardItemType) return null;
      return { kind: "item", item: { id: t.rewardItemId ?? t.id, name: t.rewardItemName, rarity: (t.rewardItemRarity ?? "normal") as Rarity, type: t.rewardItemType } };
    case "random_item": return { kind: "random_item", rarity: t.rewardItemRarity ?? undefined };
    case "badge": return t.rewardBadgeKey ? { kind: "badge", badgeKey: t.rewardBadgeKey, badgeText: t.rewardBadgeText ?? undefined } : { kind: "random_item" };
    case "name_style": return t.rewardNameStyleKey ? { kind: "name_style", styleKey: t.rewardNameStyleKey } : { kind: "random_item" };
    case "ability": return t.rewardAbilityKey ? { kind: "ability", abilityKey: t.rewardAbilityKey, name: t.rewardAbilityName ?? t.name } : { kind: "random_item" };
    case "xp_boost": return { kind: "xp_boost", days: t.rewardXpBoost ?? 1 };
    case "credits": return { kind: "credits", amount: (t.rewardCredits ?? 0) * (t.rewardQuantity ?? 1) };
    default: return { kind: "random_item" };
  }
}

function rewardText(t: BattlePassTier): string {
  switch (t.rewardType) {
    case "credits": return `${((t.rewardCredits ?? 0) * (t.rewardQuantity ?? 1)).toLocaleString("de-DE")} Credits`;
    case "item": return t.rewardItemName ?? "Item";
    case "random_item": return `Zufalls-Item${t.rewardItemRarity ? ` (${RARITY_LABELS[t.rewardItemRarity] ?? t.rewardItemRarity})` : ""}`;
    case "badge": return t.rewardBadgeText || "Badge";
    case "xp_boost": return `+${t.rewardXpBoost ?? 1} Fortschrittstage`;
    case "name_style": return t.rewardNameStyleKey || "Name-Style";
    case "ability": return t.rewardAbilityName || "Fähigkeit";
    default: return "Belohnung";
  }
}

export function PodiumShowcase({
  tiers,
  accent,
  glow,
  userStatus,
  viewIndexBase = 900,
}: {
  tiers: BattlePassTier[];
  accent: string;
  glow: string;
  userStatus: UserBpStatus | null;
  viewIndexBase?: number;
}) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const count = tiers.length;
  const tier = tiers[Math.min(active, count - 1)];

  // Auto-advance
  useEffect(() => {
    if (paused || count <= 1) return;
    const id = setInterval(() => setActive((a) => (a + 1) % count), 4000);
    return () => clearInterval(id);
  }, [paused, count]);

  const go = useCallback((dir: number) => setActive((a) => (a + dir + count) % count), [count]);

  const meta = useMemo(() => {
    const tk = trackOf(tier);
    const rarity = tier.rewardItemRarity ?? null;
    const isUltra = rarity === "ultra";
    const rColor = rarity ? (RARITY_HEX[rarity] ?? null) : null;
    const color = rColor ?? TRACK[tk].color;
    const isItem = tier.rewardType === "item" && !!tier.rewardItemName && !!tier.rewardItemType;
    const subj = subjectOf(tier);
    const claimed = userStatus?.claimedTierIds.includes(tier.id) ?? false;
    const unlocked = (userStatus?.progressDays ?? 0) >= tier.tierNumber
      && (!tier.isPremium || (userStatus?.hasPremium ?? false))
      && (!tier.isElite || (userStatus?.hasElite ?? false));
    return { tk, color, isItem, subj, claimed, unlocked, isUltra };
  }, [tier, userStatus]);

  const RAINBOW = ["#ff0044", "#ff8800", "#ffee00", "#22dd55", "#00aaff", "#aa44ff", "#ff0044"];

  if (count === 0 || !tier) return null;
  const TrackIcon = TRACK[meta.tk].icon;

  return (
    <div
      className="relative overflow-hidden rounded-3xl border"
      style={{
        borderColor: `${meta.color}33`,
        background: `radial-gradient(120% 90% at 50% 0%, ${meta.color}1f 0%, rgba(7,5,18,0) 55%), linear-gradient(180deg, rgba(12,9,24,0.6) 0%, rgba(6,4,14,0.9) 100%)`,
        boxShadow: `0 0 60px ${meta.color}18, inset 0 0 60px rgba(0,0,0,0.5)`,
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Spotlight cone from top */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-full w-2/3 -translate-x-1/2"
        style={{ background: `radial-gradient(60% 70% at 50% 0%, ${meta.color}26 0%, transparent 70%)` }}
      />
      {/* Animated rarity glow behind model */}
      <motion.div
        key={`glow-${active}`}
        className="pointer-events-none absolute left-1/2 top-[18%] h-56 w-56 -translate-x-1/2 rounded-full blur-[80px]"
        style={{ background: meta.color }}
        initial={{ opacity: 0.1, scale: 0.8 }}
        animate={meta.isUltra
          ? { opacity: [0.2, 0.4, 0.2], scale: [0.9, 1.08, 0.9], backgroundColor: RAINBOW }
          : { opacity: [0.18, 0.34, 0.18], scale: [0.9, 1.06, 0.9] }}
        transition={{ duration: meta.isUltra ? 3 : 4, repeat: Infinity, ease: meta.isUltra ? "linear" : "easeInOut" }}
      />

      {/* LIVE badge */}
      <div className="absolute left-4 top-4 z-20 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white/70 backdrop-blur-sm">
        <motion.span className="h-1.5 w-1.5 rounded-full bg-rose-500" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }} />
        Live
      </div>
      {/* Pause/Play */}
      <button
        onClick={() => setPaused((p) => !p)}
        className="absolute right-4 top-4 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/60 backdrop-blur-sm transition-colors hover:text-white"
        title={paused ? "Automatisch durchlaufen" : "Pausieren"}
      >
        {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
      </button>

      {/* Arrows */}
      <button onClick={() => go(-1)} className="absolute left-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/60 backdrop-blur-sm transition-colors hover:text-white" aria-label="vorherige">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button onClick={() => go(1)} className="absolute right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/60 backdrop-blur-sm transition-colors hover:text-white" aria-label="nächste">
        <ChevronRight className="h-5 w-5" />
      </button>

      <div className="relative z-10 flex flex-col items-center px-6 pb-5 pt-12 sm:pt-10">
        {/* Tier number */}
        <motion.div
          key={`num-${active}`}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-1 flex items-center gap-2"
        >
          {tier.highlightTier && <Star className="h-4 w-4" style={{ color: meta.color }} />}
          <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white/40">Level {tier.tierNumber}</span>
          {tier.highlightTier && <Star className="h-4 w-4" style={{ color: meta.color }} />}
        </motion.div>

        {/* 3D model on podium */}
        <div className="relative flex h-[210px] w-full max-w-[320px] items-end justify-center sm:h-[240px]">
          <motion.div
            key={`model-${active}`}
            className="absolute inset-x-0 top-0 h-[170px] sm:h-[195px]"
            initial={{ opacity: 0, scale: 0.78, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 160, damping: 18 }}
          >
            <CaseDropView
              subject={meta.subj ?? { kind: "random_item" }}
              viewIndex={viewIndexBase}
              visible
              shadow
              character={meta.isItem && !!tier.rewardItemType && WORN_TYPES.has(tier.rewardItemType)}
              fallbackColor={meta.color}
            />
          </motion.div>

          {/* Podium disc */}
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
            <div className="h-3 w-44 rounded-[100%]" style={{ background: `radial-gradient(50% 100% at 50% 0%, ${meta.color}cc, ${meta.color}22 70%, transparent)`, boxShadow: `0 0 30px ${glow}` }} />
            <div className="mx-auto -mt-1 h-7 w-40 rounded-[100%] border-t" style={{ borderColor: `${meta.color}55`, background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.4))" }} />
          </div>
        </div>

        {/* Info */}
        <motion.div
          key={`info-${active}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mt-2 flex flex-col items-center text-center"
        >
          <h3 className="text-xl font-black text-white sm:text-2xl" style={{ textShadow: `0 0 28px ${meta.color}66` }}>
            {rewardText(tier)}
          </h3>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <span className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider" style={{ borderColor: `${TRACK[meta.tk].color}55`, color: TRACK[meta.tk].color, background: `${TRACK[meta.tk].color}12` }}>
              <TrackIcon className="h-3 w-3" />{TRACK[meta.tk].label}
            </span>
            {tier.rewardItemRarity && (
              meta.isUltra ? (
                <span className="rainbow-border relative rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider">
                  <span className="rainbow-text">{RARITY_LABELS.ultra}</span>
                </span>
              ) : (
                <span className="rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider" style={{ borderColor: `${meta.color}55`, color: meta.color, background: `${meta.color}12` }}>
                  {RARITY_LABELS[tier.rewardItemRarity] ?? tier.rewardItemRarity}
                </span>
              )
            )}
            {meta.claimed ? (
              <span className="flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />Abgeholt
              </span>
            ) : !meta.unlocked ? (
              <span className="flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white/40">
                <Lock className="h-3 w-3" />Gesperrt
              </span>
            ) : (
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-300/90">
                Bereit
              </span>
            )}
          </div>
        </motion.div>

        {/* Progress dots / bar */}
        <div className="mt-4 flex w-full max-w-md items-center gap-2">
          <span className="text-[10px] font-bold tabular-nums text-white/30">{active + 1}/{count}</span>
          {count <= 16 ? (
            <div className="flex flex-1 items-center justify-center gap-1.5">
              {tiers.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  className="h-1.5 rounded-full transition-all"
                  style={{ width: i === active ? 22 : 6, background: i === active ? meta.color : "rgba(255,255,255,0.18)" }}
                  aria-label={`Level ${tiers[i].tierNumber}`}
                />
              ))}
            </div>
          ) : (
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                animate={{ width: `${((active + 1) / count) * 100}%` }}
                style={{ background: meta.color, boxShadow: `0 0 8px ${glow}` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
