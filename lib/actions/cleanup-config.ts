"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import {
  type CleanupRule,
  type CleanupSourceKey,
  ALL_CLEANUP_KEYS,
  CLEANUP_SOURCE_META,
  DEFAULT_CLEANUP_RULES,
} from "@/lib/cleanup-config";
import { logDebugEvent } from "@/lib/debug-log-server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht eingeloggt");
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role, username").eq("id", user.id).single();
  if (!isAdmin(profile)) throw new Error("Keine Admin-Berechtigung");
  return { user, profile };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getCleanupRules(): Promise<CleanupRule[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("cleanup_config")
      .select("*")
      .in("source_key", ALL_CLEANUP_KEYS);

    const byKey = new Map((data ?? []).map((r: Record<string, unknown>) => [r.source_key as string, r]));

    // Seed any missing keys so subsequent health checks see rows for all expected sources.
    const missingKeys = ALL_CLEANUP_KEYS.filter((k) => !byKey.has(k));
    if (missingKeys.length > 0) {
      await admin.from("cleanup_config").upsert(
        missingKeys.map((key) => ({
          source_key: key,
          enabled: false,
          retention_days: CLEANUP_SOURCE_META[key].defaultRetentionDays,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "source_key", ignoreDuplicates: true }
      );
    }

    return ALL_CLEANUP_KEYS.map((key) => {
      const row = byKey.get(key);
      const meta = CLEANUP_SOURCE_META[key];
      if (!row) {
        return {
          sourceKey: key,
          label: meta.label,
          description: meta.description,
          enabled: false,
          retentionDays: meta.defaultRetentionDays,
          lastRunAt: null,
          lastRunDeleted: null,
        };
      }
      return {
        sourceKey: key,
        label: meta.label,
        description: meta.description,
        enabled: (row.enabled as boolean) ?? false,
        retentionDays: (row.retention_days as number) ?? meta.defaultRetentionDays,
        lastRunAt: (row.last_run_at as string) ?? null,
        lastRunDeleted: (row.last_run_deleted as number) ?? null,
      };
    });
  } catch {
    return DEFAULT_CLEANUP_RULES;
  }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export async function updateCleanupRule(
  sourceKey: CleanupSourceKey,
  patch: { enabled?: boolean; retentionDays?: number }
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    if (!ALL_CLEANUP_KEYS.includes(sourceKey)) {
      return { success: false, error: "Unbekannter Source-Key." };
    }
    const admin = createAdminClient();
    const { error } = await admin.from("cleanup_config").upsert({
      source_key: sourceKey,
      enabled: patch.enabled,
      retention_days: patch.retentionDays !== undefined ? Math.max(1, Math.min(3650, patch.retentionDays)) : undefined,
      updated_at: new Date().toISOString(),
    }, { onConflict: "source_key", ignoreDuplicates: false });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ---------------------------------------------------------------------------
// Manual run — delete rows for one source NOW (ignores enabled flag)
// ---------------------------------------------------------------------------

export async function runCleanupNow(
  sourceKey: CleanupSourceKey,
  retentionDays: number
): Promise<{ success: boolean; deleted: number; error?: string }> {
  try {
    await requireAdmin();
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
    const deleted = await deleteSource(sourceKey, cutoff);
    // Record last run
    const admin = createAdminClient();
    await admin.from("cleanup_config").upsert({
      source_key: sourceKey,
      last_run_at: new Date().toISOString(),
      last_run_deleted: deleted,
      updated_at: new Date().toISOString(),
    }, { onConflict: "source_key", ignoreDuplicates: false });
    await logDebugEvent({
      level: "info",
      scope: "cleanup",
      message: `Manueller Cleanup: ${sourceKey} — ${deleted} Zeilen gelöscht`,
      context: { sourceKey, retentionDays, deleted, cutoff },
    });
    return { success: true, deleted };
  } catch (e) {
    await logDebugEvent({
      level: "error",
      scope: "cleanup",
      message: `Cleanup fehlgeschlagen: ${sourceKey}`,
      detail: String(e),
      context: { sourceKey, retentionDays },
    });
    return { success: false, deleted: 0, error: String(e) };
  }
}

// ---------------------------------------------------------------------------
// Run all enabled rules (called by a cron or admin trigger)
// ---------------------------------------------------------------------------

export async function runAllEnabledCleanups(): Promise<{
  success: boolean;
  results: Array<{ sourceKey: CleanupSourceKey; deleted: number; error?: string }>;
}> {
  try {
    await requireAdmin();
    const rules = await getCleanupRules();
    const enabledRules = rules.filter((r) => r.enabled && r.retentionDays > 0);
    const results: Array<{ sourceKey: CleanupSourceKey; deleted: number; error?: string }> = [];
    const admin = createAdminClient();

    for (const rule of enabledRules) {
      try {
        const cutoff = new Date(Date.now() - rule.retentionDays * 86_400_000).toISOString();
        const deleted = await deleteSource(rule.sourceKey, cutoff);
        await admin.from("cleanup_config").upsert({
          source_key: rule.sourceKey,
          last_run_at: new Date().toISOString(),
          last_run_deleted: deleted,
          updated_at: new Date().toISOString(),
        }, { onConflict: "source_key", ignoreDuplicates: false });
        results.push({ sourceKey: rule.sourceKey, deleted });
      } catch (e) {
        results.push({ sourceKey: rule.sourceKey, deleted: 0, error: String(e) });
        await logDebugEvent({
          level: "error",
          scope: "cleanup",
          message: `Auto-Cleanup fehlgeschlagen: ${rule.sourceKey}`,
          detail: String(e),
          context: { sourceKey: rule.sourceKey, retentionDays: rule.retentionDays },
        });
      }
    }
    return { success: true, results };
  } catch (e) {
    return { success: false, results: [], };
  }
}

// ---------------------------------------------------------------------------
// Per-source delete logic
// ---------------------------------------------------------------------------

async function deleteSource(key: CleanupSourceKey, cutoffIso: string): Promise<number> {
  const admin = createAdminClient();

  switch (key) {
    case "debug_logs": {
      const { data } = await admin
        .from("debug_logs")
        .delete()
        .lt("created_at", cutoffIso)
        .select("id");
      return data?.length ?? 0;
    }
    case "global_chat_messages": {
      const { data } = await admin
        .from("global_chat_messages")
        .delete()
        .lt("created_at", cutoffIso)
        .select("id");
      return data?.length ?? 0;
    }
    case "mod_actions": {
      const { data } = await admin
        .from("mod_actions")
        .delete()
        .lt("created_at", cutoffIso)
        .select("id");
      return data?.length ?? 0;
    }
    case "login_events": {
      const { data } = await admin
        .from("login_events")
        .delete()
        .lt("created_at", cutoffIso)
        .select("id");
      return data?.length ?? 0;
    }
    case "notifications": {
      // Only delete read notifications to avoid deleting unread ones
      const { data } = await admin
        .from("notifications")
        .delete()
        .lt("created_at", cutoffIso)
        .eq("read", true)
        .select("id");
      return data?.length ?? 0;
    }
    case "audit_logs": {
      const { data } = await admin
        .from("audit_logs")
        .delete()
        .lt("created_at", cutoffIso)
        .select("id");
      return data?.length ?? 0;
    }
    case "tickets_closed": {
      // Only delete closed tickets
      const { data: rows } = await admin
        .from("tickets")
        .select("id")
        .lt("created_at", cutoffIso)
        .eq("status", "closed");
      const ids = (rows ?? []).map((r: { id: string }) => r.id);
      if (ids.length === 0) return 0;
      await admin.from("ticket_messages").delete().in("ticket_id", ids);
      const { data } = await admin.from("tickets").delete().in("id", ids).select("id");
      return data?.length ?? 0;
    }
    case "trade_offers_done": {
      const { data } = await admin
        .from("trade_offers")
        .delete()
        .lt("created_at", cutoffIso)
        .in("status", ["accepted", "declined", "cancelled"])
        .select("id");
      return data?.length ?? 0;
    }
    case "auctions_done": {
      const { data } = await admin
        .from("auctions")
        .delete()
        .lt("created_at", cutoffIso)
        .in("status", ["sold", "expired", "cancelled"])
        .select("id");
      return data?.length ?? 0;
    }
    default:
      return 0;
  }
}
