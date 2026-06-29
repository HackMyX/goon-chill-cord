"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { logActivity, logDebugEvent } from "@/lib/debug-log-server";
import { broadcastLive } from "@/lib/realtime-broadcast";
import {
  DEFAULT_FEEDBACK_CONFIG, resolveFeedbackConfig, type FeedbackConfig,
} from "@/lib/feedback-config";

export async function getFeedbackConfig(): Promise<FeedbackConfig> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("feedback_config")
      .select("config")
      .eq("id", "default")
      .maybeSingle();
    return resolveFeedbackConfig((data?.config ?? null) as Partial<FeedbackConfig> | null);
  } catch {
    return DEFAULT_FEEDBACK_CONFIG;
  }
}

export async function saveFeedbackConfig(
  config: FeedbackConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Nicht eingeloggt." };

    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
    if (!isAdmin(profile)) return { success: false, error: "Kein Admin-Zugriff." };

    // Re-resolve to drop any unexpected keys and guarantee a complete shape.
    const clean = resolveFeedbackConfig(config);

    const { error } = await admin.from("feedback_config").upsert({
      id: "default",
      config: clean,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      void logDebugEvent({ level: "error", scope: "admin:feedback", message: "Feedback-Config speichern fehlgeschlagen", detail: error.message });
      return { success: false, error: error.message };
    }

    // Live-broadcast so every open client re-applies the new feedback styling.
    await broadcastLive("feedback-config-live");

    void logActivity("admin:feedback", `Feedback-Config gespeichert (enabled=${clean.enabled})`, { userId: user.id });
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
