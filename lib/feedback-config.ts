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

/** Visual intensity of a feedback event.
 *  fullscreen = große Level-Up-artige Vollbild-Feier (Aura, Konfetti, Chips, Weiter-Button). */
export type FeedbackStyle = "toast" | "popup" | "confetti" | "fullscreen";

/** Entrance animation — maps to a keyframe in globals.css via FEEDBACK_ANIM_KEYFRAME. */
export type FeedbackAnimation =
  | "pop" | "slide-up" | "slide-down" | "zoom" | "bounce" | "flip" | "fade" | "glow"
  | "drop" | "rubber" | "swing";

/** Overall magnitude of a celebration — scales size, glow, particles, screen flash. */
export type FeedbackIntensity = "subtle" | "normal" | "epic";

/** Particle effect fired on celebration popups. */
export type FeedbackParticle = "confetti" | "fireworks" | "stars" | "streamers";

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
  /** Burst particles (forced on for style="confetti"). */
  confetti: boolean;
  /** Overall magnitude — scales card size, glow, particle count, flash strength. */
  intensity: FeedbackIntensity;
  /** Which particle effect to fire (when confetti/style triggers particles). */
  particleType: FeedbackParticle;
  /** Flash a full-screen accent glow once when this fires (big-moment punch). */
  screenFlash: boolean;
}

// ── Spiel-Limit-Anzeige (LimitMeter) ────────────────────────────────────────
/** Visual style of the shared "remaining limit" meter (Plinko/Snake/DON …). */
export type LimitMeterStyle = "bar" | "segments" | "ring";

export interface LimitMeterConfig {
  /** Master on/off for the rich meter. Off → minimal text-only readout. */
  enabled: boolean;
  /** bar = gradient-Balken, segments = Pips, ring = Radial-Ring. */
  style: LimitMeterStyle;
  /** Colour when plenty is left (ratio above midThreshold). */
  highColor: string;
  /** Colour when getting low (between low- and midThreshold). */
  midColor: string;
  /** Colour when almost out (ratio at/below lowThreshold). */
  lowColor: string;
  /** Ratio (0..1) below which the meter switches to midColor. */
  midThreshold: number;
  /** Ratio (0..1) at/below which the meter switches to lowColor. */
  lowThreshold: number;
  /** Animated sheen sweeping across the fill. */
  animate: boolean;
  /** Pulse the whole meter (glow + scale) while in the low zone. */
  pulseWhenLow: boolean;
}

export const LIMIT_METER_STYLES: LimitMeterStyle[] = ["bar", "segments", "ring"];

export const DEFAULT_LIMIT_METER_CONFIG: LimitMeterConfig = {
  enabled: true,
  style: "bar",
  highColor: "#34d399",
  midColor: "#fbbf24",
  lowColor: "#f87171",
  midThreshold: 0.5,
  lowThreshold: 0.25,
  animate: true,
  pulseWhenLow: true,
};

export interface FeedbackConfig {
  /** Master switch for ALL reward feedback. */
  enabled: boolean;
  /** Toast anchor position. */
  position: FeedbackPosition;
  /** Per-event settings. */
  events: Record<FeedbackEventKey, FeedbackEventConfig>;
  /** Shared "remaining limit" meter used across the games. */
  limitMeter: LimitMeterConfig;
  /** Pop an animated toast when a new notification arrives (trade, shop, friend …). */
  notificationToasts: boolean;
  /** Defer big disruptive (fullscreen) celebrations until the player's round ends —
   *  during gameplay only a small non-blocking teaser shows, so nobody loses a run. */
  deferDuringGameplay: boolean;
}

/** The /account user pref key for live notification toasts. */
export const NOTIF_TOAST_PREF_KEY = "notif_toast";

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
  "drop": "fb-drop",
  "rubber": "fb-rubber",
  "swing": "fb-swing",
};

export const FEEDBACK_ANIMATIONS: FeedbackAnimation[] = [
  "pop", "slide-up", "slide-down", "zoom", "bounce", "flip", "fade", "glow", "drop", "rubber", "swing",
];
export const FEEDBACK_STYLES: FeedbackStyle[] = ["toast", "popup", "confetti", "fullscreen"];
export const FEEDBACK_POSITIONS: FeedbackPosition[] = ["top", "top-right", "bottom", "bottom-right"];
export const FEEDBACK_INTENSITIES: FeedbackIntensity[] = ["subtle", "normal", "epic"];
export const FEEDBACK_PARTICLES: FeedbackParticle[] = ["confetti", "fireworks", "stars", "streamers"];

/** Per-intensity magnitude factors used by the feedback host. */
export const INTENSITY_FACTOR: Record<FeedbackIntensity, {
  scale: number; glow: number; particles: number; flash: number; shockwave: boolean;
}> = {
  subtle: { scale: 0.92, glow: 0.18, particles: 12, flash: 0.10, shockwave: false },
  normal: { scale: 1.0,  glow: 0.30, particles: 24, flash: 0.20, shockwave: false },
  epic:   { scale: 1.12, glow: 0.52, particles: 46, flash: 0.40, shockwave: true  },
};

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
    xp_gain:         { enabled: true, style: "toast",    accent: "#34d399", animation: "slide-up",   durationMs: 2200, sound: true, icon: "✨", confetti: false, intensity: "subtle", particleType: "confetti",  screenFlash: false },
    level_up:        { enabled: true, style: "popup",    accent: "#a78bfa", animation: "pop",        durationMs: 3800, sound: true, icon: "⬆️", confetti: true,  intensity: "normal", particleType: "stars",     screenFlash: true  },
    level_milestone: { enabled: true, style: "confetti", accent: "#fbbf24", animation: "zoom",       durationMs: 6000, sound: true, icon: "🏆", confetti: true,  intensity: "epic",   particleType: "fireworks", screenFlash: true  },
    daily_quest:     { enabled: true, style: "fullscreen", accent: "#22d3ee", animation: "drop",     durationMs: 5200, sound: true, icon: "✅", confetti: true,  intensity: "normal", particleType: "confetti",  screenFlash: true  },
    bp_quest:        { enabled: true, style: "fullscreen", accent: "#e879f9", animation: "drop",     durationMs: 5200, sound: true, icon: "🎯", confetti: true,  intensity: "epic",   particleType: "stars",     screenFlash: true  },
    bp_tier:         { enabled: true, style: "fullscreen", accent: "#fb923c", animation: "bounce",   durationMs: 5200, sound: true, icon: "🎁", confetti: true,  intensity: "epic",   particleType: "fireworks", screenFlash: true  },
    reward:          { enabled: true, style: "popup",    accent: "#facc15", animation: "rubber",     durationMs: 3400, sound: true, icon: "🎉", confetti: true,  intensity: "normal", particleType: "streamers", screenFlash: false },
  },
  limitMeter: DEFAULT_LIMIT_METER_CONFIG,
  notificationToasts: true,
  deferDuringGameplay: true,
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
    limitMeter: { ...base.limitMeter, ...(raw.limitMeter ?? {}) },
    notificationToasts: raw.notificationToasts ?? base.notificationToasts,
    deferDuringGameplay: raw.deferDuringGameplay ?? base.deferDuringGameplay,
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

/** The /account user pref key for the rich game-limit meter (stored in notification_prefs). */
export const LIMIT_METER_PREF_KEY = "fb_limit_meter";

// ── Persönliche Feedback-Stärke (pro User, in notification_prefs) ────────────
/** How strong the user personally wants celebrations. */
export type UserFeedbackIntensity = "full" | "reduced" | "minimal";
/** Pref key storing the user's personal feedback strength (UserFeedbackIntensity). */
export const FB_INTENSITY_PREF_KEY = "fb_intensity";
/** Pref key: user wants minimal motion (no big animations/particles). */
export const FB_REDUCE_MOTION_PREF_KEY = "fb_reduce_motion";

export const USER_FEEDBACK_INTENSITIES: UserFeedbackIntensity[] = ["full", "reduced", "minimal"];

/** Apply a user's personal feedback prefs on top of the admin event config.
 *  Lets each player tone celebrations down without the admin's settings changing.
 *  - minimal  → small toast, no particles/flash, subtle.
 *  - reduced  → no fullscreen, one step calmer, no screen flash.
 *  - reduceMotion → fade entrance, no particles/flash, subtle. */
export function applyPersonalFeedback(
  ev: FeedbackEventConfig,
  pref: UserFeedbackIntensity,
  reduceMotion: boolean,
): FeedbackEventConfig {
  let out: FeedbackEventConfig = { ...ev };
  if (pref === "minimal") {
    out.style = "toast";
    out.confetti = false;
    out.screenFlash = false;
    out.intensity = "subtle";
  } else if (pref === "reduced") {
    if (out.style === "fullscreen") out.style = "popup";
    out.intensity = out.intensity === "epic" ? "normal" : "subtle";
    out.screenFlash = false;
  }
  if (reduceMotion) {
    out.animation = "fade";
    out.confetti = false;
    out.screenFlash = false;
    out.intensity = "subtle";
  }
  return out;
}

/** Pick the active tone colour for a given remaining/total ratio. */
export function limitMeterTone(
  ratio: number, remaining: number, cfg: LimitMeterConfig,
): { color: string; zone: "high" | "mid" | "low" } {
  if (remaining <= 0 || ratio <= cfg.lowThreshold) return { color: cfg.lowColor, zone: "low" };
  if (ratio <= cfg.midThreshold) return { color: cfg.midColor, zone: "mid" };
  return { color: cfg.highColor, zone: "high" };
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

