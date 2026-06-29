// ─────────────────────────────────────────────────────────────────────────────
// Reward / progression feedback ("Belohnungs-Feedback") — client-safe config.
//
// One central place that controls EVERY celebratory popup/toast on the site:
// XP gains, level-ups, milestone celebrations, daily-quest & battle-pass-quest
// completions, battle-pass tier claims and generic reward grants. Admin tunes
// colour, animation, intensity, sound, duration and on/off per event; users can
// additionally mute individual event types from /account.
//
// IMPORTANT: client-safe (no server-only imports) — imported by both the admin
// editor and the global feedback host that runs in the browser.
// ─────────────────────────────────────────────────────────────────────────────

/** Every distinct celebration trigger. */
export type FeedbackEventKey =
  | "xp_gain"
  | "level_up"
  | "level_milestone"
  | "daily_quest"
  | "bp_quest"
  | "bp_tier"
  | "reward";

/** Visual intensity of a feedback event. */
export type FeedbackStyle = "toast" | "popup" | "confetti";

/** Entrance animation — maps to a keyframe in globals.css via FEEDBACK_ANIM_KEYFRAME. */
export type FeedbackAnimation =
  | "pop" | "slide-up" | "slide-down" | "zoom" | "bounce" | "flip" | "fade" | "glow";

/** Where transient toasts appear on screen. */
export type FeedbackPosition = "top" | "top-right" | "bottom" | "bottom-right";

export interface FeedbackEventConfig {
  /** Master on/off for this event's visual feedback. */
  enabled: boolean;
  /** toast = small pill, popup = centered card, confetti = popup + particle burst. */
  style: FeedbackStyle;
  /** Primary accent colour (hex). Drives text/border/glow — applied inline (purge-proof). */
  accent: string;
  /** Entrance animation. */
  animation: FeedbackAnimation;
  /** How long the toast/popup stays before fading (ms). */
  durationMs: number;
  /** Play the configured sound when this fires. */
  sound: boolean;
  /** Emoji / short glyph shown on the feedback. */
  icon: string;
  /** Burst confetti particles (forced on for style="confetti"). */
  confetti: boolean;
}

export interface FeedbackConfig {
  /** Master switch for ALL reward feedback. */
  enabled: boolean;
  /** Toast anchor position. */
  position: FeedbackPosition;
  /** Per-event settings. */
  events: Record<FeedbackEventKey, FeedbackEventConfig>;
}

/** Animation key → globals.css @keyframes name. */
export const FEEDBACK_ANIM_KEYFRAME: Record<FeedbackAnimation, string> = {
  "pop": "fb-pop",
  "slide-up": "fb-slide-up",
  "slide-down": "fb-slide-down",
  "zoom": "fb-zoom",
  "bounce": "fb-bounce",
  "flip": "fb-flip",
  "fade": "fb-fade",
  "glow": "fb-glow",
};

export const FEEDBACK_ANIMATIONS: FeedbackAnimation[] = [
  "pop", "slide-up", "slide-down", "zoom", "bounce", "flip", "fade", "glow",
];
export const FEEDBACK_STYLES: FeedbackStyle[] = ["toast", "popup", "confetti"];
export const FEEDBACK_POSITIONS: FeedbackPosition[] = ["top", "top-right", "bottom", "bottom-right"];

/** Admin-facing metadata per event (labels/help, grouped). */
export const FEEDBACK_EVENT_META: { key: FeedbackEventKey; label: string; description: string }[] = [
  { key: "xp_gain", label: "XP erhalten", description: "Kleiner Toast, wenn der Spieler XP bekommt (z. B. nach einem Spiel)." },
  { key: "level_up", label: "Level-Up", description: "Wenn der Spieler ein normales Level aufsteigt." },
  { key: "level_milestone", label: "Meilenstein-Level", description: "Große Feier mit Konfetti bei besonderen Levels (z. B. alle 10)." },
  { key: "daily_quest", label: "Tagesquest abgeschlossen", description: "Wenn eine tägliche Aufgabe fertig ist." },
  { key: "bp_quest", label: "Battle-Pass-Quest abgeschlossen", description: "Wenn eine Battle-Pass-Aufgabe fertig ist (BP-XP erhalten)." },
  { key: "bp_tier", label: "Battle-Pass-Stufe freigeschaltet", description: "Wenn der Spieler eine Battle-Pass-Belohnung beansprucht." },
  { key: "reward", label: "Belohnung erhalten", description: "Allgemeines Feedback für sonstige Belohnungen/Gewinne." },
];

export const DEFAULT_FEEDBACK_CONFIG: FeedbackConfig = {
  enabled: true,
  position: "top",
  events: {
    xp_gain:         { enabled: true, style: "toast",    accent: "#34d399", animation: "slide-up",   durationMs: 2200, sound: true, icon: "✨", confetti: false },
    level_up:        { enabled: true, style: "popup",    accent: "#a78bfa", animation: "pop",        durationMs: 3400, sound: true, icon: "⬆️", confetti: false },
    level_milestone: { enabled: true, style: "confetti", accent: "#fbbf24", animation: "zoom",       durationMs: 6000, sound: true, icon: "🏆", confetti: true  },
    daily_quest:     { enabled: true, style: "toast",    accent: "#22d3ee", animation: "slide-down", durationMs: 3000, sound: true, icon: "✅", confetti: false },
    bp_quest:        { enabled: true, style: "toast",    accent: "#e879f9", animation: "slide-down", durationMs: 3000, sound: true, icon: "🎯", confetti: false },
    bp_tier:         { enabled: true, style: "confetti", accent: "#fb923c", animation: "bounce",     durationMs: 4600, sound: true, icon: "🎁", confetti: true  },
    reward:          { enabled: true, style: "popup",    accent: "#facc15", animation: "pop",        durationMs: 3400, sound: true, icon: "🎉", confetti: false },
  },
};

/** Merge a (possibly partial) stored config with defaults — safe per event. */
export function resolveFeedbackConfig(raw: Partial<FeedbackConfig> | null | undefined): FeedbackConfig {
  const base = DEFAULT_FEEDBACK_CONFIG;
  if (!raw || typeof raw !== "object") return base;
  const events = {} as Record<FeedbackEventKey, FeedbackEventConfig>;
  (Object.keys(base.events) as FeedbackEventKey[]).forEach((k) => {
    events[k] = { ...base.events[k], ...(raw.events?.[k] ?? {}) };
  });
  return {
    enabled: raw.enabled ?? base.enabled,
    position: raw.position ?? base.position,
    events,
  };
}

/** Build the inline `animation` shorthand for a feedback element's entrance.
 *  The element is then held by React for the event's durationMs and removed. */
export function feedbackAnimationStyle(anim: FeedbackAnimation): string {
  const kf = FEEDBACK_ANIM_KEYFRAME[anim] ?? "fb-pop";
  return `${kf} 0.45s cubic-bezier(0.22,1,0.36,1) both`;
}

/** Lighten/darken not needed — we just produce an rgba glow from a hex accent. */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return `rgba(168,85,247,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** The /account user pref key for muting an event type (stored in notification_prefs). */
export function feedbackPrefKey(key: FeedbackEventKey): string {
  return `fb_${key}`;
}

/** Rich payload broadcast on `celebrations:<userId>` for server-driven events
 *  (quest complete, bp quest, tier claim, reward grant). The client host renders
 *  it according to the event's FeedbackEventConfig. */
export interface CelebrationPayload {
  type: FeedbackEventKey;
  title: string;
  message?: string;
  /** Optional emoji override (else the event's configured icon is used). */
  icon?: string;
  /** Optional list of rewards to show as chips. */
  rewards?: { label: string; icon?: string }[];
  /** Optional numeric amount (e.g. XP/BP-XP/credits) for emphasis. */
  amount?: number;
}

