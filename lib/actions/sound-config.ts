"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { logActivity, logDebugEvent } from "@/lib/debug-log-server";
import { DEFAULT_SOUND_CONFIG, type SoundConfig } from "@/lib/sound-config";

export async function getSoundConfig(): Promise<SoundConfig> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("sound_config")
      .select("config")
      .eq("id", "default")
      .maybeSingle();

    if (!data?.config) return DEFAULT_SOUND_CONFIG;

    // Merge with defaults so new events always have a fallback
    return { ...DEFAULT_SOUND_CONFIG, ...(data.config as SoundConfig) };
  } catch {
    return DEFAULT_SOUND_CONFIG;
  }
}

export async function updateSoundConfig(
  config: SoundConfig
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  const { error } = await admin.from("sound_config").upsert({
    id: "default",
    config,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    void logDebugEvent({ level: "error", scope: "admin:sound-config", message: "Sound-Config speichern fehlgeschlagen", detail: error.message });
    return { success: false, error: error.message };
  }

  // Live-broadcast to all connected clients (no reload) — AGENTS §3.
  // SoundConfigLoader re-fetches and re-applies to the global SoundManager.
  try {
    const ch = admin.channel("sound-config-live");
    await ch.send({ type: "broadcast", event: "sound_config_changed", payload: { updatedAt: new Date().toISOString() } });
    await admin.removeChannel(ch);
  } catch { /* broadcast is best-effort */ }

  void logActivity("admin:sound-config", `Sound-Config gespeichert (${Object.keys(config).length} Events)`, { userId: user.id });
  return { success: true };
}
