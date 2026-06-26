"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  X,
  Home,
  ShoppingBag,
  Gavel,
  Repeat,
  Users,
  Shirt,
  UserRound,
  ShieldAlert,
  Shield,
  ClipboardList,
  Globe,
  Coins,
  Package,
  Gamepad2,
  Dices,
  TrendingUp,
  BarChart2,
  LogOut,
  Disc3,
  MessageCircle,
} from "lucide-react";
import { GamesMenu } from "@/components/layout/games-menu";
import { LogoutButton } from "@/components/auth/logout-button";
import { useSoundManager } from "@/lib/sound-manager";

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  isModerator?: boolean;
  credits: number;
  currencyName: string;
  slots: string[];
  pendingTradesCount?: number;
  inventoryCount?: number;
}

type IconComponent = React.ComponentType<{ className?: string }>;

interface NavLinkItem {
  icon: IconComponent;
  label: string;
  href: string;
  badge?: number;
  colorClass?: string;
}

export function MobileNavDrawer({
  open,
  onClose,
  isAdmin = false,
  isModerator = false,
  credits,
  currencyName,
  slots,
  pendingTradesCount = 0,
  inventoryCount = 0,
}: MobileNavDrawerProps) {
  const sound = useSoundManager();

  // Prevent body scroll while drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const SLOT_MAP: Record<string, NavLinkItem> = {
    shop:      { icon: ShoppingBag, label: "Shop",        href: "/shop" },
    auctions:  { icon: Gavel,       label: "Auktionen",   href: "/auctions" },
    trading:   { icon: Repeat,      label: "Trading",     href: "/trading", badge: pendingTradesCount > 0 ? pendingTradesCount : undefined },
    community: { icon: Users,       label: "Community",   href: "/community" },
    surveys:   { icon: ClipboardList, label: "Umfragen",  href: "/surveys" },
    wardrobe:  { icon: Shirt,       label: "Garderobe",   href: "/garderobe", badge: inventoryCount > 0 ? inventoryCount : undefined },
    profile:   { icon: UserRound,   label: "Profil",      href: "/account" },
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer panel — slides in from the right */}
      <div
        className="fixed right-0 top-0 bottom-0 z-[61] flex w-72 flex-col bg-[#0d0b18] border-l border-white/[0.08] shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <span className="text-sm font-bold text-zinc-200">Navigation</span>
          <button
            onMouseEnter={sound.hover}
            onClick={() => { sound.click(); onClose(); }}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition-colors hover:border-white/20 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Credits pill */}
        <div className="px-5 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 rounded-full bg-purple-600/20 border border-purple-500/30 px-3.5 py-2">
            <Coins className="h-4 w-4 text-purple-300" />
            <span className="font-bold text-white tabular-nums">
              {new Intl.NumberFormat("de-DE").format(credits)}
            </span>
            <span className="text-xs text-purple-300/70">{currencyName}</span>
          </div>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          <NavItem icon={Home} label="Startseite" href="/" onClose={onClose} />

          {/* Games section */}
          <div className="px-2 pt-3 pb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Spiele</span>
          </div>
          <NavItem icon={Globe} label="Farmwelt" href="/world" onClose={onClose} />
          <NavItem icon={Gamepad2} label="Snake" href="/snake" onClose={onClose} />
          <NavItem icon={Disc3} label="Plinko" href="/plinko" onClose={onClose} />
          <NavItem icon={Dices} label="Double or Nothing" href="/don" onClose={onClose} />
          <NavItem icon={Package} label="Cases" href="/cases" onClose={onClose} />
          <NavItem icon={TrendingUp} label="Mining" href="/mine" onClose={onClose} />

          {/* Community section */}
          <div className="px-2 pt-3 pb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Community</span>
          </div>
          {slots.map((slot) => {
            const item = SLOT_MAP[slot];
            if (!item || slot === "notifications" || slot === "logout" || slot === "games") return null;
            return (
              <NavItem
                key={slot}
                icon={item.icon}
                label={item.label}
                href={item.href}
                badge={item.badge}
                onClose={onClose}
              />
            );
          })}

          {/* Admin/Mod */}
          {(isAdmin || isModerator) && (
            <div className="px-2 pt-3 pb-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Panel</span>
            </div>
          )}
          {isAdmin && (
            <NavItem icon={ShieldAlert} label="Admin-Panel" href="/admin" onClose={onClose} colorClass="text-amber-300" />
          )}
          {(isAdmin || isModerator) && (
            <NavItem icon={Shield} label="Mod-Panel" href="/mod" onClose={onClose} colorClass="text-sky-300" />
          )}

          {/* Support section */}
          <div className="px-2 pt-3 pb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Support</span>
          </div>
          <button
            onMouseEnter={sound.hover}
            onClick={() => {
              sound.click();
              onClose();
              window.dispatchEvent(new CustomEvent("openSupportPanel"));
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-purple-300 transition-colors hover:bg-white/5"
          >
            <MessageCircle className="h-5 w-5 shrink-0" />
            <span className="flex-1 text-left text-sm font-medium">Hilfe &amp; Chat</span>
          </button>
        </nav>

        {/* Logout at the bottom */}
        <div className="border-t border-white/[0.06] px-5 py-3">
          <LogoutButton />
        </div>
      </div>
    </>
  );
}

function NavItem({
  icon: Icon,
  label,
  href,
  badge,
  colorClass = "text-zinc-300",
  onClose,
}: {
  icon: IconComponent;
  label: string;
  href: string;
  badge?: number;
  colorClass?: string;
  onClose: () => void;
}) {
  const sound = useSoundManager();
  return (
    <Link
      href={href}
      onMouseEnter={sound.hover}
      onClick={() => { sound.click(); onClose(); }}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/5 ${colorClass}`}
    >
      <Icon className="h-4.5 w-4.5 shrink-0" />
      <span className="flex-1 text-sm font-medium">{label}</span>
      {badge !== undefined && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-purple-600/80 px-1.5 text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}
