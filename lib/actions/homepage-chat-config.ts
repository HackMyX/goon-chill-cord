"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { broadcastLive } from "@/lib/realtime-broadcast";
import { logActivity, logDebugEvent } from "@/lib/debug-log-server";
import {
  DEFAULT_HOMEPAGE_CHAT_CONFIG,
  type HomepageChatConfig,
} from "@/lib/homepage-chat-config-types";

function rowToConfig(row: Record<string, unknown>): HomepageChatConfig {
  return {
    id: (row.id as string) ?? "default",
    enabled: (row.enabled as boolean) ?? true,
    defaultOpenDesktop: (row.default_open_desktop as boolean) ?? true,
    defaultOpenMobile: (row.default_open_mobile as boolean) ?? false,
    sidebarWidth: (row.sidebar_width as number) ?? 320,
    sidebarPosition: (row.sidebar_position as string) ?? "left",
    bgOpacity: (row.bg_opacity as number) ?? 20,
    blurIntensity: (row.blur_intensity as string) ?? "md",
    showAvatars: (row.show_avatars as boolean) ?? true,
    showBadges: (row.show_badges as boolean) ?? true,
    showTimestamps: (row.show_timestamps as boolean) ?? true,
    showTimestampsRelative: (row.show_timestamps_relative as boolean) ?? true,
    showInput: (row.show_input as boolean) ?? true,
    maxMessages: (row.max_messages as number) ?? 50,
    maxBadgeCount: (row.max_badge_count as number) ?? 3,
    fontSize: (row.font_size as string) ?? "sm",
    messageAnimation: (row.message_animation as boolean) ?? true,
    inputPlaceholder: (row.input_placeholder as string) ?? "Nachricht...",
    tabTitle: (row.tab_title as string) ?? "Community Chat",
    headerVisible: (row.header_visible as boolean) ?? true,
    showOnlineCount: (row.show_online_count as boolean) ?? true,
    compactMode: (row.compact_mode as boolean) ?? false,
    highlightMentions: (row.highlight_mentions as boolean) ?? true,
    mentionSound: (row.mention_sound as boolean) ?? false,
    autoScroll: (row.auto_scroll as boolean) ?? true,
    updatedAt: (row.updated_at as string | null) ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

export async function getHomepageChatConfig(): Promise<HomepageChatConfig> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("homepage_chat_config")
      .select("*")
      .eq("id", "default")
      .maybeSingle();
    if (!data) return DEFAULT_HOMEPAGE_CHAT_CONFIG;
    return rowToConfig(data as Record<string, unknown>);
  } catch {
    return DEFAULT_HOMEPAGE_CHAT_CONFIG;
  }
}

export async function adminUpdateHomepageChatConfig(
  config: Partial<HomepageChatConfig>
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Nicht eingeloggt." };

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!isAdmin(profile)) {
      return { success: false, error: "Nur Admins können die Chat-Sidebar-Einstellungen ändern." };
    }

    const patch: Record<string, unknown> = { id: "default", updated_at: new Date().toISOString() };

    if (config.enabled !== undefined)               patch.enabled = config.enabled;
    if (config.defaultOpenDesktop !== undefined)    patch.default_open_desktop = config.defaultOpenDesktop;
    if (config.defaultOpenMobile !== undefined)     patch.default_open_mobile = config.defaultOpenMobile;
    if (config.sidebarWidth !== undefined)          patch.sidebar_width = config.sidebarWidth;
    if (config.sidebarPosition !== undefined)       patch.sidebar_position = config.sidebarPosition;
    if (config.bgOpacity !== undefined)             patch.bg_opacity = config.bgOpacity;
    if (config.blurIntensity !== undefined)         patch.blur_intensity = config.blurIntensity;
    if (config.showAvatars !== undefined)           patch.show_avatars = config.showAvatars;
    if (config.showBadges !== undefined)            patch.show_badges = config.showBadges;
    if (config.showTimestamps !== undefined)        patch.show_timestamps = config.showTimestamps;
    if (config.showTimestampsRelative !== undefined) patch.show_timestamps_relative = config.showTimestampsRelative;
    if (config.showInput !== undefined)             patch.show_input = config.showInput;
    if (config.maxMessages !== undefined)           patch.max_messages = config.maxMessages;
    if (config.maxBadgeCount !== undefined)         patch.max_badge_count = config.maxBadgeCount;
    if (config.fontSize !== undefined)              patch.font_size = config.fontSize;
    if (config.messageAnimation !== undefined)      patch.message_animation = config.messageAnimation;
    if (config.inputPlaceholder !== undefined)      patch.input_placeholder = config.inputPlaceholder;
    if (config.tabTitle !== undefined)              patch.tab_title = config.tabTitle;
    if (config.headerVisible !== undefined)         patch.header_visible = config.headerVisible;
    if (config.showOnlineCount !== undefined)       patch.show_online_count = config.showOnlineCount;
    if (config.compactMode !== undefined)           patch.compact_mode = config.compactMode;
    if (config.highlightMentions !== undefined)     patch.highlight_mentions = config.highlightMentions;
    if (config.mentionSound !== undefined)          patch.mention_sound = config.mentionSound;
    if (config.autoScroll !== undefined)            patch.auto_scroll = config.autoScroll;

    const { error } = await admin
      .from("homepage_chat_config")
      .upsert(patch);

    if (error) {
      void logDebugEvent({ level: "error", scope: "admin:homepage-chat-config", message: "Speichern fehlgeschlagen", detail: error.message, context: { userId: user.id } });
      return { success: false, error: error.message };
    }
    void logActivity("admin:homepage-chat-config", "Homepage-Chat-Config gespeichert", { userId: user.id });
    await broadcastLive("homepage-chat-live");
    return { success: true };
  } catch (e) {
    void logDebugEvent({ level: "error", scope: "admin:homepage-chat-config", message: "Unbekannter Fehler", detail: String(e) });
    return { success: false, error: String(e) };
  }
}
