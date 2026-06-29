"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { Zap, Star, Sparkles, Coins, Crown, Trophy, Palette, Gift } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getLevelColor, isMilestoneLevel, resolveLevelRoadTier, DEFAULT_LEVEL_ROAD_CONFIG, type LevelRoadConfig, type LevelDefinition, type LevelReward } from "@/lib/level-system";
import { getXpConfig } from "@/lib/actions/level-system";
import { useSoundManager } from "@/lib/sound-manager";
import { MilestoneCelebration } from "@/components/layout/milestone-celebration";
import { useFeedbackSettings } from "@/lib/use-feedback";
import { hexToRgba, INTENSITY_FACTOR, type FeedbackEventConfig } from "@/lib/feedback-config";
import { useGameplayActive, isGameplayActive, subscribeGameplayActive } from "@/lib/gameplay-activity";

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
  const { config: fbConfig, allows, eventConfig, userIntensity, reduceMotion } = useFeedbackSettings();
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

  // Defer the BIG milestone takeover while the player is mid-round: show the
  // small level-up card now, replay the fullscreen milestone after the round.
  const [pendingBig, setPendingBig] = useState<LevelUpEvent[]>([]);
  const pendingBigRef = useRef(pendingBig);
  pendingBigRef.current = pendingBig;
  const capturedRef = useRef<Set<string>>(new Set());
  const forceSmallRef = useRef<Set<string>>(new Set());
  const gameplayActive = useGameplayActive();

  const current = queue[0] ?? null;
  // Personal prefs: minimal / reduce-motion users get the calm card, not the
  // grand fullscreen milestone takeover.
  const allowBig = userIntensity !== "minimal" && !reduceMotion;
  const isMs = !!current && isMilestoneLevel(current.newLevel, roadConfig) && roadConfig.celebrateMilestones !== false && allowBig;
  // A "big" level event is one that would take over the screen: a milestone, OR a
  // normal level-up the admin configured as a fullscreen celebration.
  const luFullscreen = !!current && !isMs && eventConfig("level_up").style === "fullscreen";
  const isBig = isMs || luFullscreen;
  const deferBig = isBig && fbConfig.deferDuringGameplay && gameplayActive;
  const forceSmall = !!current && forceSmallRef.current.has(current.id);
  const showMilestone = isMs && !deferBig && !forceSmall;
  const tier = current ? resolveLevelRoadTier(current.newLevel, roadConfig) : null;
  const levelDef = current ? levels.find((l) => l.level === current.newLevel) : undefined;

  // Capture a big level event that arrived mid-round: stash a big copy for replay
  // after the round, and lock the original to render small only.
  useEffect(() => {
    if (current && deferBig && !capturedRef.current.has(current.id)) {
      capturedRef.current.add(current.id);
      forceSmallRef.current.add(current.id);
      setPendingBig((p) => [...p, { ...current, id: `${current.id}-big` }]);
    }
  }, [current, deferBig]);

  // Round over → release the deferred fullscreen milestone(s).
  useEffect(() => {
    return subscribeGameplayActive(() => {
      if (!isGameplayActive() && pendingBigRef.current.length > 0) {
        setQueue((q) => [...pendingBigRef.current, ...q]);
        setPendingBig([]);
      }
    });
  }, []);

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
      {current && !showMilestone && tier && (
        <LevelUpCelebration
          key={current.id}
          ev={eventConfig("level_up")}
          forceCard={!!(deferBig || forceSmall)}
          oldLevel={current.oldLevel}
          newLevel={current.newLevel}
          accent={tier.accent}
          glow={tier.glow}
          title={levelDef?.title}
          rewards={levelDef?.rewards ?? []}
          onDone={() => dismiss(current.id)}
        />
      )}
    </AnimatePresence>
  );
}

// ── Reward chip helpers (shared look with the milestone celebration) ─────────
function rewardIcon(type: string) {
  switch (type) {
    case "credits":    return <Coins className="h-4 w-4 text-amber-300" />;
    case "ability":    return <Crown className="h-4 w-4 text-fuchsia-300" />;
    case "badge":      return <Trophy className="h-4 w-4 text-amber-300" />;
    case "name_style": return <Palette className="h-4 w-4 text-cyan-300" />;
    default:           return <Gift className="h-4 w-4 text-purple-300" />;
  }
}
function rewardLabel(r: LevelReward): string {
  if (r.type === "credits") return `${r.amount?.toLocaleString("de-DE") ?? "?"} CR`;
  if (r.type === "xp") return `${r.amount?.toLocaleString("de-DE") ?? "?"} XP`;
  if (r.type === "ability") return r.abilityKey ?? "Fähigkeits-Gutschein";
  if (r.type === "badge") return r.badgeKey ?? "Badge";
  if (r.type === "name_style") return r.nameStyleKey ?? "Style";
  if (r.type === "game_bonus") return `${r.amount ?? 1}× ${r.bonusGame ?? "Bonus"}`;
  return r.type;
}

const LU_RINGS = [0, 1, 2];

/**
 * The standard (non-milestone) level-up celebration. A prominent, juicy popup
 * that honours the admin's `level_up` feedback config — colour, entrance
 * animation, intensity (size/glow/particles), confetti, screen flash, sound and
 * duration. When the admin sets the style to "fullscreen" it expands into a
 * centered overlay with a dark backdrop; otherwise it's a centered card.
 */
function LevelUpCelebration({
  ev, oldLevel, newLevel, accent, glow, title, rewards, onDone, forceCard = false,
}: {
  ev: FeedbackEventConfig;
  oldLevel: number;
  newLevel: number;
  accent: string;
  glow: string;
  title?: string;
  rewards: LevelReward[];
  onDone: () => void;
  /** Force the small bottom card even if the event is configured fullscreen
   *  (used for the non-blocking in-game info while a round is running). */
  forceCard?: boolean;
}) {
  const sound = useSoundManager();
  const f = INTENSITY_FACTOR[ev.intensity] ?? INTENSITY_FACTOR.normal;
  const fullscreen = ev.style === "fullscreen" && !forceCard;
  // Animated count-up old → new.
  const [shown, setShown] = useState(oldLevel);

  useEffect(() => {
    if (ev.confetti) {
      const colors = ["#ffffff", accent, "#fbbf24", "#f472b6"];
      const scale = f.particles / 24;
      confetti({ particleCount: Math.round(80 * scale), spread: 95, startVelocity: 48, origin: { y: fullscreen ? 0.45 : 0.6 }, colors, scalar: 1.05 });
      if (f.shockwave) setTimeout(() => confetti({ particleCount: Math.round(60 * scale), spread: 120, startVelocity: 40, origin: { y: 0.4 }, colors }), 260);
    }
    if (ev.sound) sound.levelUp();
    // count-up
    const span = Math.max(1, newLevel - oldLevel);
    let i = 0;
    const step = setInterval(() => {
      i += 1;
      setShown(oldLevel + Math.min(i, span));
      if (i >= span) clearInterval(step);
    }, 280);
    const auto = setTimeout(onDone, Math.max(2600, ev.durationMs));
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDone(); };
    window.addEventListener("keydown", onKey);
    return () => { clearInterval(step); clearTimeout(auto); window.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const card = (
    <motion.div
      initial={{ opacity: 0, y: fullscreen ? 24 : 60, scale: 0.7 }}
      animate={{ opacity: 1, y: 0, scale: f.scale }}
      exit={{ opacity: 0, y: -30, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      onClick={(e) => { e.stopPropagation(); onDone(); }}
      className="pointer-events-auto relative w-[calc(100vw-2rem)] max-w-sm cursor-pointer overflow-hidden rounded-3xl border px-6 py-6 backdrop-blur-xl"
      style={{
        borderColor: hexToRgba(accent, 0.5),
        background: `linear-gradient(150deg, ${hexToRgba(accent, 0.2)}, rgba(8,7,18,0.94) 72%)`,
        boxShadow: `0 0 ${Math.round(40 + f.glow * 80)}px ${hexToRgba(accent, Math.min(0.6, f.glow + 0.18))}`,
      }}
      role="status"
      aria-live="assertive"
    >
      {/* shimmer sweep */}
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
        animate={{ x: ["-120%", "220%"] }}
        transition={{ duration: 1.3, ease: "linear", repeat: Infinity, repeatDelay: 1.1 }}
      />

      <div className="relative flex flex-col items-center text-center">
        {/* Level disc with expanding rings */}
        <div className="relative mb-3 flex h-28 w-28 items-center justify-center">
          {LU_RINGS.map((r) => (
            <motion.span
              key={r} aria-hidden className="absolute rounded-full border-2"
              style={{ borderColor: accent, width: 76, height: 76 }}
              initial={{ opacity: 0.5, scale: 1 }}
              animate={{ opacity: 0, scale: 2.1 }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut", delay: r * 0.7 }}
            />
          ))}
          <motion.div
            className="relative flex h-[72px] w-[72px] flex-col items-center justify-center rounded-full border-2"
            style={{ borderColor: accent, background: hexToRgba(accent, 0.14), boxShadow: `0 0 30px ${glow}` }}
            animate={{ scale: [1, 1.07, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          >
            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: accent }}>Level</span>
            <span className="text-3xl font-black leading-none tabular-nums text-white">{shown}</span>
          </motion.div>
          <Star className="absolute -right-1 -top-1 h-5 w-5 text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.9)] animate-spin" style={{ animationDuration: "3s" }} />
        </div>

        <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.28em]" style={{ color: accent }}>
          <Sparkles className="h-3.5 w-3.5" /> Level Up! <Sparkles className="h-3.5 w-3.5" />
        </p>
        <h2 className={`mt-1.5 text-3xl font-black tracking-tight ${getLevelColor(newLevel)}`}>
          Level {newLevel}
        </h2>
        <p className="mt-0.5 text-[11px] text-zinc-400">{oldLevel} → {newLevel} · Weiter so!</p>
        {title && <p className="mt-1 text-sm font-bold text-zinc-200">{title}</p>}

        {rewards.length > 0 && (
          <div className="mt-4 flex max-w-md flex-wrap items-center justify-center gap-2">
            {rewards.map((r, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.07, type: "spring", stiffness: 300, damping: 20 }}
                className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold text-zinc-100"
                style={{ borderColor: hexToRgba(accent, 0.3), background: hexToRgba(accent, 0.08) }}
              >
                {rewardIcon(r.type)} {rewardLabel(r)}
              </motion.span>
            ))}
          </div>
        )}
        <p className="mt-4 flex items-center gap-1 text-[11px] text-zinc-600">
          <Zap className="h-3 w-3" /> Klicken zum Schließen
        </p>
      </div>
    </motion.div>
  );

  if (fullscreen) {
    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
        onClick={onDone}
        className="pointer-events-auto fixed inset-0 z-[700] flex cursor-pointer items-center justify-center overflow-hidden p-6"
        style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(10,8,20,0.86) 0%, rgba(2,2,6,0.95) 70%)", backdropFilter: "blur(10px)" }}
      >
        {ev.screenFlash && (
          <div className="pointer-events-none fixed inset-0" style={{ background: `radial-gradient(circle at 50% 45%, ${hexToRgba(accent, f.flash)}, transparent 62%)`, animation: "fb-flash 0.9s ease-out forwards" }} />
        )}
        {card}
      </motion.div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-[600] flex justify-center px-4">
      {ev.screenFlash && (
        <div className="pointer-events-none fixed inset-0" style={{ background: `radial-gradient(circle at 50% 70%, ${hexToRgba(accent, f.flash * 0.8)}, transparent 60%)`, animation: "fb-flash 0.9s ease-out forwards" }} />
      )}
      {card}
    </div>
  );
}
