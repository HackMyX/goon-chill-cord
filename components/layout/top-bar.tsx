"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ShoppingBag,
  Gavel,
  Repeat,
  Users,
  Shirt,
  UserRound,
  ShieldAlert,
  Shield,
} from "lucide-react";
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

interface TopBarProps {
  credits: number;
  inventoryCount?: number;
  streakDays?: number;
  /** Forwarded to LiveClock — see its own docs for why this is optional. */
  onCreditsChange?: (newCredits: number) => void;
  isAdmin?: boolean;
  isModerator?: boolean;
  /** Passed to enable realtime inventory-badge updates. */
  userId?: string;
  /** Pending incoming/active trades — shown as badge on Trading button. */
  pendingTradesCount?: number;
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
}: TopBarProps) {
  const creditsLabel = new Intl.NumberFormat("de-DE").format(credits);
  const sound = useSoundManager();
  const { siteName, logoUrl, logoIconName, currencyName, topbarRightSlots, siteVersion } = useSiteConfig();
  const LogoIcon = resolveSiteLogoIcon(logoIconName);

  // Realtime inventory count — starts from the server-fetched prop and stays
  // in sync without a full page reload via a lightweight Supabase channel.
  const [liveInventoryCount, setLiveInventoryCount] = useState(inventoryCount);
  const [resolvedUserId, setResolvedUserId] = useState(userId ?? null);
  useEffect(() => { setLiveInventoryCount(inventoryCount); }, [inventoryCount]);

  // Self-resolve userId when not provided — avoids threading it through
  // every page/shell prop just to keep the inventory badge realtime.
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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [resolvedUserId]);

  // Active slots — fall back to defaults if config is empty or null
  const slots: string[] =
    Array.isArray(topbarRightSlots) && topbarRightSlots.length > 0
      ? topbarRightSlots
      : [...DEFAULT_TOPBAR_RIGHT_SLOTS];

  // Separate "wide-only" slots (hidden on small screens) from "always" slots
  const wideOnlySlots = new Set(["shop", "auctions", "trading", "community"]);

  function renderSlot(slot: string) {
    switch (slot) {
      case "games":
        return (
          <div key="games" className="hidden md:block">
            <GamesMenu />
          </div>
        );
      case "shop":
        return <IconButton key="shop" icon={ShoppingBag} label="Shop" href="/shop" className="hidden lg:flex" />;
      case "auctions":
        return <IconButton key="auctions" icon={Gavel} label="Auktionshaus" href="/auctions" className="hidden lg:flex" />;
      case "trading":
        return (
          <IconButton
            key="trading"
            icon={Repeat}
            label="Trading"
            href="/trading"
            badge={pendingTradesCount > 0 ? pendingTradesCount : undefined}
            className="hidden lg:flex"
          />
        );
      case "community":
        return <IconButton key="community" icon={Users} label="Community" href="/community" className="hidden lg:flex" />;
      case "wardrobe":
        return (
          <IconButton
            key="wardrobe"
            icon={Shirt}
            label="Garderobe"
            href="/garderobe"
            badge={liveInventoryCount > 0 ? liveInventoryCount : undefined}
          />
        );
      case "notifications":
        return <NotificationsBell key="notifications" />;
      case "profile":
        return <IconButton key="profile" icon={UserRound} label="Profil" href="/account" />;
      case "logout":
        return <LogoutButton key="logout" />;
      default:
        return null;
    }
  }

  // Wide-only slots that aren't "games" get grouped so they share the
  // `hidden lg:flex` wrapper and the gap between them stays consistent.
  // We render them individually now (each slot has its own hidden class),
  // so grouping is handled per slot above.
  void wideOnlySlots; // referenced in renderSlot

  return (
    <header className="sticky top-0 z-50 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b border-white/5 bg-[#030305]/95 px-4 py-2 backdrop-blur">
      {/* Left: version badge + logo + credits */}
      <div className="flex items-center gap-3 justify-self-start">
        <Link
          href="/patchnotes"
          onMouseEnter={sound.hover}
          onClick={sound.click}
          title="Patch Notes"
          className="hidden items-center rounded-md border border-purple-500/40 bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold tracking-widest text-purple-300 transition-colors hover:border-purple-400/70 hover:bg-purple-500/20 hover:text-purple-200 sm:flex"
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
          <span className="logo-text hidden font-extrabold tracking-tight sm:inline">{siteName}</span>
        </Link>
        <div className="flex items-center gap-1 rounded-full bg-purple-600/90 px-3 py-1 text-sm font-semibold text-white">
          <span>{creditsLabel} {currencyName}</span>
        </div>
        {isAdmin && (
          <IconButton
            icon={ShieldAlert}
            label="Admin-Panel"
            href="/admin"
            className="bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 hover:text-amber-200"
          />
        )}
        {isModerator && !isAdmin && (
          <IconButton
            icon={Shield}
            label="Mod-Panel"
            href="/mod"
            className="bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 hover:text-sky-200"
          />
        )}
      </div>

      {/* Center: clock + streak — always its own column, never overlapped */}
      <div className="justify-self-center">
        <LiveClock streakDays={streakDays} onClaimed={onCreditsChange} />
      </div>

      {/* Right: configurable slot order */}
      <div className="flex items-center gap-1.5 justify-self-end">
        {slots.map((slot) => renderSlot(slot))}
      </div>
    </header>
  );
}
