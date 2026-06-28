"use client";

import { useState, useTransition, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useMotionValue, useSpring } from "framer-motion";
import {
  Crown, Eye, Zap, Lock, CheckCircle2, Star, Calendar, Award, Layers, Gift,
  Sparkles, ChevronLeft, ChevronRight, Clock, Coins, TrendingUp, Shield,
  Package, Palette, Trophy, ChevronDown, ChevronUp,
  Target, Wand2, Gem, Flame,
} from "lucide-react";
import { BP_THEMES, DEFAULT_BP_VISUAL_CONFIG, type BattlePass, type BattlePassTier, type UserBpStatus, type BpQuestWithProgress, type BpVisualConfig, type BpLayoutMode } from "@/lib/battle-pass";
import { purchaseBattlePass, claimBpTier, getActiveBattlePass } from "@/lib/actions/battle-pass";
import { createClient } from "@/lib/supabase/client";
import { getBpQuestsWithProgress } from "@/lib/actions/bp-quests";
import { StyledUsername } from "@/components/ui/styled-username";
import { useSoundManager } from "@/lib/sound-manager";
import { Canvas } from "@react-three/fiber";
import { View } from "@react-three/drei";
import { ItemStandaloneCanvas, type ItemForPreview } from "@/components/shop/shop-character-view";
import { BpRewardView3D } from "@/components/battlepass/bp-reward-3d";
import { PodiumShowcase } from "@/components/battlepass/podium-showcase";
import { CaseDropView } from "@/components/cases/case-item-3d";
import { WORN_TYPES } from "@/lib/case-display-config";
import type { Rarity } from "@/lib/cases";
import { UniversalPreviewModal, type PreviewSubject } from "@/components/ui/universal-preview-modal";
import { getBadgeStyle } from "@/lib/badges";

// ── helpers ───────────────────────────────────────────────────────────────────

type TierState = "claimed" | "available" | "locked";

function tierToPreviewSubject(tier: BattlePassTier): PreviewSubject | null {
  switch (tier.rewardType) {
    case "item":
      if (!tier.rewardItemName || !tier.rewardItemType) return null;
      return {
        kind: "item",
        item: {
          id: tier.rewardItemId ?? tier.id,
          name: tier.rewardItemName,
          rarity: tier.rewardItemRarity ?? "normal",
          type: tier.rewardItemType,
        },
      };
    case "random_item":
      return { kind: "random_item", rarity: tier.rewardItemRarity ?? undefined };
    case "badge":
      if (!tier.rewardBadgeKey) return null;
      return { kind: "badge", badgeKey: tier.rewardBadgeKey, badgeText: tier.rewardBadgeText ?? undefined };
    case "name_style":
      if (!tier.rewardNameStyleKey) return null;
      return { kind: "name_style", styleKey: tier.rewardNameStyleKey };
    case "ability":
      if (!tier.rewardAbilityKey) return null;
      return {
        kind: "ability",
        abilityKey: tier.rewardAbilityKey,
        name: tier.rewardAbilityName ?? tier.name,
      };
    case "xp_boost":
      return { kind: "xp_boost", days: tier.rewardXpBoost ?? 1 };
    case "credits":
      return {
        kind: "credits",
        amount: (tier.rewardCredits ?? 0) * (tier.rewardQuantity ?? 1),
      };
    case "case_voucher":
      return {
        kind: "case_voucher",
        mode: tier.rewardCaseVoucherMode ?? "tier",
        tierLabel: tier.rewardCaseVoucherTierId ?? undefined,
        rarityFloor: tier.rewardCaseVoucherRarityFloor ?? undefined,
        durationHours: tier.rewardCaseVoucherDurationHours || undefined,
      };
    case "game_bonus":
      if (!tier.rewardGameBonusGame) return null;
      return {
        kind: "game_bonus",
        game: tier.rewardGameBonusGame,
        amount: tier.rewardGameBonusAmount || 1,
        durationHours: tier.rewardGameBonusDurationHours || undefined,
      };
    default:
      return null;
  }
}

function getTierState(tier: BattlePassTier, userStatus: UserBpStatus | null, progressDays: number): TierState {
  if (!userStatus) return "locked";
  if (userStatus.claimedTierIds.includes(tier.id)) return "claimed";
  if (progressDays >= tier.tierNumber) {
    if (tier.isPremium && !userStatus.hasPremium) return "locked";
    return "available";
  }
  return "locked";
}

function rewardLabel(tier: BattlePassTier): string {
  switch (tier.rewardType) {
    case "credits":
      return tier.rewardCredits
        ? `${((tier.rewardCredits) * tier.rewardQuantity).toLocaleString("de-DE")} CR`
        : "Credits";
    case "item": return `${tier.rewardItemName ?? "Item"}${tier.rewardQuantity > 1 ? ` ×${tier.rewardQuantity}` : ""}`;
    case "random_item": return tier.rewardItemRarity ? `${tier.rewardItemRarity} Item` : "Zufalls-Item";
    case "badge": return tier.rewardBadgeText ?? "Badge";
    case "xp_boost": return `+${tier.rewardXpBoost ?? 1} Fortschrittstag${(tier.rewardXpBoost ?? 1) !== 1 ? "e" : ""}`;
    case "name_style": return `Style: ${tier.rewardNameStyleKey ?? "?"}`;
    case "ability": return tier.rewardAbilityName ?? tier.rewardAbilityKey ?? "Fähigkeits-Gutschein";
    case "case_voucher": return tier.rewardCaseVoucherMode === "rarity" ? `Gratis-Case (${tier.rewardCaseVoucherRarityFloor ?? "?"}+)` : "Gratis-Case";
    case "game_bonus": return `+${tier.rewardGameBonusAmount || 1} ${tier.rewardGameBonusGame ?? "Spiel"}-Bonus`;
    default: return "Belohnung";
  }
}

function rewardIcon(tier: BattlePassTier): string {
  if (tier.icon) return tier.icon;
  switch (tier.rewardType) {
    case "credits": return "💰";
    case "item": return "🎁";
    case "random_item": return "🎲";
    case "badge": return "🏆";
    case "xp_boost": return "⚡";
    case "name_style": return "✨";
    case "ability": return "🔮";
    case "case_voucher": return "🎟️";
    case "game_bonus": return "🎮";
    default: return "🎁";
  }
}

// ── Visual reward preview ─────────────────────────────────────────────────────

const RARITY_COLORS: Record<string, string> = {
  normal: "#94a3b8",
  selten: "#a78bfa",
  mythisch: "#f59e0b",
  ultra: "#e879f9",
};
const RARITY_GLOWS: Record<string, string> = {
  normal: "rgba(148,163,184,0.3)",
  selten: "rgba(167,139,250,0.4)",
  mythisch: "rgba(245,158,11,0.45)",
  ultra: "rgba(232,121,249,0.5)",
};

const ACTION_ICONS: Record<string, string> = {
  monster_kill: "⚔️", pvp_kill: "🗡️", snake_game: "🐍", mine_collect: "⛏️",
  plinko_spin: "🎲", case_open: "📦", daily_login: "📅", login_streak: "🔥",
  world_playtime: "🌍", auction_bid: "🔨", credits_earn: "💰",
};

// ── Item type → icon shape (CSS-based, no WebGL — tiles are dense) ────────────

const ITEM_TYPE_ICONS: Record<string, React.ReactNode> = {
  hat:             <div className="flex h-7 w-9 flex-col items-center"><div className="h-3 w-9 rounded-t-full bg-current" /><div className="mt-0.5 h-1.5 w-11 rounded-full bg-current opacity-60" /></div>,
  face:            <div className="h-8 w-8 rounded-full border-[3px] border-current flex items-center justify-center"><div className="h-2.5 w-2.5 rounded-full bg-current" /></div>,
  hair:            <div className="flex h-8 w-8 flex-col items-center gap-0.5"><div className="h-4 w-8 rounded-t-full bg-current" /><div className="flex gap-0.5"><div className="h-4 w-1.5 rounded-b-full bg-current" /><div className="h-3 w-1.5 rounded-b-full bg-current opacity-70" /><div className="h-4 w-1.5 rounded-b-full bg-current opacity-50" /></div></div>,
  weapon_cosmetic: <Wand2 className="h-7 w-7" />,
  weapon:          <Wand2 className="h-7 w-7" />,
  jacket:          <div className="flex h-8 w-9 flex-col items-center"><div className="flex w-full gap-0.5"><div className="h-3 w-3 rounded-tl-lg bg-current" /><div className="h-5 w-3 flex-1 bg-current" /><div className="h-3 w-3 rounded-tr-lg bg-current" /></div><div className="h-4 w-full bg-current rounded-b-md" /></div>,
  pants:           <div className="flex h-8 w-8 gap-0.5 items-start justify-center"><div className="h-6 w-3 rounded-b-full bg-current" /><div className="h-6 w-3 rounded-b-full bg-current" /></div>,
  shoes:           <div className="flex gap-1 items-end"><div className="h-3 w-5 rounded-tl-full rounded-br-md bg-current" /><div className="h-3 w-5 rounded-tr-full rounded-bl-md bg-current opacity-80" /></div>,
  shield_cosmetic: <Shield className="h-7 w-7" />,
  ring:            <div className="h-7 w-7 rounded-full border-[3px] border-current" />,
  amulet:          <Gem className="h-6 w-6" />,
  pet:             <div className="flex h-8 w-8 flex-col items-center"><div className="h-5 w-5 rounded-full bg-current mx-auto" /><div className="h-2 w-7 rounded-full bg-current opacity-60 mt-0.5" /></div>,
  aura:            <div className="relative h-8 w-8 rounded-full border-2 border-current"><div className="absolute inset-1.5 rounded-full border border-current opacity-50" /></div>,
  trail:           <div className="flex flex-col gap-0.5 items-center"><div className="h-1.5 w-8 rounded-full bg-current" /><div className="h-1.5 w-6 rounded-full bg-current opacity-70" /><div className="h-1.5 w-4 rounded-full bg-current opacity-40" /></div>,
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  hat: "Hat", face: "Face", hair: "Hair", weapon_cosmetic: "Waffe", weapon: "Waffe",
  jacket: "Jacke", pants: "Hose", shoes: "Schuhe", shield_cosmetic: "Schild",
  ring: "Ring", amulet: "Amulett", pet: "Pet", aura: "Aura", trail: "Spur",
};

function TileMiniPreview({
  tier, trackColor, locked, animated, scale, offsetX = 0, offsetY = 0,
}: {
  tier: BattlePassTier;
  trackColor: string;
  locked: boolean;
  animated: boolean;
  scale: number;
  offsetX?: number;
  offsetY?: number;
}) {
  const rarity = tier.rewardItemRarity ?? "normal";
  const rarityColor = RARITY_COLORS[rarity] ?? "#94a3b8";
  const rarityGlow = RARITY_GLOWS[rarity] ?? "rgba(148,163,184,0.25)";
  const isUltra = rarity === "ultra";
  const isMythisch = rarity === "mythisch";

  const baseStyle: React.CSSProperties = {
    transform: `scale(${scale}) translate(${offsetX / scale}px, ${offsetY / scale}px)`,
    filter: locked ? "grayscale(1) brightness(0.3)" : undefined,
    transition: "filter 0.2s",
    transformOrigin: "center",
  };

  // ── Credits ──────────────────────────────────────────────────────────────────
  if (tier.rewardType === "credits") {
    const amount = (tier.rewardCredits ?? 0) * (tier.rewardQuantity ?? 1);
    const amountText = amount >= 1000 ? `${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}k` : String(amount);
    const COIN_STACK = [
      { size: 38, dx: 4,  dy: 5,  z: 1, delay: 0   },
      { size: 32, dx: 0,  dy: 0,  z: 2, delay: 0.18 },
      { size: 26, dx: -4, dy: -5, z: 3, delay: 0.36 },
    ];
    return (
      <div className="flex flex-col items-center gap-1.5" style={baseStyle}>
        <div className="relative" style={{ width: 52, height: 52 }}>
          {COIN_STACK.map((coin, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                width: coin.size,
                height: coin.size,
                top: `calc(50% - ${coin.size / 2}px + ${coin.dy}px)`,
                left: `calc(50% - ${coin.size / 2}px + ${coin.dx}px)`,
                zIndex: coin.z,
                background: `radial-gradient(circle at 33% 28%, #fef3c7, #fde68a, #f59e0b, #92400e)`,
                boxShadow: `0 0 ${8 + i * 5}px rgba(245,158,11,${0.45 + i * 0.12}), inset 0 -2px 3px rgba(0,0,0,0.25)`,
              }}
              animate={animated ? { y: [0, -3 - i * 0.5, 0] } : {}}
              transition={{ duration: 2.2 + i * 0.4, repeat: Infinity, delay: coin.delay, ease: "easeInOut" }}
            />
          ))}
          <span
            className="absolute z-10"
            style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: 16 }}
          >
            💰
          </span>
        </div>
        <p className="text-[11px] font-black tabular-nums text-amber-300 leading-none tracking-tight">
          {amountText} CR
        </p>
      </div>
    );
  }

  // ── Item / Random Item ────────────────────────────────────────────────────────
  if (tier.rewardType === "item" || tier.rewardType === "random_item") {
    const isRandom = tier.rewardType === "random_item";
    const typeIcon = tier.rewardItemType ? ITEM_TYPE_ICONS[tier.rewardItemType] : null;
    const typeLabel = tier.rewardItemType ? ITEM_TYPE_LABELS[tier.rewardItemType] : null;

    return (
      <div className="flex flex-col items-center gap-1" style={baseStyle}>
        <motion.div
          className="relative flex h-10 w-10 items-center justify-center rounded-xl border-2 overflow-hidden"
          style={{
            borderColor: rarityColor,
            background: `radial-gradient(circle at 40% 30%, ${rarityColor}25 0%, ${rarityColor}08 100%)`,
            boxShadow: locked ? "none" : `0 0 ${isMythisch || isUltra ? 18 : 10}px ${rarityGlow}`,
            color: rarityColor,
          }}
          animate={animated && !locked && (isMythisch || isUltra) ? {
            boxShadow: [`0 0 10px ${rarityGlow}`, `0 0 24px ${rarityGlow}`, `0 0 10px ${rarityGlow}`],
          } : {}}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        >
          {/* Rainbow shimmer for ultra */}
          {isUltra && animated && !locked && (
            <motion.div
              className="pointer-events-none absolute inset-0 rounded-xl"
              animate={{ opacity: [0, 0.5, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              style={{ background: "linear-gradient(135deg, #e879f920, #818cf820, #06b6d420, #34d39920)" }}
            />
          )}
          {isRandom ? (
            <motion.div
              animate={animated ? { rotateY: [0, 180, 360] } : {}}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="text-xl"
            >
              🎲
            </motion.div>
          ) : typeIcon ? (
            <div className="flex items-center justify-center" style={{ color: rarityColor }}>
              {typeIcon}
            </div>
          ) : (
            <Package className="h-5 w-5" style={{ color: rarityColor }} />
          )}
          {/* Top-right rarity gem */}
          {!locked && (
            <div
              className="absolute -top-1 -right-1 h-3 w-3 rounded-full border border-black/40 z-10"
              style={{ background: isUltra ? "linear-gradient(135deg,#e879f9,#818cf8)" : rarityColor, boxShadow: `0 0 5px ${rarityColor}` }}
            />
          )}
        </motion.div>
        <p className="text-[9px] font-black text-center leading-tight max-w-[52px] truncate" style={{ color: locked ? "rgba(255,255,255,0.2)" : rarityColor }}>
          {isRandom ? (typeLabel ?? "Item") : (typeLabel ?? tier.rewardItemType ?? "Item")}
        </p>
      </div>
    );
  }

  // ── Badge ─────────────────────────────────────────────────────────────────────
  if (tier.rewardType === "badge") {
    return (
      <div className="flex flex-col items-center gap-1" style={baseStyle}>
        <motion.div
          className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-amber-400/60"
          style={{ background: "radial-gradient(circle, rgba(245,158,11,0.2) 0%, transparent 70%)" }}
          animate={animated && !locked ? { boxShadow: ["0 0 8px rgba(245,158,11,0.3)", "0 0 22px rgba(245,158,11,0.6)", "0 0 8px rgba(245,158,11,0.3)"] } : {}}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Trophy className="h-5 w-5 text-amber-400" />
        </motion.div>
        {tier.rewardBadgeText && (
          <p className="text-[9px] font-black text-amber-300 text-center leading-tight max-w-[52px] truncate">
            {tier.rewardBadgeText}
          </p>
        )}
      </div>
    );
  }

  // ── XP Boost ──────────────────────────────────────────────────────────────────
  if (tier.rewardType === "xp_boost") {
    const days = tier.rewardXpBoost ?? 1;
    return (
      <div className="flex flex-col items-center gap-1" style={baseStyle}>
        <motion.div
          className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-sky-400/60"
          style={{ background: "radial-gradient(circle, rgba(56,189,248,0.18) 0%, transparent 70%)" }}
          animate={animated && !locked ? { boxShadow: ["0 0 8px rgba(56,189,248,0.3)", "0 0 22px rgba(56,189,248,0.7)", "0 0 8px rgba(56,189,248,0.3)"] } : {}}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <Zap className="h-5 w-5 text-sky-400" />
        </motion.div>
        <p className="text-[10px] font-black text-sky-300">+{days}d</p>
      </div>
    );
  }

  // ── Name Style ────────────────────────────────────────────────────────────────
  if (tier.rewardType === "name_style") {
    return (
      <div className="flex flex-col items-center gap-1" style={baseStyle}>
        <motion.div
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20"
          style={{ background: `radial-gradient(circle, ${trackColor}25 0%, transparent 70%)` }}
          animate={animated && !locked ? { boxShadow: [`0 0 8px ${trackColor}40`, `0 0 20px ${trackColor}70`, `0 0 8px ${trackColor}40`] } : {}}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Palette className="h-5 w-5" style={{ color: trackColor }} />
        </motion.div>
        <p className="text-[9px] font-black leading-tight max-w-[52px] truncate text-center" style={{ color: trackColor }}>
          Style
        </p>
      </div>
    );
  }

  // ── Ability ───────────────────────────────────────────────────────────────────
  if (tier.rewardType === "ability") {
    return (
      <div className="flex flex-col items-center gap-1" style={baseStyle}>
        <motion.div
          className="relative flex h-10 w-10 items-center justify-center rounded-xl border-2 border-purple-500/60"
          style={{ background: "radial-gradient(circle, rgba(168,85,247,0.2) 0%, transparent 70%)" }}
          animate={animated && !locked ? { boxShadow: ["0 0 8px rgba(168,85,247,0.3)", "0 0 24px rgba(168,85,247,0.7)", "0 0 8px rgba(168,85,247,0.3)"] } : {}}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Zap className="h-5 w-5 text-purple-400" />
          {animated && !locked && (
            <motion.div
              className="absolute inset-0 rounded-xl border-2 border-purple-400/30"
              animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </motion.div>
        <p className="text-[9px] font-black text-purple-300 text-center leading-tight max-w-[52px] truncate">
          {tier.rewardAbilityName ?? "Fähigkeits-Gutschein"}
        </p>
      </div>
    );
  }

  // ── Generic fallback (animated glowing gem) ───────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-1" style={baseStyle}>
      <motion.div
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20"
        style={{ background: `radial-gradient(circle, ${trackColor}20 0%, transparent 70%)` }}
        animate={animated && !locked ? { boxShadow: [`0 0 8px ${trackColor}30`, `0 0 20px ${trackColor}60`, `0 0 8px ${trackColor}30`] } : {}}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <Gem className="h-5 w-5" style={{ color: trackColor }} />
      </motion.div>
    </div>
  );
}

// ── Visual reward preview ─────────────────────────────────────────────────────

function RewardPreviewCard({ tier, accent, glow }: { tier: BattlePassTier; accent: string; glow: string }) {
  const rarity = tier.rewardItemRarity ?? "normal";
  const rarityColor = RARITY_COLORS[rarity] ?? "#94a3b8";
  const rarityGlow = RARITY_GLOWS[rarity] ?? "rgba(148,163,184,0.25)";

  if (tier.rewardType === "credits") {
    const amount = (tier.rewardCredits ?? 0) * (tier.rewardQuantity ?? 1);
    return (
      <div className="flex flex-col items-center gap-4">
        {/* Explicit 80px height prevents coins from being clipped at the top */}
        <div className="relative" style={{ width: 80, height: 80 }}>
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                width: 56 + i * 4,
                height: 56 + i * 4,
                bottom: i * 3,
                left: `calc(50% - ${(56 + i * 4) / 2}px)`,
                background: `radial-gradient(circle at 35% 35%, #fef3c7, #fde68a, #f59e0b, #78350f)`,
                boxShadow: `0 0 ${10 + i * 10}px rgba(245,158,11,${0.35 + i * 0.12}), inset 0 -2px 4px rgba(0,0,0,0.3)`,
                zIndex: 3 - i,
              }}
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 2 + i * 0.5, repeat: Infinity, delay: i * 0.3, ease: "easeInOut" }}
            />
          ))}
          <span className="absolute left-1/2 bottom-2.5 -translate-x-1/2 z-10 text-2xl">💰</span>
        </div>
        <div className="text-center">
          <p className="text-3xl font-black text-amber-300 tabular-nums">{amount.toLocaleString("de-DE")}</p>
          <p className="text-xs text-white/40 font-bold">Credits</p>
        </div>
      </div>
    );
  }

  if (tier.rewardType === "item" || tier.rewardType === "random_item") {
    const isRandom = tier.rewardType === "random_item";
    // Build a preview item when we have the required data (non-random items with name+type)
    const previewItem: ItemForPreview | null =
      !isRandom && tier.rewardItemName && tier.rewardItemType
        ? {
            id: tier.rewardItemId ?? tier.id,
            name: tier.rewardItemName,
            rarity: tier.rewardItemRarity ?? "normal",
            type: tier.rewardItemType,
          }
        : null;

    return (
      <div className="flex w-full flex-col items-center gap-3">
        {previewItem ? (
          // 3D isolated item preview — shows just the item, no character
          <motion.div
            className="relative w-full overflow-hidden rounded-2xl border-2"
            style={{
              borderColor: rarityColor,
              boxShadow: `0 0 40px ${rarityGlow}, inset 0 0 20px ${rarityColor}10`,
              height: 180,
              maxWidth: 220,
            }}
            animate={{
              boxShadow: [
                `0 0 30px ${rarityGlow}`,
                `0 0 60px ${rarityGlow}`,
                `0 0 30px ${rarityGlow}`,
              ],
            }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          >
            {/* Ambient background glow behind the canvas */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: `radial-gradient(circle at 50% 60%, ${rarityColor}20 0%, transparent 70%)`,
              }}
            />
            <ItemStandaloneCanvas item={previewItem} height={180} />
            {/* Corner rarity gem */}
            <div
              className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full border border-black/50 z-10"
              style={{ background: rarityColor, boxShadow: `0 0 8px ${rarityColor}` }}
            />
          </motion.div>
        ) : (
          // Fallback: animated emoji box (random items or missing item data)
          <motion.div
            className="relative flex h-24 w-24 items-center justify-center rounded-2xl border-2"
            style={{
              borderColor: rarityColor,
              background: `radial-gradient(circle at 50% 30%, ${rarityColor}20 0%, transparent 70%)`,
              boxShadow: `0 0 40px ${rarityGlow}, inset 0 0 20px ${rarityColor}10`,
            }}
            animate={{ boxShadow: [`0 0 30px ${rarityGlow}`, `0 0 60px ${rarityGlow}`, `0 0 30px ${rarityGlow}`] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          >
            {isRandom ? (
              <motion.span
                className="text-4xl"
                animate={{ rotateY: [0, 180, 360] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                🎲
              </motion.span>
            ) : (
              <span className="text-4xl">{tier.icon ?? "🎁"}</span>
            )}
            <div
              className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full border border-black/50"
              style={{ background: rarityColor, boxShadow: `0 0 8px ${rarityColor}` }}
            />
          </motion.div>
        )}

        <div className="text-center">
          <p className="text-sm font-black text-white">
            {isRandom
              ? `Zufällig${tier.rewardItemRarity ? ` · ${tier.rewardItemRarity}` : ""}`
              : (tier.rewardItemName ?? tier.name)}
          </p>
          {tier.rewardItemRarity && (
            <span
              className="mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest"
              style={{ background: `${rarityColor}20`, color: rarityColor, border: `1px solid ${rarityColor}40` }}
            >
              {tier.rewardItemRarity}
            </span>
          )}
          {tier.rewardQuantity > 1 && (
            <p className="mt-1 text-xs text-white/40">×{tier.rewardQuantity}</p>
          )}
        </div>
      </div>
    );
  }

  if (tier.rewardType === "badge") {
    const badgeStyle = tier.rewardBadgeKey ? getBadgeStyle(tier.rewardBadgeKey) : null;
    const badgeColor = badgeStyle?.glow ?? "#f59e0b";
    return (
      <div className="flex flex-col items-center gap-4">
        <motion.div
          className="relative flex h-20 w-20 items-center justify-center rounded-2xl border-2"
          style={{
            borderColor: `${badgeColor}60`,
            background: `radial-gradient(circle, ${badgeColor}15 0%, transparent 70%)`,
          }}
          animate={{ boxShadow: [`0 0 20px ${badgeColor}30`, `0 0 50px ${badgeColor}50`, `0 0 20px ${badgeColor}30`] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Trophy className="h-10 w-10" style={{ color: badgeColor }} />
          <motion.div
            className="absolute inset-0 rounded-2xl"
            animate={{ opacity: [0, 0.4, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            style={{ background: `radial-gradient(circle, ${badgeColor}30 0%, transparent 70%)` }}
          />
        </motion.div>
        {tier.rewardBadgeText && (
          <span
            className="rounded-xl border px-4 py-1.5 text-xs font-black"
            style={
              badgeStyle
                ? { background: badgeStyle.bg, color: badgeStyle.text, border: `1px solid ${badgeStyle.border}`, boxShadow: `0 0 16px ${badgeColor}40` }
                : { borderColor: `${badgeColor}40`, color: badgeColor, background: `${badgeColor}15` }
            }
          >
            {tier.rewardBadgeText}
          </span>
        )}
      </div>
    );
  }

  if (tier.rewardType === "xp_boost") {
    const days = tier.rewardXpBoost ?? 1;
    return (
      <div className="flex flex-col items-center gap-4">
        <motion.div
          className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-sky-400/60"
          style={{ background: "radial-gradient(circle, rgba(56,189,248,0.2) 0%, transparent 70%)" }}
          animate={{ boxShadow: ["0 0 20px rgba(56,189,248,0.3)", "0 0 50px rgba(56,189,248,0.6)", "0 0 20px rgba(56,189,248,0.3)"] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <Zap className="h-10 w-10 text-sky-400" />
        </motion.div>
        <div className="text-center">
          <p className="text-3xl font-black text-sky-300">+{days}</p>
          <p className="text-xs text-white/40">{days === 1 ? "Fortschrittstag" : "Fortschrittstage"}</p>
        </div>
      </div>
    );
  }

  if (tier.rewardType === "name_style" && tier.rewardNameStyleKey) {
    return (
      <div className="flex flex-col items-center gap-4">
        <motion.div
          className="flex h-20 w-full max-w-[240px] items-center justify-center rounded-2xl border border-white/10 bg-black/40 backdrop-blur-sm px-4"
          animate={{ boxShadow: [`0 0 20px ${accent}20`, `0 0 40px ${accent}40`, `0 0 20px ${accent}20`] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <StyledUsername name="DeinName" styleKey={tier.rewardNameStyleKey} size="md" staticMode={false} />
        </motion.div>
        <div className="text-center">
          <p className="text-xs text-white/40">Name Style</p>
          <p className="text-sm font-black" style={{ color: accent }}>{tier.rewardNameStyleKey}</p>
        </div>
      </div>
    );
  }

  if (tier.rewardType === "ability") {
    return (
      <div className="flex flex-col items-center gap-4">
        <motion.div
          className="relative flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-purple-500/60"
          style={{ background: "radial-gradient(circle, rgba(168,85,247,0.2) 0%, transparent 70%)" }}
          animate={{ boxShadow: ["0 0 20px rgba(168,85,247,0.3)", "0 0 60px rgba(168,85,247,0.6)", "0 0 20px rgba(168,85,247,0.3)"] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Zap className="h-10 w-10 text-purple-400" />
          <motion.div
            className="absolute inset-0 rounded-2xl border-2 border-purple-400/40"
            animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>
        <div className="text-center">
          <p className="text-sm font-black text-purple-300">{tier.rewardAbilityName ?? tier.name}</p>
          <p className="text-xs text-white/40">Fähigkeits-Gutschein</p>
        </div>
      </div>
    );
  }

  // Generic fallback
  return (
    <div className="flex flex-col items-center gap-3">
      <motion.span
        className="text-6xl"
        animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        {rewardIcon(tier)}
      </motion.span>
    </div>
  );
}

// ── Quest panel ───────────────────────────────────────────────────────────────

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "#34d399",
  medium: "#60a5fa",
  hard: "#f59e0b",
  legendary: "#e879f9",
};

const FREQ_LABELS: Record<string, string> = {
  daily: "Täglich",
  weekly: "Wöchentlich",
  seasonal: "Saisonal",
  once: "Einmalig",
};

function QuestCard({ quest, accent }: { quest: BpQuestWithProgress; accent: string }) {
  const progress = quest.progress;
  const current = progress?.currentValue ?? 0;
  const total = quest.targetValue;
  const pct = Math.min(100, Math.round((current / total) * 100));
  const completed = progress?.completed ?? false;
  const diffColor = DIFFICULTY_COLORS[quest.difficulty] ?? "#60a5fa";

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="relative rounded-xl border p-3.5 transition-colors"
      style={
        completed
          ? { borderColor: "rgba(52,211,153,0.3)", background: "rgba(52,211,153,0.04)" }
          : { borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.01)" }
      }
    >
      {completed && (
        <div className="absolute inset-0 rounded-xl pointer-events-none"
          style={{ background: "linear-gradient(135deg, rgba(52,211,153,0.06) 0%, transparent 60%)" }} />
      )}
      <div className="flex items-start gap-3">
        <div className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg"
          style={{ background: `${diffColor}15`, border: `1px solid ${diffColor}30` }}>
          <span>{quest.icon}</span>
          {completed && (
            <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500">
              <CheckCircle2 className="h-2.5 w-2.5 text-white" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className={`text-xs font-black leading-tight ${completed ? "text-emerald-400" : "text-zinc-100"}`}>
              {quest.label}
            </p>
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black"
              style={{ background: `${diffColor}20`, color: diffColor }}>
              {quest.bpXpReward} XP
            </span>
          </div>
          {quest.description && (
            <p className="mt-0.5 text-[10px] text-white/35 leading-snug">{quest.description}</p>
          )}
          {/* Progress bar */}
          <div className="mt-2 space-y-1">
            <div className="relative h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="absolute inset-y-0 left-0 rounded-full"
                style={
                  completed
                    ? { background: "#34d399" }
                    : { background: `linear-gradient(90deg, ${accent} 0%, ${accent}cc 100%)` }
                }
              />
            </div>
            <div className="flex justify-between text-[9px]">
              <span className="text-white/30">{FREQ_LABELS[quest.frequency] ?? quest.frequency}</span>
              <span className="font-bold tabular-nums" style={{ color: completed ? "#34d399" : `${accent}90` }}>
                {current.toLocaleString("de-DE")} / {total.toLocaleString("de-DE")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function QuestPanel({ passId, accent, glow }: { passId: string; accent: string; glow: string }) {
  const [quests, setQuests] = useState<BpQuestWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let active = true;
    getBpQuestsWithProgress(passId).then((q) => {
      if (active) { setQuests(q); setLoading(false); }
    });
    return () => { active = false; };
  }, [passId]);

  if (!loading && quests.length === 0) return null;

  const completed = quests.filter((q) => q.progress?.completed).length;
  const totalXp = quests.reduce((sum, q) => sum + (q.progress?.bpXpAwarded ? q.bpXpReward : 0), 0);
  const availableXp = quests.reduce((sum, q) => sum + q.bpXpReward, 0);

  const byFreq: Record<string, BpQuestWithProgress[]> = {};
  for (const q of quests) {
    if (!byFreq[q.frequency]) byFreq[q.frequency] = [];
    byFreq[q.frequency].push(q);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="rounded-2xl border border-white/[0.07] bg-white/[0.01] overflow-hidden"
      style={{ boxShadow: `0 0 40px ${glow}08` }}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between gap-3 p-5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: `${accent}15`, border: `1px solid ${accent}30` }}>
            <Target className="h-4 w-4" style={{ color: accent }} />
          </div>
          <div className="text-left">
            <p className="text-sm font-black text-zinc-100">Aufgaben</p>
            <p className="text-[10px] text-white/35">
              {loading ? "Lade…" : `${completed}/${quests.length} erledigt · ${totalXp.toLocaleString("de-DE")} / ${availableXp.toLocaleString("de-DE")} BP-XP`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!loading && (
            <div className="flex gap-1">
              {quests.filter((q) => q.progress?.completed).length > 0 && (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black text-emerald-400">
                  {completed} ✓
                </span>
              )}
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-bold text-white/40">
                {quests.length - completed} offen
              </span>
            </div>
          )}
          {collapsed ? <ChevronDown className="h-4 w-4 text-white/30" /> : <ChevronUp className="h-4 w-4 text-white/30" />}
        </div>
      </button>

      {/* Content */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-5">
              {loading ? (
                <div className="py-4 text-center text-xs text-white/30">Lade Aufgaben…</div>
              ) : (
                Object.entries(byFreq).map(([freq, qs]) => (
                  <div key={freq} className="space-y-2">
                    <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/25">
                      <span>{freq === "daily" ? "🔁" : freq === "weekly" ? "📅" : "⭐"}</span>
                      {FREQ_LABELS[freq] ?? freq}
                    </p>
                    {qs.map((q) => <QuestCard key={q.id} quest={q} accent={accent} />)}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── XP progression bar ────────────────────────────────────────────────────────

function XpProgressBar({ bpXp, bpXpPerTier, tierCount, accent, glow }: {
  bpXp: number;
  bpXpPerTier: number;
  tierCount: number;
  accent: string;
  glow: string;
}) {
  const totalXpNeeded = bpXpPerTier * tierCount;
  const currentTier = Math.min(tierCount, Math.floor(bpXp / bpXpPerTier));
  const tierProgress = bpXp % bpXpPerTier;
  const pct = Math.min(100, Math.round((tierProgress / bpXpPerTier) * 100));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/40 font-semibold">BP-XP Fortschritt</span>
        <span className="font-black tabular-nums" style={{ color: accent }}>
          {bpXp.toLocaleString("de-DE")} / {totalXpNeeded.toLocaleString("de-DE")} XP
        </span>
      </div>
      <div className="relative h-4 rounded-full bg-white/[0.04] overflow-hidden border border-white/[0.06]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: `linear-gradient(90deg, ${accent} 0%, ${accent}cc 100%)`, boxShadow: `0 0 12px ${glow}` }}
        />
        <motion.div
          className="absolute inset-y-0 w-20 rounded-full pointer-events-none"
          animate={{ left: ["-15%", "110%"] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.5 }}
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)" }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-white/70">
          Level {currentTier} · +{(bpXpPerTier - tierProgress).toLocaleString("de-DE")} XP bis Level {currentTier + 1}
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-white/25">
        <span>Level {currentTier} / {tierCount}</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}

// ── Countdown timer ───────────────────────────────────────────────────────────

function Countdown({ endDate }: { endDate: string }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    function calc() {
      const diff = new Date(endDate).getTime() - Date.now();
      if (diff <= 0) { setRemaining("Abgelaufen"); return; }
      const d = Math.floor(diff / 86_400_000);
      const h = Math.floor((diff % 86_400_000) / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      if (d > 0) setRemaining(`${d}T ${h}Std`);
      else setRemaining(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
    }
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [endDate]);

  return <span className="tabular-nums">{remaining}</span>;
}

// ── Particle field ────────────────────────────────────────────────────────────

function ParticleField({ accent, count = 40 }: { accent: string; count?: number }) {
  const particles = Array.from({ length: count }, (_, i) => ({
    id: i,
    x: (i / count) * 100,
    y: Math.sin(i * 2.3) * 40 + 50,
    size: 1 + (i % 3) * 1.2,
    dur: 4 + (i % 4) * 2,
    delay: -(i % 6),
    drift: Math.cos(i * 1.7) * 25,
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
            boxShadow: `0 0 ${p.size * 3}px ${accent}`,
          }}
          animate={{ y: [0, -50, 0], x: [0, p.drift, 0], opacity: [0, 0.9, 0], scale: [0.5, 1.3, 0.5] }}
          transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ── Horizontal track card ─────────────────────────────────────────────────────

function TrackTileCard({
  tier, state, accent, glow, trackColor, onClaim, claiming, isSelected, onClick,
  visualConfig, onDirectPreview, fillWidth, viewIndex, scrollRootRef,
}: {
  tier: BattlePassTier;
  state: TierState;
  accent: string;
  glow: string;
  trackColor: string;
  onClaim: (id: string) => void;
  claiming: boolean;
  isSelected: boolean;
  onClick: () => void;
  visualConfig: BpVisualConfig;
  onDirectPreview?: (subject: PreviewSubject) => void;
  fillWidth?: boolean;
  viewIndex: number;
  /** Scroll container — only tiles inside it render live 3D (perf + no overflow). */
  scrollRootRef?: React.RefObject<HTMLElement | null>;
}) {
  const isClaimed = state === "claimed";
  const isAvailable = state === "available";
  const isLocked = state === "locked";
  const isMilestone = tier.highlightTier;
  const displayMode = tier.displayMode ?? "auto";
  const previewSubject = tierToPreviewSubject(tier);
  const hasDirectPreview = displayMode === "3d" && previewSubject !== null && onDirectPreview;
  const tileScale = visualConfig.tileScale ?? 1.0;
  const showAnimations = visualConfig.showTileAnimations ?? true;
  const rarity = tier.rewardItemRarity ?? "normal";
  const rarityOverride = visualConfig.rarityColorOverrides?.[rarity];
  const effectiveTrackColor = rarityOverride ?? trackColor;
  const tileW = isMilestone ? (visualConfig.milestoneTileWidth ?? 172) : (visualConfig.normalTileWidth ?? 140);
  const tileH = isMilestone ? (visualConfig.milestoneTileHeight ?? 284) : (visualConfig.normalTileHeight ?? 228);
  const glassOpacity = visualConfig.glassmorphismIntensity ?? 0.5;
  const milestoneGlow = visualConfig.milestoneGlowIntensity ?? 0.6;
  const previewH = Math.max(72, tileH - 116);

  // 3D tilt effect
  const cardRef = useRef<HTMLDivElement>(null);
  const rotX = useMotionValue(0);
  const rotY = useMotionValue(0);
  const springRotX = useSpring(rotX, { stiffness: 220, damping: 22 });
  const springRotY = useSpring(rotY, { stiffness: 220, damping: 22 });

  // In a horizontal carousel (the Season-Road, where scrollRootRef is set) the
  // tile must NOT carry a live transform or backdrop-filter: each of those puts
  // the tile on its own GPU compositor layer, and the fixed full-viewport WebGL
  // canvas (which scissors each <View> to the tile's rect) cannot stay welded to
  // a separately-composited layer during fast scroll → the 3D model visibly
  // drifts/lags out of the tile. The Cases reel avoids this by using no
  // transform wrapper; we do the same here. The 3D stays welded to the tile.
  const weldToCanvas = !!scrollRootRef;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (weldToCanvas || !(visualConfig.enableTiltEffect ?? true) || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    rotX.set(-y * 14);
    rotY.set(x * 14);
  };
  const handleMouseLeave = () => { rotX.set(0); rotY.set(0); };

  // Cull off-screen tiles: the shared full-viewport Canvas scissors each <View> to the
  // tile's DOM rect and ignores the carousel's overflow clip → tiles scrolled out of the
  // carousel would otherwise render their 3D across the whole page. CaseDropView self-culls
  // (lazy + rootRef); BpRewardView3D (coins/dice/etc.) did NOT → leaked. Gate it on view.
  // Deterministisches Culling: 3D rendert NUR wenn die Kachel zu ≥82% im Scroll-Container liegt.
  // Rand-Kacheln (teilweise rausgescrollt) zeigen kein 3D → kein Überstand/Leck, kein "Nachfliegen".
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = cardRef.current;
    const root = scrollRootRef?.current;
    if (!el || !root) return;
    // SYNCHRONOUS cull on the scroll event (NOT IntersectionObserver). IO is async
    // and lags a smooth/arrow scroll by several frames, during which a tile sliding
    // out keeps drawing its 3D on the shared full-viewport canvas at its now
    // off-container position → the "models fly out of the box before they vanish".
    // Comparing rects on every scroll event culls the 3D the instant the tile is
    // less than ~78% inside the carousel — no lag, no fly-out. rAF-coalesced.
    let raf = 0;
    const compute = () => {
      raf = 0;
      const er = el.getBoundingClientRect();
      const rr = root.getBoundingClientRect();
      if (er.width <= 0) { setInView(false); return; }
      // GENEROUS perf gate only: mount/render the View whenever the tile is even
      // slightly visible, so no visible card is ever blank. The PRECISE, lag-free
      // hide is done per-frame inside <ClipToCarousel> (useFrame) — that's what
      // guarantees nothing ever pokes past the rail.
      const overlap = Math.max(0, Math.min(er.right, rr.right) - Math.max(er.left, rr.left));
      setInView(overlap > 0);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(compute); };
    compute();
    root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      root.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [scrollRootRef]);

  // Track type detection for richer visual treatment
  const isPremiumTier = tier.isPremium;

  // Border style — stronger glow for milestone + premium available tiles
  const borderStyle = isSelected
    ? {
        borderColor: effectiveTrackColor,
        boxShadow: `0 0 0 2px ${effectiveTrackColor}, 0 0 60px ${glow}, inset 0 0 20px ${effectiveTrackColor}12, inset 0 0 0 1px ${effectiveTrackColor}50`,
      }
    : isAvailable
      ? isMilestone
        ? {
            borderColor: `${effectiveTrackColor}90`,
            boxShadow: `0 0 ${Math.round(milestoneGlow * 80)}px ${glow}, 0 8px 40px ${glow}60, inset 0 0 30px ${effectiveTrackColor}12, inset 0 0 0 1px ${effectiveTrackColor}30`,
          }
        : isPremiumTier
          ? {
              borderColor: `${effectiveTrackColor}80`,
              boxShadow: `0 6px 40px ${glow}60, 0 0 24px ${glow}30, inset 0 0 16px ${effectiveTrackColor}10, inset 0 0 0 1px ${effectiveTrackColor}25`,
            }
          : { borderColor: `${effectiveTrackColor}60`, boxShadow: `0 6px 28px ${glow}40, inset 0 0 0 1px ${effectiveTrackColor}18` }
      : isClaimed
        ? { borderColor: "rgba(52,211,153,0.28)", boxShadow: "0 3px 16px rgba(52,211,153,0.10), inset 0 0 0 1px rgba(52,211,153,0.10)" }
        : { borderColor: "rgba(255,255,255,0.05)", boxShadow: "none" };

  // Richer glass gradient for premium
  const bgStyle = isAvailable
    ? isMilestone
      ? `linear-gradient(170deg, ${effectiveTrackColor}30 0%, ${effectiveTrackColor}10 45%, rgba(0,0,0,0.50) 100%)`
      : isPremiumTier
        ? `linear-gradient(170deg, ${effectiveTrackColor}26 0%, ${effectiveTrackColor}0c 50%, rgba(0,0,0,0.55) 100%)`
        : `linear-gradient(170deg, ${effectiveTrackColor}1c 0%, ${effectiveTrackColor}08 55%, rgba(0,0,0,0.55) 100%)`
    : isClaimed
      ? "linear-gradient(170deg, rgba(52,211,153,0.08) 0%, rgba(0,0,0,0.55) 100%)"
      : "linear-gradient(170deg, rgba(255,255,255,0.025) 0%, rgba(0,0,0,0.65) 100%)";

  const handleTileClick = () => {
    if (hasDirectPreview) {
      onDirectPreview(previewSubject!);
    } else {
      onClick();
    }
  };

  const tooltipName = tier.rewardItemName ?? (tier.rewardType === "credits" ? null : tier.name);
  const tooltipRarity = tier.rewardItemRarity;
  const tooltipTrack = tier.isPremium ? "Premium" : "Free";

  return (
    <motion.div
      ref={cardRef}
      onClick={handleTileClick}
      whileTap={weldToCanvas ? undefined : { scale: 0.95 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        // Welded mode (carousel): no transform / no backdrop-filter → the tile
        // stays on the main compositor layer so the WebGL 3D tracks it exactly.
        ...(weldToCanvas
          ? {}
          : {
              rotateX: springRotX,
              rotateY: springRotY,
              transformPerspective: 900,
              backdropFilter: glassOpacity > 0 ? `blur(${Math.round(glassOpacity * 12)}px)` : undefined,
              WebkitBackdropFilter: glassOpacity > 0 ? `blur(${Math.round(glassOpacity * 12)}px)` : undefined,
            }),
        width: fillWidth ? undefined : tileW,
        height: tileH,
        flexShrink: 0,
        ...borderStyle,
        background: bgStyle,
      }}
      className={`group/tile relative cursor-pointer rounded-3xl border transition-colors duration-200 ${fillWidth ? "w-full" : ""}`}
    >
      {/* ── Hover tooltip ── */}
      <div className="pointer-events-none absolute inset-x-0 bottom-full mb-2 z-[60] flex justify-center opacity-0 group-hover/tile:opacity-100 transition-opacity duration-150">
        <div className="w-max max-w-[160px] rounded-xl border border-white/15 bg-zinc-950/98 px-3 py-2 text-center shadow-2xl backdrop-blur-md">
          {tooltipName && <p className="text-[11px] font-black text-white leading-tight">{tooltipName}</p>}
          {tooltipRarity && (
            <p className="text-[9px] font-bold capitalize mt-0.5" style={{ color: RARITY_COLORS[tooltipRarity] }}>
              {tooltipRarity}
            </p>
          )}
          <p className="text-[9px] text-white/40 mt-0.5">{tooltipTrack} · Level {tier.tierNumber}</p>
          {displayMode === "3d" && (
            <p className="text-[9px] text-purple-300 mt-1">✦ 3D Live-Vorschau</p>
          )}
        </div>
      </div>
      {/* ── Isolated overflow layer for ALL decorative animations ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
        {/* Milestone top shine bar */}
        {isMilestone && (
          <>
            <div
              className="absolute top-0 inset-x-0 h-[3px]"
              style={{ background: `linear-gradient(90deg, transparent, ${effectiveTrackColor}cc, #ffffffaa, ${effectiveTrackColor}cc, transparent)` }}
            />
            <motion.div
              className="absolute top-0 inset-x-0 h-[3px]"
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              style={{ background: `linear-gradient(90deg, transparent, #ffffff99, transparent)` }}
            />
            {/* Radial crown glow at top */}
            <motion.div
              className="absolute -top-6 inset-x-0 h-24"
              animate={{ opacity: [milestoneGlow * 0.3, milestoneGlow * 0.8, milestoneGlow * 0.3] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              style={{ background: `radial-gradient(ellipse at 50% 0%, ${effectiveTrackColor}80 0%, transparent 70%)` }}
            />
            {/* Bottom inner glow */}
            <div
              className="absolute bottom-0 inset-x-0 h-16"
              style={{ background: `linear-gradient(0deg, ${effectiveTrackColor}10 0%, transparent 100%)` }}
            />
          </>
        )}

        {/* Shimmer on available */}
        {isAvailable && showAnimations && (
          <>
            <motion.div
              className="absolute inset-0"
              animate={{ opacity: [0, isPremiumTier ? 0.8 : 0.6, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              style={{ background: `linear-gradient(135deg, ${effectiveTrackColor}${isPremiumTier ? "38" : "28"}, transparent 55%)` }}
            />
            {/* Diagonal scan line */}
            <motion.div
              className="absolute left-0 right-0 h-10"
              animate={{ top: ["-10%", "110%"] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", repeatDelay: 2 }}
              style={{ background: `linear-gradient(180deg, transparent, ${effectiveTrackColor}${isPremiumTier ? "38" : "28"}, transparent)` }}
            />
            {/* Corner light flare */}
            <motion.div
              className="absolute -top-2 -right-2 h-12 w-12"
              animate={{ opacity: [0, isPremiumTier ? 0.85 : 0.6, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
              style={{ background: `radial-gradient(circle at top right, ${effectiveTrackColor}80, transparent 65%)` }}
            />
            {/* Premium: radial pulse from center */}
            {isPremiumTier && (
              <motion.div
                className="absolute inset-0 rounded-3xl"
                animate={{ opacity: [0, 0.35, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
                style={{ background: `radial-gradient(ellipse at 50% 40%, ${effectiveTrackColor}50 0%, transparent 65%)` }}
              />
            )}
          </>
        )}

        {/* Claimed check overlay */}
        {isClaimed && (
          <div
            className="absolute inset-0"
            style={{ background: "radial-gradient(circle at 50% 45%, rgba(52,211,153,0.08) 0%, transparent 65%)" }}
          />
        )}

        {/* Locked frost overlay */}
        {isLocked && (
          <div className="absolute inset-0 bg-black/40" />
        )}
      </div>

      {/* ── Content (NO overflow restriction — allows scale to breathe) ── */}
      <div
        className={`relative z-10 flex h-full flex-col items-center text-center ${isMilestone ? "p-3 pt-9" : "p-3"}`}
        style={{ justifyContent: "space-between" }}
      >
        {/* Tier number + milestone label */}
        <div className="flex flex-col items-center gap-1.5 w-full">
          {isMilestone && (
            <span
              className="rounded-full px-2.5 py-0.5 text-[7px] font-black uppercase tracking-[0.18em]"
              style={{ background: `${effectiveTrackColor}22`, color: effectiveTrackColor, border: `1px solid ${effectiveTrackColor}55` }}
            >
              ✦ MILESTONE
            </span>
          )}
          <div
            className={`flex items-center justify-center rounded-full font-black tabular-nums ${isMilestone ? "h-7 w-7 text-[11px]" : "h-5 w-5 text-[9px]"}`}
            style={
              isClaimed
                ? { background: "rgba(52,211,153,0.22)", color: "#34d399", border: "1px solid rgba(52,211,153,0.40)" }
                : isAvailable
                  ? { background: `${effectiveTrackColor}28`, color: effectiveTrackColor, border: `1px solid ${effectiveTrackColor}60` }
                  : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.22)", border: "1px solid rgba(255,255,255,0.08)" }
            }
          >
            {isClaimed ? <CheckCircle2 className={isMilestone ? "h-4 w-4" : "h-3 w-3"} /> : tier.tierNumber}
          </div>
        </div>

        {/* Preview area — 3D View or CSS fallback */}
        {(() => {
          const use3D = displayMode === "3d" || displayMode === "auto";
          const hasItemFor3D = tier.rewardType === "item" && !!tier.rewardItemName && !!tier.rewardItemType;
          // All non-item reward types have a 3D geometry in BpRewardView3D
          const hasRewardFor3D = tier.rewardType !== "item";

          if (use3D && (hasItemFor3D || hasRewardFor3D)) {
            return (
              <div
                className="relative flex-1 min-h-0 w-full"
                style={{ height: previewH, minHeight: previewH }}
              >
                {hasItemFor3D ? (
                  <CaseDropView
                    subject={{
                      kind: "item",
                      item: {
                        id: tier.rewardItemId ?? tier.id,
                        name: tier.rewardItemName!,
                        rarity: (tier.rewardItemRarity ?? "normal") as Rarity,
                        type: tier.rewardItemType!,
                      },
                    }}
                    viewIndex={viewIndex}
                    visible={inView}
                    character={WORN_TYPES.has(tier.rewardItemType!)}
                    lazy
                    rootRef={scrollRootRef}
                    fallbackColor={effectiveTrackColor}
                    clipTileRef={cardRef}
                    clipRootRef={scrollRootRef}
                  />
                ) : (
                  <BpRewardView3D
                    rewardType={tier.rewardType}
                    rarity={tier.rewardItemRarity ?? "normal"}
                    creditsAmount={(tier.rewardCredits ?? 0) * (tier.rewardQuantity ?? 1)}
                    game={tier.rewardGameBonusGame ?? undefined}
                    viewIndex={viewIndex}
                    visible={inView}
                    clipTileRef={cardRef}
                    clipRootRef={scrollRootRef}
                  />
                )}
              </div>
            );
          }

          return (
            <div
              className="flex items-center justify-center flex-1 min-h-0"
              style={{ height: previewH }}
            >
              <TileMiniPreview
                tier={tier}
                trackColor={effectiveTrackColor}
                locked={isLocked}
                animated={showAnimations && isAvailable}
                scale={tileScale}
                offsetX={visualConfig.tileOffsetX ?? 0}
                offsetY={visualConfig.tileOffsetY ?? 0}
              />
            </div>
          );
        })()}

        {/* Name + reward label */}
        <div className="w-full">
          {tier.showTierName !== false && (
            <p
              className={`font-black leading-tight text-white ${isMilestone ? "text-[11px]" : "text-[10px]"}`}
              style={{ opacity: isLocked ? 0.22 : 1 }}
            >
              {tier.name}
            </p>
          )}
          <div className="flex items-center gap-1">
            <p
              className={`mt-0.5 font-bold leading-tight truncate flex-1 ${isMilestone ? "text-[10px]" : "text-[9px]"}`}
              style={
                isClaimed ? { color: "#34d39970" }
                  : isAvailable ? { color: `${effectiveTrackColor}cc` }
                    : { color: "rgba(255,255,255,0.18)" }
              }
              title={rewardLabel(tier)}
            >
              {rewardLabel(tier)}
            </p>
            {/* 3D-mode indicator badge */}
            {displayMode === "3d" && !isLocked && (
              <span
                className="shrink-0 rounded-full px-1 text-[7px] font-black uppercase tracking-widest"
                style={{ background: `${effectiveTrackColor}25`, color: effectiveTrackColor, border: `1px solid ${effectiveTrackColor}50` }}
              >
                3D
              </span>
            )}
          </div>
        </div>

        {/* Claim button */}
        {isAvailable && (
          <motion.button
            whileTap={{ scale: 0.87 }}
            disabled={claiming}
            onClick={(e) => { e.stopPropagation(); if (!claiming) onClaim(tier.id); }}
            className={`mt-2 w-full rounded-2xl font-black text-white transition-all disabled:opacity-50 relative overflow-hidden ${
              isMilestone ? "py-2.5 text-[11px]" : "py-2 text-[10px]"
            }`}
            style={{
              background: isMilestone
                ? `linear-gradient(135deg, ${effectiveTrackColor} 0%, #ffffff22 40%, ${effectiveTrackColor}cc 100%)`
                : `linear-gradient(135deg, ${effectiveTrackColor} 0%, ${effectiveTrackColor}bb 100%)`,
              boxShadow: isMilestone
                ? `0 4px 24px ${glow}, 0 0 10px rgba(255,255,255,0.10)`
                : `0 3px 16px ${glow}`,
            }}
          >
            {/* Button shine sweep */}
            <motion.span
              className="pointer-events-none absolute inset-y-0 w-10"
              animate={{ left: ["-20%", "120%"] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", repeatDelay: 2 }}
              style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)" }}
            />
            <span className="relative z-10">{claiming ? "…" : isMilestone ? "✦ Abholen" : "Abholen"}</span>
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

// ── Horizontal scrollable track ───────────────────────────────────────────────

interface TrackProps {
  tiers: BattlePassTier[];
  label: string;
  labelColor: string;
  trackIcon: React.ReactNode;
  userStatus: UserBpStatus | null;
  progressDays: number;
  accent: string;
  glow: string;
  trackColor: string;
  onClaim: (id: string) => void;
  claimingId: string | null;
  visualConfig: BpVisualConfig;
  /** View index offset so each track's tiles get unique indices in the shared Canvas. */
  viewIndexOffset?: number;
  /** Unified "Season Road": every tile colours itself by its own track (free/premium). */
  roadMode?: boolean;
}

const ROAD_COLOR = { premium: "#f59e0b", free: "#94a3b8" } as const;
const ROAD_GLOW = { premium: "rgba(245,158,11,0.55)", free: "rgba(148,163,184,0.4)" } as const;
const roadTrackOf = (t: BattlePassTier): "premium" | "free" => (t.isPremium ? "premium" : "free");

function HorizontalTrack({
  tiers, label, labelColor, trackIcon, userStatus, progressDays, accent, glow, trackColor,
  onClaim, claimingId, visualConfig, viewIndexOffset = 0, roadMode = false,
}: TrackProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [fullPreviewSubject, setFullPreviewSubject] = useState<PreviewSubject | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [viewFrac, setViewFrac] = useState(1);

  function updateScrollState() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
    const max = el.scrollWidth - el.clientWidth;
    setScrollProgress(max > 0 ? el.scrollLeft / max : 0);
    setViewFrac(el.scrollWidth > 0 ? el.clientWidth / el.scrollWidth : 1);
  }

  function scrollBy(delta: number) {
    scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollState, { passive: true });
    updateScrollState();
    return () => el.removeEventListener("scroll", updateScrollState);
  }, []);

  // Auto-scroll to first available tier
  useEffect(() => {
    const firstAvailable = tiers.findIndex(
      (t) => getTierState(t, userStatus, progressDays) === "available"
    );
    if (firstAvailable > 0 && scrollRef.current) {
      const el = scrollRef.current;
      const cardW = visualConfig.normalTileWidth ?? 140;
      const gap = visualConfig.containerGap ?? 8;
      setTimeout(() => {
        el.scrollTo({ left: Math.max(0, firstAvailable * (cardW + gap) - 60), behavior: "smooth" });
      }, 600);
    }
  }, [tiers, userStatus, progressDays, visualConfig.normalTileWidth, visualConfig.containerGap]);

  const selectedTierData = selectedTier ? tiers.find((t) => t.id === selectedTier) : null;
  const selectedSubject = selectedTierData ? tierToPreviewSubject(selectedTierData) : null;
  const panelColor = roadMode && selectedTierData ? ROAD_COLOR[roadTrackOf(selectedTierData)] : trackColor;

  return (
    <div className="space-y-3">
      {/* Track header — hidden in unified road mode (the road has its own header) */}
      {!roadMode && (
        <div className="flex items-center gap-3">
          <span style={{ color: labelColor }}>{trackIcon}</span>
          <h2 className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: labelColor }}>
            {label}
          </h2>
          <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${labelColor}30, transparent)` }} />
          <span className="text-[10px] text-white/30">{tiers.length} Levels</span>
        </div>
      )}

      {/* Scrollable row — negative margin compensates for top padding that prevents vertical clip */}
      <div className="relative -mt-3">
        {/* Edge-Masken (ALLE Modi, nicht nur roadMode): verdecken den 3D-Überstand
            am linken/rechten Rand → eine teil-rausgescrollte Kachel kann nicht als
            Geister-Modell über die UI ragen. Der geteilte Vollbild-Canvas scissort
            auf die Kachel-Rect; diese opaken Bänder kappen, was darüber hinausragt. */}
        <div className="pointer-events-none absolute inset-y-0 z-20" style={{ left: -14, width: 88, background: "linear-gradient(to right, rgb(9,7,17) 26%, rgba(9,7,17,0))" }} />
        <div className="pointer-events-none absolute inset-y-0 z-20" style={{ right: -14, width: 88, background: "linear-gradient(to left, rgb(9,7,17) 26%, rgba(9,7,17,0))" }} />
        {/* Left arrow */}
        {canScrollLeft && (
          <button
            onClick={() => scrollBy(-300)}
            className="absolute left-0 top-1/2 z-30 -translate-y-1/2 -translate-x-1 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-zinc-900/95 text-white/70 shadow-xl hover:text-white transition-colors backdrop-blur-sm"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        {/* Scroll container — pt-3 prevents top-clipping of scaled-up preview items */}
        <div
          ref={scrollRef}
          className="flex overflow-x-auto pb-3 pt-3"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none", gap: visualConfig.containerGap ?? 8 }}
        >
          {tiers.map((tier, idx) => {
            const state = getTierState(tier, userStatus, progressDays);
            const tcol = roadMode ? ROAD_COLOR[roadTrackOf(tier)] : trackColor;
            const tglow = roadMode ? ROAD_GLOW[roadTrackOf(tier)] : glow;
            return (
              <TrackTileCard
                key={tier.id}
                tier={tier}
                state={state}
                accent={accent}
                glow={tglow}
                trackColor={tcol}
                onClaim={onClaim}
                claiming={claimingId === tier.id}
                isSelected={selectedTier === tier.id}
                onClick={() => setSelectedTier((prev) => (prev === tier.id ? null : tier.id))}
                visualConfig={visualConfig}
                onDirectPreview={setFullPreviewSubject}
                viewIndex={viewIndexOffset + idx * 2}
                scrollRootRef={scrollRef}
              />
            );
          })}
        </div>

        {/* Right arrow */}
        {canScrollRight && (
          <button
            onClick={() => scrollBy(300)}
            className="absolute right-0 top-1/2 z-30 -translate-y-1/2 translate-x-1 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-zinc-900/95 text-white/70 shadow-xl hover:text-white transition-colors backdrop-blur-sm"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Scroll-Fortschritt — macht sichtbar, dass die Bahn ALLE Stufen enthält */}
      {roadMode && viewFrac < 0.999 && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] font-bold tabular-nums text-white/30">1</span>
          <button
            onClick={() => scrollBy(-300)}
            className="rounded-full p-0.5 text-white/30 transition-colors hover:text-white/70 disabled:opacity-20"
            disabled={!canScrollLeft}
            aria-label="zurück"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="absolute inset-y-0 rounded-full transition-[left] duration-150"
              style={{
                left: `${scrollProgress * (1 - viewFrac) * 100}%`,
                width: `${Math.max(8, viewFrac * 100)}%`,
                background: accent,
                boxShadow: `0 0 8px ${glow}`,
              }}
            />
          </div>
          <button
            onClick={() => scrollBy(300)}
            className="rounded-full p-0.5 text-white/30 transition-colors hover:text-white/70 disabled:opacity-20"
            disabled={!canScrollRight}
            aria-label="weiter"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <span className="text-[10px] font-bold tabular-nums text-white/30">{tiers.length}</span>
        </div>
      )}

      {/* Selected tier detail panel — rich visual preview */}
      <AnimatePresence>
        {selectedTierData && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className="rounded-2xl border overflow-hidden"
              style={{
                borderColor: `${panelColor}40`,
                background: `linear-gradient(135deg, ${panelColor}08 0%, rgba(0,0,0,0.6) 100%)`,
                boxShadow: `0 0 40px ${panelColor}15`,
              }}
            >
              <div className="flex flex-col sm:flex-row">
                {/* Visual preview area */}
                <div
                  className="relative flex min-h-[160px] sm:w-52 shrink-0 flex-col items-center justify-center gap-4 p-6 sm:border-r"
                  style={{
                    borderColor: `${panelColor}20`,
                    background: `radial-gradient(circle at 50% 50%, ${panelColor}12 0%, transparent 70%)`,
                  }}
                >
                  {/* Background glow */}
                  <motion.div
                    className="pointer-events-none absolute inset-0"
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    style={{ background: `radial-gradient(circle at 50% 50%, ${panelColor}15 0%, transparent 60%)` }}
                  />
                  <RewardPreviewCard tier={selectedTierData} accent={panelColor} glow={`${panelColor}60`} />
                </div>
                {/* Info area */}
                <div className="flex flex-1 flex-col justify-between gap-3 p-5">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h3 className="text-lg font-black text-white leading-tight">{selectedTierData.name}</h3>
                      <div
                        className="shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest"
                        style={{ borderColor: `${panelColor}40`, color: panelColor, background: `${panelColor}12` }}
                      >
                        Level {selectedTierData.tierNumber}
                      </div>
                    </div>
                    <p className="text-sm font-semibold" style={{ color: `${panelColor}cc` }}>
                      {rewardLabel(selectedTierData)}
                    </p>
                    {selectedTierData.description && selectedTierData.showTierDescription !== false && (
                      <p className="mt-2 text-xs text-white/40 leading-relaxed">{selectedTierData.description}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedTierData.isPremium && (
                      <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-black text-amber-300">
                        <Crown className="h-3 w-3" />Premium
                      </span>
                    )}
                    {selectedTierData.highlightTier && (
                      <span className="flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black text-amber-200">
                        <Star className="h-3 w-3" />Meilenstein
                      </span>
                    )}
                    {selectedTierData.bpXpRequired && (
                      <span className="flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-black text-sky-300">
                        <Zap className="h-3 w-3" />{selectedTierData.bpXpRequired.toLocaleString("de-DE")} BP-XP
                      </span>
                    )}
                    {selectedSubject && (
                      <button
                        onClick={() => setFullPreviewSubject(selectedSubject)}
                        className="flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-[10px] font-black text-purple-300 transition-colors hover:bg-purple-500/20"
                      >
                        <Eye className="h-3 w-3" />Vollbild-Vorschau
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {fullPreviewSubject && (
        <UniversalPreviewModal
          subject={fullPreviewSubject}
          onClose={() => setFullPreviewSubject(null)}
        />
      )}
    </div>
  );
}

// ── Grid track layout ─────────────────────────────────────────────────────────

function GridTrack({ tiers, label, labelColor, trackIcon, userStatus, progressDays, accent, glow, trackColor, onClaim, claimingId, visualConfig, viewIndexOffset = 100 }: TrackProps) {
  const [fullPreviewSubject, setFullPreviewSubject] = useState<PreviewSubject | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span style={{ color: labelColor }}>{trackIcon}</span>
        <h2 className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: labelColor }}>{label}</h2>
        <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${labelColor}30, transparent)` }} />
        <span className="text-[10px] text-white/30">{tiers.length} Levels</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 pt-3">
        {tiers.map((tier, idx) => {
          const state = getTierState(tier, userStatus, progressDays);
          return (
            <TrackTileCard
              key={tier.id}
              tier={tier}
              state={state}
              accent={accent}
              glow={glow}
              trackColor={trackColor}
              onClaim={onClaim}
              claiming={claimingId === tier.id}
              isSelected={false}
              onClick={() => {}}
              visualConfig={{ ...visualConfig, normalTileWidth: 120, normalTileHeight: 180, milestoneTileWidth: 120, milestoneTileHeight: 180 }}
              onDirectPreview={setFullPreviewSubject}
              fillWidth
              viewIndex={viewIndexOffset + idx}
            />
          );
        })}
      </div>
      {fullPreviewSubject && (
        <UniversalPreviewModal subject={fullPreviewSubject} onClose={() => setFullPreviewSubject(null)} />
      )}
    </div>
  );
}

// ── List track layout ─────────────────────────────────────────────────────────

function ListTierRow({
  tier, state, trackColor, accent, glow, onClaim, claiming, onDirectPreview,
}: {
  tier: BattlePassTier;
  state: TierState;
  trackColor: string;
  accent: string;
  glow: string;
  onClaim: (id: string) => void;
  claiming: boolean;
  onDirectPreview: (s: PreviewSubject) => void;
}) {
  const isClaimed = state === "claimed";
  const isAvailable = state === "available";
  const isLocked = state === "locked";
  const rarity = tier.rewardItemRarity ?? "normal";
  const rarityColor = RARITY_COLORS[rarity] ?? trackColor;
  const previewSubject = tierToPreviewSubject(tier);
  const has3d = tier.displayMode === "3d" && previewSubject !== null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="group/tile relative flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors"
      style={
        isClaimed
          ? { borderColor: "rgba(52,211,153,0.2)", background: "rgba(52,211,153,0.03)" }
          : isAvailable
            ? { borderColor: `${trackColor}40`, background: `${trackColor}06`, cursor: has3d ? "pointer" : "default" }
            : { borderColor: "rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.01)" }
      }
      onClick={() => { if (has3d && previewSubject) onDirectPreview(previewSubject); }}
    >
      {/* Hover tooltip */}
      <div className="pointer-events-none absolute inset-x-0 top-full mt-1 z-50 hidden group-hover/tile:block">
        <div className="mx-4 rounded-xl border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-md">
          <span className="font-black text-white">{tier.rewardItemName ?? tier.name}</span>
          {tier.rewardItemRarity && <span className="ml-2 font-bold capitalize" style={{ color: rarityColor }}>{tier.rewardItemRarity}</span>}
          {has3d && <span className="ml-2 text-purple-300">· Klicken für 3D</span>}
        </div>
      </div>

      {/* Tier number badge */}
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-black tabular-nums"
        style={
          isClaimed
            ? { background: "rgba(52,211,153,0.15)", color: "#34d399" }
            : isAvailable
              ? { background: `${trackColor}20`, color: trackColor }
              : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.2)" }
        }
      >
        {isClaimed ? <CheckCircle2 className="h-4 w-4" /> : tier.tierNumber}
      </div>

      {/* Mini icon */}
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
        style={{
          borderColor: isLocked ? "rgba(255,255,255,0.06)" : `${rarityColor}40`,
          background: isLocked ? "rgba(255,255,255,0.02)" : `${rarityColor}12`,
          color: isLocked ? "rgba(255,255,255,0.2)" : rarityColor,
          filter: isLocked ? "grayscale(1) brightness(0.4)" : undefined,
        }}
      >
        <span className="text-base">{rewardIcon(tier)}</span>
      </div>

      {/* Name + reward */}
      <div className="flex-1 min-w-0">
        {tier.showTierName !== false && (
          <p className="text-sm font-black truncate" style={{ color: isLocked ? "rgba(255,255,255,0.2)" : "white" }}>
            {tier.name}
          </p>
        )}
        <p className="text-[11px] truncate" style={{ color: isLocked ? "rgba(255,255,255,0.15)" : `${trackColor}cc` }}>
          {rewardLabel(tier)}
        </p>
      </div>

      {/* Track badges */}
      <div className="flex shrink-0 items-center gap-2">
        {tier.isPremium && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-black text-amber-300">Premium</span>
        )}
        {tier.highlightTier && (
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[9px] font-black text-amber-200">★</span>
        )}
        {has3d && !isLocked && (
          <span className="rounded-full px-1.5 py-0.5 text-[7px] font-black" style={{ background: `${trackColor}25`, color: trackColor, border: `1px solid ${trackColor}50` }}>3D</span>
        )}
        {isAvailable && (
          <motion.button
            whileTap={{ scale: 0.88 }}
            disabled={claiming}
            onClick={(e) => { e.stopPropagation(); if (!claiming) onClaim(tier.id); }}
            className="rounded-xl px-3 py-1.5 text-xs font-black text-white disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${trackColor}, ${trackColor}bb)`, boxShadow: `0 2px 12px ${glow}` }}
          >
            {claiming ? "…" : "Abholen"}
          </motion.button>
        )}
        {isClaimed && (
          <span className="text-[11px] text-emerald-400/60 font-black">✓ Abgeholt</span>
        )}
        {isLocked && (
          <Lock className="h-4 w-4 text-white/15" />
        )}
      </div>
    </motion.div>
  );
}

function ListTrack({ tiers, label, labelColor, trackIcon, userStatus, progressDays, accent, glow, trackColor, onClaim, claimingId, visualConfig, viewIndexOffset: _vio }: TrackProps) {
  const [fullPreviewSubject, setFullPreviewSubject] = useState<PreviewSubject | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span style={{ color: labelColor }}>{trackIcon}</span>
        <h2 className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: labelColor }}>{label}</h2>
        <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${labelColor}30, transparent)` }} />
        <span className="text-[10px] text-white/30">{tiers.length} Levels</span>
      </div>
      <div className="space-y-1.5">
        {tiers.map((tier) => (
          <ListTierRow
            key={tier.id}
            tier={tier}
            state={getTierState(tier, userStatus, progressDays)}
            trackColor={trackColor}
            accent={accent}
            glow={glow}
            onClaim={onClaim}
            claiming={claimingId === tier.id}
            onDirectPreview={setFullPreviewSubject}
          />
        ))}
      </div>
      {fullPreviewSubject && (
        <UniversalPreviewModal subject={fullPreviewSubject} onClose={() => setFullPreviewSubject(null)} />
      )}
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({
  progressDays, tierCount, accent, glow, claimedCount,
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
          style={{ background: `linear-gradient(90deg, ${accent} 0%, ${accent}cc 100%)`, boxShadow: `0 0 12px ${glow}` }}
        />
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

export function BattlePassShell({ pass: initialPass, userStatus: initialStatus }: BattlePassShellProps) {
  const router = useRouter();
  // Pass is held in state so admin edits (broadcast on "bp-live") apply live.
  const [pass, setPass] = useState(initialPass);
  useEffect(() => { setPass(initialPass); }, [initialPass]);
  const theme = BP_THEMES[pass.theme] ?? BP_THEMES.default;
  const accent = pass.accentColor || theme.accent;
  const glow = theme.glow.replace(/[\d.]+\)$/, "0.5)");

  const sound = useSoundManager();
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const [userStatus, setUserStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [purchaseAnim, setPurchaseAnim] = useState(false);
  const [claimBurst, setClaimBurst] = useState<{ key: number; reward: string } | null>(null);
  const burstKeyRef = useRef(0);

  const shellRef = useRef<HTMLDivElement>(null);

  // Live updates: admin BP changes broadcast on "bp-live" → re-fetch the whole
  // active pass + this user's status without a reload (AGENTS §3).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("bp-live")
      .on("broadcast", { event: "bp_changed" }, () => {
        getActiveBattlePass()
          .then((view) => {
            if (!view) return;
            setPass(view.pass);
            if (view.userStatus) setUserStatus(view.userStatus);
          })
          .catch(() => { /* keep current on error */ });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const progressDays = userStatus?.progressDays ?? 0;
  const hasPremium = userStatus?.hasPremium ?? false;
  const visualConfig: BpVisualConfig = { ...DEFAULT_BP_VISUAL_CONFIG, ...(pass.visualConfig ?? {}) };

  const freeTiers = pass.tiers.filter((t) => !t.isPremium);
  const premiumTiers = pass.tiers.filter((t) => t.isPremium);
  const claimedCount = userStatus?.claimedTierIds.length ?? 0;

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const handleClaim = useCallback((tierId: string) => {
    if (claimingId || isPending) return;
    setClaimingId(tierId);
    startTransition(async () => {
      const res = await claimBpTier(tierId);
      setClaimingId(null);
      if (res.success) {
        soundRef.current.bpTierClaim();
        const rewardLabel = res.reward ? `✦ ${res.reward}` : "Reward abgeholt!";
        showToast(rewardLabel, true);
        // Zero-Latency: optimistisch claimen, KEIN router.refresh() (kein Reload-Ruck).
        setUserStatus((prev) =>
          prev ? { ...prev, claimedTierIds: [...prev.claimedTierIds, tierId] } : prev
        );
        // Fettes Partikel-Feedback auf der Kachel/zentral.
        burstKeyRef.current += 1;
        setClaimBurst({ key: burstKeyRef.current, reward: res.reward ?? "" });
        setTimeout(() => setClaimBurst((b) => (b && b.key === burstKeyRef.current ? null : b)), 1500);
        // xp_boost erhöht progress_days → schaltet evtl. neue Stufen frei: gezielter Resync (kein Full-Reload).
        if (res.rewardType === "xp_boost") {
          getActiveBattlePass()
            .then((view) => {
              if (!view) return;
              setPass(view.pass);
              if (view.userStatus) setUserStatus(view.userStatus);
            })
            .catch(() => { /* optimistischer Stand bleibt */ });
        }
      } else {
        soundRef.current.error();
        showToast(res.error ?? "Fehler.", false);
      }
    });
  }, [claimingId, isPending]);

  const handleBuyPremium = useCallback(() => {
    setBuyError(null);
    startTransition(async () => {
      const res = await purchaseBattlePass(pass.id);
      if (res.success) {
        setPurchaseAnim(true);
        setTimeout(() => setPurchaseAnim(false), 2000);
        showToast("Premium Pass aktiviert! 👑", true);
        setUserStatus((prev) =>
          prev ? { ...prev, hasPremium: true }
               : { passId: pass.id, hasPremium: true, progressDays: 0, claimedTierIds: [], bpXp: 0 }
        );
        router.refresh();
      } else {
        setBuyError(res.error ?? "Kauf fehlgeschlagen.");
      }
    });
  }, [pass.id, router]);

  // Coin-purchase animation overlay
  const CoinBurst = purchaseAnim ? (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
      {Array.from({ length: 18 }, (_, i) => (
        <motion.div
          key={i}
          className="absolute text-2xl"
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{
            x: Math.cos((i / 18) * Math.PI * 2) * (80 + Math.random() * 120),
            y: Math.sin((i / 18) * Math.PI * 2) * (80 + Math.random() * 120),
            opacity: 0,
            scale: 0.3,
          }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        >
          💰
        </motion.div>
      ))}
    </div>
  ) : null;

  // Claim-Eskalation: Konfetti-Explosion + Funken-Ring + aufploppendes Reward-Label (zero-latency).
  const ClaimBurst = claimBurst ? (
    <div key={claimBurst.key} className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
      {/* Schockwellen-Ring */}
      <motion.div
        className="absolute rounded-full border-2"
        style={{ borderColor: accent, width: 80, height: 80 }}
        initial={{ scale: 0.2, opacity: 0.9 }}
        animate={{ scale: 6, opacity: 0 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
      {/* Konfetti */}
      {Array.from({ length: 38 }, (_, i) => {
        const ang = (i / 38) * Math.PI * 2 + (i % 3) * 0.2;
        const dist = 120 + (i % 7) * 34;
        const colors = [accent, "#fbbf24", "#34d399", "#f472b6", "#38bdf8", "#ffffff"];
        const col = colors[i % colors.length];
        const w = 6 + (i % 3) * 3;
        return (
          <motion.div
            key={`c${i}`}
            className="absolute rounded-[2px]"
            style={{ width: w, height: w * 1.8, background: col, boxShadow: `0 0 6px ${col}99` }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
            animate={{
              x: Math.cos(ang) * dist,
              y: Math.sin(ang) * dist + 120,
              opacity: [1, 1, 0],
              rotate: (i % 2 ? 1 : -1) * (220 + i * 12),
              scale: 0.6,
            }}
            transition={{ duration: 1.5 + (i % 5) * 0.12, ease: "easeOut" }}
          />
        );
      })}
      {/* Funken */}
      {Array.from({ length: 16 }, (_, i) => {
        const ang = (i / 16) * Math.PI * 2;
        const dist = 80 + (i % 4) * 22;
        return (
          <motion.div
            key={`s${i}`}
            className="absolute text-base"
            style={{ color: accent, textShadow: `0 0 8px ${glow}` }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.4 }}
            animate={{ x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, opacity: 0, scale: 1.2 }}
            transition={{ duration: 1, ease: "easeOut" }}
          >
            ✦
          </motion.div>
        );
      })}
      {/* Reward-Label */}
      <motion.div
        className="absolute rounded-full border px-5 py-2.5 text-base font-extrabold backdrop-blur-md"
        style={{ borderColor: `${accent}90`, background: `${accent}26`, color: "#fff", boxShadow: `0 0 36px ${glow}` }}
        initial={{ scale: 0.4, opacity: 0, y: 14 }}
        animate={{ scale: [0.4, 1.18, 1], opacity: [0, 1, 1, 0], y: [14, -8, -14] }}
        transition={{ duration: 1.6, ease: "easeOut", times: [0, 0.22, 0.62, 1] }}
      >
        {claimBurst.reward ? `✦ ${claimBurst.reward}` : "✦ Abgeholt!"}
      </motion.div>
    </div>
  ) : null;

  return (
    <div ref={shellRef} className="flex flex-1 flex-col min-h-0 relative">
      {CoinBurst}
      {ClaimBurst}

      {/* ══ HERO ══════════════════════════════════════════════════════════ */}
      <div
        className="relative overflow-hidden border-b"
        style={{ borderColor: `${accent}25`, background: `linear-gradient(180deg, ${accent}12 0%, #070512 100%)` }}
      >
        {/* Grid pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(255,255,255,0.6) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(255,255,255,0.6) 40px)",
          }}
        />

        {/* Glow orbs */}
        <motion.div
          className="pointer-events-none absolute -top-40 left-1/4 h-[600px] w-[600px] rounded-full blur-[160px]"
          style={{ background: accent }}
          animate={{ opacity: [0.08, 0.2, 0.08], scale: [1, 1.1, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="pointer-events-none absolute -bottom-24 right-1/3 h-96 w-96 rounded-full blur-[120px]"
          style={{ background: accent }}
          animate={{ opacity: [0.05, 0.14, 0.05] }}
          transition={{ duration: 8, repeat: Infinity, delay: 2 }}
        />
        <motion.div
          className="pointer-events-none absolute top-1/2 -right-20 h-[400px] w-[400px] rounded-full blur-[100px]"
          style={{ background: pass.highlightColor ?? accent }}
          animate={{ opacity: [0.04, 0.12, 0.04] }}
          transition={{ duration: 7, repeat: Infinity, delay: 1 }}
        />

        {/* Particles — admin-configurable */}
        {visualConfig.showParticleField && <ParticleField accent={accent} count={35} />}

        {/* Banner image — cinematic full bleed */}
        {pass.bannerImageUrl && (
          <>
            <div
              className="pointer-events-none absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url(${pass.bannerImageUrl})`,
                opacity: 0.18,
                maskImage: "linear-gradient(180deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0) 100%)",
                WebkitMaskImage: "linear-gradient(180deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0) 100%)",
              }}
            />
            {/* Character preview — right-side fade-in */}
            <div
              className="pointer-events-none absolute right-0 top-0 h-full w-1/3 bg-contain bg-right-top bg-no-repeat hidden lg:block"
              style={{
                backgroundImage: `url(${pass.bannerImageUrl})`,
                opacity: 0.35,
                maskImage: "linear-gradient(270deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0) 100%)",
                WebkitMaskImage: "linear-gradient(270deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0) 100%)",
              }}
            />
          </>
        )}

        {/* Hero content */}
        <div className="relative z-10 mx-auto max-w-6xl px-4 py-10 sm:py-14">
          <div className="flex flex-col items-center text-center">

            {/* Season badge + icon */}
            <motion.div
              initial={{ opacity: 0, y: -16, scale: 0.88 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 18 }}
              className="mb-5 flex items-center gap-3"
            >
              <span className="text-3xl">{pass.passIcon ?? "🏆"}</span>
              <div
                className="inline-flex items-center gap-2 rounded-full border px-5 py-2 text-xs font-black uppercase tracking-[0.25em] backdrop-blur-md"
                style={{
                  borderColor: `${accent}60`,
                  color: accent,
                  background: `${accent}12`,
                  boxShadow: `0 0 30px ${glow}`,
                }}
              >
                <motion.span animate={{ rotate: [0, 360] }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }}>
                  <Star className="h-3 w-3" />
                </motion.span>
                {pass.seasonLabel}
              </div>
            </motion.div>

            {/* Title */}
            <motion.h1
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.07, type: "spring", stiffness: 100, damping: 16 }}
              className="text-4xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl"
              style={{ textShadow: `0 0 100px ${glow}, 0 0 160px ${glow}40` }}
            >
              {pass.name}
            </motion.h1>

            {/* Animated divider */}
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "160px", opacity: 1 }}
              transition={{ delay: 0.22, duration: 0.7 }}
              className="mx-auto my-5 h-[2px] rounded-full"
              style={{ background: `linear-gradient(90deg, transparent, ${accent}, ${pass.highlightColor ?? accent}, transparent)`, boxShadow: `0 0 20px ${glow}` }}
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

            {/* Stats row */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="mt-7 flex flex-wrap justify-center gap-3"
            >
              <div
                className="flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold backdrop-blur-sm"
                style={{ borderColor: `${accent}30`, background: `${accent}08`, color: "rgba(255,255,255,0.7)" }}
              >
                <Layers className="h-4 w-4" style={{ color: accent }} />
                <span className="font-black" style={{ color: accent }}>{pass.tierCount}</span> Levels
              </div>
              {pass.startDate && (
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/50 backdrop-blur-sm">
                  <Calendar className="h-4 w-4" />
                  {new Date(pass.startDate).toLocaleDateString("de-DE")}
                  {pass.endDate && ` – ${new Date(pass.endDate).toLocaleDateString("de-DE")}`}
                </div>
              )}
              {pass.showCountdown && pass.endDate && (
                <div
                  className="flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold backdrop-blur-sm"
                  style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)", color: "rgba(252,165,165,0.9)" }}
                >
                  <Clock className="h-4 w-4 text-red-400" />
                  Noch: <Countdown endDate={pass.endDate} />
                </div>
              )}
              {pass.spinChanceBoost > 0 && (
                <div className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/8 px-4 py-2.5 text-sm font-bold text-amber-300 backdrop-blur-sm">
                  <TrendingUp className="h-4 w-4" />
                  +{Math.round(pass.spinChanceBoost * 100)}% Case-Boost
                </div>
              )}
            </motion.div>

            {/* Track badges */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32 }}
              className="mt-5 flex flex-wrap justify-center gap-2"
            >
              <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/50">
                <Gift className="h-3 w-3" /> FREE · {freeTiers.length} Levels
              </span>
              {premiumTiers.length > 0 && (
                <span className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300">
                  <Crown className="h-3 w-3" /> PREMIUM · {premiumTiers.length} Levels · {pass.priceCr.toLocaleString("de-DE")} CR
                </span>
              )}
            </motion.div>
          </div>
        </div>
      </div>

      {/* ══ 3D PODIUM SHOWCASE — große Live-Bühne, läuft durch alle Rewards ══ */}
      {pass.tiers.length > 0 && (
        <div className="mx-auto w-full max-w-5xl px-3 pt-6 sm:px-5 sm:pt-8">
          <PodiumShowcase
            tiers={[...pass.tiers].sort((a, b) => a.tierNumber - b.tierNumber)}
            accent={accent}
            glow={glow}
            userStatus={userStatus}
          />
        </div>
      )}

      {/* ══ MAIN CONTENT ══════════════════════════════════════════════════ */}
      <div className="mx-auto w-full max-w-7xl px-3 sm:px-5 py-6 sm:py-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">

          {/* Tracks column */}
          <div className="flex-1 min-w-0 space-y-8">

            {/* Progress bar / XP bar */}
            {userStatus && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 backdrop-blur-sm"
                style={{ boxShadow: `0 0 30px ${glow}10` }}
              >
                {pass.progressionType === "xp" ? (
                  <XpProgressBar
                    bpXp={userStatus.bpXp}
                    bpXpPerTier={pass.bpXpPerTier}
                    tierCount={pass.tierCount}
                    accent={accent}
                    glow={glow}
                  />
                ) : (
                  <ProgressBar
                    progressDays={progressDays}
                    tierCount={pass.tierCount}
                    accent={accent}
                    glow={glow}
                    claimedCount={claimedCount}
                  />
                )}
              </motion.div>
            )}

            {/* ══ SEASON-ROAD — eine durchgehende Bahn aller Stufen (Premium-Erlebnis) ══ */}
            {(() => {
              const allTiers = [...pass.tiers].sort((a, b) => a.tierNumber - b.tierNumber);
              if (allTiers.length === 0) return null;
              const layoutMode: BpLayoutMode = visualConfig.layoutMode ?? "carousel";
              const TrackComponent = layoutMode === "grid" ? GridTrack : layoutMode === "list" ? ListTrack : HorizontalTrack;
              const showLockHint = !hasPremium && premiumTiers.length > 0;
              return (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.05 }}
                  className="rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.025] to-black/30 p-4 sm:p-5"
                  style={{ boxShadow: `0 0 50px ${glow}10` }}
                >
                  {/* Track-Legende mit Lock-Status */}
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-white/60">
                      <Trophy className="h-4 w-4" style={{ color: accent }} /> Season-Road
                    </h2>
                    <div className="h-px min-w-8 flex-1" style={{ background: `linear-gradient(90deg, ${accent}30, transparent)` }} />
                    <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold text-white/50">
                      <Gift className="h-3 w-3" />FREE · {freeTiers.length}
                    </span>
                    {premiumTiers.length > 0 && (
                      <span className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold" style={{ borderColor: hasPremium ? "#f59e0b55" : "#f59e0b33", background: "#f59e0b12", color: "#fcd34d" }}>
                        {hasPremium ? <Crown className="h-3 w-3" /> : <Lock className="h-3 w-3" />}PREMIUM · {premiumTiers.length}
                      </span>
                    )}
                  </div>
                  {showLockHint && (
                    <p className="mb-3 text-[11px] text-white/35">
                      <Lock className="mr-1 inline h-3 w-3" />
                      Gesperrte Premium-Stufen schaltest du rechts in der Seitenleiste frei.
                    </p>
                  )}
                  <TrackComponent
                    tiers={allTiers}
                    label="Season-Road"
                    labelColor="rgba(255,255,255,0.5)"
                    trackIcon={<Trophy className="h-4 w-4" />}
                    accent={accent}
                    glow={glow}
                    trackColor={accent}
                    userStatus={userStatus}
                    progressDays={progressDays}
                    onClaim={handleClaim}
                    claimingId={claimingId}
                    visualConfig={visualConfig}
                    viewIndexOffset={0}
                    roadMode
                  />
                </motion.div>
              );
            })()}
            {/* QUEST PANEL */}
            <QuestPanel passId={pass.id} accent={accent} glow={glow} />

          </div>

          {/* ── Side panel ──────────────────────────────────────────────── */}
          <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="flex w-full flex-col gap-4 lg:w-72 lg:shrink-0"
          >
            {/* User progress card */}
            {userStatus && (
              <div
                className="rounded-2xl border p-5 backdrop-blur-sm"
                style={{ borderColor: `${accent}20`, background: `${accent}06` }}
              >
                <h3 className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest" style={{ color: `${accent}aa` }}>
                  <Award className="h-3.5 w-3.5" />
                  Dein Status
                </h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  {hasPremium && (
                    <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-300">
                      <Crown className="h-3 w-3" />Premium
                    </span>
                  )}
                  {!hasPremium && (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-white/35">
                      Free Pass
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    pass.progressionType === "xp"
                      ? { label: "BP-XP", value: userStatus.bpXp.toLocaleString("de-DE"), icon: <Zap className="h-3 w-3" style={{ color: accent }} /> }
                      : { label: "Login-Tage", value: progressDays, icon: <Calendar className="h-3 w-3" /> },
                    { label: "Abgeholt", value: claimedCount, icon: <CheckCircle2 className="h-3 w-3 text-emerald-400" /> },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                      <div className="flex items-center justify-center gap-1 mb-1" style={{ color: `${accent}80` }}>
                        {s.icon}
                        <p className="text-[9px] font-bold uppercase tracking-widest text-white/25">{s.label}</p>
                      </div>
                      <p className="text-2xl font-black tabular-nums text-white">{s.value}</p>
                    </div>
                  ))}
                </div>
                {pass.progressionType === "xp" && (
                  <div className="mt-3 pt-3 border-t border-white/[0.06]">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-white/20 mb-2">Nächster Tier</p>
                    <div className="relative h-2 rounded-full bg-white/[0.04] overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, Math.round(((userStatus.bpXp % pass.bpXpPerTier) / pass.bpXpPerTier) * 100))}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
                      />
                    </div>
                    <p className="mt-1 text-right text-[9px] font-bold tabular-nums" style={{ color: `${accent}80` }}>
                      {(userStatus.bpXp % pass.bpXpPerTier).toLocaleString("de-DE")} / {pass.bpXpPerTier.toLocaleString("de-DE")} XP
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Purchase / upgrade card */}
            {!hasPremium && (
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 space-y-3 backdrop-blur-sm">
                <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/35">
                  <Coins className="h-3.5 w-3.5" />
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
                  <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "#f59e0b30", background: "#f59e0b06" }}>
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
                      className="w-full rounded-xl py-3 text-sm font-black text-white transition-all disabled:opacity-50 relative overflow-hidden"
                      style={{
                        background: `linear-gradient(135deg, ${accent} 0%, ${accent}bb 100%)`,
                        boxShadow: `0 4px 24px ${glow}`,
                      }}
                    >
                      <span className="relative z-10">{isPending ? "Kaufe…" : (pass.customBuyText || "👑 Premium kaufen")}</span>
                    </motion.button>
                  </div>
                )}

              </div>
            )}

            {/* Fully owned */}
            {hasPremium && (
              <div
                className="rounded-2xl border p-5"
                style={{ borderColor: `${accent}30`, background: `${accent}08` }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: `${accent}20` }}>
                    <Shield className="h-5 w-5" style={{ color: accent }} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">Vollständig freigeschaltet</p>
                    <p className="text-xs text-white/35 mt-0.5">Hol täglich deine Rewards ab!</p>
                  </div>
                </div>
              </div>
            )}

            {/* Banner preview card */}
            {pass.bannerImageUrl && (
              <div
                className="rounded-2xl overflow-hidden border"
                style={{ borderColor: `${accent}25` }}
              >
                <div className="relative h-28 bg-cover bg-center" style={{ backgroundImage: `url(${pass.bannerImageUrl})` }}>
                  <div
                    className="absolute inset-0"
                    style={{ background: `linear-gradient(0deg, ${accent}40 0%, transparent 60%)` }}
                  />
                  <div className="absolute bottom-2 left-3 text-xs font-black text-white drop-shadow-lg">{pass.name}</div>
                </div>
              </div>
            )}

            {/* Remaining tiers quick stats */}
            <div
              className="rounded-2xl border p-4"
              style={{ borderColor: `${accent}12`, background: `${accent}04` }}
            >
              <h4 className="mb-3 text-[10px] font-black uppercase tracking-widest" style={{ color: `${accent}60` }}>Überblick</h4>
              <div className="space-y-2.5">
                {[
                  { label: "Abgeholte Levels", value: `${claimedCount} / ${pass.tierCount}`, color: "#34d399" },
                  { label: "Verfügbare Levels", value: String(pass.tiers.filter((t) => getTierState(t, userStatus, progressDays) === "available").length), color: accent },
                  { label: "Gesperrte Levels", value: String(pass.tiers.filter((t) => getTierState(t, userStatus, progressDays) === "locked").length), color: "rgba(255,255,255,0.25)" },
                  { label: "Meilenstein-Level", value: String(pass.tiers.filter((t) => t.highlightTier).length), color: "#fbbf24" },
                ].map((s) => (
                  <div key={s.label} className="flex items-center justify-between text-xs">
                    <span className="text-white/35">{s.label}</span>
                    <span className="font-black tabular-nums" style={{ color: s.color }}>{s.value}</span>
                  </div>
                ))}
                <div className="mt-2 h-px bg-white/5" />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/35">Free / Premium</span>
                  <span className="font-bold text-white/40 tabular-nums">
                    {freeTiers.length} / {premiumTiers.length}
                  </span>
                </div>
              </div>
            </div>
          </motion.aside>
        </div>
      </div>

      {/* ══ Toast ════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.msg}
            initial={{ opacity: 0, y: 32, scale: 0.88 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 220, damping: 20 }}
            className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 w-max max-w-[calc(100vw-2rem)] rounded-2xl border px-6 py-4 text-sm font-bold shadow-2xl backdrop-blur-xl"
            style={
              toast.ok
                ? { borderColor: "#34d39940", background: "rgba(6,40,28,0.95)", color: "#34d399", boxShadow: "0 4px 40px rgba(52,211,153,0.25)" }
                : { borderColor: "#f8717140", background: "rgba(40,6,6,0.95)", color: "#f87171", boxShadow: "0 4px 40px rgba(248,113,113,0.2)" }
            }
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ Shared WebGL Canvas for 3D tile previews ═════════════════════
          z-[10] (not 0!) puts the transparent canvas ABOVE the tier cards
          (which are `relative z-10`) so the 3D actually shows — at zIndex 0 it
          sat behind the opaque page, rendering nowhere. drei's View scissors
          each scene to its tracking <div>, and pointer-events:none lets clicks
          fall through to the cards. eventSource is required so the shared
          canvas measures against the shell. Mirrors the working shop setup. */}
      <Canvas
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          pointerEvents: "none",
          zIndex: 10,
        }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        eventSource={shellRef as React.RefObject<HTMLElement>}
        dpr={[1, 1.5]}
      >
        <View.Port />
      </Canvas>
    </div>
  );
}
