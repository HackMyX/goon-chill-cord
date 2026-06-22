"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { logDebugEvent } from "@/lib/debug-log-server";

export interface DebugLogEntry {
  id: string;
  level: "error" | "warn" | "info";
  scope: string;
  message: string;
  detail: string | null;
  context: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Reachable from the client (app/global-error.tsx, and any client
 * try/catch that wants the same admin-visible log) — this is the only
 * client-callable entry into the debug log, deliberately separate from the
 * internal logDebugEvent() used by instrumentation.ts's server-side hook.
 */
export async function reportClientError(input: {
  message: string;
  detail?: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  await logDebugEvent({
    level: "error",
    scope: "client",
    message: input.message,
    detail: input.detail,
    context: input.context,
  });
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("username, role").eq("id", user.id).single();
  if (!isAdmin(profile)) return null;
  return user;
}

export async function getDebugLogs(limit = 200): Promise<DebugLogEntry[]> {
  const user = await requireAdmin();
  if (!user) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("debug_logs")
    .select("id, level, scope, message, detail, context, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    level: row.level,
    scope: row.scope,
    message: row.message,
    detail: row.detail,
    context: row.context,
    createdAt: row.created_at,
  }));
}

export async function deleteAllDebugLogs(): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin.from("debug_logs").delete().gte("created_at", "1970-01-01");
  if (error) return { success: false, error: "Löschen fehlgeschlagen." };
  return { success: true };
}

export async function deleteDebugLogsInRange(fromIso: string, toIso: string): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  if (!Date.parse(fromIso) || !Date.parse(toIso)) {
    return { success: false, error: "Ungültiger Zeitraum." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("debug_logs").delete().gte("created_at", fromIso).lte("created_at", toIso);
  if (error) return { success: false, error: "Löschen fehlgeschlagen." };
  return { success: true };
}

export async function deleteDebugLog(id: string): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin.from("debug_logs").delete().eq("id", id);
  if (error) return { success: false, error: "Löschen fehlgeschlagen." };
  return { success: true };
}
