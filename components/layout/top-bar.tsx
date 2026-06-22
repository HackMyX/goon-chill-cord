"use client";

import Link from "next/link";
import {
  Link2,
  ShoppingBag,
  Gavel,
  Repeat,
  Users,
  Shirt,
  UserRound,
  ShieldAlert,
} from "lucide-react";
import { IconButton } from "@/components/layout/icon-button";
import { GamesMenu } from "@/components/layout/games-menu";
import { LiveClock } from "@/components/layout/live-clock";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { LogoutButton } from "@/components/auth/logout-button";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import { resolveSiteLogoIcon } from "@/lib/site-logo-icons";
import { useSoundManager } from "@/lib/sound-manager";

interface TopBarProps {
  credits: number;
  inventoryCount?: number;
  streakDays?: number;
  /** Forwarded to LiveClock — see its own docs for why this is optional. */
  onCreditsChange?: (newCredits: number) => void;
  /** Shows the small Admin-panel shortcut next to the CR display below —
   * every page rendering TopBar computes this server-side itself (`lib/
   * admin.ts`'s `isAdmin(profile)`, same check the homepage's own big
   * "Admin" button already gates on) and passes the plain boolean down, so
   * a non-admin's TopBar never even receives the `/admin` href, let alone
   * renders a button pointing at it. Defaults to `false` so every existing
   * call site that hasn't been updated yet simply keeps not showing it,
   * rather than erroring. */
  isAdmin?: boolean;
}

export function TopBar({
  credits,
  inventoryCount = 0,
  streakDays = 2,
  onCreditsChange,
  isAdmin = false,
}: TopBarProps) {
  const creditsLabel = new Intl.NumberFormat("de-DE").format(credits);
  const sound = useSoundManager();
  const { siteName, logoUrl, logoIconName } = useSiteConfig();
  const LogoIcon = resolveSiteLogoIcon(logoIconName);

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
            {logoUrl ? (
              // Admin-provided arbitrary external URL, not a local/
              // optimizable asset — next/image would need it allow-listed
              // per-domain, which an admin-editable URL can't satisfy.
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
          <span>{creditsLabel} CR</span>
          <Link2 className="h-3.5 w-3.5 opacity-80" />
        </div>
        {/* Admin-only shortcut to /admin — previously only reachable from
            the homepage's big "Admin" button, which meant leaving the
            homepage (e.g. into the World to tune a fight live) meant
            clicking all the way back just to reach the panel again. */}
        {isAdmin && (
          <IconButton
            icon={ShieldAlert}
            label="Admin-Panel"
            href="/admin"
            className="bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 hover:text-amber-200"
          />
        )}
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
