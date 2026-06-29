"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Sparkles, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSoundManager } from "@/lib/sound-manager";
import { useFeedbackSettings } from "@/lib/use-feedback";
import {
  feedbackAnimationStyle, hexToRgba, INTENSITY_FACTOR,
  type CelebrationPayload, type FeedbackConfig, type FeedbackEventConfig, type FeedbackEventKey,
  type FeedbackPosition, type FeedbackParticle,
} from "@/lib/feedback-config";

interface QueueItem { id: string; payload: CelebrationPayload }

// On phones the side-anchored positions collapse to centred so nothing clips the
// screen edge; the desktop anchor returns at >=640px (sm).
const POSITION_CLASS: Record<FeedbackPosition, string> = {
  "top":          "top-[max(5rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 items-center",
  "top-right":    "top-[max(5rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 items-center sm:left-auto sm:right-4 sm:translate-x-0 sm:items-end",
  "bottom":       "bottom-[calc(6.5rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 items-center",
  "bottom-right": "bottom-[calc(6.5rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 items-center sm:left-auto sm:right-4 sm:translate-x-0 sm:items-end",
};

/**
 * Global host for server-driven reward celebrations (daily/BP quests, BP tier
 * claims, generic rewards). Subscribes to the user's `celebrations:<id>` channel
 * and renders each event according to the admin FeedbackConfig (style, accent,
 * animation, duration, confetti, sound) — gated by the user's /account prefs.
 *
 * XP gains and level-ups have their own dedicated hosts (XpGainToast,
 * LevelUpPopup) that listen to the profiles table directly.
 */
export function FeedbackHost({ userId }: { userId?: string | null }) {
  const [resolvedUserId, setResolvedUserId] = useState(userId ?? null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const { config, allows } = useFeedbackSettings();
  const configRef = useRef(config);
  configRef.current = config;
  const allowsRef = useRef(allows);
  allowsRef.current = allows;

  useEffect(() => {
    if (userId) { setResolvedUserId(userId); return; }
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setResolvedUserId(data.user.id);
    });
  }, [userId]);

  useEffect(() => {
    if (!resolvedUserId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`celebrations:${resolvedUserId}`)
      .on("broadcast", { event: "celebrate" }, (msg) => {
        const payload = msg.payload as CelebrationPayload;
        if (!payload?.type) return;
        if (!allowsRef.current(payload.type)) return; // master / event / user-pref gate
        setQueue((q) => [...q.slice(-3), { id: `${Date.now()}-${Math.random()}`, payload }]);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [resolvedUserId]);

  function dismiss(id: string) {
    setQueue((q) => q.filter((it) => it.id !== id));
  }

  if (queue.length === 0) return null;

  // Split: corner toasts/popups vs. fullscreen "level-up" celebrations.
  const cornerItems = queue.filter((it) => config.events[it.payload.type]?.style !== "fullscreen");
  const fsItems = queue.filter((it) => config.events[it.payload.type]?.style === "fullscreen");

  return (
    <>
      {cornerItems.length > 0 && (
        <div
          className={`pointer-events-none fixed z-[595] flex max-w-[calc(100vw-1.5rem)] flex-col gap-2.5 px-1 ${POSITION_CLASS[config.position] ?? POSITION_CLASS.top}`}
          aria-live="polite"
        >
          {cornerItems.map((item) => (
            <FeedbackItem
              key={item.id}
              payload={item.payload}
              cfg={config}
              onDone={() => dismiss(item.id)}
            />
          ))}
        </div>
      )}
      {/* Only the most-recent fullscreen celebration at a time (avoids stacking overlays). */}
      {fsItems.length > 0 && (
        <FullscreenCelebration
          key={fsItems[fsItems.length - 1].id}
          payload={fsItems[fsItems.length - 1].payload}
          ev={config.events[fsItems[fsItems.length - 1].payload.type]}
          onDone={() => {
            // dismiss ALL queued fullscreen items so we don't replay a backlog.
            setQueue((q) => q.filter((it) => config.events[it.payload.type]?.style !== "fullscreen"));
          }}
        />
      )}
    </>
  );
}

function FeedbackItem({ payload, cfg, onDone }: { payload: CelebrationPayload; cfg: FeedbackConfig; onDone: () => void }) {
  const sound = useSoundManager();
  const ev: FeedbackEventConfig = cfg.events[payload.type];
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (ev.sound) playFeedbackSound(sound, payload.type);
    const dur = Math.max(1200, ev.durationMs);
    const t1 = setTimeout(() => setLeaving(true), dur);
    const t2 = setTimeout(onDone, dur + 360);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accent = ev.accent;
  const icon = payload.icon || ev.icon;
  const isPopup = ev.style !== "toast";
  const showConfetti = ev.style === "confetti" || ev.confetti;
  const f = INTENSITY_FACTOR[ev.intensity] ?? INTENSITY_FACTOR.normal;

  const animStyle = leaving
    ? "fb-out 0.34s ease forwards"
    : feedbackAnimationStyle(ev.animation);

  if (!isPopup) {
    // Compact toast pill
    return (
      <div
        className="pointer-events-auto relative flex max-w-[calc(100vw-1.5rem)] items-center gap-2.5 overflow-hidden rounded-full border px-4 py-2 backdrop-blur-md"
        style={{
          animation: animStyle,
          borderColor: hexToRgba(accent, 0.5),
          background: `linear-gradient(90deg, ${hexToRgba(accent, 0.22)}, ${hexToRgba(accent, 0.10)})`,
          boxShadow: `0 8px 30px ${hexToRgba(accent, 0.28)}`,
          color: accent,
        }}
        onClick={onDone}
      >
        <div className="absolute inset-0 -translate-x-full animate-[mine-shimmer_1.6s_ease_forwards] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <span className="relative text-base leading-none">{icon}</span>
        <div className="relative flex min-w-0 flex-col">
          <span className="truncate text-sm font-extrabold" style={{ color: accent }}>{payload.title}</span>
          {payload.message && <span className="truncate text-[11px] font-medium text-white/70">{payload.message}</span>}
        </div>
        {typeof payload.amount === "number" && (
          <span className="relative ml-1 rounded-full bg-white/10 px-2 py-0.5 text-xs font-black tabular-nums" style={{ color: accent }}>
            +{payload.amount.toLocaleString("de-DE")}
          </span>
        )}
      </div>
    );
  }

  // Larger celebration card (popup / confetti)
  return (
    <div
      className="pointer-events-auto relative w-[calc(100vw-2rem)] max-w-sm cursor-pointer overflow-visible"
      onClick={onDone}
      role="status"
    >
      {/* ScreenFlash must NOT be inside a transformed ancestor (else `fixed` breaks). */}
      {ev.screenFlash && !leaving && <ScreenFlash accent={accent} strength={f.flash} />}
      <div className="relative overflow-visible" style={{ transform: `scale(${f.scale})` }}>
      {showConfetti && !leaving && <ParticleField accent={accent} type={ev.particleType} count={f.particles} />}
      {f.shockwave && !leaving && <Shockwave accent={accent} />}
      <div className="relative overflow-visible" style={{ animation: animStyle }}>
        <div
          className="relative overflow-hidden rounded-2xl border px-5 py-4 backdrop-blur-md"
          style={{
            borderColor: hexToRgba(accent, 0.5),
            background: `linear-gradient(135deg, ${hexToRgba(accent, 0.18)}, rgba(8,7,18,0.92) 70%)`,
            boxShadow: `0 0 ${Math.round(30 + f.glow * 70)}px ${hexToRgba(accent, Math.min(0.6, f.glow + 0.12))}`,
          }}
        >
          <div className="absolute inset-0 -translate-x-full animate-[mine-shimmer_2s_ease_forwards] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <div className="relative flex items-center gap-3.5">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-2xl"
              style={{ borderColor: hexToRgba(accent, 0.5), background: hexToRgba(accent, 0.15), boxShadow: `0 0 20px ${hexToRgba(accent, 0.3)}` }}
            >
              {icon}
            </div>
            <div className="min-w-0">
              <p className="text-base font-black leading-tight" style={{ color: accent }}>{payload.title}</p>
              {payload.message && <p className="mt-0.5 text-xs text-zinc-300">{payload.message}</p>}
              {typeof payload.amount === "number" && (
                <p className="mt-0.5 text-sm font-black tabular-nums" style={{ color: accent }}>
                  +{payload.amount.toLocaleString("de-DE")}
                </p>
              )}
            </div>
          </div>
          {payload.rewards && payload.rewards.length > 0 && (
            <div className="relative mt-3 flex flex-wrap gap-1.5">
              {payload.rewards.map((r, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold"
                  style={{ borderColor: hexToRgba(accent, 0.35), background: hexToRgba(accent, 0.10), color: accent }}
                >
                  {r.icon && <span className="leading-none">{r.icon}</span>}{r.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

/** One-shot full-screen accent glow that pulses once — the "big moment" punch.
 *  Rendered via portal-free fixed overlay; pointer-events none. */
function ScreenFlash({ accent, strength }: { accent: string; strength: number }) {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0"
      style={{
        background: `radial-gradient(circle at 50% 42%, ${hexToRgba(accent, strength)}, transparent 62%)`,
        animation: "fb-flash 0.9s ease-out forwards",
      }}
    />
  );
}

/** Expanding shockwave ring behind the card (epic intensity only). */
function Shockwave({ accent }: { accent: string }) {
  return (
    <span
      className="pointer-events-none absolute left-1/2 top-1/2 z-0 block h-24 w-24 rounded-full border-2"
      style={{ borderColor: hexToRgba(accent, 0.7), animation: "fb-shockwave 0.9s ease-out forwards" }}
    />
  );
}

/** Configurable particle burst — confetti / fireworks / stars / streamers.
 *  Particle count scales with the event intensity. Exported so the admin editor
 *  can fire a faithful inline preview. */
export function ParticleField({ accent, type, count }: { accent: string; type: FeedbackParticle; count: number }) {
  const colors = [accent, "#ffffff", hexToRgba(accent, 0.65), "#fbbf24", "#f472b6"];
  const n = Math.max(6, Math.round(count));
  const parts = Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2 + (i % 3) * 0.4;
    const color = colors[i % colors.length];
    const delay = (i % 7) * 0.035;
    return { i, angle, color, delay };
  });

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0">
      {parts.map((p) => {
        if (type === "fireworks") {
          const dist = 80 + (p.i % 6) * 26;
          const cx = Math.cos(p.angle) * dist;
          const cy = Math.sin(p.angle) * dist;
          const size = 4 + (p.i % 3) * 2;
          return (
            <span key={p.i} className="absolute block rounded-full"
              style={{
                left: "50%", top: 0, height: size, width: size, background: p.color,
                boxShadow: `0 0 8px ${p.color}`,
                ["--fb-cx" as string]: `${cx}px`, ["--fb-cy" as string]: `${cy}px`, ["--fb-s" as string]: "1",
                animation: `fb-spark 1.05s ${p.delay}s cubic-bezier(0.15,0.7,0.3,1) forwards`,
              }} />
          );
        }
        if (type === "stars") {
          const cx = (p.i % 2 ? 1 : -1) * (20 + (p.i % 6) * 16);
          const cy = -(90 + (p.i % 5) * 34);
          return (
            <span key={p.i} className="absolute text-sm leading-none"
              style={{
                left: `${48 + (p.i % 5 - 2) * 8}%`, top: 0, color: p.color, filter: `drop-shadow(0 0 4px ${p.color})`,
                ["--fb-cx" as string]: `${cx}px`, ["--fb-cy" as string]: `${cy}px`, ["--fb-cr" as string]: `${180 + (p.i % 4) * 90}deg`,
                animation: `fb-star 1.3s ${p.delay}s ease-out forwards`,
              }}>★</span>
          );
        }
        if (type === "streamers") {
          const cx = (p.i % 2 ? 1 : -1) * (10 + (p.i % 7) * 14);
          const cy = 150 + (p.i % 5) * 30;
          return (
            <span key={p.i} className="absolute block rounded-[1px]"
              style={{
                left: `${50 + (p.i % 6 - 3) * 7}%`, top: 0, height: 14, width: 4, background: p.color,
                ["--fb-cx" as string]: `${cx}px`, ["--fb-cy" as string]: `${cy}px`, ["--fb-r" as string]: `${(p.i % 4) * 30}deg`,
                animation: `fb-streamer 1.3s ${p.delay}s ease-in forwards`,
              }} />
          );
        }
        // confetti (default)
        const dist = 70 + (p.i % 5) * 22;
        const cx = Math.cos(p.angle) * dist;
        const cy = Math.sin(p.angle) * dist + 40;
        return (
          <span key={p.i} className="absolute block h-2 w-2 rounded-[1px]"
            style={{
              left: `${50 + (p.i % 3 - 1) * 6}%`, top: 0, background: p.color,
              ["--fb-cx" as string]: `${cx}px`, ["--fb-cy" as string]: `${cy}px`, ["--fb-cr" as string]: `${180 + (p.i % 7) * 90}deg`,
              animation: `fb-confetti 1.1s ${p.delay}s ease-out forwards`,
            }} />
        );
      })}
    </div>
  );
}

/** Fullscreen "level-up feeling" celebration for big server-driven events
 *  (quest completion, BP tier …). Driven entirely by the CelebrationPayload +
 *  the event's FeedbackEventConfig (accent, icon, intensity, particle type,
 *  sound, duration) so the admin tunes it like any other event. Modeled on the
 *  milestone level-up celebration. Exported for the admin live preview. */
const FS_RINGS = [0, 1, 2];
const FS_SPARKS = Array.from({ length: 16 }, (_, i) => ({
  angle: (i / 16) * Math.PI * 2,
  dist: 120 + (i % 3) * 38,
  delay: (i % 8) * 0.07,
  size: 4 + (i % 3) * 2,
}));

export function FullscreenCelebration({ payload, ev, onDone }: {
  payload: CelebrationPayload; ev: FeedbackEventConfig; onDone: () => void;
}) {
  const sound = useSoundManager();
  const accent = ev.accent;
  const icon = payload.icon || ev.icon;
  const f = INTENSITY_FACTOR[ev.intensity] ?? INTENSITY_FACTOR.normal;

  useEffect(() => {
    const colors = ["#ffffff", accent, "#fbbf24", "#f472b6", "#22d3ee"];
    const scale = f.particles / 24; // relative to "normal"
    confetti({ particleCount: Math.round(110 * scale), spread: 100, startVelocity: 52, origin: { y: 0.45 }, colors, scalar: 1.1 });
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => confetti({ particleCount: Math.round(70 * scale), spread: 120, startVelocity: 55, origin: { x: 0.15, y: 0.5 }, angle: 60, colors }), 220));
    timers.push(setTimeout(() => confetti({ particleCount: Math.round(70 * scale), spread: 120, startVelocity: 55, origin: { x: 0.85, y: 0.5 }, angle: 120, colors }), 420));
    if (f.shockwave) timers.push(setTimeout(() => confetti({ particleCount: Math.round(80 * scale), spread: 150, startVelocity: 42, origin: { y: 0.35 }, colors }), 700));
    if (ev.sound) playFeedbackSound(sound, payload.type);
    const auto = setTimeout(onDone, Math.max(2600, ev.durationMs));
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDone(); };
    window.addEventListener("keydown", onKey);
    return () => { timers.forEach(clearTimeout); clearTimeout(auto); window.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onDone}
      className="pointer-events-auto fixed inset-0 z-[700] flex cursor-pointer flex-col items-center justify-center overflow-hidden p-6"
      style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(10,8,20,0.86) 0%, rgba(2,2,6,0.95) 70%)", backdropFilter: "blur(10px)" }}
      role="status"
      aria-live="assertive"
    >
      {/* accent aura */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]"
        style={{ width: 520, height: 520, background: hexToRgba(accent, 0.5) }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0.25, 0.5, 0.25], scale: [0.8, 1.05, 0.9] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        initial={{ scale: 0.6, y: 24, opacity: 0 }}
        animate={{ scale: f.scale, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 18 }}
        className="relative z-10 flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon disc with expanding rings + sparks */}
        <div className="relative mb-5 flex h-40 w-40 items-center justify-center">
          {FS_RINGS.map((r) => (
            <motion.span
              key={r} aria-hidden className="absolute rounded-full border-2"
              style={{ borderColor: accent, width: 96, height: 96 }}
              initial={{ opacity: 0.5, scale: 1 }}
              animate={{ opacity: 0, scale: 2.2 }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut", delay: r * 0.8 }}
            />
          ))}
          {FS_SPARKS.map((s, i) => (
            <motion.span
              key={i} aria-hidden className="absolute rounded-full"
              style={{ width: s.size, height: s.size, background: accent }}
              initial={{ x: 0, y: 0, opacity: 0 }}
              animate={{ x: Math.cos(s.angle) * s.dist, y: Math.sin(s.angle) * s.dist, opacity: [0, 1, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1.4, delay: s.delay, ease: "easeOut" }}
            />
          ))}
          <motion.div
            className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 text-5xl"
            style={{ borderColor: accent, background: hexToRgba(accent, 0.12), boxShadow: `0 0 40px ${hexToRgba(accent, 0.6)}` }}
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            {icon}
          </motion.div>
        </div>

        {/* Headline */}
        <motion.p
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
          className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.3em]"
          style={{ color: accent }}
        >
          <Sparkles className="h-3.5 w-3.5" /> Geschafft <Sparkles className="h-3.5 w-3.5" />
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.24, type: "spring", stiffness: 260, damping: 18 }}
          className="mt-2 max-w-xl bg-gradient-to-r from-white via-white to-zinc-300 bg-clip-text text-center text-3xl font-black tracking-tight text-transparent drop-shadow-[0_0_30px_rgba(255,255,255,0.25)] sm:text-4xl"
        >
          {payload.title}
        </motion.h2>
        {payload.message && (
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.32 }}
            className="mt-1.5 max-w-md text-center text-sm font-bold text-zinc-300"
          >
            {payload.message}
          </motion.p>
        )}
        {typeof payload.amount === "number" && (
          <motion.p
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.36, type: "spring", stiffness: 300, damping: 18 }}
            className="mt-2 text-2xl font-black tabular-nums" style={{ color: accent }}
          >
            +{payload.amount.toLocaleString("de-DE")}
          </motion.p>
        )}

        {/* Reward chips */}
        {payload.rewards && payload.rewards.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="mt-5 flex max-w-md flex-wrap items-center justify-center gap-2"
          >
            {payload.rewards.map((r, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.45 + i * 0.07, type: "spring", stiffness: 300, damping: 20 }}
                className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold text-zinc-100 shadow-[0_0_16px_rgba(0,0,0,0.4)]"
                style={{ borderColor: hexToRgba(accent, 0.3), background: hexToRgba(accent, 0.08) }}
              >
                {r.icon && <span className="leading-none">{r.icon}</span>} {r.label}
              </motion.span>
            ))}
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-7">
          <button
            onClick={onDone}
            className="rounded-xl px-8 py-2.5 text-sm font-black text-black transition-transform hover:scale-105 active:scale-95"
            style={{ background: `linear-gradient(135deg, ${accent}, #fbbf24)`, boxShadow: `0 0 24px ${hexToRgba(accent, 0.5)}` }}
          >
            <Zap className="mr-1.5 inline-block h-4 w-4" /> Weiter
          </button>
        </motion.div>
        <p className="mt-3 text-[11px] text-zinc-600">Klicken zum Schließen</p>
      </motion.div>
    </motion.div>
  );
}

function playFeedbackSound(sound: ReturnType<typeof useSoundManager>, type: FeedbackEventKey) {
  switch (type) {
    case "xp_gain": sound.xpGain(); break;
    case "level_up": sound.levelUp(); break;
    case "level_milestone": sound.bpUnlock(); break;
    case "daily_quest": sound.questComplete(); break;
    case "bp_quest": sound.questComplete(); break;
    case "bp_tier": sound.bpTierClaim(); break;
    case "reward": sound.win(); break;
    default: sound.win();
  }
}
