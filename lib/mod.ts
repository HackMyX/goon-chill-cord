/**
 * Pure mod-system types and constants — NOT "use server".
 * Kept separate from lib/actions/mod.ts so that non-async exports
 * (interfaces, default values) don't violate Next.js's rule that
 * "use server" files may only export async functions.
 */

export interface ModPermissions {
  canViewTickets: boolean;
  canCloseTickets: boolean;
  canWarnUsers: boolean;
  canTempBanUsers: boolean;
  canViewUserDetails: boolean;
  canViewAuditLog: boolean;
  canAddCredits: boolean;
  maxTempBanHours: number;
  warnRequiresReason: boolean;
  // v2 extended permissions
  canClearChat: boolean;
  canDeleteTickets: boolean;
  canSetTicketPriority: boolean;
  canUpdateTicketStatus: boolean;
  canRewardTickets: boolean;
  maxRewardPerTicket: number; // 0 = kein Limit
  canPauseTickets: boolean;
  // v3 — Admin-KI access
  canUseAdminAi: boolean; // Zugriff auf Admin-KI-Tools (standard: false für Mods)
  // v4 — Global-Chat-Stummschaltung (zeitlich begrenzt)
  canMuteChat: boolean;
  maxChatMuteHours: number;
}

export const DEFAULT_MOD_PERMISSIONS: ModPermissions = {
  canViewTickets: true,
  canCloseTickets: true,
  canWarnUsers: true,
  canTempBanUsers: false,
  canViewUserDetails: true,
  canViewAuditLog: false,
  canAddCredits: false,
  maxTempBanHours: 24,
  warnRequiresReason: true,
  canClearChat: false,
  canDeleteTickets: false,
  canSetTicketPriority: false,
  canUpdateTicketStatus: false,
  canRewardTickets: false,
  maxRewardPerTicket: 0,
  canPauseTickets: false,
  canUseAdminAi: false,
  canMuteChat: false,
  maxChatMuteHours: 24,
};

export const ADMIN_MOD_PERMISSIONS: ModPermissions = {
  canViewTickets: true,
  canCloseTickets: true,
  canWarnUsers: true,
  canTempBanUsers: true,
  canViewUserDetails: true,
  canViewAuditLog: true,
  canAddCredits: true,
  maxTempBanHours: 8760,
  warnRequiresReason: false,
  canClearChat: true,
  canDeleteTickets: true,
  canSetTicketPriority: true,
  canUpdateTicketStatus: true,
  canRewardTickets: true,
  maxRewardPerTicket: 0,
  canPauseTickets: true,
  canUseAdminAi: true,
  canMuteChat: true,
  maxChatMuteHours: 8760,
};

export interface ChatConfig {
  enabled: boolean;
  messageCooldownSec: number;
  maxMessageLength: number;
  bannedWords: string[];
  autoFilter: boolean;
  modsCanClear: boolean;
}

export const DEFAULT_CHAT_CONFIG: ChatConfig = {
  enabled: true,
  messageCooldownSec: 2,
  maxMessageLength: 300,
  bannedWords: [],
  autoFilter: true,
  modsCanClear: true,
};

export interface ModeratorWithPermissions {
  id: string;
  username: string;
  role: string;
  override: Partial<ModPermissions> | null;
  effective: ModPermissions;
}

export interface ModActionRow {
  id: string;
  modId: string;
  modUsername: string | null;
  targetUserId: string | null;
  targetUsername: string | null;
  actionType: "warning" | "note" | "temp_ban" | "ticket_close" | "credits_add" | "chat_mute" | "chat_unmute";
  reason: string | null;
  details: Record<string, unknown> | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface ModUserSummary {
  id: string;
  username: string;
  nameStyleKey?: string;
  role: string;
  credits: number;
  streakDays: number;
  tempBannedUntil: string | null;
  createdAt: string;
  warningCount: number;
  noteCount: number;
}

export interface ModTicket {
  id: string;
  userId: string;
  username: string;
  nameStyleKey?: string;
  subject: string;
  message: string;
  status: "open" | "in_progress" | "paused" | "closed" | string;
  category: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  closedByUsername: string | null;
  attachmentUrl: string | null;
  rewardCredits: number | null;
  rewardNote: string | null;
  rewardGrantedAt: string | null;
  rewardPending: boolean;
  escalatedToAdmin: boolean;
  escalatedToUserId: string | null;
  escalatedToUsername: string | null;
  suggestionOutcome?: "accepted" | "declined" | null;
}

export interface EscalationTarget {
  id: string;
  username: string;
  role: "moderator" | "admin";
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  userId: string;
  username: string;
  nameStyleKey?: string;
  avatarUrl: string | null;
  message: string;
  isStaff: boolean;
  createdAt: string;
  attachmentUrl: string | null;
}

/**
 * A single activity-/audit-log entry as consumed by the mod panel.
 * Shape is compatible with the admin `<AuditTimeline>` `AuditEntry` prop
 * (id/action/payload/created_at + resolved actor username).
 */
export interface ModAuditEntry {
  id: string;
  action: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  actor: string | null;
}
