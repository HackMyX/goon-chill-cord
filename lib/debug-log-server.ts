import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type DebugLogLevel = "error" | "warn" | "info";

/**
 * Writes one row to `debug_logs` — the admin panel's full-scope Debug Log
 * tab reads straight from this table. Deliberately swallows its own
 * failures (a logging call must never be the thing that throws).
 */
export async function logDebugEvent(input: {
  level?: DebugLogLevel;
  scope: string;
  message: string;
  detail?: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("debug_logs").insert({
      level: input.level ?? "error",
      scope: input.scope,
      message: input.message.slice(0, 2000),
      detail: input.detail?.slice(0, 8000) ?? null,
      context: input.context ?? null,
    });
  } catch {
    // best-effort — logging must never throw or block the real flow.
  }
}

/**
 * Convenience wrapper for info-level activity tracking.
 * Use this to log successful user/admin actions so the admin can see
 * all website activity in the debug log, not just errors.
 */
export async function logActivity(
  scope: string,
  message: string,
  context?: Record<string, unknown>
): Promise<void> {
  await logDebugEvent({ level: "info", scope, message, context });
}

/**
 * Logs an error with scope + message, then rethrows the original error.
 * Use in catch blocks where you want DB logging but still need to propagate.
 */
export async function logAndRethrow(
  scope: string,
  message: string,
  error: unknown,
  context?: Record<string, unknown>
): Promise<never> {
  await logDebugEvent({
    level: "error",
    scope,
    message,
    detail: error instanceof Error ? error.stack ?? error.message : String(error),
    context,
  });
  throw error;
}
