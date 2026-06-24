"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isModerator, isAdmin } from "@/lib/admin";
import { notifyUser } from "@/lib/notifications-internal";
import {
  DEFAULT_MOD_PERMISSIONS,
  ADMIN_MOD_PERMISSIONS,
  type ModPermissions,
  type ModActionRow,
  type ModUserSummary,
  type ModTicket,
  type TicketMessage,
} from "@/lib/mod";

// ---------------------------------------------------------------------------
// Internal auth helpers (not exported — not async functions consumers call)
// ---------------------------------------------------------------------------

async function requireMod() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht eingeloggt");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!isModerator(profile)) throw new Error("Keine Moderator-Berechtigung");
  const isAdminUser = isAdmin(profile);
  return { user, profile, supabase, isAdminUser };
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht eingeloggt");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) throw new Error("Keine Admin-Berechtigung");
  return { user, profile, supabase };
}

// Returns full admin permissions for admins, DB-stored perms for mods.
async function effectivePerms(isAdminUser: boolean): Promise<ModPermissions> {
  if (isAdminUser) return ADMIN_MOD_PERMISSIONS;
  return getModPermissions();
}

// ---------------------------------------------------------------------------
// Read: permissions
// ---------------------------------------------------------------------------

export async function getModPermissions(): Promise<ModPermissions> {
  const admin = createAdminClient();
  const { data } = await admin.from("mod_permissions").select("*").eq("id", "default").single();
  if (!data) return DEFAULT_MOD_PERMISSIONS;
  return {
    canViewTickets: data.can_view_tickets ?? true,
    canCloseTickets: data.can_close_tickets ?? true,
    canWarnUsers: data.can_warn_users ?? true,
    canTempBanUsers: data.can_temp_ban_users ?? false,
    canViewUserDetails: data.can_view_user_details ?? true,
    canViewAuditLog: data.can_view_audit_log ?? false,
    canAddCredits: data.can_add_credits ?? false,
    maxTempBanHours: data.max_temp_ban_hours ?? 24,
    warnRequiresReason: data.warn_requires_reason ?? true,
    canClearChat: data.can_clear_chat ?? false,
    canDeleteTickets: data.can_delete_tickets ?? false,
    canSetTicketPriority: data.can_set_ticket_priority ?? false,
    canUpdateTicketStatus: data.can_update_ticket_status ?? false,
    canRewardTickets: data.can_reward_tickets ?? false,
  };
}

export async function updateModPermissions(
  perms: ModPermissions
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { error } = await admin.from("mod_permissions").upsert({
      id: "default",
      can_view_tickets: perms.canViewTickets,
      can_close_tickets: perms.canCloseTickets,
      can_warn_users: perms.canWarnUsers,
      can_temp_ban_users: perms.canTempBanUsers,
      can_view_user_details: perms.canViewUserDetails,
      can_view_audit_log: perms.canViewAuditLog,
      can_add_credits: perms.canAddCredits,
      max_temp_ban_hours: perms.maxTempBanHours,
      warn_requires_reason: perms.warnRequiresReason,
      can_clear_chat: perms.canClearChat,
      can_delete_tickets: perms.canDeleteTickets,
      can_set_ticket_priority: perms.canSetTicketPriority,
      can_update_ticket_status: perms.canUpdateTicketStatus,
      can_reward_tickets: perms.canRewardTickets,
      updated_at: new Date().toISOString(),
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ---------------------------------------------------------------------------
// Read: mod actions log
// ---------------------------------------------------------------------------

export async function getModActions(limit = 50): Promise<ModActionRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mod_actions")
    .select("id, mod_id, target_user_id, action_type, reason, details, expires_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!data || data.length === 0) return [];

  const allIds = Array.from(
    new Set([
      ...data.map((r) => r.mod_id),
      ...data.map((r) => r.target_user_id).filter((id): id is string => !!id),
    ])
  );
  const { data: profiles } = await admin.from("profiles").select("id, username").in("id", allIds);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p.username as string | null]));

  return data.map((r) => ({
    id: r.id,
    modId: r.mod_id,
    modUsername: byId.get(r.mod_id) ?? null,
    targetUserId: r.target_user_id,
    targetUsername: r.target_user_id ? (byId.get(r.target_user_id) ?? null) : null,
    actionType: r.action_type as ModActionRow["actionType"],
    reason: r.reason,
    details: r.details as Record<string, unknown> | null,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }));
}

export async function getMyModActions(limit = 30): Promise<ModActionRow[]> {
  const { user } = await requireMod();
  const admin = createAdminClient();
  const { data } = await admin
    .from("mod_actions")
    .select("id, mod_id, target_user_id, action_type, reason, details, expires_at, created_at")
    .eq("mod_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!data || data.length === 0) return [];

  const targetIds = data.map((r) => r.target_user_id).filter((id): id is string => !!id);
  const { data: profiles } = targetIds.length
    ? await admin.from("profiles").select("id, username").in("id", targetIds)
    : { data: [] };
  const byId = new Map((profiles ?? []).map((p) => [p.id, p.username as string | null]));

  return data.map((r) => ({
    id: r.id,
    modId: r.mod_id,
    modUsername: null,
    targetUserId: r.target_user_id,
    targetUsername: r.target_user_id ? (byId.get(r.target_user_id) ?? null) : null,
    actionType: r.action_type as ModActionRow["actionType"],
    reason: r.reason,
    details: r.details as Record<string, unknown> | null,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Read: users list (mod view)
// ---------------------------------------------------------------------------

export async function getModUsers(): Promise<ModUserSummary[]> {
  await requireMod();
  const admin = createAdminClient();
  const { data: users } = await admin
    .from("profiles")
    .select("id, username, role, credits, streak_days, temp_banned_until, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (!users || users.length === 0) return [];

  const ids = users.map((u) => u.id);
  const { data: actionCounts } = await admin
    .from("mod_actions")
    .select("target_user_id, action_type")
    .in("target_user_id", ids)
    .in("action_type", ["warning", "note"]);

  const warnCounts = new Map<string, number>();
  const noteCounts = new Map<string, number>();
  for (const a of actionCounts ?? []) {
    if (a.action_type === "warning") warnCounts.set(a.target_user_id, (warnCounts.get(a.target_user_id) ?? 0) + 1);
    if (a.action_type === "note") noteCounts.set(a.target_user_id, (noteCounts.get(a.target_user_id) ?? 0) + 1);
  }

  return users.map((u) => ({
    id: u.id,
    username: u.username ?? "?",
    role: u.role ?? "user",
    credits: u.credits ?? 0,
    streakDays: u.streak_days ?? 0,
    tempBannedUntil: u.temp_banned_until,
    createdAt: u.created_at,
    warningCount: warnCounts.get(u.id) ?? 0,
    noteCount: noteCounts.get(u.id) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Read: tickets
// ---------------------------------------------------------------------------

export async function getModTickets(): Promise<ModTicket[]> {
  await requireMod();
  const admin = createAdminClient();
  const { data } = await admin
    .from("tickets")
    .select("id, user_id, subject, description, status, category, priority, created_at, closed_at, closed_by, attachment_url, reward_credits, reward_note, reward_granted_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (!data || data.length === 0) return [];

  const allIds = Array.from(
    new Set([
      ...data.map((t) => t.user_id),
      ...data.map((t) => t.closed_by).filter((id): id is string => !!id),
    ])
  );
  const { data: profiles } = await admin.from("profiles").select("id, username").in("id", allIds);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p.username as string | null]));

  return data.map((t) => ({
    id: t.id,
    userId: t.user_id,
    username: byId.get(t.user_id) ?? "?",
    subject: t.subject ?? "(kein Betreff)",
    message: t.description ?? "",
    status: t.status ?? "open",
    category: t.category ?? "other",
    priority: t.priority ?? "normal",
    createdAt: t.created_at,
    closedAt: t.closed_at,
    closedByUsername: t.closed_by ? (byId.get(t.closed_by) ?? null) : null,
    attachmentUrl: (t as Record<string, unknown>).attachment_url as string | null ?? null,
    rewardCredits: (t as Record<string, unknown>).reward_credits as number | null ?? null,
    rewardNote: (t as Record<string, unknown>).reward_note as string | null ?? null,
    rewardGrantedAt: (t as Record<string, unknown>).reward_granted_at as string | null ?? null,
  }));
}

export async function getTicketMessages(ticketId: string): Promise<TicketMessage[]> {
  await requireMod();
  const admin = createAdminClient();
  const { data } = await admin
    .from("ticket_messages")
    .select("id, ticket_id, user_id, message, is_staff, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  if (!data || data.length === 0) return [];

  const userIds = Array.from(new Set(data.map((m) => m.user_id)));
  const { data: profiles } = await admin.from("profiles").select("id, username").in("id", userIds);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p.username as string | null]));

  return data.map((m) => ({
    id: m.id,
    ticketId: m.ticket_id,
    userId: m.user_id,
    username: byId.get(m.user_id) ?? "?",
    message: m.message ?? "",
    isStaff: m.is_staff ?? false,
    createdAt: m.created_at,
  }));
}

export async function modMarkInProgress(
  ticketId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser);
    if (!perms.canCloseTickets) return { success: false, error: "Keine Berechtigung." };
    const admin = createAdminClient();
    const [ticketRes] = await Promise.all([
      admin.from("tickets").update({ status: "in_progress", updated_at: new Date().toISOString() }).eq("id", ticketId),
    ]);
    if (ticketRes.error) return { success: false, error: ticketRes.error.message };
    const { data: ticket } = await admin.from("tickets").select("user_id").eq("id", ticketId).single();
    await admin.from("mod_actions").insert({
      mod_id: user.id, target_user_id: ticket?.user_id ?? null,
      action_type: "note", reason: "Ticket als 'In Bearbeitung' markiert",
      details: { ticket_id: ticketId },
    });
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function modReplyToTicket(
  ticketId: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser);
    if (!perms.canCloseTickets) return { success: false, error: "Keine Berechtigung." };
    if (!message.trim()) return { success: false, error: "Nachricht darf nicht leer sein." };
    const admin = createAdminClient();
    const { error } = await admin.from("ticket_messages").insert({
      ticket_id: ticketId,
      user_id: user.id,
      message: message.trim(),
      is_staff: true,
    });
    if (error) return { success: false, error: error.message };
    await admin.from("tickets").update({ updated_at: new Date().toISOString() }).eq("id", ticketId);
    const { data: ticket } = await admin.from("tickets").select("user_id").eq("id", ticketId).single();
    if (ticket?.user_id) {
      await notifyUser({
        userId: ticket.user_id,
        type: "ticket_status",
        title: "Mod hat geantwortet",
        message: message.trim().slice(0, 100),
        link: "/support",
      });
    }
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

// ---------------------------------------------------------------------------
// Actions: warn, note, temp ban, close ticket, credits
// ---------------------------------------------------------------------------

export async function modWarnUser(
  targetUserId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser);
    if (!perms.canWarnUsers) return { success: false, error: "Keine Berechtigung zum Verwarnen." };
    if (perms.warnRequiresReason && !reason.trim()) return { success: false, error: "Begründung erforderlich." };
    const admin = createAdminClient();
    const { error } = await admin.from("mod_actions").insert({
      mod_id: user.id, target_user_id: targetUserId,
      action_type: "warning", reason: reason.trim() || null,
    });
    if (error) return { success: false, error: error.message };
    await notifyUser({
      userId: targetUserId,
      type: "admin_action",
      title: "Verwarnung erhalten",
      message: reason.trim() ? `Grund: ${reason.trim()}` : "Du hast eine Verwarnung erhalten.",
      link: "/account",
    });
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function modAddNote(
  targetUserId: string,
  note: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser);
    if (!perms.canWarnUsers) return { success: false, error: "Keine Berechtigung." };
    const admin = createAdminClient();
    const { error } = await admin.from("mod_actions").insert({
      mod_id: user.id, target_user_id: targetUserId,
      action_type: "note", reason: note.trim() || null,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function modTempBan(
  targetUserId: string,
  hours: number,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser);
    if (!perms.canTempBanUsers) return { success: false, error: "Keine Berechtigung für Temp-Bans." };
    const cappedHours = Math.min(hours, perms.maxTempBanHours);
    const expiresAt = new Date(Date.now() + cappedHours * 3_600_000).toISOString();
    const admin = createAdminClient();
    const [actionRes, banRes] = await Promise.all([
      admin.from("mod_actions").insert({
        mod_id: user.id, target_user_id: targetUserId,
        action_type: "temp_ban", reason: reason.trim() || null,
        expires_at: expiresAt, details: { hours: cappedHours },
      }),
      admin.from("profiles").update({ temp_banned_until: expiresAt }).eq("id", targetUserId),
    ]);
    if (actionRes.error) return { success: false, error: actionRes.error.message };
    if (banRes.error) return { success: false, error: banRes.error.message };
    await notifyUser({
      userId: targetUserId,
      type: "admin_ban",
      title: "Temporär gesperrt",
      message: reason.trim()
        ? `Du wurdest für ${cappedHours}h gesperrt. Grund: ${reason.trim()}`
        : `Du wurdest für ${cappedHours}h temporär gesperrt.`,
      link: "/account",
    });
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function modLiftBan(
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser);
    if (!perms.canTempBanUsers) return { success: false, error: "Keine Berechtigung." };
    const admin = createAdminClient();
    const [actionRes, liftRes] = await Promise.all([
      admin.from("mod_actions").insert({
        mod_id: user.id, target_user_id: targetUserId,
        action_type: "note", reason: "Ban manuell aufgehoben",
      }),
      admin.from("profiles").update({ temp_banned_until: null }).eq("id", targetUserId),
    ]);
    if (liftRes.error) return { success: false, error: liftRes.error.message };
    if (actionRes.error) return { success: false, error: actionRes.error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function modCloseTicket(
  ticketId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser);
    if (!perms.canCloseTickets) return { success: false, error: "Keine Berechtigung zum Schließen." };
    const admin = createAdminClient();
    const { data: ticket } = await admin.from("tickets").select("user_id").eq("id", ticketId).single();
    const [ticketRes, actionRes] = await Promise.all([
      admin.from("tickets").update({
        status: "closed", closed_at: new Date().toISOString(), closed_by: user.id,
      }).eq("id", ticketId),
      admin.from("mod_actions").insert({
        mod_id: user.id, target_user_id: ticket?.user_id ?? null,
        action_type: "ticket_close", reason: reason.trim() || null,
        details: { ticket_id: ticketId },
      }),
    ]);
    if (ticketRes.error) return { success: false, error: ticketRes.error.message };
    if (actionRes.error) return { success: false, error: actionRes.error.message };
    if (ticket?.user_id) {
      await notifyUser({
        userId: ticket.user_id,
        type: "ticket_status",
        title: "Ticket geschlossen",
        message: reason.trim() ? `Dein Ticket wurde geschlossen. Begründung: ${reason.trim()}` : "Dein Support-Ticket wurde geschlossen.",
        link: "/support",
      });
    }
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function getModWarningsForUser(userId: string): Promise<ModActionRow[]> {
  await requireMod();
  const admin = createAdminClient();
  const { data } = await admin
    .from("mod_actions")
    .select("id, mod_id, target_user_id, action_type, reason, details, expires_at, created_at")
    .eq("target_user_id", userId)
    .eq("action_type", "warning")
    .order("created_at", { ascending: false });
  if (!data || data.length === 0) return [];
  const modIds = Array.from(new Set(data.map((r) => r.mod_id)));
  const { data: profiles } = await admin.from("profiles").select("id, username").in("id", modIds);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p.username as string | null]));
  return data.map((r) => ({
    id: r.id, modId: r.mod_id, modUsername: byId.get(r.mod_id) ?? null,
    targetUserId: r.target_user_id, targetUsername: null,
    actionType: r.action_type as ModActionRow["actionType"],
    reason: r.reason, details: r.details as Record<string, unknown> | null,
    expiresAt: r.expires_at, createdAt: r.created_at,
  }));
}

export async function modRemoveWarning(
  warningId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser);
    if (!perms.canWarnUsers) return { success: false, error: "Keine Berechtigung." };
    const admin = createAdminClient();
    const { data: warning, error: fetchErr } = await admin
      .from("mod_actions")
      .select("id, target_user_id, action_type")
      .eq("id", warningId)
      .single();
    if (fetchErr || !warning) return { success: false, error: "Verwarnung nicht gefunden." };
    if (warning.action_type !== "warning") return { success: false, error: "Kein Verwarnung-Eintrag." };
    const [deleteRes] = await Promise.all([
      admin.from("mod_actions").delete().eq("id", warningId),
      admin.from("mod_actions").insert({
        mod_id: user.id, target_user_id: warning.target_user_id,
        action_type: "note", reason: `Verwarnung entfernt (ID: ${warningId.slice(0, 8)})`,
      }),
    ]);
    if (deleteRes.error) return { success: false, error: deleteRes.error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function getModUserHistory(userId: string): Promise<ModActionRow[]> {
  await requireMod();
  const admin = createAdminClient();
  const { data } = await admin
    .from("mod_actions")
    .select("id, mod_id, target_user_id, action_type, reason, details, expires_at, created_at")
    .eq("target_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!data || data.length === 0) return [];
  const modIds = Array.from(new Set(data.map((r) => r.mod_id)));
  const { data: profiles } = await admin.from("profiles").select("id, username").in("id", modIds);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p.username as string | null]));
  return data.map((r) => ({
    id: r.id, modId: r.mod_id, modUsername: byId.get(r.mod_id) ?? null,
    targetUserId: r.target_user_id, targetUsername: null,
    actionType: r.action_type as ModActionRow["actionType"],
    reason: r.reason, details: r.details as Record<string, unknown> | null,
    expiresAt: r.expires_at, createdAt: r.created_at,
  }));
}

export async function modAddCredits(
  targetUserId: string,
  amount: number,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser);
    if (!perms.canAddCredits) return { success: false, error: "Keine Berechtigung." };
    if (amount === 0) return { success: false, error: "Betrag darf nicht 0 sein." };
    const admin = createAdminClient();
    const { data: target } = await admin.from("profiles").select("credits").eq("id", targetUserId).single();
    if (!target) return { success: false, error: "Nutzer nicht gefunden." };
    const newCredits = Math.max(0, (target.credits ?? 0) + amount);
    const [updateRes, actionRes] = await Promise.all([
      admin.from("profiles").update({ credits: newCredits }).eq("id", targetUserId),
      admin.from("mod_actions").insert({
        mod_id: user.id, target_user_id: targetUserId,
        action_type: "credits_add", reason: reason.trim() || null,
        details: { amount, newTotal: newCredits },
      }),
    ]);
    if (updateRes.error) return { success: false, error: updateRes.error.message };
    if (actionRes.error) return { success: false, error: actionRes.error.message };
    await notifyUser({
      userId: targetUserId,
      type: "admin_credits",
      title: amount > 0 ? "Credits erhalten" : "Credits abgezogen",
      message: reason.trim()
        ? `${amount > 0 ? "+" : ""}${amount} CR ${reason.trim()}`
        : `${amount > 0 ? "+" : ""}${amount} Credits durch Mod-Aktion.`,
      link: "/account",
    });
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

// ---------------------------------------------------------------------------
// Ticket v2: delete, priority, status, reward — gated by extended permissions
// ---------------------------------------------------------------------------

export async function modDeleteTicket(
  ticketId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser);
    if (!perms.canDeleteTickets) return { success: false, error: "Keine Berechtigung zum Löschen." };
    const admin = createAdminClient();
    await admin.from("ticket_messages").delete().eq("ticket_id", ticketId);
    const { error } = await admin.from("tickets").delete().eq("id", ticketId);
    if (error) return { success: false, error: error.message };
    await admin.from("mod_actions").insert({
      mod_id: user.id, target_user_id: null,
      action_type: "note", reason: `Ticket gelöscht (ID: ${ticketId.slice(0, 8)})`,
      details: { ticket_id: ticketId },
    });
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function modSetTicketPriority(
  ticketId: string,
  priority: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser);
    if (!perms.canSetTicketPriority) return { success: false, error: "Keine Berechtigung." };
    const admin = createAdminClient();
    const { error } = await admin.from("tickets").update({ priority, updated_at: new Date().toISOString() }).eq("id", ticketId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function modUpdateTicketStatus(
  ticketId: string,
  status: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser);
    if (!perms.canUpdateTicketStatus) return { success: false, error: "Keine Berechtigung." };
    const admin = createAdminClient();
    const isClosing = status === "closed" || status === "resolved";
    const now = new Date().toISOString();
    const { error } = await admin.from("tickets").update({
      status, updated_at: now,
      ...(isClosing ? { closed_at: now, closed_by: user.id } : {}),
    }).eq("id", ticketId);
    if (error) return { success: false, error: error.message };
    const { data: ticket } = await admin.from("tickets").select("user_id, subject").eq("id", ticketId).single();
    if (ticket?.user_id) {
      const LABELS: Record<string, string> = { open: "Offen", in_progress: "In Bearbeitung", resolved: "Gelöst", closed: "Geschlossen" };
      await notifyUser({
        userId: ticket.user_id,
        type: "ticket_status",
        title: "Ticket-Status geändert",
        message: `Dein Ticket „${ticket.subject}" ist jetzt: ${LABELS[status] ?? status}`,
        link: `/?openTicket=${ticketId}`,
      });
    }
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function modGrantTicketReward(
  ticketId: string,
  opts: { credits?: number; note?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser);
    if (!perms.canRewardTickets) return { success: false, error: "Keine Berechtigung für Ticketbelohnungen." };
    const admin = createAdminClient();
    const { data: ticket } = await admin.from("tickets").select("user_id, subject").eq("id", ticketId).single();
    if (!ticket) return { success: false, error: "Ticket nicht gefunden." };

    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      reward_granted_at: now, reward_granted_by: user.id, updated_at: now,
    };
    if (opts.note) updatePayload.reward_note = opts.note;
    if (opts.credits && opts.credits > 0) {
      updatePayload.reward_credits = opts.credits;
      const { data: targetProfile } = await admin.from("profiles").select("credits").eq("id", ticket.user_id).single();
      const newCredits = (targetProfile?.credits ?? 0) + opts.credits;
      await admin.from("profiles").update({ credits: newCredits }).eq("id", ticket.user_id);
    }
    const { error } = await admin.from("tickets").update(updatePayload).eq("id", ticketId);
    if (error) return { success: false, error: error.message };
    await admin.from("mod_actions").insert({
      mod_id: user.id, target_user_id: ticket.user_id,
      action_type: "credits_add", reason: `Ticketbelohnung: ${opts.note ?? ticket.subject}`,
      details: { ticket_id: ticketId, credits: opts.credits ?? 0 },
    });
    await notifyUser({
      userId: ticket.user_id,
      type: "admin_credits",
      title: "🏆 Belohnung erhalten!",
      message: opts.credits
        ? `Dein hilfreicher Report wurde mit +${opts.credits} Credits belohnt!${opts.note ? ` — ${opts.note}` : ""}`
        : `Dein hilfreicher Report wurde belohnt!${opts.note ? ` — ${opts.note}` : ""}`,
      link: `/?openTicket=${ticketId}`,
    });
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}
