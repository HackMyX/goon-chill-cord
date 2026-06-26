"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { logActivity, logDebugEvent } from "@/lib/debug-log-server";
import { DEFAULT_PREVIEW_CONFIG, type PreviewConfig } from "@/lib/preview-config-types";

function rowToConfig(row: Record<string, unknown>): PreviewConfig {
  return {
    id: "default",
    item3dAutoRotate:       (row.item3d_auto_rotate       as boolean) ?? DEFAULT_PREVIEW_CONFIG.item3dAutoRotate,
    item3dRotationSpeed:    Number(row.item3d_rotation_speed)          || DEFAULT_PREVIEW_CONFIG.item3dRotationSpeed,
    item3dCameraFov:        Number(row.item3d_camera_fov)              || DEFAULT_PREVIEW_CONFIG.item3dCameraFov,
    item3dCameraDistance:   Number(row.item3d_camera_distance)         || DEFAULT_PREVIEW_CONFIG.item3dCameraDistance,
    nameStyleSize:          (row.name_style_size           as string)  ?? DEFAULT_PREVIEW_CONFIG.nameStyleSize,
    nameStyleGlowPulse:     (row.name_style_glow_pulse     as boolean) ?? DEFAULT_PREVIEW_CONFIG.nameStyleGlowPulse,
    badgeGlowEnabled:       (row.badge_glow_enabled        as boolean) ?? DEFAULT_PREVIEW_CONFIG.badgeGlowEnabled,
    badgeGlowIntensity:     Number(row.badge_glow_intensity)           || DEFAULT_PREVIEW_CONFIG.badgeGlowIntensity,
    particleEffectsEnabled: (row.particle_effects_enabled  as boolean) ?? DEFAULT_PREVIEW_CONFIG.particleEffectsEnabled,
    previewBgStyle:         (row.preview_bg_style          as string)  ?? DEFAULT_PREVIEW_CONFIG.previewBgStyle,
    updatedAt:              (row.updated_at                as string | null) ?? null,
  };
}

export async function getPreviewConfig(): Promise<PreviewConfig> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("preview_config")
      .select("*")
      .eq("id", "default")
      .maybeSingle();
    if (!data) return DEFAULT_PREVIEW_CONFIG;
    return rowToConfig(data as Record<string, unknown>);
  } catch {
    return DEFAULT_PREVIEW_CONFIG;
  }
}

export async function updatePreviewConfig(
  config: Omit<PreviewConfig, "id" | "updatedAt">
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  const { error } = await admin.from("preview_config").upsert({
    id: "default",
    item3d_auto_rotate:       config.item3dAutoRotate,
    item3d_rotation_speed:    config.item3dRotationSpeed,
    item3d_camera_fov:        config.item3dCameraFov,
    item3d_camera_distance:   config.item3dCameraDistance,
    name_style_size:          config.nameStyleSize,
    name_style_glow_pulse:    config.nameStyleGlowPulse,
    badge_glow_enabled:       config.badgeGlowEnabled,
    badge_glow_intensity:     config.badgeGlowIntensity,
    particle_effects_enabled: config.particleEffectsEnabled,
    preview_bg_style:         config.previewBgStyle,
    updated_at:               new Date().toISOString(),
  });

  if (error) {
    void logDebugEvent({ level: "error", scope: "admin:preview-config", message: "Preview-Config speichern fehlgeschlagen", detail: error.message });
    return { success: false, error: error.message };
  }
  void logActivity("admin:preview-config", "Preview-Engine Konfiguration gespeichert", { userId: user.id });
  return { success: true };
}
