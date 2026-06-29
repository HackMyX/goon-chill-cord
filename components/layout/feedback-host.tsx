"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSoundManager } from "@/lib/sound-manager";
import { useFeedbackSettings } from "@/lib/use-feedback";
import {
  feedbackAnimationStyle, hexToRgba,
  type CelebrationPayload, type FeedbackConfig, type FeedbackEventConfig, type FeedbackEventKey, type FeedbackPosition,
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

  return (
    <div
      className={`pointer-events-none fixed z-[595] flex max-w-[calc(100vw-1.5rem)] flex-col gap-2.5 px-1 ${POSITION_CLASS[config.position] ?? POSITION_CLASS.top}`}
      aria-live="polite"
    >
      {queue.map((item) => (
        <FeedbackItem
          key={item.id}
          payload={item.payload}
          cfg={config}
          onDone={() => dismiss(item.id)}
        />
      ))}
    </div>
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
      style={{ animation: animStyle }}
      onClick={onDone}
      role="status"
    >
      {showConfetti && <ConfettiBurst accent={accent} />}
      <div
        className="relative overflow-hidden rounded-2xl border px-5 py-4 backdrop-blur-md"
        style={{
          borderColor: hexToRgba(accent, 0.5),
          background: `linear-gradient(135deg, ${hexToRgba(accent, 0.18)}, rgba(8,7,18,0.92) 70%)`,
          boxShadow: `0 0 44px ${hexToRgba(accent, 0.3)}`,
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
  );
}

/** Lightweight CSS confetti burst — 16 particles fanning out from the card top. */
function ConfettiBurst({ accent }: { accent: string }) {
  const colors = [accent, "#ffffff", hexToRgba(accent, 0.6), "#fbbf24"];
  const parts = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2;
    const dist = 70 + (i % 5) * 22;
    const cx = Math.cos(angle) * dist;
    const cy = Math.sin(angle) * dist + 40;
    const rot = 180 + (i % 7) * 90;
    const delay = (i % 6) * 0.04;
    return { cx, cy, rot, color: colors[i % colors.length], delay, left: 50 + (i % 3 - 1) * 6 };
  });
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0">
      {parts.map((p, i) => (
        <span
          key={i}
          className="absolute block h-2 w-2 rounded-[1px]"
          style={{
            left: `${p.left}%`,
            top: 0,
            background: p.color,
            ["--fb-cx" as string]: `${p.cx}px`,
            ["--fb-cy" as string]: `${p.cy}px`,
            ["--fb-cr" as string]: `${p.rot}deg`,
            animation: `fb-confetti 1.1s ${p.delay}s ease-out forwards`,
          }}
        />
      ))}
    </div>
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
