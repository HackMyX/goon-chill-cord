"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Crown, Zap, Lock, CheckCircle2, ChevronRight,
  Star, Calendar, Award, Layers, TrendingUp, Gift, Sparkles,
} from "lucide-react";
import { BP_THEMES, type BattlePass, type BattlePassTier, type UserBpStatus } from "@/lib/battle-pass";
import { purchaseBattlePass, purchaseEliteBattlePass, claimBpTier } from "@/lib/actions/battle-pass";

// ── helpers ───────────────────────────────────────────────────────────────────

type TierState = "claimed" | "available" | "locked";

function getTierState(tier: BattlePassTier, userStatus: UserBpStatus | null, progressDays: number): TierState {
  if (!userStatus) return "locked";
  if (userStatus.claimedTierIds.includes(tier.id)) return "claimed";
  if (progressDays >= tier.tierNumber) {
    if (tier.isPremium && !userStatus.hasPremium) return "locked";
    if (tier.isElite && !userStatus.hasElite) return "locked";
    return "available";
  }
  return "locked";
}

function rewardLabel(tier: BattlePassTier): string {
  switch (tier.rewardType) {
    case "credits":
      return tier.rewardCredits
        ? `${(tier.rewardCredits * tier.rewardQuantity).toLocaleString("de-DE")} CR`
        : "Credits";
    case "item": return `Item${tier.rewardQuantity > 1 ? ` ×${tier.rewardQuantity}` : ""}`;
    case "random_item": return `Zufalls-Item${tier.rewardItemRarity ? ` (${tier.rewardItemRarity})` : ""}`;
    case "badge": return tier.rewardBadgeText ?? "Badge";
    case "xp_boost": return `+${tier.rewardXpBoost ?? 1} Tag${(tier.rewardXpBoost ?? 1) !== 1 ? "e" : ""}`;
    case "name_style": return `Style: ${tier.rewardNameStyleKey ?? "?"}`;
    default: return "Belohnung";
  }
}

// ── Particle field ────────────────────────────────────────────────────────────

function ParticleField({ accent, count = 30 }: { accent: string; count?: number }) {
  const particles = Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 1 + Math.random() * 2.5,
    dur: 4 + Math.random() * 8,
    delay: Math.random() * -8,
    drift: (Math.random() - 0.5) * 30,
  }));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: accent,
            boxShadow: `0 0 ${p.size * 2}px ${accent}`,
          }}
          animate={{
            y: [0, -40, 0],
            x: [0, p.drift, 0],
            opacity: [0, 0.8, 0],
            scale: [0.5, 1.2, 0.5],
          }}
          transition={{
            duration: p.dur,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// ── Milestone tier card (BIG) ─────────────────────────────────────────────────

function MilestoneTierCard({
  tier,
  state,
  accent,
  glow,
  onClaim,
  claiming,
}: {
  tier: BattlePassTier;
  state: TierState;
  accent: string;
  glow: string;
  onClaim: (id: string) => void;
  claiming: boolean;
}) {
  const isClaimed = state === "claimed";
  const isAvailable = state === "available";
  const isLocked = state === "locked";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={isAvailable ? { scale: 1.03, y: -4 } : undefined}
      className="relative overflow-hidden rounded-2xl border p-5 text-center"
      style={
        isAvailable
          ? {
              borderColor: accent + "70",
              background: `linear-gradient(135deg, ${accent}18 0%, ${accent}08 50%, transparent 100%)`,
              boxShadow: `0 0 40px ${glow}, 0 0 80px ${glow}40, inset 0 1px 0 ${accent}30`,
            }
          : isClaimed
            ? { borderColor: "rgba(52,211,153,0.3)", background: "rgba(52,211,153,0.05)" }
            : { borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)", opacity: 0.6 }
      }
    >
      {/* Animated glow background */}
      {isAvailable && (
        <>
          <motion.div
            className="pointer-events-none absolute inset-0 rounded-2xl"
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            style={{ background: `radial-gradient(circle at 50% 40%, ${glow}, transparent 70%)` }}
          />
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{
              backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(255,255,255,0.01) 8px, rgba(255,255,255,0.01) 9px)",
            }}
          />
        </>
      )}
      {isClaimed && (
        <div className="pointer-events-none absolute inset-0 rounded-2xl" style={{ background: "radial-gradient(circle at 50% 30%, rgba(52,211,153,0.08), transparent 70%)" }} />
      )}

      {/* Tier badge */}
      <div className="relative z-10 flex flex-col items-center gap-3">
        <div
          className="flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest"
          style={
            isClaimed
              ? { borderColor: "rgba(52,211,153,0.4)", color: "#34d399", background: "rgba(52,211,153,0.08)" }
              : isAvailable
                ? { borderColor: accent + "50", color: accent, background: accent + "10" }
                : { borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.3)" }
          }
        >
          <Star className="h-2.5 w-2.5" />
          Meilenstein {tier.tierNumber}
        </div>

        {/* Icon */}
        <motion.span
          className={`text-5xl leading-none ${isLocked ? "grayscale opacity-30" : ""}`}
          animate={isAvailable ? { scale: [1, 1.08, 1] } : {}}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          {tier.icon}
        </motion.span>

        {/* Name */}
        <h3 className="text-base font-black text-white leading-tight">{tier.name}</h3>

        {/* Reward */}
        <div
          className="rounded-lg border px-3 py-1.5 text-sm font-bold"
          style={
            isClaimed
              ? { borderColor: "rgba(52,211,153,0.3)", color: "#34d399", background: "rgba(52,211,153,0.06)" }
              : isAvailable
                ? { borderColor: accent + "40", color: accent, background: accent + "08" }
                : { borderColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.2)" }
          }
        >
          {rewardLabel(tier)}
        </div>

        {/* Description */}
        {tier.description && (
          <p className="text-xs text-white/40 leading-relaxed max-w-[180px]">{tier.description}</p>
        )}

        {/* Status */}
        {isClaimed && (
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Abgeholt
          </div>
        )}
        {isLocked && (
          <div className="flex items-center gap-1.5 text-xs font-bold text-white/20">
            <Lock className="h-3.5 w-3.5" />
            Gesperrt
          </div>
        )}

        {/* Claim button */}
        {isAvailable && (
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            disabled={claiming}
            onClick={() => !claiming && onClaim(tier.id)}
            className="w-full rounded-xl py-3 text-sm font-black text-white transition-all disabled:opacity-60 mt-1"
            style={{
              background: `linear-gradient(135deg, ${accent} 0%, ${accent}cc 100%)`,
              boxShadow: `0 4px 24px ${glow}, 0 0 0 1px ${accent}30`,
            }}
          >
            {claiming ? "Abholen…" : "✦ Jetzt abholen"}
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

// ── Regular tier card ─────────────────────────────────────────────────────────

function TierCard({
  tier,
  state,
  accent,
  glow,
  onClaim,
  claiming,
}: {
  tier: BattlePassTier;
  state: TierState;
  accent: string;
  glow: string;
  onClaim: (id: string) => void;
  claiming: boolean;
}) {
  const isClaimed = state === "claimed";
  const isAvailable = state === "available";
  const isLocked = state === "locked";

  return (
    <motion.div
      layout
      whileHover={isAvailable ? { scale: 1.06, y: -3 } : undefined}
      className="relative flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all duration-200 overflow-hidden"
      style={
        isAvailable
          ? {
              borderColor: accent + "50",
              background: `linear-gradient(135deg, ${accent}12 0%, transparent 100%)`,
              boxShadow: `0 0 16px ${glow}60`,
              cursor: "pointer",
            }
          : isClaimed
            ? { borderColor: "rgba(52,211,153,0.25)", background: "rgba(52,211,153,0.05)" }
            : { borderColor: "rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.01)", opacity: 0.45 }
      }
      onClick={isAvailable && !claiming ? () => onClaim(tier.id) : undefined}
    >
      {/* Shimmer on available */}
      {isAvailable && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-xl"
          animate={{ opacity: [0, 0.4, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: Math.random() * 2 }}
          style={{ background: `linear-gradient(135deg, ${accent}20, transparent)` }}
        />
      )}

      {/* Tier number */}
      <span
        className="absolute top-1.5 left-1.5 rounded-md px-1 py-0.5 text-[8px] font-black tabular-nums"
        style={
          isClaimed
            ? { background: "rgba(52,211,153,0.15)", color: "#34d399" }
            : isAvailable
              ? { background: accent + "20", color: accent }
              : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.2)" }
        }
      >
        {tier.tierNumber}
      </span>

      {/* Status icon */}
      {isClaimed && <CheckCircle2 className="absolute top-1.5 right-1.5 h-3 w-3 text-emerald-400" />}
      {isLocked && <Lock className="absolute top-1.5 right-1.5 h-2.5 w-2.5 text-white/15" />}

      {/* Reward emoji */}
      <span className={`text-2xl mt-3.5 leading-none ${isLocked ? "grayscale opacity-30" : ""}`}>
        {tier.icon}
      </span>

      <span className="text-[10px] font-bold text-white/70 leading-tight line-clamp-2 px-0.5">
        {tier.name}
      </span>
      <span
        className="text-[9px] font-semibold leading-tight"
        style={
          isClaimed ? { color: "#34d399aa" }
            : isAvailable ? { color: accent + "cc" }
              : { color: "rgba(255,255,255,0.2)" }
        }
      >
        {rewardLabel(tier)}
      </span>

      {isAvailable && (
        <motion.button
          whileTap={{ scale: 0.88 }}
          disabled={claiming}
          className="mt-1.5 w-full rounded-lg py-2 text-[10px] font-black text-white transition-all disabled:opacity-50"
          style={{
            background: `linear-gradient(135deg, ${accent} 0%, ${accent}aa 100%)`,
            boxShadow: `0 2px 12px ${glow}`,
          }}
          onClick={(e) => { e.stopPropagation(); if (!claiming) onClaim(tier.id); }}
        >
          {claiming ? "…" : "Abholen"}
        </motion.button>
      )}
    </motion.div>
  );
}

// ── Track section with milestone cards ────────────────────────────────────────

function TrackRow({
  tiers,
  label,
  labelColor,
  icon,
  userStatus,
  progressDays,
  accent,
  glow,
  onClaim,
  claimingId,
}: {
  tiers: BattlePassTier[];
  label: string;
  labelColor: string;
  icon: React.ReactNode;
  userStatus: UserBpStatus | null;
  progressDays: number;
  accent: string;
  glow: string;
  onClaim: (id: string) => void;
  claimingId: string | null;
}) {
  const milestones = tiers.filter((t) => t.highlightTier);
  const regular = tiers.filter((t) => !t.highlightTier);

  return (
    <div className="space-y-5">
      {/* Track header */}
      <div className="flex items-center gap-3">
        <span style={{ color: labelColor }}>{icon}</span>
        <h2
          className="text-xs font-black uppercase tracking-[0.2em]"
          style={{ color: labelColor }}
        >
          {label}
        </h2>
        <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${labelColor}30, transparent)` }} />
      </div>

      {/* Milestone cards — displayed prominently */}
      {milestones.length > 0 && (
        <div className={`grid gap-3 ${milestones.length === 1 ? "grid-cols-1 max-w-xs" : milestones.length <= 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
          {milestones.map((tier) => (
            <MilestoneTierCard
              key={tier.id}
              tier={tier}
              state={getTierState(tier, userStatus, progressDays)}
              accent={accent}
              glow={glow}
              onClaim={onClaim}
              claiming={claimingId === tier.id}
            />
          ))}
        </div>
      )}

      {/* Regular tiers grid */}
      {regular.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {regular.map((tier) => (
            <TierCard
              key={tier.id}
              tier={tier}
              state={getTierState(tier, userStatus, progressDays)}
              accent={accent}
              glow={glow}
              onClaim={onClaim}
              claiming={claimingId === tier.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({
  progressDays,
  tierCount,
  accent,
  glow,
  claimedCount,
}: {
  progressDays: number;
  tierCount: number;
  accent: string;
  glow: string;
  claimedCount: number;
}) {
  const pct = Math.min(100, Math.round((progressDays / tierCount) * 100));
  const claimPct = Math.min(100, Math.round((claimedCount / tierCount) * 100));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-white/40">Fortschritt</span>
        <span className="font-black tabular-nums" style={{ color: accent }}>
          {progressDays} / {tierCount} Tage
        </span>
      </div>
      <div className="relative h-3 rounded-full bg-white/[0.04] overflow-hidden border border-white/[0.06]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${claimPct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: "rgba(52,211,153,0.35)" }}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.1 }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${accent} 0%, ${accent}cc 100%)`,
            boxShadow: `0 0 12px ${glow}`,
          }}
        />
        {/* Shimmer */}
        <motion.div
          className="absolute inset-y-0 w-16 rounded-full pointer-events-none"
          animate={{ left: ["-15%", "110%"] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.5 }}
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)" }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-white/25">
        <span>{claimedCount} abgeholt</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}

// ── Main shell ────────────────────────────────────────────────────────────────

interface BattlePassShellProps {
  pass: BattlePass;
  userStatus: UserBpStatus | null;
}

export function BattlePassShell({ pass, userStatus: initialStatus }: BattlePassShellProps) {
  const router = useRouter();
  const theme = BP_THEMES[pass.theme] ?? BP_THEMES.default;

  const [userStatus, setUserStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);

  const progressDays = userStatus?.progressDays ?? 0;
  const hasPremium = userStatus?.hasPremium ?? false;
  const hasElite = userStatus?.hasElite ?? false;

  const freeTiers = pass.tiers.filter((t) => !t.isPremium && !t.isElite);
  const premiumTiers = pass.tiers.filter((t) => t.isPremium && !t.isElite);
  const eliteTiers = pass.tiers.filter((t) => t.isElite);
  const claimedCount = userStatus?.claimedTierIds.length ?? 0;

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3200);
  }

  const handleClaim = useCallback((tierId: string) => {
    if (claimingId || isPending) return;
    setClaimingId(tierId);
    startTransition(async () => {
      const res = await claimBpTier(tierId);
      setClaimingId(null);
      if (res.success) {
        showToast(res.reward ? `✦ ${res.reward}` : "Reward abgeholt!", true);
        setUserStatus((prev) =>
          prev ? { ...prev, claimedTierIds: [...prev.claimedTierIds, tierId] } : prev
        );
        router.refresh();
      } else {
        showToast(res.error ?? "Fehler.", false);
      }
    });
  }, [claimingId, isPending, router]);

  const handleBuyPremium = useCallback(() => {
    setBuyError(null);
    startTransition(async () => {
      const res = await purchaseBattlePass(pass.id);
      if (res.success) {
        showToast("Premium Pass aktiviert! 👑", true);
        setUserStatus((prev) =>
          prev ? { ...prev, hasPremium: true }
               : { passId: pass.id, hasPremium: true, hasElite: false, progressDays: 0, claimedTierIds: [] }
        );
        router.refresh();
      } else {
        setBuyError(res.error ?? "Kauf fehlgeschlagen.");
      }
    });
  }, [pass.id, router]);

  const handleBuyElite = useCallback(() => {
    setBuyError(null);
    startTransition(async () => {
      const res = await purchaseEliteBattlePass(pass.id);
      if (res.success) {
        showToast("Elite Pass aktiviert! 💎", true);
        setUserStatus((prev) =>
          prev ? { ...prev, hasElite: true }
               : { passId: pass.id, hasPremium: false, hasElite: true, progressDays: 0, claimedTierIds: [] }
        );
        router.refresh();
      } else {
        setBuyError(res.error ?? "Kauf fehlgeschlagen.");
      }
    });
  }, [pass.id, router]);

  return (
    <div className="flex flex-1 flex-col min-h-0 relative">

      {/* ══ EPIC HERO ══════════════════════════════════════════════════════ */}
      <div
        className="relative overflow-hidden border-b"
        style={{ borderColor: `${theme.accent}25`, background: `linear-gradient(180deg, ${theme.accent}0d 0%, #0a090f 100%)` }}
      >
        {/* Grid pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(255,255,255,0.6) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(255,255,255,0.6) 40px)",
          }}
        />

        {/* Large ambient glow orbs */}
        <motion.div
          className="pointer-events-none absolute -top-32 left-1/4 h-[500px] w-[500px] rounded-full blur-[140px]"
          style={{ background: theme.accent }}
          animate={{ opacity: [0.08, 0.18, 0.08], scale: [1, 1.1, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="pointer-events-none absolute -bottom-24 right-1/4 h-96 w-96 rounded-full blur-[120px]"
          style={{ background: theme.accent }}
          animate={{ opacity: [0.05, 0.12, 0.05], scale: [1, 1.15, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />
        <motion.div
          className="pointer-events-none absolute top-1/2 right-12 h-72 w-72 rounded-full blur-[100px]"
          style={{ background: theme.glow }}
          animate={{ opacity: [0.04, 0.1, 0.04] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />

        {/* Particles */}
        <ParticleField accent={theme.accent} count={25} />

        {/* Banner image */}
        {pass.bannerImageUrl && (
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.07]"
            style={{ backgroundImage: `url(${pass.bannerImageUrl})` }}
          />
        )}

        {/* Content */}
        <div className="relative z-10 mx-auto max-w-5xl px-4 py-10 sm:py-16 text-center">
          {/* Season badge */}
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="mb-5 inline-flex items-center gap-2 rounded-full border px-5 py-2 text-xs font-black uppercase tracking-[0.25em] backdrop-blur-md"
            style={{
              borderColor: `${theme.accent}60`,
              color: theme.accent,
              background: `${theme.accent}10`,
              boxShadow: `0 0 24px ${theme.glow}`,
            }}
          >
            <motion.span
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            >
              <Star className="h-3 w-3" />
            </motion.span>
            {pass.seasonLabel}
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06, type: "spring", stiffness: 100, damping: 18 }}
            className="text-4xl font-black tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl"
            style={{ textShadow: `0 0 80px ${theme.glow}, 0 0 120px ${theme.glow}50` }}
          >
            {pass.name}
          </motion.h1>

          {/* Animated accent line */}
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "120px", opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.7 }}
            className="mx-auto my-5 h-0.5 rounded-full"
            style={{ background: `linear-gradient(90deg, transparent, ${theme.accent}, transparent)`, boxShadow: `0 0 16px ${theme.glow}` }}
          />

          {/* Description */}
          {pass.description && (
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mx-auto max-w-xl text-sm sm:text-base text-white/50 leading-relaxed"
            >
              {pass.description}
            </motion.p>
          )}

          {/* Meta row */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.22 }}
            className="mt-6 flex flex-wrap justify-center gap-4 text-xs text-white/35"
          >
            <span className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              {pass.tierCount} Tiers
            </span>
            {pass.startDate && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(pass.startDate).toLocaleDateString("de-DE")}
                {pass.endDate && ` – ${new Date(pass.endDate).toLocaleDateString("de-DE")}`}
              </span>
            )}
            {pass.spinChanceBoost > 0 && (
              <span className="flex items-center gap-1.5" style={{ color: theme.accent + "cc" }}>
                <TrendingUp className="h-3.5 w-3.5" />
                +{Math.round(pass.spinChanceBoost * 100)}% Case-Boost (Premium)
              </span>
            )}
          </motion.div>

          {/* Track badges */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-6 flex flex-wrap justify-center gap-2"
          >
            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/50 backdrop-blur-sm">
              <Gift className="h-3 w-3" />
              FREE · {freeTiers.length} Tiers
            </span>
            {premiumTiers.length > 0 && (
              <span
                className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold backdrop-blur-sm"
                style={{ borderColor: "#f59e0b50", background: "#f59e0b12", color: "#fbbf24" }}
              >
                <Crown className="h-3 w-3" />
                PREMIUM · {premiumTiers.length} Tiers
              </span>
            )}
            {pass.eliteEnabled && eliteTiers.length > 0 && (
              <span className="flex items-center gap-1.5 rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-bold text-violet-300 backdrop-blur-sm">
                <Sparkles className="h-3 w-3" />
                ELITE · {eliteTiers.length} Tiers
              </span>
            )}
          </motion.div>
        </div>
      </div>

      {/* ══ MAIN CONTENT ══════════════════════════════════════════════════ */}
      <div className="mx-auto w-full max-w-7xl px-3 sm:px-5 py-6 sm:py-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">

          {/* Tracks column */}
          <div className="flex-1 min-w-0 space-y-10">

            {/* Progress bar */}
            {userStatus && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 backdrop-blur-sm"
                style={{ boxShadow: `0 0 30px ${theme.glow}10` }}
              >
                <ProgressBar
                  progressDays={progressDays}
                  tierCount={pass.tierCount}
                  accent={theme.accent}
                  glow={theme.glow}
                  claimedCount={claimedCount}
                />
              </motion.div>
            )}

            {/* FREE TRACK */}
            {freeTiers.length > 0 && (
              <TrackRow
                tiers={freeTiers}
                label="Free Track"
                labelColor="rgba(255,255,255,0.35)"
                icon={<Gift className="h-4 w-4" />}
                userStatus={userStatus}
                progressDays={progressDays}
                accent={theme.accent}
                glow={theme.glow}
                onClaim={handleClaim}
                claimingId={claimingId}
              />
            )}

            {/* PREMIUM TRACK */}
            {premiumTiers.length > 0 && (
              <div>
                {!hasPremium && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mb-4 flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/6 px-4 py-2.5"
                  >
                    <Lock className="h-4 w-4 shrink-0 text-amber-400/60" />
                    <p className="text-xs text-amber-300/70 font-semibold">Premium Pass benötigt — schalte {premiumTiers.length} exklusive Tiers frei.</p>
                  </motion.div>
                )}
                <TrackRow
                  tiers={premiumTiers}
                  label="Premium Track"
                  labelColor="#f59e0bcc"
                  icon={<Crown className="h-4 w-4" />}
                  userStatus={userStatus}
                  progressDays={progressDays}
                  accent={theme.accent}
                  glow={theme.glow}
                  onClaim={handleClaim}
                  claimingId={claimingId}
                />
              </div>
            )}

            {/* ELITE TRACK */}
            {pass.eliteEnabled && eliteTiers.length > 0 && (
              <div>
                {!hasElite && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mb-4 flex items-center gap-3 rounded-xl border border-violet-500/20 bg-violet-500/6 px-4 py-2.5"
                  >
                    <Zap className="h-4 w-4 shrink-0 text-violet-400/60" />
                    <p className="text-xs text-violet-300/70 font-semibold">Elite Pass benötigt — {eliteTiers.length} legendary Tiers warten.</p>
                  </motion.div>
                )}
                <TrackRow
                  tiers={eliteTiers}
                  label="Elite Track"
                  labelColor="#a78bfa"
                  icon={<Sparkles className="h-4 w-4" />}
                  userStatus={userStatus}
                  progressDays={progressDays}
                  accent={theme.accent}
                  glow={theme.glow}
                  onClaim={handleClaim}
                  claimingId={claimingId}
                />
              </div>
            )}
          </div>

          {/* ── Side panel ──────────────────────────────────────────────── */}
          <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.18 }}
            className="flex w-full flex-col gap-4 lg:w-72 lg:shrink-0"
          >
            {/* User progress card */}
            {userStatus && (
              <div
                className="rounded-2xl border p-5 backdrop-blur-sm"
                style={{ borderColor: `${theme.accent}20`, background: `${theme.accent}05` }}
              >
                <h3 className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest" style={{ color: `${theme.accent}aa` }}>
                  <Award className="h-3.5 w-3.5" />
                  Dein Status
                </h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  {hasPremium && (
                    <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-300">
                      <Crown className="h-3 w-3" />Premium
                    </span>
                  )}
                  {hasElite && (
                    <span className="flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs font-bold text-violet-300">
                      💎 Elite
                    </span>
                  )}
                  {!hasPremium && !hasElite && (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-white/35">
                      Free Pass
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Login-Tage", value: progressDays },
                    { label: "Abgeholt", value: claimedCount },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center"
                    >
                      <p className="text-[9px] font-bold uppercase tracking-widest text-white/25">{s.label}</p>
                      <p className="mt-0.5 text-2xl font-black tabular-nums text-white">{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Purchase card */}
            {(!hasPremium || (pass.eliteEnabled && !hasElite)) && (
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 backdrop-blur-sm space-y-3">
                <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/35">
                  <ChevronRight className="h-3.5 w-3.5" />
                  Pass upgraden
                </h3>

                <AnimatePresence>
                  {buyError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
                    >
                      {buyError}
                    </motion.div>
                  )}
                </AnimatePresence>

                {!hasPremium && (
                  <div
                    className="rounded-xl border p-4 space-y-3"
                    style={{ borderColor: "#f59e0b30", background: "#f59e0b06" }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-sm font-black text-amber-300">
                        <Crown className="h-4 w-4" />Premium
                      </span>
                      <span className="text-lg font-black text-white tabular-nums">
                        {pass.priceCr.toLocaleString("de-DE")}
                        <span className="text-xs text-white/30 ml-1">CR</span>
                      </span>
                    </div>
                    <p className="text-xs text-white/35 leading-relaxed">
                      Schalte den Premium-Track frei und erhalte exklusive Belohnungen.
                    </p>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      disabled={isPending}
                      onClick={handleBuyPremium}
                      className="w-full rounded-xl py-3 text-sm font-black text-white transition-all disabled:opacity-50"
                      style={{
                        background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accent}bb 100%)`,
                        boxShadow: `0 4px 24px ${theme.glow}`,
                      }}
                    >
                      {isPending ? "Kaufe…" : "👑 Premium kaufen"}
                    </motion.button>
                  </div>
                )}

                {pass.eliteEnabled && !hasElite && (
                  <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-sm font-black text-violet-300">
                        <Sparkles className="h-4 w-4" />Elite
                      </span>
                      <span className="text-lg font-black text-white tabular-nums">
                        {pass.elitePriceCr.toLocaleString("de-DE")}
                        <span className="text-xs text-white/30 ml-1">CR</span>
                      </span>
                    </div>
                    <p className="text-xs text-white/35 leading-relaxed">
                      Legendary Elite-Rewards — für die wahren Goons.
                    </p>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      disabled={isPending}
                      onClick={handleBuyElite}
                      className="w-full rounded-xl border border-violet-500/40 bg-violet-500/15 py-3 text-sm font-black text-violet-200 transition-all hover:bg-violet-500/25 disabled:opacity-50"
                      style={{ boxShadow: "0 4px 20px rgba(167,139,250,0.2)" }}
                    >
                      {isPending ? "Kaufe…" : "💎 Elite kaufen"}
                    </motion.button>
                  </div>
                )}
              </div>
            )}

            {/* Fully owned state */}
            {hasPremium && (!pass.eliteEnabled || hasElite) && (
              <div
                className="rounded-2xl border p-5"
                style={{ borderColor: `${theme.accent}30`, background: `${theme.accent}08` }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={{ background: `${theme.accent}20` }}
                  >
                    <CheckCircle2 className="h-5 w-5" style={{ color: theme.accent }} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">Vollständig freigeschaltet</p>
                    <p className="text-xs text-white/35 mt-0.5">Hol täglich deine Rewards ab!</p>
                  </div>
                </div>
              </div>
            )}
          </motion.aside>
        </div>
      </div>

      {/* ══ Toast ══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.msg + Date.now()}
            initial={{ opacity: 0, y: 30, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 220, damping: 20 }}
            className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 w-max max-w-[calc(100vw-2rem)] rounded-2xl border px-5 py-3.5 text-sm font-bold shadow-2xl backdrop-blur-xl"
            style={
              toast.ok
                ? { borderColor: "#34d39940", background: "rgba(6,40,28,0.92)", color: "#34d399", boxShadow: "0 4px 32px rgba(52,211,153,0.2)" }
                : { borderColor: "#f8717140", background: "rgba(40,6,6,0.92)", color: "#f87171", boxShadow: "0 4px 32px rgba(248,113,113,0.2)" }
            }
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
