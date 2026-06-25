"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Crown, Zap, Star, TrendingUp, ChevronRight, ShieldCheck } from "lucide-react";
import { BP_THEMES, type BattlePass, type UserBpStatus } from "@/lib/battle-pass";

interface BpBannerProps {
  pass: BattlePass;
  userStatus: UserBpStatus | null;
  onPurchase?: () => void;
}

function TierPreviewCard({
  tier,
  accent,
  glow,
  delay,
}: {
  tier: { tierNumber: number; name: string; icon: string; highlightTier: boolean };
  accent: string;
  glow: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.4, type: "spring", stiffness: 220, damping: 22 }}
      className="relative flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-center backdrop-blur-sm shrink-0"
      style={{
        borderColor: tier.highlightTier ? accent + "60" : "rgba(255,255,255,0.08)",
        background: tier.highlightTier
          ? `linear-gradient(135deg, ${accent}18 0%, transparent 100%)`
          : "rgba(0,0,0,0.3)",
        boxShadow: tier.highlightTier ? `0 0 18px ${glow}` : undefined,
      }}
    >
      {tier.highlightTier && (
        <div
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{
            background: `linear-gradient(135deg, ${accent}20 0%, transparent 70%)`,
            animation: "bpGlowPulse 2.4s ease-in-out infinite",
          }}
        />
      )}
      <span className="text-xl leading-none">{tier.icon}</span>
      <span className="text-[10px] font-black uppercase tracking-widest text-white/50">
        Tier {tier.tierNumber}
      </span>
      <span className="text-[11px] font-semibold text-white/80 leading-tight max-w-[64px] line-clamp-1">
        {tier.name}
      </span>
    </motion.div>
  );
}

export function BpBanner({ pass, userStatus, onPurchase }: BpBannerProps) {
  const router = useRouter();
  const theme = BP_THEMES[pass.theme] ?? BP_THEMES.default;

  const hasPremium = userStatus?.hasPremium ?? false;
  const hasElite = userStatus?.hasElite ?? false;
  const progressDays = userStatus?.progressDays ?? 0;
  const progressPct = Math.min(100, Math.round((progressDays / pass.tierCount) * 100));

  // Pick 5 milestone preview tiers (highlight tiers first, else evenly spaced)
  const milestoneTiers = pass.tiers.filter((t) => t.highlightTier).slice(0, 5);
  const previewTiers =
    milestoneTiers.length >= 5
      ? milestoneTiers
      : (() => {
          const step = Math.max(1, Math.floor(pass.tiers.length / 5));
          return Array.from({ length: 5 }, (_, i) => pass.tiers[Math.min(i * step, pass.tiers.length - 1)]).filter(
            Boolean
          );
        })();

  const freeTierCount = pass.tiers.filter((t) => !t.isPremium && !t.isElite).length;
  const premiumTierCount = pass.tiers.filter((t) => t.isPremium && !t.isElite).length;
  const eliteTierCount = pass.tiers.filter((t) => t.isElite).length;

  function handleClick() {
    router.push("/battlepass");
  }

  function handleBuy(e: React.MouseEvent) {
    e.stopPropagation();
    if (onPurchase) {
      onPurchase();
    } else {
      router.push("/battlepass");
    }
  }

  return (
    <>
      <style>{`
        @keyframes bpGlowPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes bpBorderSpin {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .bp-animated-border::before {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(90deg, transparent, ${theme.accent}80, transparent, ${theme.accent}60, transparent);
          background-size: 200% 200%;
          animation: bpBorderSpin 4s linear infinite;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
      `}</style>

      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        onClick={handleClick}
        className="relative overflow-hidden cursor-pointer select-none bp-animated-border rounded-none border-b"
        style={{
          borderColor: theme.accent + "30",
          background: theme.gradient,
        }}
      >
        {/* Ambient glow blobs */}
        <div
          className="pointer-events-none absolute -top-20 left-1/4 h-64 w-64 rounded-full blur-[100px]"
          style={{ background: theme.glow, opacity: 0.25 }}
        />
        <div
          className="pointer-events-none absolute -bottom-10 right-1/3 h-48 w-48 rounded-full blur-[80px]"
          style={{ background: theme.glow, opacity: 0.15 }}
        />

        {/* Subtle scanline overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.6) 4px)",
          }}
        />

        <div className="relative z-10 mx-auto max-w-7xl px-3 sm:px-4 py-4 sm:py-5 lg:py-6">
          <div className="flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-center lg:gap-6 min-w-0">

            {/* ── LEFT: Pass info ───────────────────────────────────── */}
            <div className="flex min-w-0 w-full flex-col gap-2 lg:w-[260px] lg:shrink-0">
              {/* Active badge + pass name row */}
              <div className="flex items-center gap-2 flex-wrap">
                {pass.isActive && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border"
                    style={{
                      color: theme.accent,
                      borderColor: theme.accent + "50",
                      background: theme.accent + "18",
                    }}
                  >
                    <ShieldCheck className="h-2.5 w-2.5" />
                    Aktiv
                  </span>
                )}
                {hasPremium && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-300">
                    <Crown className="h-2.5 w-2.5" />
                    Premium
                  </span>
                )}
                {hasElite && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-violet-300">
                    💎 Elite
                  </span>
                )}
              </div>

              {/* Season label */}
              <p
                className="text-[11px] font-black uppercase tracking-[0.2em] opacity-70"
                style={{ color: theme.accent }}
              >
                {pass.seasonLabel}
              </p>

              {/* Pass name */}
              <h2 className="text-xl font-black leading-tight tracking-tight text-white sm:text-2xl lg:text-3xl">
                {pass.name}
              </h2>

              {/* Description */}
              {pass.description && (
                <p className="text-sm text-white/60 leading-relaxed line-clamp-2">
                  {pass.description}
                </p>
              )}

              {/* Track breakdown */}
              <div className="flex flex-wrap gap-2 mt-1">
                <span className="flex items-center gap-1 text-[11px] text-white/50">
                  <TrendingUp className="h-3 w-3" />
                  {pass.tierCount} Tiers
                </span>
                {freeTierCount > 0 && (
                  <span className="text-[11px] text-white/40">
                    {freeTierCount} FREE
                  </span>
                )}
                {premiumTierCount > 0 && (
                  <span className="text-[11px] text-amber-400/70">
                    + {premiumTierCount} PREMIUM
                  </span>
                )}
                {pass.eliteEnabled && eliteTierCount > 0 && (
                  <span className="text-[11px] text-violet-400/70">
                    + {eliteTierCount} ELITE
                  </span>
                )}
              </div>

              {/* Progress bar if owned */}
              {userStatus && (
                <div className="mt-1.5 flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-white/40 font-semibold">Fortschritt</span>
                    <span className="font-black" style={{ color: theme.accent }}>
                      {progressDays} / {pass.tierCount} Tage
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPct}%` }}
                      transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
                      className="h-full rounded-full"
                      style={{
                        background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent}cc)`,
                        boxShadow: `0 0 8px ${theme.glow}`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── CENTER: Tier preview cards ─────────────────────────── */}
            <div className="flex flex-1 items-center justify-center gap-2 overflow-x-auto pb-1 lg:pb-0 min-w-0">
              {previewTiers.map((tier, i) => (
                <TierPreviewCard
                  key={tier.id}
                  tier={tier}
                  accent={theme.accent}
                  glow={theme.glow}
                  delay={0.1 + i * 0.07}
                />
              ))}
              {previewTiers.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-white/30">
                  <Star className="h-4 w-4" />
                  <span>Tier-Rewards werden bald hinzugefügt</span>
                </div>
              )}
            </div>

            {/* ── RIGHT: Price + buy buttons ────────────────────────── */}
            <div className="flex flex-col items-start gap-3 lg:w-[220px] lg:shrink-0 lg:items-end">
              {/* Price display */}
              {!hasPremium && (
                <div className="flex flex-col gap-0.5 lg:text-right">
                  <span className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">
                    Premium Pass
                  </span>
                  <span className="text-2xl font-black text-white tabular-nums">
                    {pass.priceCr.toLocaleString("de-DE")}
                    <span className="text-sm font-semibold text-white/50 ml-1">CR</span>
                  </span>
                </div>
              )}
              {pass.eliteEnabled && !hasElite && (
                <div className="flex flex-col gap-0.5 lg:text-right">
                  <span className="text-[11px] text-violet-400/70 font-semibold uppercase tracking-widest">
                    Elite Pass
                  </span>
                  <span className="text-xl font-black text-violet-300 tabular-nums">
                    {pass.elitePriceCr.toLocaleString("de-DE")}
                    <span className="text-sm font-semibold text-violet-400/50 ml-1">CR</span>
                  </span>
                </div>
              )}

              {/* Buy buttons */}
              <div className="flex flex-col gap-2 w-full lg:items-end">
                {!hasPremium && (
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={handleBuy}
                    className="relative overflow-hidden rounded-xl px-5 py-2.5 text-sm font-black text-white w-full lg:w-auto transition-all"
                    style={{
                      background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accent}aa 100%)`,
                      boxShadow: `0 4px 24px ${theme.glow}`,
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent card-shimmer-inner" />
                    <span className="relative flex items-center justify-center gap-2">
                      <Crown className="h-3.5 w-3.5" />
                      Premium kaufen
                    </span>
                  </motion.button>
                )}

                {pass.eliteEnabled && !hasElite && (
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={handleBuy}
                    className="relative overflow-hidden rounded-xl border border-violet-500/40 bg-violet-500/15 px-5 py-2.5 text-sm font-black text-violet-300 w-full lg:w-auto transition-all hover:bg-violet-500/25"
                    style={{ boxShadow: "0 4px 20px rgba(139,92,246,0.2)" }}
                  >
                    <span className="flex items-center justify-center gap-2">
                      <Zap className="h-3.5 w-3.5" />
                      Elite kaufen
                    </span>
                  </motion.button>
                )}

                {/* Already fully owned */}
                {hasPremium && (!pass.eliteEnabled || hasElite) && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={(e) => { e.stopPropagation(); router.push("/battlepass"); }}
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-white/70 w-full lg:w-auto transition-all hover:bg-white/10"
                  >
                    Zum Battle Pass
                    <ChevronRight className="h-3.5 w-3.5" />
                  </motion.button>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}
