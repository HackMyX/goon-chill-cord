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
};

export interface ModActionRow {
  id: string;
  modId: string;
  modUsername: string | null;
  targetUserId: string | null;
  targetUsername: string | null;
  actionType: "warning" | "note" | "temp_ban" | "ticket_close" | "credits_add";
  reason: string | null;
  details: Record<string, unknown> | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface ModUserSummary {
  id: string;
  username: string;
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
  subject: string;
  message: string;
  status: "open" | "in_progress" | "closed" | string;
  category: string;
  priority: string;
  createdAt: string;
  closedAt: string | null;
  closedByUsername: string | null;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  userId: string;
  username: string;
  message: string;
  isStaff: boolean;
  createdAt: string;
}
