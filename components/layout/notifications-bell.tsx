"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bell, CheckCheck, Repeat, Gavel, Sparkles, Swords, Flame, Gift, ShieldCheck, MessageCircle, ShoppingBag, Coins, Ban, Lightbulb, Dice5, PackageOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationEntry,
} from "@/lib/actions/notifications";
import { useSoundManager } from "@/lib/sound-manager";
import { debugLog } from "@/lib/debug";

const TYPE_ICON: Record<string, typeof Bell> = {
  trade_offer: Repeat,
  trade_accepted: Repeat,
  trade_declined: Repeat,
  auction_bid: Gavel,
  auction_outbid: Gavel,
  auction_sold: Gavel,
  auction_won: Gavel,
  pvp_hit: Swords,
  pvp_kill: Swords,
  streak_kill: Flame,
  streak_claim: Gift,
  streak_commit: Flame,
  admin_action: ShieldCheck,
  admin_credits: Coins,
  admin_grant_item: Gift,
  admin_ban: Ban,
  shop_purchase: ShoppingBag,
  ticket_new: MessageCircle,
  ticket_reply: MessageCircle,
  ticket_status: MessageCircle,
  ticket_suggestion: Lightbulb,
  case_opened: PackageOpen,
  double_or_nothing: Dice5,
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "jetzt";
  if (mins < 60) return `vor ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours}h`;
  return `vor ${Math.floor(hours / 24)}d`;
}

/**
 * Bell icon + dropdown — live via Supabase Realtime (lib/presence-client.ts
 * sibling pattern, just its own channel keyed by user id since
 * notifications are per-user, not a shared presence roster). A brand new
 * row insert bounces the bell and plays a sound *before* the dropdown is
 * even opened, so "you have something new" is noticeable without having
 * to go look.
 */
export function NotificationsBell() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [bounce, setBounce] = useState(false);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sound = useSoundManager();

  useEffect(() => {
    const timeout = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
    const supabase = createClient();

    getNotifications().then((list) => {
      if (active) setNotifications(list);
    });

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || !active) return;
      channel = supabase
        .channel(`notifications:${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          (payload) => {
            const row = payload.new as {
              id: string;
              type: string;
              title: string;
              message: string;
              link: string | null;
              read: boolean;
              created_at: string;
            };
            debugLog("Notifications", "new notification received", row);
            setNotifications((curr) => [
              {
                id: row.id,
                type: row.type,
                title: row.title,
                message: row.message,
                link: row.link,
                read: row.read,
                createdAt: row.created_at,
              },
              ...curr,
            ]);
            sound.win();
            setBounce(true);
            setTimeout(() => setBounce(false), 1000);
          }
        )
        .subscribe();
    });

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only subscription
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  function toggleOpen() {
    sound.click();
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setOpen((o) => !o);
  }

  async function handleNotificationClick(n: NotificationEntry) {
    sound.click();
    if (!n.read) {
      setNotifications((curr) => curr.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      await markNotificationRead(n.id);
    }
    setOpen(false);
  }

  async function handleMarkAllRead() {
    sound.click();
    setNotifications((curr) => curr.map((n) => ({ ...n, read: true })));
    await markAllNotificationsRead();
  }

  return (
    <>
      <button
        ref={buttonRef}
        onMouseEnter={sound.hover}
        onClick={toggleOpen}
        className={`relative flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-zinc-300 transition-colors hover:bg-purple-500/20 hover:text-purple-300 ${
          bounce ? "animate-bounce" : ""
        }`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow-[0_0_8px_rgba(239,68,68,0.7)]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: coords.top, right: coords.right }}
            className="fixed z-[100] w-80 overflow-hidden rounded-xl border border-white/10 bg-[#0b0814] shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
              <span className="text-sm font-bold text-zinc-200">Benachrichtigungen</span>
              {unreadCount > 0 && (
                <button
                  onMouseEnter={sound.hover}
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-[11px] font-semibold text-purple-300 hover:text-purple-200"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Alle gelesen
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <Sparkles className="h-6 w-6 text-zinc-600" />
                  <p className="text-xs text-zinc-500">Noch keine Benachrichtigungen.</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const Icon = TYPE_ICON[n.type] ?? Bell;
                  const content = (
                    <div
                      className={`flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-purple-500/10 ${
                        !n.read ? "bg-purple-500/[0.06]" : ""
                      }`}
                    >
                      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${!n.read ? "text-purple-300" : "text-zinc-500"}`} />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold ${!n.read ? "text-zinc-100" : "text-zinc-400"}`}>
                          {n.title}
                        </p>
                        <p className="line-clamp-2 text-xs text-zinc-500">{n.message}</p>
                        <p className="mt-0.5 text-[10px] text-zinc-600">{timeAgo(n.createdAt)}</p>
                      </div>
                      {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-purple-400" />}
                    </div>
                  );
                  return n.link ? (
                    <Link key={n.id} href={n.link} onClick={() => handleNotificationClick(n)}>
                      {content}
                    </Link>
                  ) : (
                    <button key={n.id} onClick={() => handleNotificationClick(n)} className="w-full">
                      {content}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
