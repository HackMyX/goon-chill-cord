"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { logActivity, logDebugEvent } from "@/lib/debug-log-server";
import { DEFAULT_MUSIC_CONFIG, type MusicConfig } from "@/lib/music-config";

export async function getMusicConfig(): Promise<MusicConfig> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("music_config")
      .select("config")
      .eq("id", "default")
      .maybeSingle();
    if (!data?.config) return DEFAULT_MUSIC_CONFIG;
    return { ...DEFAULT_MUSIC_CONFIG, ...(data.config as MusicConfig) };
  } catch {
    return DEFAULT_MUSIC_CONFIG;
  }
}

export async function saveMusicConfig(
  config: MusicConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Nicht eingeloggt." };

    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
    if (!isAdmin(profile)) return { success: false, error: "Kein Admin-Zugriff." };

    const { error } = await admin.from("music_config").upsert({
      id: "default",
      config,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      void logDebugEvent({ level: "error", scope: "admin:music", message: "Music-Config speichern fehlgeschlagen", detail: error.message });
      return { success: false, error: error.message };
    }

    // Live-broadcast to all connected players (no reload) — AGENTS §3.
    // Players re-fetch the config and re-apply per-page volume / track instantly.
    try {
      const ch = admin.channel("music-live");
      await ch.send({ type: "broadcast", event: "music_changed", payload: { updatedAt: new Date().toISOString() } });
      await admin.removeChannel(ch);
    } catch { /* broadcast is best-effort */ }

    void logActivity("admin:music", `Music-Config gespeichert (${config.tracks.length} Tracks, enabled=${config.enabled})`, { userId: user.id });
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
