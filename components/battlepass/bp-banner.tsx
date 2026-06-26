"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Crown, Zap, Star, TrendingUp, ChevronRight, ShieldCheck,
  Trophy, Gem, Shield, Wand2, Package, Palette,
} from "lucide-react";
import { BP_THEMES, type BattlePass, type BattlePassTier, type UserBpStatus } from "@/lib/battle-pass";

// ── Rarity palette ──────────────────────────────────────────────────────────────

const RARITY_COLORS: Record<string, string> = {
  normal: "#94a3b8",
  selten: "#a78bfa",
  mythisch: "#f59e0b",
  ultra: "#e879f9",
};

// ── Reward-type icon silhouette — shown on the preview card ────────────────────

function TierRewardIcon({ tier, size = 32, color }: {
  tier: BattlePassTier;
  size?: number;
  color: string;
}) {
  const s = size;
  const half = s / 2;

  if (tier.rewardType === "credits") {
    const amount = (tier.rewardCredits ?? 0) * (tier.rewardQuantity ?? 1);
    const text = amount >= 1000 ? `${Math.round(amount / 1000)}k` : String(amount);
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div
          className="flex items-center justify-center rounded-full font-black"
          style={{
            width: s, height: s,
            background: "radial-gradient(circle at 35% 35%, #fef3c7, #f59e0b, #78350f)",
            boxShadow: `0 0 ${half}px rgba(245,158,11,0.7)`,
            fontSize: s * 0.42,
          }}
        >
          💰
        </div>
        <span className="text-[9px] font-black text-amber-300 tabular-nums leading-none">{text} CR</span>
      </div>
    );
  }

  if (tier.rewardType === "badge") {
    return (
      <Trophy style={{ width: s, height: s, color: "#f59e0b", filter: `drop-shadow(0 0 8px rgba(245,158,11,0.8))` }} />
    );
  }

  if (tier.rewardType === "xp_boost") {
    const days = tier.rewardXpBoost ?? 1;
    return (
      <div className="flex flex-col items-center gap-0.5">
        <Zap style={{ width: s * 0.9, height: s * 0.9, color: "#38bdf8", filter: `drop-shadow(0 0 8px rgba(56,189,248,0.8))` }} />
        <span className="text-[9px] font-black text-sky-300">+{days}d</span>
      </div>
    );
  }

  if (tier.rewardType === "name_style") {
    return <Palette style={{ width: s, height: s, color, filter: `drop-shadow(0 0 8px ${color}99)` }} />;
  }

  if (tier.rewardType === "ability") {
    return (
      <div
        className="flex items-center justify-center rounded-xl"
        style={{
          width: s, height: s,
          background: "radial-gradient(circle, rgba(168,85,247,0.3) 0%, transparent 70%)",
          border: "1px solid rgba(168,85,247,0.5)",
        }}
      >
        <Zap style={{ width: s * 0.6, height: s * 0.6, color: "#c084fc" }} />
      </div>
    );
  }

  if (tier.rewardType === "item" || tier.rewardType === "random_item") {
    const rarity = tier.rewardItemRarity ?? "normal";
    const rarityColor = RARITY_COLORS[rarity] ?? color;
    const itemType = tier.rewardItemType;
    let icon: React.ReactNode;

    if (itemType === "weapon_cosmetic" || itemType === "weapon") {
      icon = <Wand2 style={{ width: s * 0.75, height: s * 0.75, color: rarityColor }} />;
    } else if (itemType === "shield_cosmetic") {
      icon = <Shield style={{ width: s * 0.75, height: s * 0.75, color: rarityColor }} />;
    } else if (itemType === "amulet" || itemType === "ring") {
      icon = <Gem style={{ width: s * 0.75, height: s * 0.75, color: rarityColor }} />;
    } else if (tier.rewardType === "random_item") {
      icon = <span style={{ fontSize: s * 0.72 }}>🎲</span>;
    } else {
      icon = <Package style={{ width: s * 0.7, height: s * 0.7, color: rarityColor }} />;
    }

    return (
      <div
        className="flex items-center justify-center rounded-xl"
        style={{
          width: s, height: s,
          background: `radial-gradient(circle at 40% 30%, ${rarityColor}30 0%, ${rarityColor}08 100%)`,
          border: `1.5px solid ${rarityColor}60`,
          boxShadow: `0 0 ${half}px ${rarityColor}50`,
        }}
      >
        {icon}
      </div>
    );
  }

  // Generic fallback — use tier icon or gift
  return <span style={{ fontSize: s * 0.9 }}>{tier.icon || "🎁"}</span>;
}

// ── Massive tier preview card ───────────────────────────────────────────────────

function TierPreviewCard({
  tier, accent, glow, delay,
}: {
  tier: BattlePassTier;
  accent: string;
  glow: string;
  delay: number;
}) {
  const rarity = tier.rewardItemRarity ?? null;
  const rarityColor = rarity ? (RARITY_COLORS[rarity] ?? accent) : accent;
  const isHighlight = tier.highlightTier;
  const cardColor = isHighlight ? accent : rarityColor;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.88 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.45, type: "spring", stiffness: 200, damping: 22 }}
      className="relative flex flex-col items-center gap-2 shrink-0"
      style={{ width: isHighlight ? 100 : 84 }}
    >
      {/* Card body */}
      <div
        className="relative flex w-full flex-col items-center gap-2 rounded-2xl border px-2 pt-4 pb-3 text-center overflow-hidden"
        style={{
          borderColor: isHighlight ? `${cardColor}80` : `${cardColor}40`,
          background: isHighlight
            ? `linear-gradient(170deg, ${cardColor}25 0%, ${cardColor}08 60%, rgba(0,0,0,0.5) 100%)`
            : `linear-gradient(170deg, ${cardColor}12 0%, rgba(0,0,0,0.55) 100%)`,
          boxShadow: isHighlight
            ? `0 0 32px ${glow}55, 0 0 10px ${cardColor}30, inset 0 0 16px ${cardColor}10`
            : `0 4px 16px ${cardColor}18`,
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Top shine bar for highlight/milestone */}
        {isHighlight && (
          <>
            <div
              className="absolute top-0 inset-x-0 h-[2px]"
              style={{ background: `linear-gradient(90deg, transparent, ${cardColor}cc, #ffffffaa, ${cardColor}cc, transparent)` }}
            />
            <motion.div
              className="absolute inset-0 rounded-2xl pointer-events-none"
              animate={{ opacity: [0.2, 0.55, 0.2] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              style={{ background: `radial-gradient(ellipse at 50% 0%, ${cardColor}35 0%, transparent 65%)` }}
            />
          </>
        )}

        {/* Reward icon */}
        <div className="relative z-10 flex items-center justify-center" style={{ minHeight: 46 }}>
          <TierRewardIcon tier={tier} size={isHighlight ? 44 : 36} color={cardColor} />
        </div>

        {/* Tier number chip */}
        <div
          className="absolute top-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[8px] font-black tabular-nums"
          style={{
            background: `${cardColor}22`,
            color: cardColor,
            border: `1px solid ${cardColor}40`,
          }}
        >
          {tier.tierNumber}
        </div>

        {/* MILESTONE badge */}
        {isHighlight && (
          <div
            className="absolute top-1.5 right-1.5 rounded-full px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wide"
            style={{ background: `${cardColor}30`, color: cardColor }}
          >
            ✦
          </div>
        )}

        {/* Tier name */}
        <p
          className="relative z-10 text-[10px] font-black leading-tight max-w-full truncate"
          style={{ color: isHighlight ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.65)" }}
        >
          {tier.name}
        </p>
      </div>
    </motion.div>
  );
}

// ── BpBanner ───────────────────────────────────────────────────────────────────

interface BpBannerProps {
  pass: BattlePass;
  userStatus: UserBpStatus | null;
  onPurchase?: () => void;
}

export function BpBanner({ pass, userStatus, onPurchase }: BpBannerProps) {
  const router = useRouter();
  const theme = BP_THEMES[pass.theme] ?? BP_THEMES.default;
  const accent = pass.accentColor || theme.accent;
  const glow = theme.glow;

  const hasPremium = userStatus?.hasPremium ?? false;
  const hasElite = userStatus?.hasElite ?? false;
  const progressDays = userStatus?.progressDays ?? 0;
  const progressPct = Math.min(100, Math.round((progressDays / pass.tierCount) * 100));

  const freeTierCount = pass.tiers.filter((t) => !t.isPremium && !t.isElite).length;
  const premiumTierCount = pass.tiers.filter((t) => t.isPremium && !t.isElite).length;
  const eliteTierCount = pass.tiers.filter((t) => t.isElite).length;

  // Prefer milestone tiers for the preview; fill from evenly-spaced tiers otherwise
  const previewTiers: BattlePassTier[] = (() => {
    const milestones = pass.tiers.filter((t) => t.highlightTier);
    if (milestones.length >= 5) return milestones.slice(0, 5);
    const step = Math.max(1, Math.floor(pass.tiers.length / 5));
    return Array.from({ length: 5 }, (_, i) =>
      pass.tiers[Math.min(i * step, pass.tiers.length - 1)]
    ).filter(Boolean) as BattlePassTier[];
  })();

  function handleClick() {
    router.push("/battlepass");
  }

  function handleBuy(e: React.MouseEvent) {
    e.stopPropagation();
    onPurchase ? onPurchase() : router.push("/battlepass");
  }

  return (
    <>
      <style>{`
        @keyframes bpBannerGlow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.9; }
        }
        @keyframes bpBorderSpin {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .bp-animated-border::before {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(90deg, transparent, ${accent}80, transparent, ${accent}60, transparent);
          background-size: 200% 200%;
          animation: bpBorderSpin 4s linear infinite;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
        @keyframes bpScanLine {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100vw); }
        }
        .bp-scan-line {
          animation: bpScanLine 6s ease-in-out infinite;
        }
      `}</style>

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
        onClick={handleClick}
        className="relative overflow-hidden cursor-pointer select-none bp-animated-border border-b"
        style={{
          borderColor: `${accent}28`,
          background: `linear-gradient(160deg, ${accent}18 0%, #07051a 55%, ${accent}08 100%)`,
          minHeight: 160,
        }}
      >
        {/* Scanline sweep */}
        <div
          className="bp-scan-line pointer-events-none absolute inset-y-0 w-24 opacity-[0.04] z-20"
          style={{ background: `linear-gradient(90deg, transparent, #fff, transparent)` }}
        />

        {/* Ambient glow blobs */}
        <div
          className="pointer-events-none absolute -top-24 left-1/4 h-80 w-80 rounded-full blur-[120px]"
          style={{ background: accent, opacity: 0.22, animation: "bpBannerGlow 5s ease-in-out infinite" }}
        />
        <div
          className="pointer-events-none absolute -bottom-16 right-1/4 h-64 w-64 rounded-full blur-[100px]"
          style={{ background: accent, opacity: 0.12, animation: "bpBannerGlow 7s ease-in-out infinite 2s" }}
        />
        <div
          className="pointer-events-none absolute top-0 right-0 h-48 w-48 rounded-full blur-[80px]"
          style={{ background: pass.highlightColor ?? accent, opacity: 0.10, animation: "bpBannerGlow 6s ease-in-out infinite 1s" }}
        />

        {/* Subtle grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg,transparent,transparent 31px,rgba(255,255,255,0.7) 32px)," +
              "repeating-linear-gradient(90deg,transparent,transparent 31px,rgba(255,255,255,0.7) 32px)",
          }}
        />

        {/* Banner image — faint full-bleed */}
        {pass.bannerImageUrl && (
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url(${pass.bannerImageUrl})`,
              opacity: 0.12,
              maskImage: "linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0) 100%)",
              WebkitMaskImage: "linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0) 100%)",
            }}
          />
        )}

        {/* Main content */}
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 py-5 sm:py-7 lg:py-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-8">

            {/* ── LEFT: Pass info ──────────────────────────────────────── */}
            <div className="flex flex-col gap-2.5 min-w-0 lg:w-[280px] lg:shrink-0">
              {/* Status badges */}
              <div className="flex flex-wrap items-center gap-1.5">
                {pass.isActive && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest backdrop-blur-sm"
                    style={{ color: accent, borderColor: `${accent}55`, background: `${accent}18`, boxShadow: `0 0 12px ${accent}20` }}
                  >
                    <ShieldCheck className="h-2.5 w-2.5" />
                    Aktiv
                  </span>
                )}
                {hasPremium && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/18 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-300">
                    <Crown className="h-2.5 w-2.5" />Premium
                  </span>
                )}
                {hasElite && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/50 bg-violet-500/18 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-violet-300">
                    💎 Elite
                  </span>
                )}
              </div>

              {/* Season label */}
              <p
                className="text-[10px] font-black uppercase tracking-[0.22em] opacity-75"
                style={{ color: accent }}
              >
                {pass.seasonLabel}
              </p>

              {/* Pass name — large and glowing */}
              <h2
                className="text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl lg:text-4xl"
                style={{ textShadow: `0 0 60px ${accent}60, 0 0 100px ${accent}20` }}
              >
                {pass.name}
              </h2>

              {/* Description */}
              {pass.description && (
                <p className="text-xs text-white/55 leading-relaxed line-clamp-2 max-w-xs">
                  {pass.description}
                </p>
              )}

              {/* Track breakdown chips */}
              <div className="flex flex-wrap gap-1.5 mt-0.5">
                <span className="flex items-center gap-1 text-[10px] text-white/40 font-semibold">
                  <TrendingUp className="h-3 w-3" />
                  {pass.tierCount} Tiers
                </span>
                {freeTierCount > 0 && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/35 font-bold">
                    {freeTierCount} FREE
                  </span>
                )}
                {premiumTierCount > 0 && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400/80 font-bold">
                    +{premiumTierCount} PREMIUM
                  </span>
                )}
                {pass.eliteEnabled && eliteTierCount > 0 && (
                  <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-400/80 font-bold">
                    +{eliteTierCount} ELITE
                  </span>
                )}
              </div>

              {/* Progress bar */}
              {userStatus && (
                <div className="mt-1 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-white/35 font-semibold">Fortschritt</span>
                    <span className="font-black tabular-nums" style={{ color: accent }}>
                      {progressDays} / {pass.tierCount}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPct}%` }}
                      transition={{ duration: 1, ease: "easeOut", delay: 0.4 }}
                      className="h-full rounded-full relative overflow-hidden"
                      style={{
                        background: `linear-gradient(90deg, ${accent}, ${accent}cc)`,
                        boxShadow: `0 0 10px ${glow}`,
                      }}
                    >
                      <motion.div
                        className="absolute inset-y-0 w-12"
                        animate={{ left: ["-30%", "130%"] }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.5 }}
                        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)" }}
                      />
                    </motion.div>
                  </div>
                </div>
              )}
            </div>

            {/* ── CENTER: Tier preview cards ─────────────────────────── */}
            <div className="flex flex-1 items-center justify-center gap-2.5 sm:gap-3 overflow-x-auto pb-1 min-w-0">
              {previewTiers.length > 0 ? previewTiers.map((tier, i) => (
                <TierPreviewCard
                  key={tier.id}
                  tier={tier}
                  accent={accent}
                  glow={glow}
                  delay={0.08 + i * 0.07}
                />
              )) : (
                <div className="flex items-center gap-2 text-sm text-white/25">
                  <Star className="h-4 w-4" />
                  <span>Rewards werden bald hinzugefügt</span>
                </div>
              )}
            </div>

            {/* ── RIGHT: Prices + CTA ───────────────────────────────── */}
            <div className="flex flex-col items-start gap-3 lg:w-[210px] lg:shrink-0 lg:items-end">
              {/* Price display */}
              {!hasPremium && (
                <div className="flex flex-col gap-0.5 lg:text-right">
                  <span className="text-[10px] text-white/35 font-semibold uppercase tracking-widest">
                    Premium Pass
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span
                      className="text-2xl font-black text-white tabular-nums"
                      style={{ textShadow: `0 0 20px ${accent}60` }}
                    >
                      {pass.priceCr.toLocaleString("de-DE")}
                    </span>
                    <span className="text-sm font-semibold text-white/40">CR</span>
                  </div>
                </div>
              )}
              {pass.eliteEnabled && !hasElite && (
                <div className="flex flex-col gap-0.5 lg:text-right">
                  <span className="text-[10px] text-violet-400/60 font-semibold uppercase tracking-widest">
                    Elite Pass
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-black text-violet-300 tabular-nums">
                      {pass.elitePriceCr.toLocaleString("de-DE")}
                    </span>
                    <span className="text-sm font-semibold text-violet-400/40">CR</span>
                  </div>
                </div>
              )}

              {/* CTA buttons */}
              <div className="flex flex-col gap-2 w-full lg:items-end">
                {!hasPremium && (
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={handleBuy}
                    className="relative overflow-hidden rounded-xl px-5 py-2.5 text-sm font-black text-white w-full lg:w-auto transition-all"
                    style={{
                      background: `linear-gradient(135deg, ${accent} 0%, ${accent}aa 100%)`,
                      boxShadow: `0 4px 28px ${glow}, 0 0 0 1px ${accent}30`,
                    }}
                  >
                    <motion.div
                      className="pointer-events-none absolute inset-y-0 w-14"
                      animate={{ left: ["-20%", "120%"] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", repeatDelay: 2 }}
                      style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)" }}
                    />
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
                    className="relative overflow-hidden rounded-xl border border-violet-500/50 bg-violet-500/18 px-5 py-2.5 text-sm font-black text-violet-200 w-full lg:w-auto transition-all hover:bg-violet-500/28"
                    style={{ boxShadow: "0 4px 24px rgba(139,92,246,0.25), 0 0 0 1px rgba(139,92,246,0.2)" }}
                  >
                    <span className="flex items-center justify-center gap-2">
                      <Zap className="h-3.5 w-3.5" />
                      Elite kaufen
                    </span>
                  </motion.button>
                )}

                {/* Already owned → go to pass */}
                {hasPremium && (!pass.eliteEnabled || hasElite) && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={(e) => { e.stopPropagation(); router.push("/battlepass"); }}
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/6 px-5 py-2.5 text-sm font-bold text-white/70 w-full lg:w-auto transition-all hover:bg-white/10"
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
