"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Star, ChevronUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getLevelColor, isMilestoneLevel, resolveLevelRoadTier, DEFAULT_LEVEL_ROAD_CONFIG, type LevelRoadConfig, type LevelDefinition } from "@/lib/level-system";
import { getXpConfig } from "@/lib/actions/level-system";
import { useSoundManager } from "@/lib/sound-manager";
import { MilestoneCelebration } from "@/components/layout/milestone-celebration";
import { useFeedbackSettings } from "@/lib/use-feedback";
import { hexToRgba } from "@/lib/feedback-config";

interface LevelUpEvent {
  id: string;
  oldLevel: number;
  newLevel: number;
}

export function LevelUpPopup({ userId }: { userId?: string | null }) {
  const [queue, setQueue] = useState<LevelUpEvent[]>([]);
  const [resolvedUserId, setResolvedUserId] = useState(userId ?? null);
  const [roadConfig, setRoadConfig] = useState<LevelRoadConfig>(DEFAULT_LEVEL_ROAD_CONFIG);
  const [levels, setLevels] = useState<LevelDefinition[]>([]);
  const sound = useSoundManager();
  const { config: fbConfig, allows } = useFeedbackSettings();
  // Refs so the realtime callback (mount-only) always sees the latest config.
  const roadConfigRef = useRef(roadConfig);
  roadConfigRef.current = roadConfig;
  const allowsRef = useRef(allows);
  allowsRef.current = allows;
  const fbRef = useRef(fbConfig);
  fbRef.current = fbConfig;

  // Load level config once so milestone level-ups can trigger the fullscreen
  // celebration (with the level's title + rewards), and tier colours match.
  useEffect(() => {
    getXpConfig().then((cfg) => {
      setRoadConfig(cfg.levelRoadConfig ?? DEFAULT_LEVEL_ROAD_CONFIG);
      setLevels(cfg.levels ?? []);
    }).catch(() => {});
  }, []);

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
            const milestone = isMilestoneLevel(newLevel, roadConfigRef.current) && roadConfigRef.current.celebrateMilestones !== false;
            const key = milestone ? "level_milestone" : "level_up";
            if (allowsRef.current(key)) {
              setQueue((q) => [...q, {
                id: `${Date.now()}`,
                oldLevel: prevLevel!,
                newLevel,
              }]);
              if (fbRef.current.events[key].sound) sound.levelUp();
            }
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
  const showMilestone = !!current && isMilestoneLevel(current.newLevel, roadConfig) && roadConfig.celebrateMilestones !== false;
  const tier = current ? resolveLevelRoadTier(current.newLevel, roadConfig) : null;
  const levelDef = current ? levels.find((l) => l.level === current.newLevel) : undefined;

  return (
    <AnimatePresence>
      {current && showMilestone && tier && (
        <MilestoneCelebration
          key={current.id}
          level={current.newLevel}
          title={levelDef?.title}
          accent={tier.accent}
          glow={tier.glow}
          rewards={levelDef?.rewards ?? []}
          onClose={() => dismiss(current.id)}
        />
      )}
      {current && !showMilestone && (
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
          <div
            className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-amber-900/80 via-[#1a0a00]/90 to-purple-900/60 px-6 py-4 backdrop-blur-md"
            style={{ borderColor: hexToRgba(fbConfig.events.level_up.accent, 0.45), boxShadow: `0 0 40px ${hexToRgba(fbConfig.events.level_up.accent, 0.28)}` }}
          >
            {/* Shimmer */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 1.2, ease: "linear", repeat: Infinity, repeatDelay: 1 }}
            />

            <div className="relative flex items-center gap-4">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl border text-2xl"
                style={{ borderColor: hexToRgba(fbConfig.events.level_up.accent, 0.5), background: hexToRgba(fbConfig.events.level_up.accent, 0.15), boxShadow: `0 0 20px ${hexToRgba(fbConfig.events.level_up.accent, 0.3)}` }}
              >
                {fbConfig.events.level_up.icon || <ChevronUp className="h-6 w-6" style={{ color: fbConfig.events.level_up.accent }} />}
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Zap className="h-3.5 w-3.5" style={{ color: fbConfig.events.level_up.accent }} />
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: fbConfig.events.level_up.accent }}>Level Up!</span>
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
