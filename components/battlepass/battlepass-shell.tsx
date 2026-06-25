"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Crown,
  Zap,
  Lock,
  CheckCircle2,
  ChevronRight,
  Star,
  Calendar,
  Award,
  Layers,
  TrendingUp,
  Gift,
} from "lucide-react";
import { BP_THEMES, type BattlePass, type BattlePassTier, type UserBpStatus } from "@/lib/battle-pass";
import {
  purchaseBattlePass,
  purchaseEliteBattlePass,
  claimBpTier,
} from "@/lib/actions/battle-pass";

// ── helpers ──────────────────────────────────────────────────────────────────

type TierState = "claimed" | "available" | "locked";

function getTierState(
  tier: BattlePassTier,
  userStatus: UserBpStatus | null,
  progressDays: number
): TierState {
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
    case "item":
      return `Item${tier.rewardQuantity > 1 ? ` ×${tier.rewardQuantity}` : ""}`;
    case "random_item":
      return `Zufalls-Item${tier.rewardItemRarity ? ` (${tier.rewardItemRarity})` : ""}`;
    case "badge":
      return tier.rewardBadgeText ?? "Badge";
    case "xp_boost":
      return `+${tier.rewardXpBoost ?? 1} Tag${(tier.rewardXpBoost ?? 1) !== 1 ? "e" : ""}`;
    default:
      return "Belohnung";
  }
}

// ── TierCard ─────────────────────────────────────────────────────────────────

interface TierCardProps {
  tier: BattlePassTier;
  state: TierState;
  accent: string;
  glow: string;
  onClaim: (id: string) => void;
  claiming: boolean;
}

function TierCard({ tier, state, accent, glow, onClaim, claiming }: TierCardProps) {
  const isClaimed = state === "claimed";
  const isAvailable = state === "available";
  const isLocked = state === "locked";

  return (
    <motion.div
      layout
      whileHover={isAvailable ? { scale: 1.04, y: -2 } : undefined}
      className={`relative flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-all duration-200 overflow-hidden ${
        isClaimed
          ? "border-emerald-500/30 bg-emerald-500/8"
          : isAvailable
          ? "cursor-pointer border-white/15 bg-white/5 hover:border-white/25"
          : "border-white/5 bg-white/[0.02] opacity-50"
      }`}
      style={
        isAvailable && tier.highlightTier
          ? {
              borderColor: accent + "50",
              background: `linear-gradient(135deg, ${accent}12 0%, transparent 100%)`,
              boxShadow: `0 0 20px ${glow}`,
            }
          : isClaimed
          ? {}
          : {}
      }
      onClick={isAvailable && !claiming ? () => onClaim(tier.id) : undefined}
    >
      {/* Pulse ring for available highlight */}
      {isAvailable && tier.highlightTier && (
        <div
          className="absolute inset-0 rounded-xl pointer-events-none animate-pulse"
          style={{ background: `radial-gradient(circle at center, ${glow}, transparent 70%)`, opacity: 0.15 }}
        />
      )}

      {/* Tier number badge */}
      <span
        className={`absolute top-1.5 left-1.5 rounded-md px-1 py-0.5 text-[9px] font-black uppercase tabular-nums ${
          isClaimed
            ? "bg-emerald-500/20 text-emerald-300"
            : tier.isElite
            ? "bg-violet-500/20 text-violet-300"
            : tier.isPremium
            ? "bg-amber-500/20 text-amber-300"
            : "bg-white/5 text-white/30"
        }`}
      >
        {tier.tierNumber}
      </span>

      {/* Status overlay icon */}
      {isClaimed && (
        <div className="absolute top-1.5 right-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        </div>
      )}
      {isLocked && (
        <div className="absolute top-1.5 right-1.5">
          <Lock className="h-3 w-3 text-white/20" />
        </div>
      )}

      {/* Reward icon */}
      <span className={`text-2xl mt-4 ${isLocked ? "grayscale opacity-40" : ""}`}>
        {tier.icon}
      </span>

      {/* Tier name */}
      <span className="text-[11px] font-black text-white/80 leading-tight line-clamp-2 px-0.5">
        {tier.name}
      </span>

      {/* Reward label */}
      <span
        className={`text-[10px] font-semibold leading-tight ${
          isClaimed ? "text-emerald-400/80" : isAvailable ? "text-white/50" : "text-white/25"
        }`}
      >
        {rewardLabel(tier)}
      </span>

      {/* Claim button for available tiers */}
      {isAvailable && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          disabled={claiming}
          className="mt-1 w-full rounded-lg py-2 text-[11px] font-black text-white transition-all disabled:opacity-50 min-h-[36px]"
          style={{
            background: tier.highlightTier
              ? `linear-gradient(135deg, ${accent} 0%, ${accent}bb 100%)`
              : "rgba(255,255,255,0.1)",
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (!claiming) onClaim(tier.id);
          }}
        >
          {claiming ? "..." : "Abholen"}
        </motion.button>
      )}
    </motion.div>
  );
}

// ── Progress bar ─────────────────────────────────────────────────────────────

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
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/40 font-semibold">Gesamt-Fortschritt</span>
        <span className="font-black tabular-nums" style={{ color: accent }}>
          {progressDays} / {tierCount} Tage
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-white/5 overflow-hidden border border-white/5">
        {/* Claimed portion */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${claimPct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: "rgba(52,211,153,0.5)" }}
        />
        {/* Progress portion */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: "easeOut", delay: 0.1 }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${accent} 0%, ${accent}bb 100%)`,
            boxShadow: `0 0 10px ${glow}`,
          }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-white/30">
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

  const handleClaim = useCallback(
    (tierId: string) => {
      if (claimingId || isPending) return;
      setClaimingId(tierId);
      startTransition(async () => {
        const res = await claimBpTier(tierId);
        setClaimingId(null);
        if (res.success) {
          showToast(res.reward ? `+${res.reward}` : "Reward abgeholt!", true);
          // Optimistically add to claimed list
          setUserStatus((prev) =>
            prev
              ? { ...prev, claimedTierIds: [...prev.claimedTierIds, tierId] }
              : prev
          );
          router.refresh();
        } else {
          showToast(res.error ?? "Fehler beim Abholen.", false);
        }
      });
    },
    [claimingId, isPending, router]
  );

  const handleBuyPremium = useCallback(() => {
    setBuyError(null);
    startTransition(async () => {
      const res = await purchaseBattlePass(pass.id);
      if (res.success) {
        showToast("Premium Pass aktiviert!", true);
        setUserStatus((prev) =>
          prev ? { ...prev, hasPremium: true } : { passId: pass.id, hasPremium: true, hasElite: false, progressDays: 0, claimedTierIds: [] }
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
          prev ? { ...prev, hasElite: true } : { passId: pass.id, hasPremium: false, hasElite: true, progressDays: 0, claimedTierIds: [] }
        );
        router.refresh();
      } else {
        setBuyError(res.error ?? "Kauf fehlgeschlagen.");
      }
    });
  }, [pass.id, router]);

  return (
    <div className="flex flex-1 flex-col min-h-0 relative">
      {/* ── HERO BANNER ─────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden border-b"
        style={{ borderColor: theme.accent + "30", background: theme.gradient }}
      >
        {/* Background blobs */}
        <div
          className="pointer-events-none absolute -top-24 left-1/3 h-80 w-80 rounded-full blur-[120px]"
          style={{ background: theme.glow, opacity: 0.3 }}
        />
        <div
          className="pointer-events-none absolute -bottom-16 right-1/4 h-60 w-60 rounded-full blur-[100px]"
          style={{ background: theme.glow, opacity: 0.2 }}
        />
        {/* Animated background grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(255,255,255,0.5) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(255,255,255,0.5) 40px)",
          }}
        />
        {/* Banner image if set */}
        {pass.bannerImageUrl && (
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-10"
            style={{ backgroundImage: `url(${pass.bannerImageUrl})` }}
          />
        )}

        <div className="relative z-10 mx-auto max-w-5xl px-4 py-6 sm:py-10 text-center">
          {/* Season chip */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-black uppercase tracking-widest backdrop-blur-sm"
            style={{ borderColor: theme.accent + "50", color: theme.accent, background: theme.accent + "15" }}
          >
            <Star className="h-3 w-3" />
            {pass.seasonLabel}
          </motion.div>

          {/* Pass name */}
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl lg:text-6xl"
          >
            {pass.name}
          </motion.h1>

          {/* Description */}
          {pass.description && (
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14 }}
              className="mx-auto mt-4 max-w-xl text-sm sm:text-base text-white/60 leading-relaxed px-2 sm:px-0"
            >
              {pass.description}
            </motion.p>
          )}

          {/* Tier count + date range */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-6 flex flex-wrap justify-center gap-4 text-sm text-white/40"
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
              <span className="flex items-center gap-1.5 text-amber-400/70">
                <TrendingUp className="h-3.5 w-3.5" />
                +{Math.round(pass.spinChanceBoost * 100)}% Case-Boost
              </span>
            )}
          </motion.div>

          {/* Track badges */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.26 }}
            className="mt-5 flex flex-wrap justify-center gap-2"
          >
            <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/60">
              FREE Track · {freeTiers.length} Tiers
            </span>
            {premiumTiers.length > 0 && (
              <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">
                <Crown className="h-3 w-3" />
                PREMIUM Track · {premiumTiers.length} Tiers
              </span>
            )}
            {pass.eliteEnabled && eliteTiers.length > 0 && (
              <span className="flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-300">
                💎 ELITE Track · {eliteTiers.length} Tiers
              </span>
            )}
          </motion.div>
        </div>
      </div>

      {/* ── MAIN CONTENT ─────────────────────────────────────────── */}
      <div className="mx-auto w-full max-w-7xl px-3 sm:px-4 py-5 sm:py-8">
        <div className="flex flex-col gap-6 sm:gap-8 lg:flex-row lg:items-start lg:gap-8">

          {/* ── Tracks column ──────────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col gap-8">

            {/* Progress bar (if has status) */}
            {userStatus && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-white/8 bg-white/[0.03] p-5"
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
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <Gift className="h-4 w-4 text-white/40" />
                  <h2 className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                    Free Track
                  </h2>
                  <div className="flex-1 h-px bg-gradient-to-r from-white/8 to-transparent" />
                </div>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
                  {freeTiers.map((tier) => (
                    <TierCard
                      key={tier.id}
                      tier={tier}
                      state={getTierState(tier, userStatus, progressDays)}
                      accent={theme.accent}
                      glow={theme.glow}
                      onClaim={handleClaim}
                      claiming={claimingId === tier.id}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* PREMIUM TRACK */}
            {premiumTiers.length > 0 && (
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <Crown className="h-4 w-4 text-amber-400/60" />
                  <h2 className="text-xs font-black uppercase tracking-[0.2em] text-amber-400/60">
                    Premium Track
                  </h2>
                  {!hasPremium && (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-400">
                      Premium benötigt
                    </span>
                  )}
                  <div className="flex-1 h-px bg-gradient-to-r from-amber-500/15 to-transparent" />
                </div>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
                  {premiumTiers.map((tier) => (
                    <TierCard
                      key={tier.id}
                      tier={tier}
                      state={getTierState(tier, userStatus, progressDays)}
                      accent={theme.accent}
                      glow={theme.glow}
                      onClaim={handleClaim}
                      claiming={claimingId === tier.id}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ELITE TRACK */}
            {pass.eliteEnabled && eliteTiers.length > 0 && (
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <Zap className="h-4 w-4 text-violet-400/60" />
                  <h2 className="text-xs font-black uppercase tracking-[0.2em] text-violet-400/60">
                    Elite Track
                  </h2>
                  {!hasElite && (
                    <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-[10px] font-bold text-violet-400">
                      Elite benötigt
                    </span>
                  )}
                  <div className="flex-1 h-px bg-gradient-to-r from-violet-500/15 to-transparent" />
                </div>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
                  {eliteTiers.map((tier) => (
                    <TierCard
                      key={tier.id}
                      tier={tier}
                      state={getTierState(tier, userStatus, progressDays)}
                      accent={theme.accent}
                      glow={theme.glow}
                      onClaim={handleClaim}
                      claiming={claimingId === tier.id}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Side panel ─────────────────────────────────────────── */}
          <motion.aside
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 }}
            className="flex w-full flex-col gap-4 lg:w-72 lg:shrink-0"
          >
            {/* User stats card */}
            {userStatus && (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                <h3 className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40">
                  <Award className="h-3.5 w-3.5" />
                  Dein Fortschritt
                </h3>
                <div className="flex flex-col gap-3">
                  {/* Track badges */}
                  <div className="flex flex-wrap gap-2">
                    {hasPremium && (
                      <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-300">
                        <Crown className="h-3 w-3" />
                        Premium
                      </span>
                    )}
                    {hasElite && (
                      <span className="flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs font-bold text-violet-300">
                        💎 Elite
                      </span>
                    )}
                    {!hasPremium && !hasElite && (
                      <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-white/40">
                        Free Pass
                      </span>
                    )}
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-white/[0.03] p-3 border border-white/5">
                      <p className="text-[10px] text-white/30 font-semibold uppercase tracking-wider">
                        Login-Tage
                      </p>
                      <p className="text-xl font-black text-white tabular-nums">{progressDays}</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.03] p-3 border border-white/5">
                      <p className="text-[10px] text-white/30 font-semibold uppercase tracking-wider">
                        Abgeholt
                      </p>
                      <p className="text-xl font-black text-white tabular-nums">{claimedCount}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Purchase card */}
            {(!hasPremium || (pass.eliteEnabled && !hasElite)) && (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                <h3 className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40">
                  <ChevronRight className="h-3.5 w-3.5" />
                  Pass upgraden
                </h3>

                {/* Error message */}
                <AnimatePresence>
                  {buyError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
                    >
                      {buyError}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex flex-col gap-3">
                  {!hasPremium && (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-sm font-black text-amber-300">
                          <Crown className="h-4 w-4" />
                          Premium Pass
                        </span>
                        <span className="text-lg font-black text-white tabular-nums">
                          {pass.priceCr.toLocaleString("de-DE")}
                          <span className="text-xs text-white/40 ml-1">CR</span>
                        </span>
                      </div>
                      <p className="mb-3 text-xs text-white/40 leading-relaxed">
                        Schalte den Premium-Track frei und erhalte exklusive Belohnungen.
                      </p>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        disabled={isPending}
                        onClick={handleBuyPremium}
                        className="w-full rounded-xl py-2.5 text-sm font-black text-white transition-all disabled:opacity-50"
                        style={{
                          background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accent}aa 100%)`,
                          boxShadow: `0 4px 20px ${theme.glow}`,
                        }}
                      >
                        {isPending ? "Kaufe..." : "Premium kaufen"}
                      </motion.button>
                    </div>
                  )}

                  {pass.eliteEnabled && !hasElite && (
                    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-sm font-black text-violet-300">
                          <Zap className="h-4 w-4" />
                          Elite Pass
                        </span>
                        <span className="text-lg font-black text-white tabular-nums">
                          {pass.elitePriceCr.toLocaleString("de-DE")}
                          <span className="text-xs text-white/40 ml-1">CR</span>
                        </span>
                      </div>
                      <p className="mb-3 text-xs text-white/40 leading-relaxed">
                        Exklusive Elite-Rewards — nur für die wahren Goons.
                      </p>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        disabled={isPending}
                        onClick={handleBuyElite}
                        className="w-full rounded-xl border border-violet-500/30 bg-violet-500/15 py-2.5 text-sm font-black text-violet-300 transition-all hover:bg-violet-500/25 disabled:opacity-50"
                      >
                        {isPending ? "Kaufe..." : "Elite kaufen"}
                      </motion.button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Fully owned state */}
            {hasPremium && (!pass.eliteEnabled || hasElite) && (
              <div
                className="rounded-2xl border p-5"
                style={{ borderColor: theme.accent + "30", background: theme.accent + "08" }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-full"
                    style={{ background: theme.accent + "20" }}
                  >
                    <CheckCircle2 className="h-5 w-5" style={{ color: theme.accent }} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">Vollständig freigeschaltet</p>
                    <p className="text-xs text-white/40">Hol täglich deine Rewards ab!</p>
                  </div>
                </div>
              </div>
            )}
          </motion.aside>
        </div>
      </div>

      {/* ── Toast notification ─────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.msg}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-max max-w-[calc(100vw-2rem)] rounded-2xl border px-4 py-3 text-sm font-bold shadow-2xl backdrop-blur-xl ${
              toast.ok
                ? "border-emerald-500/30 bg-emerald-900/80 text-emerald-300"
                : "border-red-500/30 bg-red-900/80 text-red-300"
            }`}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
