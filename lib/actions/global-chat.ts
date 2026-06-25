"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, isModerator } from "@/lib/admin";
import { type ChatConfig, DEFAULT_CHAT_CONFIG, ADMIN_MOD_PERMISSIONS, DEFAULT_MOD_PERMISSIONS, type ModPermissions } from "@/lib/mod";
import { logDebugEvent } from "@/lib/debug-log-server";

export interface GlobalChatMessage {
  id: string;
  userId: string | null;
  username: string;
  role: string;
  content: string;
  isSystem: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  avatarUrl: string | null;
  badges?: string[];
  nameStyleKey?: string;
}

function rowToMsg(r: Record<string, unknown>): GlobalChatMessage {
  const metadata = (r.metadata as Record<string, unknown>) ?? null;
  const badges = metadata?.badges as string[] | undefined;
  const nameStyleKey = metadata?.name_style_key as string | undefined;
  return {
    id: r.id as string,
    userId: r.user_id as string | null,
    username: r.username as string,
    role: (r.role as string) ?? "user",
    content: r.content as string,
    isSystem: (r.is_system as boolean) ?? false,
    metadata,
    createdAt: r.created_at as string,
    avatarUrl: (r.avatar_url as string) ?? null,
    badges: Array.isArray(badges) ? badges : undefined,
    nameStyleKey,
  };
}

// ── Auto-detection patterns for common offensive content ──────────────────────
// Covers basic l33t-speak evasions without full ML. Used when autoFilter=true.
const AUTO_BLOCK_PATTERNS: RegExp[] = [
  /\bn[i1!][g9][g9][e3]r\b/gi,
  /\bn[i1!][g9][g9][a4]\b/gi,
  /\bf[a4@][g9][g9][o0]t\b/gi,
  /\bk[i1][k1][e3]\b/gi,
  /\bch[i1]nk\b/gi,
];

const AUTO_CENSOR_PATTERNS: RegExp[] = [
  /(.)\1{9,}/g,   // 10+ repeated characters
];

function checkAutoFilter(content: string): { blocked: boolean; censored: string } {
  for (const pat of AUTO_BLOCK_PATTERNS) {
    if (pat.test(content)) {
      pat.lastIndex = 0;
      return { blocked: true, censored: content };
    }
    pat.lastIndex = 0;
  }
  let censored = content;
  for (const pat of AUTO_CENSOR_PATTERNS) {
    censored = censored.replace(pat, (m) => m[0].repeat(5) + "…");
    pat.lastIndex = 0;
  }
  return { blocked: false, censored };
}

function checkBannedWords(content: string, bannedWords: string[]): boolean {
  if (bannedWords.length === 0) return false;
  const lower = content.toLowerCase();
  return bannedWords.some((w) => w && lower.includes(w.toLowerCase()));
}

// ── Config ────────────────────────────────────────────────────────────────────

export async function getChatConfig(): Promise<ChatConfig> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("global_chat_config").select("*").eq("id", "default").single();
    if (!data) return DEFAULT_CHAT_CONFIG;
    return {
      enabled: data.enabled ?? true,
      messageCooldownSec: data.message_cooldown_sec ?? 2,
      maxMessageLength: data.max_message_length ?? 300,
      bannedWords: (data.banned_words as string[]) ?? [],
      autoFilter: data.auto_filter ?? true,
      modsCanClear: data.mods_can_clear ?? true,
    };
  } catch {
    return DEFAULT_CHAT_CONFIG;
  }
}

export async function updateChatConfig(
  config: ChatConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Nicht eingeloggt." };
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
    if (!isAdmin(profile)) return { success: false, error: "Nur Admins können Chat-Einstellungen ändern." };
    const { error } = await admin.from("global_chat_config").upsert({
      id: "default",
      enabled: config.enabled,
      message_cooldown_sec: Math.max(0, Math.min(60, config.messageCooldownSec)),
      max_message_length: Math.max(50, Math.min(2000, config.maxMessageLength)),
      banned_words: config.bannedWords.filter(Boolean),
      auto_filter: config.autoFilter,
      mods_can_clear: config.modsCanClear,
      updated_at: new Date().toISOString(),
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Clear chat ────────────────────────────────────────────────────────────────

export async function clearGlobalChat(): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Nicht eingeloggt." };
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("role, username, mod_permissions_override")
      .eq("id", user.id)
      .single();
    if (!isModerator(profile)) return { success: false, error: "Keine Berechtigung." };

    if (!isAdmin(profile)) {
      // Resolve effective permissions: global defaults merged with per-user override
      const { data: globalRow } = await admin
        .from("mod_permissions")
        .select("*")
        .eq("id", "default")
        .single();
      const globalPerms: ModPermissions = globalRow
        ? {
            canViewTickets: globalRow.can_view_tickets ?? DEFAULT_MOD_PERMISSIONS.canViewTickets,
            canCloseTickets: globalRow.can_close_tickets ?? DEFAULT_MOD_PERMISSIONS.canCloseTickets,
            canWarnUsers: globalRow.can_warn_users ?? DEFAULT_MOD_PERMISSIONS.canWarnUsers,
            canTempBanUsers: globalRow.can_temp_ban_users ?? DEFAULT_MOD_PERMISSIONS.canTempBanUsers,
            canViewUserDetails: globalRow.can_view_user_details ?? DEFAULT_MOD_PERMISSIONS.canViewUserDetails,
            canViewAuditLog: globalRow.can_view_audit_log ?? DEFAULT_MOD_PERMISSIONS.canViewAuditLog,
            canAddCredits: globalRow.can_add_credits ?? DEFAULT_MOD_PERMISSIONS.canAddCredits,
            maxTempBanHours: globalRow.max_temp_ban_hours ?? DEFAULT_MOD_PERMISSIONS.maxTempBanHours,
            warnRequiresReason: globalRow.warn_requires_reason ?? DEFAULT_MOD_PERMISSIONS.warnRequiresReason,
            canClearChat: globalRow.can_clear_chat ?? DEFAULT_MOD_PERMISSIONS.canClearChat,
            canDeleteTickets: globalRow.can_delete_tickets ?? DEFAULT_MOD_PERMISSIONS.canDeleteTickets,
            canSetTicketPriority: globalRow.can_set_ticket_priority ?? DEFAULT_MOD_PERMISSIONS.canSetTicketPriority,
            canUpdateTicketStatus: globalRow.can_update_ticket_status ?? DEFAULT_MOD_PERMISSIONS.canUpdateTicketStatus,
            canRewardTickets: globalRow.can_reward_tickets ?? DEFAULT_MOD_PERMISSIONS.canRewardTickets,
            maxRewardPerTicket: (globalRow as Record<string, unknown>).max_reward_per_ticket as number ?? DEFAULT_MOD_PERMISSIONS.maxRewardPerTicket,
          }
        : DEFAULT_MOD_PERMISSIONS;
      const override = ((profile as Record<string, unknown>).mod_permissions_override as Partial<ModPermissions>) ?? null;
      const effectivePerms: ModPermissions = override ? { ...globalPerms, ...override } : globalPerms;
      if (!effectivePerms.canClearChat) {
        return { success: false, error: "Keine Berechtigung zum Chat leeren (Mod-Einstellung)." };
      }
      const cfg = await getChatConfig();
      if (!cfg.modsCanClear) {
        return { success: false, error: "Mods dürfen den Chat nicht leeren (Chat-Einstellung)." };
      }
    }

    const { error } = await admin.from("global_chat_messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      void logDebugEvent({ level: "error", scope: "chat", message: "clearGlobalChat DB-Fehler", detail: error.message });
      return { success: false, error: error.message };
    }
    await admin.from("global_chat_messages").insert({
      user_id: null,
      username: "System",
      role: "system",
      content: `💬 Chat wurde von ${(profile as Record<string, unknown>).username ?? "einem Moderator"} geleert.`,
      is_system: true,
      metadata: { type: "chat_clear", by: (profile as Record<string, unknown>).username },
    });
    return { success: true };
  } catch (e) {
    void logDebugEvent({ level: "error", scope: "chat", message: "clearGlobalChat fehlgeschlagen", detail: String(e) });
    return { success: false, error: String(e) };
  }
}

// ── Read messages ─────────────────────────────────────────────────────────────

export async function getGlobalChatMessages(limit = 60): Promise<GlobalChatMessage[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("global_chat_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map(rowToMsg).reverse();
}

// ── Send message ──────────────────────────────────────────────────────────────

export async function sendGlobalChatMessage(content: string): Promise<{ success: boolean; error?: string }> {
  if (!content?.trim()) return { success: false, error: "Leere Nachricht." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const { data: profile } = await supabase.from("profiles").select("username, role, temp_banned_until, avatar_url, active_name_style_key").eq("id", user.id).single();
  if (!profile) return { success: false, error: "Profil nicht gefunden." };

  if (profile.temp_banned_until && new Date(profile.temp_banned_until) > new Date()) {
    return { success: false, error: "Du bist temporär gesperrt." };
  }

  // Load chat config (graceful fallback to defaults if table doesn't exist yet)
  const cfg = await getChatConfig();

  if (!cfg.enabled && !isModerator(profile)) {
    return { success: false, error: "Der Chat ist derzeit deaktiviert." };
  }

  const maxLen = cfg.maxMessageLength;
  const trimmed = content.trim().slice(0, maxLen);

  if (cfg.autoFilter) {
    const { blocked } = checkAutoFilter(trimmed);
    if (blocked) return { success: false, error: "Nachricht enthält nicht erlaubte Inhalte." };
  }

  if (checkBannedWords(trimmed, cfg.bannedWords)) {
    return { success: false, error: "Nachricht enthält verbotene Wörter." };
  }

  const admin = createAdminClient();
  const cooldownMs = cfg.messageCooldownSec * 1000;
  const since = new Date(Date.now() - cooldownMs).toISOString();
  const { data: recent } = await admin
    .from("global_chat_messages")
    .select("id")
    .eq("user_id", user.id)
    .gte("created_at", since)
    .limit(1);
  if (recent && recent.length > 0) {
    return { success: false, error: `Zu schnell! Warte ${cfg.messageCooldownSec}s bevor du die nächste Nachricht sendest.` };
  }

  // Fetch user's badges as a snapshot for display in the chat message
  let badgeKeys: string[] = [];
  try {
    const { data: userBadges } = await admin
      .from("user_badges")
      .select("badge_key")
      .eq("user_id", user.id);
    if (userBadges && userBadges.length > 0) {
      badgeKeys = userBadges.map((b: Record<string, unknown>) => b.badge_key as string).filter(Boolean);
    }
  } catch {
    // If user_badges table doesn't exist yet, silently skip
  }

  const { error } = await admin.from("global_chat_messages").insert({
    user_id: user.id,
    username: profile.username ?? "Unbekannt",
    role: profile.role ?? "user",
    content: trimmed,
    is_system: false,
    avatar_url: (profile as Record<string, unknown>).avatar_url ?? null,
    metadata: (() => {
      const nameStyleKey = (profile as Record<string, unknown>).active_name_style_key as string | null | undefined;
      const meta: Record<string, unknown> = {};
      if (badgeKeys.length > 0) meta.badges = badgeKeys;
      if (nameStyleKey) meta.name_style_key = nameStyleKey;
      return Object.keys(meta).length > 0 ? meta : null;
    })(),
  });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// Called by server actions when big wins happen — bypasses RLS
export async function broadcastSystemWin(opts: {
  username: string;
  itemName: string;
  rarity: string;
  caseName?: string;
}) {
  try {
    const admin = createAdminClient();
    const emoji = opts.rarity === "ultra" ? "🌟" : opts.rarity === "mythisch" ? "✨" : "⭐";
    const rarityLabel = opts.rarity === "ultra" ? "Ultra" : opts.rarity === "mythisch" ? "Mythisch" : opts.rarity;
    const content = `${emoji} ${opts.username} hat „${opts.itemName}" (${rarityLabel}) gezogen!`;
    await admin.from("global_chat_messages").insert({
      user_id: null,
      username: "System",
      role: "system",
      content,
      is_system: true,
      metadata: {
        type: "win",
        rarity: opts.rarity,
        itemName: opts.itemName,
        username: opts.username,
      },
    });
  } catch { /* never let broadcast failure affect case opening */ }
}
