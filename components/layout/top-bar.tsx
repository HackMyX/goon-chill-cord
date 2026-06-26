"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ShoppingBag,
  Gavel,
  Repeat,
  Users,
  Shirt,
  UserRound,
  ShieldAlert,
  Shield,
  ClipboardList,
  Coins,
  Menu,
} from "lucide-react";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { IconButton } from "@/components/layout/icon-button";
import { GamesMenu } from "@/components/layout/games-menu";
import { LiveClock } from "@/components/layout/live-clock";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { LogoutButton } from "@/components/auth/logout-button";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import { resolveSiteLogoIcon } from "@/lib/site-logo-icons";
import { useSoundManager } from "@/lib/sound-manager";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_TOPBAR_RIGHT_SLOTS } from "@/lib/site-config";
import { LevelBadge } from "@/components/ui/level-badge";
import { DailyQuestsTrigger } from "@/components/daily-quests/daily-quests-panel";

interface TopBarProps {
  credits: number;
  inventoryCount?: number;
  streakDays?: number;
  onCreditsChange?: (newCredits: number) => void;
  isAdmin?: boolean;
  isModerator?: boolean;
  userId?: string;
  pendingTradesCount?: number;
  level?: number;
}

export function TopBar({
  credits,
  inventoryCount = 0,
  streakDays = 2,
  onCreditsChange,
  isAdmin = false,
  isModerator = false,
  userId,
  pendingTradesCount = 0,
  level,
}: TopBarProps) {
  const creditsLabel = new Intl.NumberFormat("de-DE").format(credits);
  const sound = useSoundManager();
  const {
    siteName,
    logoUrl,
    logoIconName,
    currencyName,
    topbarRightSlots,
    siteVersion,
    topbarShowLabels,
  } = useSiteConfig();
  const LogoIcon = resolveSiteLogoIcon(logoIconName);

  const [liveInventoryCount, setLiveInventoryCount] = useState(inventoryCount);
  const [resolvedUserId, setResolvedUserId] = useState(userId ?? null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [liveLevel, setLiveLevel] = useState(level ?? 0);
  useEffect(() => { setLiveInventoryCount(inventoryCount); }, [inventoryCount]);
  useEffect(() => { if (level !== undefined) setLiveLevel(level); }, [level]);

  useEffect(() => {
    if (userId) { setResolvedUserId(userId); return; }
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setResolvedUserId(data.user.id);
    });
  }, [userId]);

  useEffect(() => {
    if (!resolvedUserId) return;
    const supabase = createClient();
    // Fetch initial level if not passed as prop
    if (!level) {
      supabase.from("profiles").select("level").eq("id", resolvedUserId).single()
        .then(({ data }) => { if (data?.level) setLiveLevel(data.level as number); });
    }
    const channel = supabase
      .channel(`topbar-inventory-${resolvedUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "inventory", filter: `user_id=eq.${resolvedUserId}` },
        () => setLiveInventoryCount((n) => n + 1)
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "inventory", filter: `user_id=eq.${resolvedUserId}` },
        () => setLiveInventoryCount((n) => Math.max(0, n - 1))
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${resolvedUserId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (typeof row.level === "number") setLiveLevel(row.level);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedUserId]);

  const slots: string[] =
    Array.isArray(topbarRightSlots) && topbarRightSlots.length > 0
      ? topbarRightSlots
      : [...DEFAULT_TOPBAR_RIGHT_SLOTS];

  function renderSlot(slot: string) {
    switch (slot) {
      case "games":
        return (
          <div key="games" className="hidden xl:block">
            <GamesMenu />
          </div>
        );
      case "shop":
        return (
          <IconButton
            key="shop"
            icon={ShoppingBag}
            label="Shop"
            href="/shop"
            showLabel={topbarShowLabels}
            className="hidden xl:flex"
          />
        );
      case "auctions":
        return (
          <IconButton
            key="auctions"
            icon={Gavel}
            label="Auktionen"
            href="/auctions"
            showLabel={topbarShowLabels}
            className="hidden xl:flex"
          />
        );
      case "trading":
        return (
          <IconButton
            key="trading"
            icon={Repeat}
            label="Trading"
            href="/trading"
            badge={pendingTradesCount > 0 ? pendingTradesCount : undefined}
            showLabel={topbarShowLabels}
            className="hidden xl:flex"
          />
        );
      case "community":
        return (
          <IconButton
            key="community"
            icon={Users}
            label="Community"
            href="/community"
            showLabel={topbarShowLabels}
            className="hidden xl:flex"
          />
        );
      case "surveys":
        return (
          <IconButton
            key="surveys"
            icon={ClipboardList}
            label="Umfragen"
            href="/surveys"
            showLabel={topbarShowLabels}
            className="hidden xl:flex"
          />
        );
      case "quests":
        return (
          <div key="quests" className="hidden xl:flex">
            <DailyQuestsTrigger userId={resolvedUserId ?? undefined} />
          </div>
        );
      case "wardrobe":
        return (
          <IconButton
            key="wardrobe"
            icon={Shirt}
            label="Garderobe"
            href="/garderobe"
            badge={liveInventoryCount > 0 ? liveInventoryCount : undefined}
            showLabel={topbarShowLabels}
            className="hidden xl:flex"
          />
        );
      case "notifications":
        return <NotificationsBell key="notifications" />;
      case "profile":
        return (
          <IconButton
            key="profile"
            icon={UserRound}
            label="Profil"
            href="/account"
            showLabel={topbarShowLabels}
            className="hidden xl:flex"
          />
        );
      case "logout":
        return (
          <span key="logout" className="hidden xl:flex">
            <LogoutButton />
          </span>
        );
      default:
        return null;
    }
  }

  return (
    <>
    <header
      className="sticky top-0 z-50 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:gap-4 border-b border-white/[0.06] bg-[#030305]/95 px-3 sm:px-4 py-2 backdrop-blur-md"
      style={{ paddingLeft: "max(0.75rem, calc(0.75rem + env(safe-area-inset-left)))", paddingRight: "max(0.75rem, calc(0.75rem + env(safe-area-inset-right)))" }}
    >
      {/* Left: version + logo + credits + admin buttons */}
      <div className="flex items-center gap-2.5 justify-self-start">
        <Link
          href="/patchnotes"
          onMouseEnter={sound.hover}
          onClick={sound.click}
          title="Patch Notes"
          className="hidden items-center rounded-md border border-purple-500/40 bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold tracking-widest text-purple-300 transition-colors hover:border-purple-400/70 hover:bg-purple-500/20 hover:text-purple-200 sm:flex [@media(max-height:600px)]:hidden"
        >
          {siteVersion}
        </Link>
        <Link
          href="/"
          onMouseEnter={sound.hover}
          onClick={sound.click}
          className="group flex items-center gap-2"
        >
          <span className="relative flex items-center justify-center">
            <span aria-hidden className="logo-icon-glow" />
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={siteName}
                className="relative h-6 w-6 rounded object-cover transition-transform duration-300 group-hover:rotate-[-8deg] group-hover:scale-110"
              />
            ) : (
              <LogoIcon className="relative h-6 w-6 text-purple-400 transition-transform duration-300 group-hover:rotate-[-8deg] group-hover:scale-110" />
            )}
          </span>
          <span className="logo-text hidden font-extrabold tracking-tight sm:inline [@media(max-height:600px)]:hidden">{siteName}</span>
        </Link>

        {/* Credits pill — animates on change */}
        <motion.div
          key={credits}
          initial={{ scale: 1.1 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          className="flex items-center gap-1.5 rounded-full bg-purple-600/90 px-3 py-1 text-sm font-semibold text-white shadow-[0_0_10px_rgba(147,51,234,0.25)]"
        >
          <Coins className="h-3.5 w-3.5 shrink-0 text-purple-200" />
          <span className="tabular-nums">{creditsLabel}</span>
          <span className="hidden text-xs text-purple-200/70 sm:inline [@media(max-height:600px)]:hidden">{currencyName}</span>
        </motion.div>

        {liveLevel > 0 && (
          <Link href="/account" onMouseEnter={sound.hover} onClick={sound.click} className="hidden sm:block [@media(max-height:600px)]:hidden">
            <LevelBadge level={liveLevel} size="xs" />
          </Link>
        )}

        {isAdmin && (
          <>
            <IconButton
              icon={ShieldAlert}
              label="Admin-Panel"
              href="/admin"
              showLabel={topbarShowLabels}
              className="hidden xl:flex [@media(max-height:600px)]:hidden bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 hover:text-amber-200 border-0"
            />
            <IconButton
              icon={Shield}
              label="Mod-Panel"
              href="/mod"
              showLabel={topbarShowLabels}
              className="hidden xl:flex [@media(max-height:600px)]:hidden bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 hover:text-sky-200 border-0"
            />
          </>
        )}
        {isModerator && !isAdmin && (
          <IconButton
            icon={Shield}
            label="Mod-Panel"
            href="/mod"
            showLabel={topbarShowLabels}
            className="hidden xl:flex [@media(max-height:600px)]:hidden bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 hover:text-sky-200 border-0"
          />
        )}
      </div>

      {/* Center: clock + streak */}
      <div className="justify-self-center">
        <LiveClock streakDays={streakDays} onClaimed={onCreditsChange} />
      </div>

      {/* Right: configurable slots (desktop) + hamburger (mobile) */}
      <div className="flex items-center gap-1.5 justify-self-end">
        {/* Nav slots — hidden entirely in mobile landscape (short viewport) */}
        <div className="[@media(max-height:600px)]:hidden contents">
          {slots.map((slot) => renderSlot(slot))}
        </div>
        {/* Hamburger — visible on mobile + always visible in landscape regardless of md: breakpoint */}
        <button
          onMouseEnter={sound.hover}
          onClick={() => { sound.click(); setMobileMenuOpen(true); }}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-zinc-300 transition-colors hover:border-white/20 hover:text-white xl:hidden [@media(max-height:600px)]:flex"
          aria-label="Menü öffnen"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

    </header>

    <MobileNavDrawer
      open={mobileMenuOpen}
      onClose={() => setMobileMenuOpen(false)}
      isAdmin={isAdmin}
      isModerator={isModerator}
      credits={credits}
      currencyName={currencyName ?? "CR"}
      slots={slots}
      pendingTradesCount={pendingTradesCount}
      inventoryCount={liveInventoryCount}
    />
    </>
  );
}
