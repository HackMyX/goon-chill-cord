"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { logActivity, logDebugEvent } from "@/lib/debug-log-server";
import {
  DEFAULT_THEME_CONFIG,
  isThemeKey,
  type ThemeConfig,
} from "@/lib/theme-config";

export async function getThemeConfig(): Promise<ThemeConfig> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("theme_config")
      .select("config")
      .eq("id", "default")
      .maybeSingle();
    if (!data?.config) return DEFAULT_THEME_CONFIG;
    const cfg = data.config as Partial<ThemeConfig>;
    return {
      activeTheme: isThemeKey(cfg.activeTheme) ? cfg.activeTheme : DEFAULT_THEME_CONFIG.activeTheme,
      allowUserChoice: cfg.allowUserChoice ?? DEFAULT_THEME_CONFIG.allowUserChoice,
    };
  } catch {
    return DEFAULT_THEME_CONFIG;
  }
}

export async function saveThemeConfig(
  config: ThemeConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isThemeKey(config.activeTheme)) {
      return { success: false, error: "Unbekanntes Theme." };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Nicht eingeloggt." };

    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
    if (!isAdmin(profile)) return { success: false, error: "Kein Admin-Zugriff." };

    const clean: ThemeConfig = {
      activeTheme: config.activeTheme,
      allowUserChoice: !!config.allowUserChoice,
    };

    const { error } = await admin.from("theme_config").upsert({
      id: "default",
      config: clean,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      void logDebugEvent({ level: "error", scope: "admin:theme", message: "Theme-Config speichern fehlgeschlagen", detail: error.message });
      return { success: false, error: error.message };
    }

    // Live-broadcast to all connected clients (no reload) — AGENTS §3.
    try {
      const ch = admin.channel("theme-live");
      await ch.send({ type: "broadcast", event: "theme_changed", payload: clean });
      await admin.removeChannel(ch);
    } catch { /* broadcast is best-effort */ }

    void logActivity("admin:theme", `Theme gesetzt: ${clean.activeTheme} (User-Wahl: ${clean.allowUserChoice ? "an" : "aus"})`, { userId: user.id });
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
