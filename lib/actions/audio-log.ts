"use server";

import { logDebugEvent } from "@/lib/debug-log-server";

/**
 * Client → server bridge so the browser-side audio engine (SoundManager /
 * MusicPlayer) can report a missing or unplayable sound into the admin Debug
 * Log instead of failing invisibly. The client deduplicates per event key, so
 * this is called at most once per broken sound — never in a hot loop.
 *
 * Best-effort by design: a logging hop must never break audio or the UI.
 */
export async function reportAudioIssue(input: {
  scope: string;
  message: string;
  detail?: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  await logDebugEvent({
    level: "warn",
    scope: input.scope,
    message: input.message,
    detail: input.detail,
    context: input.context,
  });
}
