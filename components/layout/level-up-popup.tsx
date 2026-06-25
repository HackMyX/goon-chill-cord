"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Star, ChevronUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getLevelColor } from "@/lib/level-system";
import { useSoundManager } from "@/lib/sound-manager";

interface LevelUpEvent {
  id: string;
  oldLevel: number;
  newLevel: number;
}

export function LevelUpPopup({ userId }: { userId?: string | null }) {
  const [queue, setQueue] = useState<LevelUpEvent[]>([]);
  const [resolvedUserId, setResolvedUserId] = useState(userId ?? null);
  const sound = useSoundManager();

  useEffect(() => {
    if (userId) { setResolvedUserId(userId); return; }
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setResolvedUserId(data.user.id);
    });
  }, [userId]);

  useEffect(() => {
    if (!resolvedUserId) return;
    let prevLevel: number | null = null;
    const supabase = createClient();

    supabase.from("profiles").select("level").eq("id", resolvedUserId).single()
      .then(({ data }) => { if (data?.level) prevLevel = data.level as number; });

    const channel = supabase
      .channel(`level-up-popup-${resolvedUserId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${resolvedUserId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const newLevel = typeof row.level === "number" ? row.level : null;
          if (newLevel && prevLevel !== null && newLevel > prevLevel) {
            setQueue((q) => [...q, {
              id: `${Date.now()}`,
              oldLevel: prevLevel!,
              newLevel,
            }]);
            sound.levelUp();
          }
          if (newLevel) prevLevel = newLevel;
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [resolvedUserId]);

  function dismiss(id: string) {
    setQueue((q) => q.filter((e) => e.id !== id));
  }

  const current = queue[0] ?? null;

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.id}
          initial={{ opacity: 0, y: 80, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -40, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 350, damping: 24 }}
          onAnimationComplete={() => {
            setTimeout(() => dismiss(current.id), 3500);
          }}
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-[600] -translate-x-1/2 cursor-pointer w-[calc(100vw-2rem)] max-w-sm"
          onClick={() => dismiss(current.id)}
          role="status"
          aria-live="polite"
        >
          <div className="relative overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-900/80 via-[#1a0a00]/90 to-purple-900/60 px-6 py-4 shadow-[0_0_40px_rgba(251,191,36,0.25)] backdrop-blur-md">
            {/* Shimmer */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 1.2, ease: "linear", repeat: Infinity, repeatDelay: 1 }}
            />

            <div className="relative flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/50 bg-amber-500/15 shadow-[0_0_20px_rgba(251,191,36,0.3)]">
                <ChevronUp className="h-6 w-6 text-amber-300" />
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-xs font-bold uppercase tracking-widest text-amber-400">Level Up!</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-black ${getLevelColor(current.newLevel)}`}>
                    Level {current.newLevel}
                  </span>
                  <Star className="h-4 w-4 text-amber-400 animate-spin" style={{ animationDuration: "2s" }} />
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  {current.oldLevel} → {current.newLevel} · Weiter so!
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
