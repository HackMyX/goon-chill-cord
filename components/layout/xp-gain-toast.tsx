"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSoundManager } from "@/lib/sound-manager";
import { useFeedbackSettings } from "@/lib/use-feedback";
import { hexToRgba } from "@/lib/feedback-config";

interface XpToast {
  id: string;
  amount: number;
}

/** Global XP gain notification — subscribes to the user's profile via
 * Supabase Realtime and shows a small "+XX XP" chip whenever xp increases.
 * Mounted once in the root layout. Merges rapid-fire gains (same 600 ms
 * window) so Plinko spam doesn't flood the screen. */
export function XpGainToast({ userId }: { userId?: string | null }) {
  const [queue, setQueue] = useState<XpToast[]>([]);
  const [resolvedUserId, setResolvedUserId] = useState(userId ?? null);
  const sound = useSoundManager();
  const { config, allows } = useFeedbackSettings();
  const allowsRef = useRef(allows);
  allowsRef.current = allows;
  const ev = config.events.xp_gain;
  const soundOnRef = useRef(ev.sound);
  soundOnRef.current = ev.sound;
  // Pending accumulator for rapid-fire merge (e.g. Plinko auto-bet)
  const pendingRef = useRef<{ amount: number; timer: ReturnType<typeof setTimeout> } | null>(null);

  useEffect(() => {
    if (userId) { setResolvedUserId(userId); return; }
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setResolvedUserId(data.user.id);
    });
  }, [userId]);

  useEffect(() => {
    if (!resolvedUserId) return;
    let prevXp: number | null = null;
    const supabase = createClient();

    supabase
      .from("profiles")
      .select("xp")
      .eq("id", resolvedUserId)
      .single()
      .then(({ data }) => { if (typeof data?.xp === "number") prevXp = data.xp as number; });

    const channel = supabase
      .channel(`xp-gain-toast-${resolvedUserId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${resolvedUserId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const newXp = typeof row.xp === "number" ? row.xp : null;
          if (newXp === null) return;
          if (prevXp !== null && newXp > prevXp) {
            const gained = newXp - prevXp;
            // Merge rapid-fire gains into one toast
            if (pendingRef.current) {
              clearTimeout(pendingRef.current.timer);
              pendingRef.current.amount += gained;
              const acc = pendingRef.current.amount;
              pendingRef.current.timer = setTimeout(() => {
                flush(acc);
                pendingRef.current = null;
              }, 600);
            } else {
              pendingRef.current = {
                amount: gained,
                timer: setTimeout(() => {
                  flush(pendingRef.current!.amount);
                  pendingRef.current = null;
                }, 600),
              };
            }
          }
          if (newXp !== null) prevXp = newXp;
        }
      )
      .subscribe();

    return () => {
      if (pendingRef.current) clearTimeout(pendingRef.current.timer);
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedUserId]);

  function flush(amount: number) {
    if (!allowsRef.current("xp_gain")) return; // admin/user can disable XP feedback
    if (soundOnRef.current) sound.xpGain();
    setQueue((q) => [
      ...q.slice(-2), // keep max 3 at a time
      { id: `${Date.now()}-${Math.random()}`, amount },
    ]);
  }

  function dismiss(id: string) {
    setQueue((q) => q.filter((t) => t.id !== id));
  }

  return (
    <div
      className="pointer-events-none fixed bottom-[calc(13.5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-[590] flex -translate-x-1/2 flex-col-reverse items-center gap-1.5"
      aria-live="polite"
    >
      <AnimatePresence>
        {queue.map((toast) => (
          <XpToastChip
            key={toast.id}
            toast={toast}
            accent={ev.accent}
            durationMs={ev.durationMs}
            icon={ev.icon}
            onDone={() => dismiss(toast.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function XpToastChip({ toast, accent, durationMs, icon, onDone }: {
  toast: XpToast; accent: string; durationMs: number; icon: string; onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, Math.max(1200, durationMs));
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.88 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.92 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      className="pointer-events-auto"
    >
      <div
        className="flex items-center gap-1.5 rounded-full border bg-black/70 px-3 py-1 backdrop-blur-md"
        style={{ borderColor: hexToRgba(accent, 0.5), boxShadow: `0 0 16px ${hexToRgba(accent, 0.25)}` }}
      >
        <span className="text-xs leading-none">{icon || "✨"}</span>
        <Zap className="h-3 w-3" style={{ color: accent }} />
        <span className="text-xs font-bold tabular-nums" style={{ color: accent }}>
          +{toast.amount.toLocaleString("de-DE")} XP
        </span>
      </div>
    </motion.div>
  );
}
