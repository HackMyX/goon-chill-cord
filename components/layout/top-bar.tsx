"use client";

import Link from "next/link";
import {
  Gamepad2,
  Link2,
  ShoppingBag,
  Gavel,
  Repeat,
  Users,
  Shirt,
  UserRound,
} from "lucide-react";
import { IconButton } from "@/components/layout/icon-button";
import { GamesMenu } from "@/components/layout/games-menu";
import { LiveClock } from "@/components/layout/live-clock";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { LogoutButton } from "@/components/auth/logout-button";
import { useSoundManager } from "@/lib/sound-manager";

interface TopBarProps {
  credits: number;
  inventoryCount?: number;
  streakDays?: number;
  /** Forwarded to LiveClock — see its own docs for why this is optional. */
  onCreditsChange?: (newCredits: number) => void;
}

export function TopBar({ credits, inventoryCount = 0, streakDays = 2, onCreditsChange }: TopBarProps) {
  const creditsLabel = new Intl.NumberFormat("de-DE").format(credits);
  const sound = useSoundManager();

  return (
    // `minmax(0,1fr)` (not bare `1fr`) on both side columns forces them to
    // *true* equal width regardless of how much content either side holds
    // — content that doesn't fit wraps/overflows inside its own column
    // instead of stretching that column wider, which is what let the
    // Streak clock and the Games dropdown collide before. The center
    // column is `auto`, so the clock always gets exactly its own space.
    <header className="sticky top-0 z-50 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b border-white/5 bg-[#030305]/95 px-4 py-2 backdrop-blur">
      {/* Left: logo + credits */}
      <div className="flex items-center gap-3 justify-self-start">
        <Link
          href="/"
          onMouseEnter={sound.hover}
          onClick={sound.click}
          className="group flex items-center gap-2"
        >
          <span className="relative flex items-center justify-center">
            <span aria-hidden className="logo-icon-glow" />
            <Gamepad2 className="relative h-6 w-6 text-purple-400 transition-transform duration-300 group-hover:rotate-[-8deg] group-hover:scale-110" />
          </span>
          <span className="logo-text hidden font-extrabold tracking-tight sm:inline">
            Goon&apos;n Chill Cord
          </span>
        </Link>
        <div className="flex items-center gap-1 rounded-full bg-purple-600/90 px-3 py-1 text-sm font-semibold text-white">
          <span>{creditsLabel} CR</span>
          <Link2 className="h-3.5 w-3.5 opacity-80" />
        </div>
      </div>

      {/* Center: clock + streak — always its own column, never overlapped */}
      <div className="justify-self-center">
        <LiveClock streakDays={streakDays} onClaimed={onCreditsChange} />
      </div>

      {/* Right: games (widest control, sits outermost-left of this group) +
          non-game features (hidden on small screens) + core nav.
          No `overflow-hidden` here on purpose — it used to clip the top
          sliver of the Garderobe badge (IconButton positions it at
          `-top-1 -right-1`, just outside the button's own box, and a tight
          `overflow-hidden` wrapper cut that off). The responsive `hidden
          md:block` / `hidden lg:flex` groups above already keep this row
          from ever actually overflowing its grid column on narrow screens,
          so there's nothing left for `overflow-hidden` to protect against. */}
      <div className="flex items-center gap-1.5 justify-self-end">
        <div className="hidden md:block">
          <GamesMenu />
        </div>
        <div className="hidden items-center gap-1.5 lg:flex">
          <IconButton icon={ShoppingBag} label="Shop" href="/shop" />
          <IconButton icon={Gavel} label="Auktionshaus" href="/auctions" />
          <IconButton icon={Repeat} label="Trading" href="/trading" />
          <IconButton icon={Users} label="Community" href="/community" />
        </div>
        <IconButton icon={Shirt} label="Garderobe" href="/garderobe" badge={inventoryCount} />
        <NotificationsBell />
        <IconButton icon={UserRound} label="Profil" href="/account" />
        <LogoutButton />
      </div>
    </header>
  );
}
