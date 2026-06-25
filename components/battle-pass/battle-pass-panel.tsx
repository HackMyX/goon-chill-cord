"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gift, Coins, Check, Lock, Crown, Zap, Calendar, ShoppingCart,
  Star, Package, Sparkles, Trophy, TrendingUp, ChevronRight,
} from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { purchaseBattlePass, claimBpTier } from "@/lib/actions/battle-pass";
import { useSoundManager } from "@/lib/sound-manager";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import { BP_THEMES } from "@/lib/battle-pass";
import { RARITY_LABELS, RARITY_STYLES } from "@/lib/cases";
import type { ActiveBpView, BattlePassTier, BpRewardType } from "@/lib/battle-pass";
import type { Rarity } from "@/lib/cases";

// ── reward helpers ─────────────────────────────────────────────────────────────

function RewardIcon({ type, className = "h-3.5 w-3.5" }: { type: BpRewardType; className?: string }) {
  if (type === "credits") return <Coins className={className} />;
  if (type === "item") return <Package className={className} />;
  if (type === "random_item") return <Sparkles className={className} />;
  if (type === "badge") return <Trophy className={className} />;
  if (type === "xp_boost") return <TrendingUp className={className} />;
  return <Gift className={className} />;
}

function rewardLabel(tier: BattlePassTier): string {
  if (tier.rewardType === "credits" && tier.rewardCredits) {
    const total = Math.round(tier.rewardCredits * tier.rewardQuantity);
    return `+${total.toLocaleString("de-DE")} CR`;
  }
  if (tier.rewardType === "item") return tier.name;
  if (tier.rewardType === "random_item") {
    const r = tier.rewardItemRarity ? RARITY_LABELS[tier.rewardItemRarity] : "Random";
    return `${r} Item`;
  }
  if (tier.rewardType === "badge") return tier.rewardBadgeText ?? tier.name;
  if (tier.rewardType === "xp_boost") return `+${tier.rewardXpBoost ?? 1}d XP`;
  return tier.name;
}

function rarityGlow(rarity: Rarity | null): string {
  if (!rarity) return "";
  const map: Record<Rarity, string> = {
    normal: "",
    selten: "rgba(59,130,246,0.25)",
    mythisch: "rgba(168,85,247,0.35)",
    ultra: "rgba(245,158,11,0.4)",
  };
  return map[rarity] ?? "";
}

// ── Tier card ─────────────────────────────────────────────────────────────────

function TierCard({
  tier,
  unlocked,
  claimed,
  hasPremium,
  onClaim,
  accentColor,
}: {
  tier: BattlePassTier;
  unlocked: boolean;
  claimed: boolean;
  hasPremium: boolean;
  onClaim: (tierId: string) => Promise<void>;
  accentColor: string;
}) {
  const [claiming, setClaiming] = useState(false);
  const sound = useSoundManager();

  const canClaim = unlocked && !claimed && (!tier.isPremium || hasPremium);
  const isLocked = !unlocked || (tier.isPremium && !hasPremium && !claimed);
  const isHighlight = tier.highlightTier;

  async function handleClaim() {
    if (!canClaim || claiming) return;
    setClaiming(true);
    sound.click();
    await onClaim(tier.id);
    setClaiming(false);
  }

  const rarityStyle = tier.rewardType === "random_item" && tier.rewardItemRarity
    ? RARITY_STYLES[tier.rewardItemRarity]
    : null;

  const glow = claimed
    ? "rgba(52,211,153,0.2)"
    : canClaim
      ? tier.isPremium
        ? "rgba(245,158,11,0.2)"
        : `${accentColor}30`
      : "";

  return (
    <motion.div
      className={`relative flex flex-col items-center rounded-xl border transition-all cursor-default select-none ${
        isHighlight ? "px-4 py-4" : "px-3 py-3"
      } ${
        claimed
          ? "border-emerald-400/40 bg-emerald-500/[0.08]"
          : canClaim
            ? tier.isPremium
              ? "border-amber-400/50 bg-amber-500/10 cursor-pointer"
              : "border-purple-400/40 cursor-pointer"
            : isLocked
              ? "border-white/5 bg-black/20 opacity-40"
              : "border-white/10 bg-white/[0.02]"
      }`}
      style={{
        minWidth: isHighlight ? "80px" : "68px",
        boxShadow: glow ? `0 0 18px ${glow}` : undefined,
        borderColor: canClaim && !tier.isPremium ? `${accentColor}50` : undefined,
      }}
      whileHover={canClaim ? { scale: 1.06, y: -2 } : {}}
      whileTap={canClaim ? { scale: 0.97 } : {}}
      onClick={canClaim ? handleClaim : undefined}
    >
      {/* Highlight ring */}
      {isHighlight && canClaim && (
        <div
          className="absolute inset-0 rounded-xl opacity-30"
          style={{ boxShadow: `0 0 0 2px ${tier.isPremium ? "#f59e0b" : accentColor}` }}
        />
      )}

      {/* Tier number */}
      <span className={`font-bold text-zinc-500 ${isHighlight ? "text-[10px]" : "text-[9px]"}`}>
        {tier.tierNumber}
      </span>

      {/* Main icon */}
      {claiming ? (
        <span className={`leading-none animate-pulse ${isHighlight ? "text-3xl" : "text-2xl"}`}>⏳</span>
      ) : claimed ? (
        <span className={`leading-none ${isHighlight ? "text-3xl" : "text-2xl"}`}>✅</span>
      ) : isLocked ? (
        <Lock className={`${isHighlight ? "h-7 w-7" : "h-5 w-5"} text-zinc-600`} />
      ) : (
        <span className={`leading-none transition-transform ${canClaim && isHighlight ? "drop-shadow-lg" : ""} ${isHighlight ? "text-3xl" : "text-2xl"}`}>
          {tier.icon}
        </span>
      )}

      {/* Premium badge */}
      {tier.isPremium && (
        <span className={`font-bold text-amber-400 ${isHighlight ? "text-[9px]" : "text-[8px]"}`}>PRO</span>
      )}

      {/* Reward label */}
      <div
        className={`flex items-center gap-0.5 font-semibold text-center leading-tight ${
          isHighlight ? "text-[10px] mt-0.5" : "text-[9px]"
        } ${
          claimed ? "text-emerald-400"
          : isLocked ? "text-zinc-600"
          : tier.isPremium ? "text-amber-300"
          : "text-zinc-300"
        }`}
        style={!claimed && !isLocked && !tier.isPremium ? { color: accentColor } : undefined}
      >
        {!claimed && !isLocked && (
          <RewardIcon type={tier.rewardType} className={isHighlight ? "h-3 w-3 shrink-0" : "h-2.5 w-2.5 shrink-0"} />
        )}
        <span className="max-w-[64px] truncate">{rewardLabel(tier)}</span>
      </div>

      {/* Rarity badge for random_item */}
      {rarityStyle && !isLocked && (
        <span className={`rounded-full border px-1 text-[7px] font-bold ${rarityStyle.border} ${rarityStyle.text}`}
          style={tier.rewardItemRarity ? { boxShadow: `0 0 6px ${rarityGlow(tier.rewardItemRarity)}` } : undefined}
        >
          {RARITY_LABELS[tier.rewardItemRarity!]}
        </span>
      )}

      {/* Claim overlay */}
      {canClaim && !claiming && (
        <div className="absolute inset-0 flex items-end justify-center rounded-xl pb-1.5 opacity-0 transition-opacity hover:opacity-100">
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
            Holen
          </span>
        </div>
      )}
    </motion.div>
  );
}

// ── tier row section (free / premium) ─────────────────────────────────────────

function TierRow({
  label,
  tiers,
  unlocked,
  claimed,
  hasPremium,
  onClaim,
  accentColor,
  isPremium,
}: {
  label: string;
  tiers: BattlePassTier[];
  unlocked: (t: BattlePassTier) => boolean;
  claimed: (t: BattlePassTier) => boolean;
  hasPremium: boolean;
  onClaim: (tierId: string) => Promise<void>;
  accentColor: string;
  isPremium: boolean;
}) {
  const rowTiers = tiers.filter((t) => t.isPremium === isPremium);
  if (rowTiers.length === 0) return null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        {isPremium ? (
          <Crown className="h-3.5 w-3.5 text-amber-400" />
        ) : (
          <Gift className="h-3.5 w-3.5" style={{ color: accentColor }} />
        )}
        <span className={`text-xs font-bold ${isPremium ? "text-amber-300" : "text-zinc-300"}`}>{label}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {rowTiers.map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier}
            unlocked={unlocked(tier)}
            claimed={claimed(tier)}
            hasPremium={hasPremium}
            onClaim={onClaim}
            accentColor={accentColor}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

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
  const [claimMsg, setClaimMsg] = useState<{ text: string; type: BpRewardType } | null>(null);
  const [myCredits, setMyCredits] = useState(credits);
  const sound = useSoundManager();
  const router = useRouter();
  const { currencyName } = useSiteConfig();

  const theme = BP_THEMES[pass.theme ?? "default"];
  const accent = pass.accentColor ?? theme.accent;

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
        setClaimMsg({ text: res.reward, type: res.rewardType ?? "credits" });
        setTimeout(() => setClaimMsg(null), 3500);
      }
      router.refresh();
    } else {
      sound.error();
    }
  }

  const progressPct = pass.tierCount > 0 ? Math.min(100, (progressDays / pass.tierCount) * 100) : 0;
  const claimableFree = pass.tiers.filter((t) => !t.isPremium && progressDays >= t.tierNumber && !claimedIds.has(t.id)).length;
  const claimablePremium = hasPremium ? pass.tiers.filter((t) => t.isPremium && progressDays >= t.tierNumber && !claimedIds.has(t.id)).length : 0;

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

        {/* ── HERO HEADER ──────────────────────────────────────────────────── */}
        <div
          className="relative mb-6 overflow-hidden rounded-2xl p-6"
          style={{
            background: theme.gradient,
            border: `1px solid ${accent}33`,
          }}
        >
          {/* Ambient glow */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(ellipse at top left, ${theme.glow} 0%, transparent 55%)`,
              opacity: 0.35,
            }}
          />

          {/* Banner image overlay */}
          {pass.bannerImageUrl && (
            <div
              className="pointer-events-none absolute inset-0 opacity-10"
              style={{ backgroundImage: `url(${pass.bannerImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }}
            />
          )}

          <div className="relative flex flex-wrap items-start justify-between gap-4">
            {/* Left: info */}
            <div>
              <p className="mb-1 text-xs font-black uppercase tracking-widest" style={{ color: accent, opacity: 0.8 }}>
                {pass.seasonLabel}
              </p>
              <h1 className="mb-2 text-3xl font-black text-zinc-100 leading-tight">{pass.name}</h1>
              {pass.description && (
                <p className="mb-3 max-w-md text-sm text-zinc-400">{pass.description}</p>
              )}
              <div className="flex flex-wrap gap-3 text-xs">
                {dateRange && (
                  <span className="flex items-center gap-1 text-zinc-400">
                    <Calendar className="h-3.5 w-3.5" />{dateRange}
                  </span>
                )}
                <span className="flex items-center gap-1 text-zinc-400">
                  <Zap className="h-3.5 w-3.5" style={{ color: accent }} />
                  {pass.tierCount} Tiers
                </span>
                {pass.spinChanceBoost > 0 && (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <Star className="h-3.5 w-3.5" />
                    +{(pass.spinChanceBoost * 100).toFixed(1)}% Spin-Boost für Premium
                  </span>
                )}
                {(claimableFree + claimablePremium) > 0 && (
                  <span
                    className="flex items-center gap-1 font-bold animate-pulse"
                    style={{ color: accent }}
                  >
                    <Gift className="h-3.5 w-3.5" />
                    {claimableFree + claimablePremium} Belohnung{(claimableFree + claimablePremium) !== 1 ? "en" : ""} abholen!
                  </span>
                )}
              </div>
            </div>

            {/* Right: purchase / status */}
            <div className="shrink-0">
              {hasPremium ? (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-6 py-4 text-center"
                  style={{ boxShadow: "0 0 24px rgba(245,158,11,0.2)" }}
                >
                  <Crown className="h-7 w-7 text-amber-400" />
                  <span className="text-sm font-black text-amber-200">Premium aktiv</span>
                  <span className="text-[10px] text-amber-400/70">Alle Tiers freigeschaltet</span>
                </motion.div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={handlePurchase}
                    disabled={purchasing || myCredits < pass.priceCr}
                    className="group flex items-center gap-2 rounded-xl border border-amber-400/50 bg-amber-500/15 px-5 py-3 text-sm font-black text-amber-200 transition-all hover:bg-amber-500/28 disabled:opacity-40"
                    style={{ boxShadow: "0 0 18px rgba(245,158,11,0.2)" }}
                  >
                    <ShoppingCart className="h-4 w-4 transition-transform group-hover:scale-110" />
                    {purchasing
                      ? "Kaufe…"
                      : `Premium — ${pass.priceCr.toLocaleString("de-DE")} ${currencyName}`}
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

        {/* ── PROGRESS BAR ─────────────────────────────────────────────────── */}
        <div
          className="mb-6 rounded-2xl border border-white/10 bg-black/20 p-5"
          style={{ boxShadow: `0 0 0 1px ${accent}15` }}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-bold text-zinc-200">Dein Fortschritt</span>
            <span className="text-sm font-bold" style={{ color: accent }}>
              {progressDays} / {pass.tierCount}
            </span>
          </div>

          {/* Segmented progress */}
          <div className="relative h-4 w-full overflow-hidden rounded-full bg-black/50">
            <motion.div
              className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              style={{
                background: `linear-gradient(90deg, ${accent}cc 0%, ${accent} 100%)`,
                boxShadow: `0 0 16px ${theme.glow}`,
              }}
            />
            {/* Tier markers */}
            {[5, 10, 15, 20, 25].filter((n) => n <= pass.tierCount).map((n) => (
              <div
                key={n}
                className="absolute top-0 h-full w-px bg-white/10"
                style={{ left: `${(n / pass.tierCount) * 100}%` }}
              />
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500">
            <span>Täglich einloggen &amp; Daily Streak abholen → Tiers freischalten</span>
            <span>{pass.tierCount - progressDays > 0 ? `${pass.tierCount - progressDays} Tage bis Tier ${pass.tierCount}` : "Alle Tiers freigeschaltet!"}</span>
          </div>
        </div>

        {/* ── CLAIM TOAST ───────────────────────────────────────────────────── */}
        <AnimatePresence>
          {claimMsg && (
            <motion.div
              key="claimtoast"
              initial={{ opacity: 0, y: -16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              className="mb-4 flex items-center gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-5 py-3"
              style={{ boxShadow: "0 0 20px rgba(52,211,153,0.2)" }}
            >
              <motion.span
                initial={{ rotate: -10 }}
                animate={{ rotate: 0 }}
                className="text-2xl"
              >
                ✅
              </motion.span>
              <div>
                <p className="text-sm font-bold text-emerald-300">Belohnung erhalten!</p>
                <p className="text-xs text-emerald-400/80">{claimMsg.text}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── TIER GRID ─────────────────────────────────────────────────────── */}
        {pass.tiers.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-8 text-center">
            <Gift className="mx-auto mb-3 h-10 w-10 text-zinc-600" />
            <p className="text-sm text-zinc-500">Noch keine Belohnungen konfiguriert — schau bald wieder rein.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Legend */}
            <div className="flex flex-wrap gap-3 text-[10px] text-zinc-500">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded border" style={{ borderColor: `${accent}50`, background: `${accent}18` }} />
                Kostenlos
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded border border-amber-400/50 bg-amber-500/10" />
                Premium
              </span>
              <span className="flex items-center gap-1">
                <Star className="h-2.5 w-2.5 text-yellow-400" />
                Milestone (hervorgehoben)
              </span>
            </div>

            {/* Free track */}
            <div
              className="rounded-2xl border border-white/[0.07] bg-black/20 p-4"
              style={{ borderColor: `${accent}20` }}
            >
              <div className="mb-3 flex items-center gap-2">
                <Gift className="h-4 w-4" style={{ color: accent }} />
                <span className="text-sm font-bold text-zinc-200">Kostenlose Belohnungen</span>
                <span className="text-[10px] text-zinc-500">— für alle Spieler</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {pass.tiers.filter((t) => !t.isPremium).map((tier) => (
                  <TierCard
                    key={tier.id}
                    tier={tier}
                    unlocked={progressDays >= tier.tierNumber}
                    claimed={claimedIds.has(tier.id)}
                    hasPremium={hasPremium}
                    onClaim={handleClaim}
                    accentColor={accent}
                  />
                ))}
              </div>
            </div>

            {/* Premium track */}
            {pass.tiers.some((t) => t.isPremium) && (
              <div
                className={`rounded-2xl border p-4 transition-all ${
                  hasPremium
                    ? "border-amber-400/25 bg-amber-500/[0.05]"
                    : "border-white/[0.07] bg-black/20 opacity-70"
                }`}
                style={hasPremium ? { boxShadow: "0 0 24px rgba(245,158,11,0.07)" } : undefined}
              >
                <div className="mb-3 flex items-center gap-2">
                  <Crown className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-bold text-amber-200">Premium Belohnungen</span>
                  {!hasPremium && (
                    <button
                      onClick={handlePurchase}
                      disabled={purchasing || myCredits < pass.priceCr}
                      className="ml-auto flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-[11px] font-bold text-amber-300 transition-all hover:bg-amber-500/25 disabled:opacity-40"
                    >
                      <ShoppingCart className="h-3 w-3" />
                      Kaufen
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {pass.tiers.filter((t) => t.isPremium).map((tier) => (
                    <TierCard
                      key={tier.id}
                      tier={tier}
                      unlocked={progressDays >= tier.tierNumber}
                      claimed={claimedIds.has(tier.id)}
                      hasPremium={hasPremium}
                      onClaim={handleClaim}
                      accentColor={accent}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
