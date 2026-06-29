"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSoundManager } from "@/lib/sound-manager";
import { useFeedbackSettings } from "@/lib/use-feedback";
import { hexToRgba, INTENSITY_FACTOR } from "@/lib/feedback-config";

interface XpToast {
  id: string;
  amount: number;
  /** How many rapid-fire gains were merged into this toast (combo). */
  combo: number;
}

/** Global XP gain notification — subscribes to the user's profile via
 * Supabase Realtime and shows a juicy "+XX XP" chip whenever xp increases.
 * Mounted once in the root layout. Merges rapid-fire gains (same 600 ms
 * window) into one chip and tracks a combo multiplier so Plinko/auto-bet spam
 * turns into a satisfying "x5 COMBO" instead of flooding the screen. */
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
  const pendingRef = useRef<{ amount: number; combo: number; timer: ReturnType<typeof setTimeout> } | null>(null);

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
            // Merge rapid-fire gains into one toast + bump the combo counter.
            if (pendingRef.current) {
              clearTimeout(pendingRef.current.timer);
              pendingRef.current.amount += gained;
              pendingRef.current.combo += 1;
              const acc = pendingRef.current.amount;
              const combo = pendingRef.current.combo;
              pendingRef.current.timer = setTimeout(() => { flush(acc, combo); pendingRef.current = null; }, 600);
            } else {
              pendingRef.current = {
                amount: gained,
                combo: 1,
                timer: setTimeout(() => {
                  flush(pendingRef.current!.amount, pendingRef.current!.combo);
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

  function flush(amount: number, combo: number) {
    if (!allowsRef.current("xp_gain")) return; // admin/user can disable XP feedback
    if (soundOnRef.current) sound.xpGain();
    setQueue((q) => [
      ...q.slice(-2), // keep max 3 at a time
      { id: `${Date.now()}-${Math.random()}`, amount, combo },
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
            intensity={ev.intensity}
            onDone={() => dismiss(toast.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function XpToastChip({ toast, accent, durationMs, icon, intensity, onDone }: {
  toast: XpToast; accent: string; durationMs: number; icon: string;
  intensity: "subtle" | "normal" | "epic"; onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, Math.max(1200, durationMs));
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const f = INTENSITY_FACTOR[intensity] ?? INTENSITY_FACTOR.subtle;
  const big = toast.combo >= 3;
  // A few sparkles that rise off the chip — more for bigger combos.
  const sparkCount = Math.min(10, 3 + toast.combo);
  const sparks = Array.from({ length: sparkCount }, (_, i) => ({
    i,
    x: (i % 2 ? 1 : -1) * (8 + (i % 5) * 9),
    delay: (i % 5) * 0.05,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.84 }}
      animate={{ opacity: 1, y: 0, scale: f.scale }}
      exit={{ opacity: 0, y: -14, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 420, damping: 26 }}
      className="pointer-events-auto relative"
    >
      {/* rising sparkles */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-0">
        {sparks.map((s) => (
          <span
            key={s.i}
            className="absolute left-1/2 block h-1 w-1 rounded-full"
            style={{
              background: accent,
              boxShadow: `0 0 6px ${accent}`,
              ["--fb-cx" as string]: `${s.x}px`,
              ["--fb-cy" as string]: `-${26 + (s.i % 4) * 10}px`,
              ["--fb-cr" as string]: "120deg",
              animation: `fb-star 1s ${s.delay}s ease-out forwards`,
            }}
          />
        ))}
      </div>
      <div
        className="relative z-10 flex items-center gap-1.5 rounded-full border bg-black/70 px-3 py-1 backdrop-blur-md"
        style={{
          borderColor: hexToRgba(accent, 0.55),
          boxShadow: `0 0 ${Math.round(14 + f.glow * 40)}px ${hexToRgba(accent, 0.3 + f.glow)}`,
        }}
      >
        <span className="text-xs leading-none">{icon || "✨"}</span>
        <Zap className={big ? "h-3.5 w-3.5" : "h-3 w-3"} style={{ color: accent }} />
        <span className={`font-black tabular-nums ${big ? "text-sm" : "text-xs"}`} style={{ color: accent }}>
          +{toast.amount.toLocaleString("de-DE")} XP
        </span>
        {toast.combo > 1 && (
          <motion.span
            key={toast.combo}
            initial={{ scale: 1.5, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 18 }}
            className="ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-black uppercase leading-none"
            style={{ background: hexToRgba(accent, 0.22), color: accent, border: `1px solid ${hexToRgba(accent, 0.5)}` }}
          >
            ×{toast.combo}{toast.combo >= 5 ? " 🔥" : ""}
          </motion.span>
        )}
      </div>
    </motion.div>
  );
}
