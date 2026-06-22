import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type DebugLogLevel = "error" | "warn" | "info";

/**
 * Writes one row to `debug_logs` — the admin panel's full-scope Debug Log
 * tab reads straight from this table. Deliberately swallows its own
 * failures (a logging call must never be the thing that throws), and
 * deliberately does NOT also go through console.error here — call sites
 * that want both keep their existing console.error and call this
 * separately, since this is specifically the persistent/admin-visible
 * channel, not a replacement for normal dev-console output.
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
