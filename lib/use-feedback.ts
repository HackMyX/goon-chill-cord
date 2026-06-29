"use client";

import { useCallback, useEffect, useState } from "react";
import { getFeedbackConfig } from "@/lib/actions/feedback-config";
import { getNotificationPrefs, type NotificationPrefs } from "@/lib/actions/account";
import { useLiveConfig } from "@/lib/use-live-config";
import {
  DEFAULT_FEEDBACK_CONFIG, feedbackPrefKey, LIMIT_METER_PREF_KEY, NOTIF_TOAST_PREF_KEY,
  FB_INTENSITY_PREF_KEY, FB_REDUCE_MOTION_PREF_KEY, applyPersonalFeedback,
  type FeedbackConfig, type FeedbackEventConfig, type FeedbackEventKey, type UserFeedbackIntensity,
} from "@/lib/feedback-config";

/**
 * Shared client hook for the reward-feedback system. Loads the admin feedback
 * config (live-updating on save) plus the current user's per-event mute prefs,
 * and exposes `allows(key)` = master on AND event on AND user hasn't muted it.
 */
export function useFeedbackSettings() {
  const [config, setConfig] = useState<FeedbackConfig>(DEFAULT_FEEDBACK_CONFIG);
  const [prefs, setPrefs] = useState<NotificationPrefs>({});

  useEffect(() => { getFeedbackConfig().then(setConfig).catch(() => {}); }, []);
  useEffect(() => { getNotificationPrefs().then(setPrefs).catch(() => {}); }, []);
  useLiveConfig("feedback-config-live", getFeedbackConfig, setConfig);

  const allows = useCallback((key: FeedbackEventKey): boolean => {
    if (!config.enabled) return false;
    const ev = config.events[key];
    if (!ev?.enabled) return false;
    if (prefs[feedbackPrefKey(key)] === false) return false;
    return true;
  }, [config, prefs]);

  // Personal feedback strength chosen by the user in /account.
  const rawIntensity = prefs[FB_INTENSITY_PREF_KEY];
  const userIntensity: UserFeedbackIntensity =
    rawIntensity === "reduced" || rawIntensity === "minimal" ? rawIntensity : "full";
  const reduceMotion = prefs[FB_REDUCE_MOTION_PREF_KEY] === true;

  // The admin event config with the user's personal prefs applied on top.
  const eventConfig = useCallback((key: FeedbackEventKey): FeedbackEventConfig => {
    return applyPersonalFeedback(config.events[key], userIntensity, reduceMotion);
  }, [config, userIntensity, reduceMotion]);

  // The rich game-limit meter: admin master + meter-enabled + user hasn't opted out.
  // (Master `config.enabled` does NOT gate the meter — it's an informational HUD,
  //  not a celebration — so muting all popups still leaves the limit readable.)
  const limitMeterAllowed = config.limitMeter.enabled && prefs[LIMIT_METER_PREF_KEY] !== false;
  // Honour reduce-motion for the meter too (no sheen/pulse).
  const limitMeter = reduceMotion
    ? { ...config.limitMeter, animate: false, pulseWhenLow: false }
    : config.limitMeter;

  // Live notification toasts: admin master + user hasn't opted out.
  const notificationToastsEnabled = config.notificationToasts && prefs[NOTIF_TOAST_PREF_KEY] !== false;

  return { config, allows, eventConfig, userIntensity, reduceMotion, limitMeter, limitMeterAllowed, notificationToastsEnabled };
}
