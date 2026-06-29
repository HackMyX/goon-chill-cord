"use client";

import { useCallback, useEffect, useState } from "react";
import { getFeedbackConfig } from "@/lib/actions/feedback-config";
import { getNotificationPrefs } from "@/lib/actions/account";
import { useLiveConfig } from "@/lib/use-live-config";
import {
  DEFAULT_FEEDBACK_CONFIG, feedbackPrefKey, LIMIT_METER_PREF_KEY,
  type FeedbackConfig, type FeedbackEventKey,
} from "@/lib/feedback-config";

/**
 * Shared client hook for the reward-feedback system. Loads the admin feedback
 * config (live-updating on save) plus the current user's per-event mute prefs,
 * and exposes `allows(key)` = master on AND event on AND user hasn't muted it.
 */
export function useFeedbackSettings() {
  const [config, setConfig] = useState<FeedbackConfig>(DEFAULT_FEEDBACK_CONFIG);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});

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

  // The rich game-limit meter: admin master + meter-enabled + user hasn't opted out.
  // (Master `config.enabled` does NOT gate the meter — it's an informational HUD,
  //  not a celebration — so muting all popups still leaves the limit readable.)
  const limitMeterAllowed = config.limitMeter.enabled && prefs[LIMIT_METER_PREF_KEY] !== false;

  return { config, allows, limitMeter: config.limitMeter, limitMeterAllowed };
}
