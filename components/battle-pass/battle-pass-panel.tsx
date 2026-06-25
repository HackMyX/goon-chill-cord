"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Gift, Coins, Check, Lock, Crown, Zap, Calendar, ShoppingCart, Star } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { purchaseBattlePass, claimBpTier } from "@/lib/actions/battle-pass";
import { useSoundManager } from "@/lib/sound-manager";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import type { ActiveBpView, BattlePassTier } from "@/lib/battle-pass";

function RewardIcon({ type }: { type: string }) {
  if (type === "credits") return <Coins className="h-3 w-3" />;
  if (type === "badge") return <Star className="h-3 w-3" />;
  return <Gift className="h-3 w-3" />;
}

function TierCard({
  tier,
  unlocked,
  claimed,
  hasPremium,
  onClaim,
}: {
  tier: BattlePassTier;
  unlocked: boolean;
  claimed: boolean;
  hasPremium: boolean;
  onClaim: (tierId: string) => Promise<void>;
}) {
  const [claiming, setClaiming] = useState(false);
  const sound = useSoundManager();

  const canClaim = unlocked && !claimed && (!tier.isPremium || hasPremium);
  const isLocked = !unlocked || (tier.isPremium && !hasPremium && !claimed);

  async function handleClaim() {
    if (!canClaim || claiming) return;
    setClaiming(true);
    sound.click();
    await onClaim(tier.id);
    setClaiming(false);
  }

  return (
    <div
      className={`relative flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all ${
        claimed
          ? "border-emerald-400/30 bg-emerald-500/[0.07]"
          : canClaim
            ? tier.isPremium
              ? "border-amber-400/50 bg-amber-500/10 shadow-[0_0_14px_rgba(245,158,11,0.15)] hover:shadow-[0_0_22px_rgba(245,158,11,0.25)] cursor-pointer"
              : "border-purple-400/50 bg-purple-500/10 shadow-[0_0_14px_rgba(168,85,247,0.15)] hover:shadow-[0_0_22px_rgba(168,85,247,0.25)] cursor-pointer"
            : isLocked
              ? "border-white/5 bg-black/20 opacity-50"
              : "border-white/10 bg-white/[0.02]"
      }`}
      onClick={canClaim ? handleClaim : undefined}
      style={{ minWidth: "72px" }}
    >
      {/* Tier number */}
      <span className="text-[9px] font-bold text-zinc-500">{tier.tierNumber}</span>

      {/* Icon */}
      <span className={`text-2xl leading-none transition-transform ${canClaim ? "hover:scale-110" : ""}`}>
        {tier.icon}
      </span>

      {/* Premium badge */}
      {tier.isPremium && (
        <span className="text-[8px] font-bold text-amber-400">PRO</span>
      )}

      {/* Reward label */}
      <div className={`flex items-center gap-0.5 text-[9px] font-semibold ${
        claimed ? "text-emerald-400" : isLocked ? "text-zinc-600" : tier.isPremium ? "text-amber-300" : "text-purple-300"
      }`}>
        {claimed ? (
          <Check className="h-2.5 w-2.5" />
        ) : isLocked ? (
          <Lock className="h-2.5 w-2.5" />
        ) : (
          <RewardIcon type={tier.rewardType} />
        )}
        {tier.rewardType === "credits" && tier.rewardCredits ? `+${tier.rewardCredits.toLocaleString("de-DE")}` : tier.name}
      </div>

      {/* Claim button overlay */}
      {canClaim && !claiming && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 opacity-0 transition-opacity hover:bg-black/20 hover:opacity-100">
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold text-white">Holen</span>
        </div>
      )}
      {claiming && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
          <span className="text-xs text-white">…</span>
        </div>
      )}
    </div>
  );
}

interface BattlePassPanelProps {
  view: ActiveBpView;
  credits: number;
  streakDays: number;
  isAdmin?: boolean;
  isModerator?: boolean;
}

export function BattlePassPanel({
  view,
  credits,
  streakDays,
  isAdmin = false,
  isModerator = false,
}: BattlePassPanelProps) {
  const { pass, userStatus } = view;
  const [claimedIds, setClaimedIds] = useState<Set<string>>(
    new Set(userStatus?.claimedTierIds ?? [])
  );
  const [progressDays, setProgressDays] = useState(userStatus?.progressDays ?? 0);
  const [hasPremium, setHasPremium] = useState(userStatus?.hasPremium ?? false);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [myCredits, setMyCredits] = useState(credits);
  const sound = useSoundManager();
  const router = useRouter();
  const { currencyName } = useSiteConfig();

  async function handlePurchase() {
    if (purchasing || hasPremium) return;
    setPurchasing(true);
    setPurchaseError(null);
    sound.click();
    const res = await purchaseBattlePass(pass.id);
    setPurchasing(false);
    if (res.success) {
      sound.save();
      setHasPremium(true);
      setMyCredits((c) => c - pass.priceCr);
      router.refresh();
    } else {
      sound.error();
      setPurchaseError(res.error ?? "Fehler");
    }
  }

  async function handleClaim(tierId: string) {
    const res = await claimBpTier(tierId);
    if (res.success) {
      sound.save();
      setClaimedIds((prev) => new Set([...prev, tierId]));
      if (res.reward) {
        setClaimMsg(`Erhalten: ${res.reward}`);
        setTimeout(() => setClaimMsg(null), 3000);
      }
      router.refresh();
    } else {
      sound.error();
    }
  }

  const progressPct = pass.tierCount > 0 ? Math.min(100, (progressDays / pass.tierCount) * 100) : 0;

  const dateRange = pass.startDate || pass.endDate
    ? [
        pass.startDate ? new Intl.DateTimeFormat("de-DE", { dateStyle: "short" }).format(new Date(pass.startDate)) : "?",
        pass.endDate ? new Intl.DateTimeFormat("de-DE", { dateStyle: "short" }).format(new Date(pass.endDate)) : "?",
      ].join(" – ")
    : null;

  return (
    <div className="flex flex-1 flex-col">
      <TopBar credits={myCredits} streakDays={streakDays} isAdmin={isAdmin} isModerator={isModerator} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {/* Header */}
        <div
          className="relative mb-6 overflow-hidden rounded-2xl p-6"
          style={{ background: `linear-gradient(135deg, ${pass.bannerColor}22 0%, #0b081480 100%)`, border: `1px solid ${pass.bannerColor}44` }}
        >
          <div className="absolute inset-0 opacity-20"
            style={{ background: `radial-gradient(ellipse at top left, ${pass.bannerColor} 0%, transparent 60%)` }} />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-zinc-400">{pass.seasonLabel}</p>
              <h1 className="mb-2 text-2xl font-extrabold text-zinc-100">{pass.name}</h1>
              {pass.description && <p className="max-w-md text-sm text-zinc-400">{pass.description}</p>}
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-400">
                {dateRange && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />{dateRange}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5 text-purple-400" />
                  {pass.tierCount} Tiers
                </span>
                {pass.spinChanceBoost > 0 && (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <Star className="h-3.5 w-3.5" />
                    +{(pass.spinChanceBoost * 100).toFixed(1)}% Spin-Chance für Premium
                  </span>
                )}
              </div>
            </div>

            {/* Purchase / premium status */}
            <div className="shrink-0">
              {hasPremium ? (
                <div className="flex flex-col items-center gap-1 rounded-xl border border-amber-400/40 bg-amber-500/10 px-5 py-4 text-center shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                  <Crown className="h-6 w-6 text-amber-400" />
                  <span className="text-sm font-bold text-amber-200">Premium aktiv</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={handlePurchase}
                    disabled={purchasing || myCredits < pass.priceCr}
                    className="flex items-center gap-2 rounded-xl border border-amber-400/50 bg-amber-500/15 px-5 py-3 text-sm font-bold text-amber-200 shadow-[0_0_14px_rgba(245,158,11,0.2)] transition-all hover:bg-amber-500/25 hover:shadow-[0_0_24px_rgba(245,158,11,0.35)] disabled:opacity-40"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    {purchasing ? "Kaufe…" : `Premium kaufen — ${pass.priceCr.toLocaleString("de-DE")} ${currencyName}`}
                  </button>
                  {myCredits < pass.priceCr && (
                    <p className="text-[10px] text-red-400">
                      Zu wenig {currencyName} ({myCredits.toLocaleString("de-DE")} / {pass.priceCr.toLocaleString("de-DE")})
                    </p>
                  )}
                  {purchaseError && <p className="text-[10px] text-red-400">{purchaseError}</p>}
                  <p className="text-[10px] text-zinc-500">Kostenlose Tiers ohne Premium claimbar</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-6 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-zinc-200">Dein Fortschritt</span>
            <span className="text-zinc-400">{progressDays} / {pass.tierCount} Login-Tage</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-black/40">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-purple-500 to-purple-400"
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              style={{ boxShadow: "0 0 12px rgba(168,85,247,0.5)" }}
            />
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            Jeden Tag einloggen und Daily Streak abholen um Tiers freizuschalten.
          </p>
        </div>

        {claimMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-300"
          >
            ✓ {claimMsg}
          </motion.div>
        )}

        {/* Tiers track */}
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-zinc-200">Tier-Belohnungen</p>
            <div className="flex gap-3 text-[10px] text-zinc-500">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded border border-purple-400/50 bg-purple-500/10" />
                Kostenlos
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded border border-amber-400/50 bg-amber-500/10" />
                Premium
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {pass.tiers.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-500 w-full">
                Noch keine Tiers konfiguriert — komm später wieder.
              </p>
            ) : (
              pass.tiers.map((tier) => (
                <TierCard
                  key={tier.id}
                  tier={tier}
                  unlocked={progressDays >= tier.tierNumber}
                  claimed={claimedIds.has(tier.id)}
                  hasPremium={hasPremium}
                  onClaim={handleClaim}
                />
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
