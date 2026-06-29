"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useFeedbackSettings } from "@/lib/use-feedback";
import { hexToRgba } from "@/lib/feedback-config";

interface NotifToast {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
}

/** type → accent colour + emoji, matched by prefix so new types fall back nicely. */
function styleFor(type: string): { accent: string; icon: string } {
  const t = type.toLowerCase();
  if (t.startsWith("trade")) return { accent: "#22d3ee", icon: "🔁" };
  if (t.startsWith("auction")) return { accent: "#34d399", icon: "🔨" };
  if (t.startsWith("friend")) return { accent: "#a78bfa", icon: "👥" };
  if (t.startsWith("streak")) return { accent: "#fb923c", icon: "🔥" };
  if (t.startsWith("shop")) return { accent: "#fbbf24", icon: "🛒" };
  if (t.startsWith("case")) return { accent: "#e879f9", icon: "🎁" };
  if (t.startsWith("mine")) return { accent: "#f59e0b", icon: "⛏️" };
  if (t.startsWith("snake")) return { accent: "#4ade80", icon: "🐍" };
  if (t.includes("double_or_nothing")) return { accent: "#f472b6", icon: "🎲" };
  if (t.startsWith("ticket")) return { accent: "#38bdf8", icon: "🎫" };
  if (t.startsWith("admin") || t.includes("role")) return { accent: "#f87171", icon: "🛡️" };
  return { accent: "#a78bfa", icon: "🔔" };
}

/**
 * Global host that pops a small animated toast whenever a NEW notification row
 * is inserted for the user (trade, auction, shop, friend, streak …). Same visual
 * language as the reward feedback. Click navigates to the notification's link.
 * Admin master switch (`notificationToasts`) + user opt-out (`notif_toast`);
 * honours the personal reduce-motion preference. The persistent bell keeps its
 * own list — this is just the ephemeral live nudge.
 */
export function NotificationToast({ userId }: { userId?: string | null }) {
  const router = useRouter();
  const [resolvedUserId, setResolvedUserId] = useState(userId ?? null);
  const [queue, setQueue] = useState<NotifToast[]>([]);
  const { notificationToastsEnabled, reduceMotion } = useFeedbackSettings();
  const enabledRef = useRef(notificationToastsEnabled);
  enabledRef.current = notificationToastsEnabled;

  useEffect(() => {
    if (userId) { setResolvedUserId(userId); return; }
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => { if (data.user) setResolvedUserId(data.user.id); });
  }, [userId]);

  useEffect(() => {
    if (!resolvedUserId) return;
    const supabase = createClient();
    // Distinct channel from the bell so both subscriptions coexist.
    const channel = supabase
      .channel(`notif-toast:${resolvedUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${resolvedUserId}` },
        (payload) => {
          if (!enabledRef.current) return;
          const row = payload.new as Record<string, unknown>;
          setQueue((q) => [
            ...q.slice(-3),
            {
              id: String(row.id ?? `${Date.now()}-${Math.random()}`),
              type: String(row.type ?? ""),
              title: String(row.title ?? "Benachrichtigung"),
              message: String(row.message ?? ""),
              link: (row.link as string | null) ?? null,
            },
          ]);
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [resolvedUserId]);

  function dismiss(id: string) {
    setQueue((q) => q.filter((t) => t.id !== id));
  }

  if (queue.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-3 top-[max(4.5rem,env(safe-area-inset-top))] z-[580] flex w-[calc(100vw-1.5rem)] max-w-xs flex-col gap-2 sm:w-80"
      aria-live="polite"
    >
      <AnimatePresence>
        {queue.map((t) => (
          <NotifToastCard
            key={t.id}
            toast={t}
            reduceMotion={reduceMotion}
            onClick={() => { if (t.link) router.push(t.link); dismiss(t.id); }}
            onDone={() => dismiss(t.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function NotifToastCard({ toast, reduceMotion, onClick, onDone }: {
  toast: NotifToast; reduceMotion: boolean; onClick: () => void; onDone: () => void;
}) {
  const { accent, icon } = styleFor(toast.type);
  useEffect(() => {
    const t = setTimeout(onDone, 5200);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 60, scale: 0.9 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 40, scale: 0.92 }}
      transition={{ type: "spring", stiffness: 360, damping: 26 }}
      className="pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border px-3.5 py-3 text-left backdrop-blur-md"
      style={{
        borderColor: hexToRgba(accent, 0.45),
        background: `linear-gradient(135deg, ${hexToRgba(accent, 0.16)}, rgba(10,8,18,0.94) 75%)`,
        boxShadow: `0 8px 32px ${hexToRgba(accent, 0.28)}`,
      }}
    >
      {!reduceMotion && (
        <span className="absolute inset-0 -translate-x-full animate-[mine-shimmer_1.8s_ease_forwards] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      )}
      <span
        className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-lg"
        style={{ borderColor: hexToRgba(accent, 0.5), background: hexToRgba(accent, 0.14), boxShadow: `0 0 14px ${hexToRgba(accent, 0.3)}` }}
      >
        {icon}
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block truncate text-sm font-black" style={{ color: accent }}>{toast.title}</span>
        {toast.message && <span className="mt-0.5 block line-clamp-2 text-[11px] leading-snug text-zinc-300">{toast.message}</span>}
      </span>
    </motion.button>
  );
}
