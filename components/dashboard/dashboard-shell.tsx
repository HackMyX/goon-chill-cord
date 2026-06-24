"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package, ShoppingBag, Shirt, Globe, Joystick, Pickaxe, Coins,
  Users, Repeat, Gavel, ClipboardList, X, ChevronRight,
  Trophy, Megaphone, TrendingUp,
} from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { Leaderboard, type LeaderboardEntry } from "@/components/dashboard/leaderboard";
import { subscribeToPresence } from "@/lib/presence-client";
import { useSoundManager } from "@/lib/sound-manager";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import { resolveSiteLogoIcon } from "@/lib/site-logo-icons";
import { useRealtimeProfile } from "@/lib/use-realtime-profile";
import { DEFAULT_HOMEPAGE_CONFIG, type HomepageConfig, type HomepageCardId } from "@/lib/site-config";
import type { LucideIcon } from "lucide-react";

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
  glow: string;
}

const CARD_DEFS: Record<HomepageCardId, CardDef> = {
  shop: {
    label: "Shop", description: "Tägliche Angebote & exklusive Items kaufen.", href: "/shop",
    icon: ShoppingBag, gradient: "from-amber-500/10 to-transparent", border: "border-amber-500/20",
    iconBg: "bg-amber-500/10", iconColor: "text-amber-400", glow: "hover:shadow-amber-500/10",
  },
  cases: {
    label: "Cases", description: "Öffne Cases & gewinne seltene Cosmetics.", href: "/cases",
    icon: Package, gradient: "from-purple-500/10 to-transparent", border: "border-purple-500/20",
    iconBg: "bg-purple-500/10", iconColor: "text-purple-400", glow: "hover:shadow-purple-500/10",
  },
  garderobe: {
    label: "Garderobe", description: "Dein Inventar, Equipment & Outfit.", href: "/garderobe",
    icon: Shirt, gradient: "from-indigo-500/10 to-transparent", border: "border-indigo-500/20",
    iconBg: "bg-indigo-500/10", iconColor: "text-indigo-400", glow: "hover:shadow-indigo-500/10",
  },
  world: {
    label: "3D-Welt", description: "Erkunde die Online-3D-Welt im Browser.", href: "/world",
    icon: Globe, gradient: "from-emerald-500/10 to-transparent", border: "border-emerald-500/20",
    iconBg: "bg-emerald-500/10", iconColor: "text-emerald-400", glow: "hover:shadow-emerald-500/10",
  },
  snake: {
    label: "Snake", description: "Klassisches Snake — verdiene Credits.", href: "/snake",
    icon: Joystick, gradient: "from-lime-500/10 to-transparent", border: "border-lime-500/20",
    iconBg: "bg-lime-500/10", iconColor: "text-lime-400", glow: "hover:shadow-lime-500/10",
  },
  mine: {
    label: "Mine", description: "Mine-Minigame für Credits und Items.", href: "/mine",
    icon: Pickaxe, gradient: "from-orange-500/10 to-transparent", border: "border-orange-500/20",
    iconBg: "bg-orange-500/10", iconColor: "text-orange-400", glow: "hover:shadow-orange-500/10",
  },
  don: {
    label: "Double or Nothing", description: "Verdopple deine Credits — oder verlier alles.", href: "/don",
    icon: Coins, gradient: "from-yellow-500/10 to-transparent", border: "border-yellow-500/20",
    iconBg: "bg-yellow-500/10", iconColor: "text-yellow-400", glow: "hover:shadow-yellow-500/10",
  },
  community: {
    label: "Community", description: "Spielerliste, Online-Status & Profil.", href: "/community",
    icon: Users, gradient: "from-sky-500/10 to-transparent", border: "border-sky-500/20",
    iconBg: "bg-sky-500/10", iconColor: "text-sky-400", glow: "hover:shadow-sky-500/10",
  },
  trading: {
    label: "Trading", description: "Items direkt mit anderen Spielern tauschen.", href: "/trading",
    icon: Repeat, gradient: "from-teal-500/10 to-transparent", border: "border-teal-500/20",
    iconBg: "bg-teal-500/10", iconColor: "text-teal-400", glow: "hover:shadow-teal-500/10",
  },
  auctions: {
    label: "Auktionshaus", description: "Items versteigern und ersteigern.", href: "/auctions",
    icon: Gavel, gradient: "from-rose-500/10 to-transparent", border: "border-rose-500/20",
    iconBg: "bg-rose-500/10", iconColor: "text-rose-400", glow: "hover:shadow-rose-500/10",
  },
  surveys: {
    label: "Umfragen", description: "Community-Umfragen — deine Stimme zählt.", href: "/surveys",
    icon: ClipboardList, gradient: "from-violet-500/10 to-transparent", border: "border-violet-500/20",
    iconBg: "bg-violet-500/10", iconColor: "text-violet-400", glow: "hover:shadow-violet-500/10",
  },
};

const ANNOUNCEMENT_STYLES = {
  purple: "border-purple-500/30 bg-purple-500/10 text-purple-200",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  red: "border-red-500/30 bg-red-500/10 text-red-200",
};

interface DashboardShellProps {
  initialCredits: number;
  inventoryCount: number;
  streakDays: number;
  leaderboard: LeaderboardEntry[];
  isAdmin?: boolean;
  isModerator?: boolean;
  username?: string;
  userCount?: number;
  homepageConfig?: HomepageConfig;
}

export function DashboardShell({
  initialCredits,
  inventoryCount,
  streakDays,
  leaderboard,
  isAdmin = false,
  isModerator = false,
  username,
  userCount = 0,
  homepageConfig,
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

  const creditsFormatted = new Intl.NumberFormat("de-DE").format(credits);
  const heroTitle = cfg.heroTitle.trim() || siteName;

  const visibleCards = cfg.cardOrder
    .filter((id) => !cfg.disabledCards.includes(id))
    .map((id) => CARD_DEFS[id])
    .filter(Boolean);

  return (
    <div className="flex flex-1 flex-col">
      <TopBar
        credits={credits}
        inventoryCount={inventoryCount}
        streakDays={streakDays}
        onCreditsChange={handleCreditsChange}
        isAdmin={isAdmin}
        isModerator={isModerator}
      />

      <main className="flex-1">
        {/* Announcement Banner */}
        <AnimatePresence>
          {cfg.announcementEnabled && cfg.announcementText && !announcementDismissed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={`flex items-center gap-3 border-b px-4 py-3 ${ANNOUNCEMENT_STYLES[cfg.announcementColor]}`}
            >
              <Megaphone className="h-4 w-4 shrink-0" />
              <p className="flex-1 text-sm font-medium">{cfg.announcementText}</p>
              <button
                onClick={dismissAnnouncement}
                onMouseEnter={sound.hover}
                className="rounded-md p-1 opacity-60 hover:opacity-100 transition-opacity"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hero */}
        <section className="relative overflow-hidden border-b border-white/5">
          {/* Atmospheric glow */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[500px] w-[900px] rounded-full bg-purple-600/8 blur-[120px]" />
            <div className="absolute -top-10 right-0 h-72 w-72 rounded-full bg-indigo-600/6 blur-[80px]" />
            <div className="absolute top-10 left-0 h-56 w-56 rounded-full bg-violet-600/5 blur-[70px]" />
          </div>

          <div className="relative z-10 mx-auto max-w-4xl px-4 pt-14 pb-12 text-center">
            {/* Logo */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="mb-6 flex justify-center"
            >
              <div className="relative flex h-20 w-20 items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-purple-500/15 blur-xl" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-purple-500/20 bg-purple-500/5 shadow-[0_0_30px_rgba(147,51,234,0.15)]">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt={siteName} className="h-10 w-10 rounded-xl object-cover" />
                  ) : (
                    <LogoIcon className="h-9 w-9 text-purple-400" />
                  )}
                </div>
              </div>
            </motion.div>

            {/* Title */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.08 }}
              className="text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl"
            >
              {username ? (
                <>
                  <span className="text-zinc-300 text-2xl sm:text-3xl font-semibold">Hey, </span>
                  <br />
                  <span className="bg-gradient-to-r from-purple-300 via-fuchsia-300 to-indigo-300 bg-clip-text text-transparent">
                    {username}
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
              transition={{ duration: 0.4, delay: 0.14 }}
              className="mx-auto mt-4 max-w-xl text-base text-zinc-400 leading-relaxed"
            >
              {cfg.heroSubtitle}
            </motion.p>

            {/* Stats row */}
            {cfg.showStats && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="mt-7 flex flex-wrap justify-center gap-3"
              >
                <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-4 py-1.5 text-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                  <span className="font-bold text-emerald-300">{onlineCount}</span>
                  <span className="text-zinc-500">Online</span>
                </div>
                {userCount > 0 && (
                  <div className="flex items-center gap-1.5 rounded-full border border-purple-500/20 bg-purple-500/5 px-4 py-1.5 text-sm">
                    <Users className="h-3.5 w-3.5 text-purple-400" />
                    <span className="font-bold text-purple-300">{userCount.toLocaleString("de-DE")}</span>
                    <span className="text-zinc-500">Spieler</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/5 px-4 py-1.5 text-sm">
                  <Coins className="h-3.5 w-3.5 text-amber-400" />
                  <span className="font-bold text-amber-300 tabular-nums">{creditsFormatted}</span>
                  <span className="text-zinc-500">{currencyName}</span>
                </div>
              </motion.div>
            )}

            {/* CTA buttons */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.26 }}
              className="mt-8 flex flex-wrap justify-center gap-3"
            >
              <Link
                href="/cases"
                onMouseEnter={sound.hover}
                onClick={sound.click}
                className="group relative overflow-hidden rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(147,51,234,0.4)] transition-all hover:bg-purple-500 hover:shadow-[0_0_30px_rgba(147,51,234,0.6)] hover:scale-[1.03] active:scale-95"
              >
                <span className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Cases öffnen
                </span>
              </Link>
              <Link
                href="/shop"
                onMouseEnter={sound.hover}
                onClick={sound.click}
                className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-6 py-2.5 text-sm font-bold text-amber-300 transition-all hover:border-amber-400/50 hover:bg-amber-500/10 hover:scale-[1.03] active:scale-95"
              >
                <ShoppingBag className="h-4 w-4" />
                Shop
              </Link>
              <Link
                href="/garderobe"
                onMouseEnter={sound.hover}
                onClick={sound.click}
                className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-6 py-2.5 text-sm font-bold text-zinc-300 transition-all hover:border-white/30 hover:text-zinc-100 hover:scale-[1.03] active:scale-95"
              >
                <Shirt className="h-4 w-4" />
                Garderobe
              </Link>
            </motion.div>
          </div>
        </section>

        {/* Feature Cards */}
        {cfg.showFeatureCards && visibleCards.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 py-10">
            <div className="mb-5 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-zinc-500" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-600">
                Alle Features
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visibleCards.map((card, i) => (
                <motion.div
                  key={card.href}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.04 }}
                >
                  <Link
                    href={card.href}
                    onMouseEnter={sound.hover}
                    onClick={sound.click}
                    className={`group relative flex flex-col gap-3 rounded-2xl border bg-gradient-to-br p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${card.gradient} ${card.border} ${card.glow}`}
                  >
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.iconBg}`}>
                      <card.icon className={`h-5 w-5 ${card.iconColor}`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-bold text-zinc-100">{card.label}</h3>
                      <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{card.description}</p>
                    </div>
                    <ChevronRight className="absolute right-4 bottom-4 h-4 w-4 text-zinc-700 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-zinc-400" />
                  </Link>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Leaderboard */}
        {cfg.showLeaderboard && (
          <section className="mx-auto max-w-6xl px-4 pb-4">
            <div className="mb-5 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-zinc-500" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-600">
                Bestenliste
              </h2>
            </div>
            <Leaderboard entries={leaderboard} />
          </section>
        )}
      </main>
    </div>
  );
}
