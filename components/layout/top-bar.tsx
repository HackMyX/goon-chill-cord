"use client";

import {
  Gamepad2,
  Link2,
  ShoppingBag,
  Gavel,
  Pickaxe,
  Repeat,
  Backpack,
  Users,
  Globe,
  Swords,
  Shirt,
  UserRound,
} from "lucide-react";
import { IconButton } from "@/components/layout/icon-button";
import { LiveClock } from "@/components/layout/live-clock";
import { LogoutButton } from "@/components/auth/logout-button";

interface TopBarProps {
  credits: number;
  inventoryCount?: number;
  streakDays?: number;
}

export function TopBar({
  credits,
  inventoryCount = 0,
  streakDays = 2,
}: TopBarProps) {
  const creditsLabel = new Intl.NumberFormat("de-DE").format(credits);

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between gap-4 border-b border-white/5 bg-[#0b0b12]/95 px-4 py-2 backdrop-blur">
      {/* Left: logo + credits */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Gamepad2 className="h-6 w-6 text-purple-400" />
          <span className="hidden font-bold text-zinc-100 sm:inline">
            Goon&apos;n Chill Cord
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-purple-600/90 px-3 py-1 text-sm font-semibold text-white">
          <span>{creditsLabel} CR</span>
          <Link2 className="h-3.5 w-3.5 opacity-80" />
        </div>
      </div>

      {/* Left-center: action icons */}
      <div className="flex items-center gap-2">
        <IconButton icon={ShoppingBag} label="Shop" />
        <IconButton icon={Gavel} label="Auktionshaus" />
        <IconButton icon={Pickaxe} label="Mine" />
        <IconButton icon={Repeat} label="Trading" />
      </div>

      {/* Center: clock + streak */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <LiveClock streakDays={streakDays} />
      </div>

      {/* Right-center: inventory */}
      <div className="flex items-center">
        <button className="relative flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-purple-500/20 hover:text-purple-300">
          <Backpack className="h-4 w-4" />
          Inventar
          {inventoryCount > 0 && (
            <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-purple-600 px-1 text-[10px] font-bold text-white">
              {inventoryCount}
            </span>
          )}
        </button>
      </div>

      {/* Right: secondary icons */}
      <div className="flex items-center gap-2">
        <IconButton icon={Users} label="Community" />
        <IconButton icon={Globe} label="3D-Welt" />
        <IconButton icon={Swords} label="Games" />
        <IconButton icon={Shirt} label="Garderobe" />
        <IconButton icon={UserRound} label="Profil" />
        <LogoutButton />
      </div>
    </header>
  );
}
