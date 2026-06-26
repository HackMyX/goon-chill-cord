"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence, useMotionValue, animate } from "framer-motion";
import {
  Package, ShoppingBag, Shirt, Globe, Joystick, Pickaxe, Coins,
  Users, Repeat, Gavel, ClipboardList, X, ChevronRight,
  Megaphone, TrendingUp, CircleDot,
} from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { Leaderboard, type LeaderboardEntry, type StreakEntry } from "@/components/dashboard/leaderboard";
import { GameLeaderboards } from "@/components/dashboard/game-leaderboards";
import type { GameLeaderboardSection } from "@/lib/actions/homepage-leaderboards";
import { subscribeToPresence } from "@/lib/presence-client";
import { useSoundManager } from "@/lib/sound-manager";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import { resolveSiteLogoIcon } from "@/lib/site-logo-icons";
import { useRealtimeProfile } from "@/lib/use-realtime-profile";
import { DEFAULT_HOMEPAGE_CONFIG, type HomepageConfig, type HomepageCardId } from "@/lib/site-config";
import type { LucideIcon } from "lucide-react";
import { BpBanner } from "@/components/battlepass/bp-banner";
import { getActiveBattlePass } from "@/lib/actions/battle-pass";
import type { ActiveBpView } from "@/lib/battle-pass";
import { StyledUsername } from "@/components/ui/styled-username";
import { HomepageChatSidebar } from "@/components/global/homepage-chat-sidebar";
import {
  DEFAULT_HOMEPAGE_CHAT_CONFIG,
  type HomepageChatConfig,
} from "@/lib/homepage-chat-config-types";

// Animated number that counts up when the value changes
function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const motionVal = useMotionValue(value);
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    if (prevRef.current === value) return;
    const controls = animate(motionVal, value, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    prevRef.current = value;
    return () => controls.stop();
  }, [value, motionVal]);

  return (
    <span className={className}>
      {display.toLocaleString("de-DE")}
    </span>
  );
}

function useOnlineCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => subscribeToPresence((ids) => setCount(ids.size)), []);
  return count;
}

interface CardDef {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  gradient: string;
  border: string;
  iconBg: string;
  iconColor: string;
  shadow: string;
  accentBar: string;
}

const CARD_DEFS: Record<HomepageCardId, CardDef> = {
  shop: {
    label: "Shop", description: "Tägliche Angebote & exklusive Items kaufen.", href: "/shop",
    icon: ShoppingBag, gradient: "from-amber-500/10 via-amber-500/3 to-transparent",
    border: "border-amber-500/20", iconBg: "bg-amber-500/10", iconColor: "text-amber-400",
    shadow: "hover:shadow-[0_4px_24px_rgba(245,158,11,0.15)]", accentBar: "bg-amber-500",
  },
  cases: {
    label: "Cases", description: "Öffne Cases & gewinne seltene Cosmetics.", href: "/cases",
    icon: Package, gradient: "from-purple-500/10 via-purple-500/3 to-transparent",
    border: "border-purple-500/20", iconBg: "bg-purple-500/10", iconColor: "text-purple-400",
    shadow: "hover:shadow-[0_4px_24px_rgba(168,85,247,0.18)]", accentBar: "bg-purple-500",
  },
  garderobe: {
    label: "Garderobe", description: "Dein Inventar, Equipment & Outfit.", href: "/garderobe",
    icon: Shirt, gradient: "from-indigo-500/10 via-indigo-500/3 to-transparent",
    border: "border-indigo-500/20", iconBg: "bg-indigo-500/10", iconColor: "text-indigo-400",
    shadow: "hover:shadow-[0_4px_24px_rgba(99,102,241,0.15)]", accentBar: "bg-indigo-500",
  },
  world: {
    label: "Farmwelt", description: "Erkunde die Farmwelt im Browser.", href: "/world",
    icon: Globe, gradient: "from-emerald-500/10 via-emerald-500/3 to-transparent",
    border: "border-emerald-500/20", iconBg: "bg-emerald-500/10", iconColor: "text-emerald-400",
    shadow: "hover:shadow-[0_4px_24px_rgba(52,211,153,0.12)]", accentBar: "bg-emerald-500",
  },
  snake: {
    label: "Snake", description: "Klassisches Snake — verdiene Credits.", href: "/snake",
    icon: Joystick, gradient: "from-lime-500/10 via-lime-500/3 to-transparent",
    border: "border-lime-500/20", iconBg: "bg-lime-500/10", iconColor: "text-lime-400",
    shadow: "hover:shadow-[0_4px_24px_rgba(163,230,53,0.12)]", accentBar: "bg-lime-500",
  },
  mine: {
    label: "Mine", description: "Mine-Minigame für Credits und Items.", href: "/mine",
    icon: Pickaxe, gradient: "from-orange-500/10 via-orange-500/3 to-transparent",
    border: "border-orange-500/20", iconBg: "bg-orange-500/10", iconColor: "text-orange-400",
    shadow: "hover:shadow-[0_4px_24px_rgba(249,115,22,0.12)]", accentBar: "bg-orange-500",
  },
  don: {
    label: "Double or Nothing", description: "Verdopple deine Credits — oder verlier alles.", href: "/don",
    icon: Coins, gradient: "from-yellow-500/10 via-yellow-500/3 to-transparent",
    border: "border-yellow-500/20", iconBg: "bg-yellow-500/10", iconColor: "text-yellow-400",
    shadow: "hover:shadow-[0_4px_24px_rgba(234,179,8,0.12)]", accentBar: "bg-yellow-500",
  },
  community: {
    label: "Community", description: "Spielerliste, Online-Status & Profil.", href: "/community",
    icon: Users, gradient: "from-sky-500/10 via-sky-500/3 to-transparent",
    border: "border-sky-500/20", iconBg: "bg-sky-500/10", iconColor: "text-sky-400",
    shadow: "hover:shadow-[0_4px_24px_rgba(14,165,233,0.12)]", accentBar: "bg-sky-500",
  },
  trading: {
    label: "Trading", description: "Items direkt mit anderen Spielern tauschen.", href: "/trading",
    icon: Repeat, gradient: "from-teal-500/10 via-teal-500/3 to-transparent",
    border: "border-teal-500/20", iconBg: "bg-teal-500/10", iconColor: "text-teal-400",
    shadow: "hover:shadow-[0_4px_24px_rgba(20,184,166,0.12)]", accentBar: "bg-teal-500",
  },
  auctions: {
    label: "Auktionshaus", description: "Items versteigern und ersteigern.", href: "/auctions",
    icon: Gavel, gradient: "from-rose-500/10 via-rose-500/3 to-transparent",
    border: "border-rose-500/20", iconBg: "bg-rose-500/10", iconColor: "text-rose-400",
    shadow: "hover:shadow-[0_4px_24px_rgba(244,63,94,0.12)]", accentBar: "bg-rose-500",
  },
  surveys: {
    label: "Umfragen", description: "Community-Umfragen — deine Stimme zählt.", href: "/surveys",
    icon: ClipboardList, gradient: "from-violet-500/10 via-violet-500/3 to-transparent",
    border: "border-violet-500/20", iconBg: "bg-violet-500/10", iconColor: "text-violet-400",
    shadow: "hover:shadow-[0_4px_24px_rgba(139,92,246,0.12)]", accentBar: "bg-violet-500",
  },
  battlepass: {
    label: "Battle Pass", description: "Wöchentlicher Pass — täglich einloggen & Belohnungen sichern.", href: "/battlepass",
    icon: TrendingUp, gradient: "from-purple-500/10 via-purple-500/3 to-transparent",
    border: "border-purple-500/20", iconBg: "bg-purple-500/10", iconColor: "text-purple-400",
    shadow: "hover:shadow-[0_4px_24px_rgba(168,85,247,0.12)]", accentBar: "bg-purple-500",
  },
  plinko: {
    label: "Plinko", description: "Lass den Ball fallen und gewinne Credits!", href: "/plinko",
    icon: CircleDot, gradient: "from-pink-500/10 via-pink-500/3 to-transparent",
    border: "border-pink-500/20", iconBg: "bg-pink-500/10", iconColor: "text-pink-400",
    shadow: "hover:shadow-[0_4px_24px_rgba(236,72,153,0.12)]", accentBar: "bg-pink-500",
  },
};

const ANNOUNCEMENT_STYLES = {
  purple: { outer: "border-purple-500/30 bg-purple-500/10", icon: "text-purple-300", text: "text-purple-200", dot: "bg-purple-400" },
  amber: { outer: "border-amber-500/30 bg-amber-500/10", icon: "text-amber-300", text: "text-amber-200", dot: "bg-amber-400" },
  sky: { outer: "border-sky-500/30 bg-sky-500/10", icon: "text-sky-300", text: "text-sky-200", dot: "bg-sky-400" },
  emerald: { outer: "border-emerald-500/30 bg-emerald-500/10", icon: "text-emerald-300", text: "text-emerald-200", dot: "bg-emerald-400" },
  red: { outer: "border-red-500/30 bg-red-500/10", icon: "text-red-300", text: "text-red-200", dot: "bg-red-400" },
};

interface DashboardShellProps {
  initialCredits: number;
  inventoryCount: number;
  streakDays: number;
  leaderboard: LeaderboardEntry[];
  streakLeaderboard?: StreakEntry[];
  isAdmin?: boolean;
  isModerator?: boolean;
  username?: string;
  nameStyleKey?: string;
  userCount?: number;
  homepageConfig?: HomepageConfig;
  chatSidebarConfig?: HomepageChatConfig;
  gameLeaderboards?: GameLeaderboardSection[];
}

export function DashboardShell({
  initialCredits,
  inventoryCount,
  streakDays,
  leaderboard,
  streakLeaderboard = [],
  isAdmin = false,
  isModerator = false,
  username,
  nameStyleKey,
  userCount = 0,
  homepageConfig,
  chatSidebarConfig,
  gameLeaderboards = [],
}: DashboardShellProps) {
  const cfg = homepageConfig ?? DEFAULT_HOMEPAGE_CONFIG;
  const [credits, setCredits] = useState(initialCredits);
  useRealtimeProfile((row) => {
    if (typeof row.credits === "number") setCredits(row.credits);
  });
  const router = useRouter();
  const sound = useSoundManager();
  const onlineCount = useOnlineCount();
  const { siteName, logoUrl, logoIconName, currencyName } = useSiteConfig();
  const LogoIcon = resolveSiteLogoIcon(logoIconName);

  const [bpView, setBpView] = useState<ActiveBpView | null>(null);
  useEffect(() => {
    getActiveBattlePass().then((view) => {
      if (view && view.pass.showOnDashboard && view.pass.isActive) {
        setBpView(view);
      }
    }).catch(() => { /* ignore */ });
  }, []);

  const [announcementDismissed, setAnnouncementDismissed] = useState(true);
  useEffect(() => {
    if (!cfg.announcementEnabled || !cfg.announcementText) return;
    const key = `ann_${cfg.announcementText.slice(0, 30)}`;
    setAnnouncementDismissed(localStorage.getItem(key) === "1");
  }, [cfg.announcementEnabled, cfg.announcementText]);

  function dismissAnnouncement() {
    const key = `ann_${cfg.announcementText.slice(0, 30)}`;
    localStorage.setItem(key, "1");
    setAnnouncementDismissed(true);
  }

  function handleCreditsChange(newCredits: number) {
    setCredits(newCredits);
    router.refresh();
  }

  const heroTitle = cfg.heroTitle.trim() || siteName;
  const annStyle = ANNOUNCEMENT_STYLES[cfg.announcementColor] ?? ANNOUNCEMENT_STYLES.purple;

  const visibleCards = cfg.cardOrder
    .filter((id) => !cfg.disabledCards.includes(id))
    .map((id) => CARD_DEFS[id])
    .filter(Boolean);

  const resolvedChatConfig = chatSidebarConfig ?? DEFAULT_HOMEPAGE_CHAT_CONFIG;

  return (
    <div className="flex flex-1 flex-col">
      {/* Glassmorphism global chat sidebar — fixed/overlay, does not push content */}
      <HomepageChatSidebar config={resolvedChatConfig} />
      <TopBar
        credits={credits}
        inventoryCount={inventoryCount}
        streakDays={streakDays}
        onCreditsChange={handleCreditsChange}
        isAdmin={isAdmin}
        isModerator={isModerator}
      />

      <main className="flex-1 overflow-hidden">
        {/* Announcement Banner */}
        <AnimatePresence>
          {cfg.announcementEnabled && cfg.announcementText && !announcementDismissed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={`relative flex items-center gap-3 border-b px-4 py-3 overflow-hidden ${annStyle.outer}`}
            >
              {/* Scan line */}
              <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${annStyle.dot}`} />
              <Megaphone className={`h-4 w-4 shrink-0 ${annStyle.icon}`} />
              <p className={`flex-1 text-sm font-medium ${annStyle.text}`}>{cfg.announcementText}</p>
              <button onClick={dismissAnnouncement} onMouseEnter={sound.hover}
                className={`rounded-md p-1 opacity-60 hover:opacity-100 transition-opacity ${annStyle.icon}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── HERO ─────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b border-white/[0.04]">
          {/* Mesh background blobs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="animate-mesh-a absolute -top-20 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-purple-600/10 blur-[130px]" />
            <div className="animate-mesh-b absolute top-10 -right-20 h-80 w-80 rounded-full bg-indigo-600/8 blur-[90px]" />
            <div className="animate-mesh-c absolute top-20 -left-10 h-64 w-64 rounded-full bg-violet-600/6 blur-[70px]" />
            {/* Subtle grid overlay */}
            <div className="absolute inset-0 opacity-[0.025]"
              style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(255,255,255,0.3) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(255,255,255,0.3) 40px)" }}
            />
            {/* Floating particles */}
            <div className="animate-particle-a absolute bottom-10 left-[15%] h-1 w-1 rounded-full bg-purple-400/50" />
            <div className="animate-particle-b absolute bottom-6 left-[40%] h-1.5 w-1.5 rounded-full bg-indigo-400/40" />
            <div className="animate-particle-c absolute bottom-14 left-[65%] h-1 w-1 rounded-full bg-fuchsia-400/50" />
            <div className="animate-particle-d absolute bottom-4 left-[80%] h-1 w-1 rounded-full bg-violet-400/40" />
            <div className="animate-particle-e absolute bottom-8 left-[25%] h-0.5 w-0.5 rounded-full bg-blue-400/60" />
            <div className="animate-particle-f absolute bottom-12 left-[55%] h-1.5 w-1.5 rounded-full bg-purple-300/30" />
          </div>

          <div className="relative z-10 mx-auto max-w-4xl px-4 pt-14 pb-14 text-center">
            {/* Logo with glow ring */}
            <motion.div
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="mb-7 flex justify-center"
            >
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-purple-500/20 blur-2xl scale-150" />
                <div className="absolute inset-0 rounded-2xl bg-purple-500/10 blur-lg" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-purple-500/25 bg-gradient-to-br from-purple-500/10 to-transparent shadow-[0_0_40px_rgba(168,85,247,0.2)]">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt={siteName} className="h-12 w-12 rounded-xl object-cover" />
                  ) : (
                    <LogoIcon className="h-11 w-11 text-purple-300" />
                  )}
                </div>
              </div>
            </motion.div>

            {/* Title */}
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl leading-tight"
            >
              {username ? (
                <>
                  <span className="block text-xl sm:text-2xl font-semibold text-zinc-400 mb-1 tracking-normal">
                    Hey, willkommen zurück 👋
                  </span>
                  <span>
                    <StyledUsername name={username!} styleKey={nameStyleKey} size="hero" disablePopup />
                  </span>
                </>
              ) : (
                <>
                  <span className="text-zinc-200">Willkommen im </span>
                  <span className="bg-gradient-to-r from-purple-400 via-fuchsia-400 to-indigo-400 bg-clip-text text-transparent">
                    {heroTitle}
                  </span>
                </>
              )}
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.17 }}
              className="mx-auto mt-4 max-w-xl text-base text-zinc-400 leading-relaxed"
            >
              {cfg.heroSubtitle}
            </motion.p>

            {/* Stats row */}
            {cfg.showStats && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.24 }}
                className="mt-8 flex flex-wrap justify-center gap-3"
              >
                {/* Online */}
                <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-5 py-2 text-sm backdrop-blur-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-live-dot" />
                  <AnimatedNumber value={onlineCount} className="font-black text-emerald-300" />
                  <span className="text-zinc-500">Online</span>
                </div>

                {/* User count */}
                {userCount > 0 && (
                  <div className="flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/5 px-5 py-2 text-sm backdrop-blur-sm">
                    <Users className="h-3.5 w-3.5 text-purple-400" />
                    <AnimatedNumber value={userCount} className="font-black text-purple-300 tabular-nums" />
                    <span className="text-zinc-500">Spieler</span>
                  </div>
                )}

                {/* Credits */}
                <div className="flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/5 px-5 py-2 text-sm backdrop-blur-sm">
                  <Coins className="h-3.5 w-3.5 text-amber-400" />
                  <AnimatedNumber value={credits} className="font-black text-amber-300 tabular-nums" />
                  <span className="text-zinc-500">{currencyName}</span>
                </div>
              </motion.div>
            )}

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.32 }}
              className="mt-8 flex flex-wrap justify-center gap-3"
            >
              <Link
                href="/cases"
                onMouseEnter={sound.hover}
                onClick={sound.click}
                className="group relative overflow-hidden rounded-xl bg-purple-600 px-7 py-3 text-sm font-bold text-white shadow-[0_0_24px_rgba(147,51,234,0.45)] transition-all hover:bg-purple-500 hover:shadow-[0_0_36px_rgba(147,51,234,0.65)] hover:scale-[1.04] active:scale-95"
              >
                <div className="card-shimmer-inner absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                <span className="relative flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Cases öffnen
                </span>
              </Link>
              <Link
                href="/shop"
                onMouseEnter={sound.hover}
                onClick={sound.click}
                className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 px-7 py-3 text-sm font-bold text-amber-300 transition-all hover:border-amber-400/50 hover:bg-amber-500/15 hover:scale-[1.04] active:scale-95"
              >
                <ShoppingBag className="h-4 w-4" />
                Shop
              </Link>
              <Link
                href="/garderobe"
                onMouseEnter={sound.hover}
                onClick={sound.click}
                className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-7 py-3 text-sm font-bold text-zinc-300 transition-all hover:border-white/30 hover:text-zinc-100 hover:scale-[1.04] active:scale-95"
              >
                <Shirt className="h-4 w-4" />
                Garderobe
              </Link>
            </motion.div>
          </div>
        </section>

        {/* ── BATTLE PASS BANNER ─────────────────────────────────────── */}
        {bpView && (
          <BpBanner
            pass={bpView.pass}
            userStatus={bpView.userStatus}
          />
        )}

        {/* ── FEATURE CARDS ──────────────────────────────────────────── */}
        {cfg.showFeatureCards && visibleCards.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 py-10">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-6 flex items-center gap-3"
            >
              <TrendingUp className="h-4 w-4 text-zinc-600" />
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-600">
                Alle Features
              </h2>
              <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
            </motion.div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visibleCards.map((card, i) => (
                <motion.div
                  key={card.href}
                  initial={{ opacity: 0, y: 24, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.08 + i * 0.045, type: "spring", stiffness: 200, damping: 22 }}
                  whileHover={{ y: -3 }}
                >
                  <Link
                    href={card.href}
                    onMouseEnter={sound.hover}
                    onClick={sound.click}
                    className={`group relative flex h-[168px] flex-col gap-3.5 overflow-hidden rounded-2xl border bg-gradient-to-br p-5 transition-all duration-300 ${card.gradient} ${card.border} ${card.shadow}`}
                  >
                    {/* Shimmer on hover */}
                    <div className="card-shimmer-inner pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/8 to-transparent" />

                    {/* Top accent bar */}
                    <div className={`absolute top-0 left-0 right-0 h-[2px] ${card.accentBar} opacity-30 group-hover:opacity-70 transition-opacity duration-300`} />

                    {/* Icon */}
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${card.iconBg} transition-transform duration-300 group-hover:scale-110`}>
                      <card.icon className={`h-5 w-5 ${card.iconColor}`} />
                    </div>

                    {/* Text */}
                    <div className="min-w-0">
                      <h3 className="truncate font-black text-zinc-100 text-sm">{card.label}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-500 line-clamp-2">{card.description}</p>
                    </div>

                    {/* Arrow */}
                    <ChevronRight className="absolute right-4 bottom-4 h-4 w-4 text-zinc-700 transition-all duration-200 group-hover:translate-x-1 group-hover:text-zinc-300" />
                  </Link>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* ── LEADERBOARD ────────────────────────────────────────────── */}
        {cfg.showLeaderboard && (
          <div className="relative">
            {/* Section separator */}
            <div className="mx-auto max-w-6xl px-4">
              <div className="flex items-center gap-3 pb-2 pt-2">
                <div className="flex-1 h-px bg-gradient-to-l from-white/10 to-transparent" />
                <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
              </div>
            </div>
            <Leaderboard
              entries={leaderboard}
              streakEntries={streakLeaderboard}
              showStreakTab={cfg.showStreakLeaderboard}
              style={cfg.leaderboardStyle}
            />
          </div>
        )}

        {/* ── GAME LEADERBOARDS ──────────────────────────────────────── */}
        {gameLeaderboards.length > 0 && (
          <>
            <div className="mx-auto max-w-6xl px-4">
              <div className="flex items-center gap-3 py-2">
                <div className="flex-1 h-px bg-gradient-to-l from-white/10 to-transparent" />
                <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
              </div>
            </div>
            <GameLeaderboards sections={gameLeaderboards} />
          </>
        )}
      </main>
    </div>
  );
}
