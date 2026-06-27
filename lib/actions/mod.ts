"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isModerator, isAdmin } from "@/lib/admin";
import { notifyUser, notifyStaff } from "@/lib/notifications-internal";
import { logDebugEvent, logActivity } from "@/lib/debug-log-server";
import {
  DEFAULT_MOD_PERMISSIONS,
  ADMIN_MOD_PERMISSIONS,
  type ModPermissions,
  type ModActionRow,
  type ModUserSummary,
  type ModTicket,
  type TicketMessage,
  type ModeratorWithPermissions,
  type EscalationTarget,
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

// Returns full admin permissions for admins, per-user override merged with
// global defaults for mods. userId is the moderator's own profile ID.
async function effectivePerms(isAdminUser: boolean, userId: string): Promise<ModPermissions> {
  if (isAdminUser) return ADMIN_MOD_PERMISSIONS;
  const globalPerms = await getModPermissions();
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("mod_permissions_override")
    .eq("id", userId)
    .single();
  if (!data?.mod_permissions_override) return globalPerms;
  return { ...globalPerms, ...(data.mod_permissions_override as Partial<ModPermissions>) };
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
    maxRewardPerTicket: data.max_reward_per_ticket ?? 0,
    canPauseTickets: data.can_pause_tickets ?? false,
    canUseAdminAi: data.can_use_admin_ai ?? false,
  };
}

/** Broadcasts a permission-changed event to all connected mod-panel clients. */
async function broadcastPermissionChange() {
  try {
    const admin = createAdminClient();
    const ch = admin.channel("mod-permissions-live");
    await ch.send({ type: "broadcast", event: "permissions_changed", payload: { ts: Date.now() } });
    await admin.removeChannel(ch);
  } catch {
    // non-critical — clients will refresh on next manual reload
  }
}

/** Returns the effective permissions for the currently logged-in mod/admin. */
export async function getMyEffectivePermissions(): Promise<ModPermissions> {
  const { user, isAdminUser } = await requireMod();
  return effectivePerms(isAdminUser, user.id);
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
      max_reward_per_ticket: perms.maxRewardPerTicket,
      can_pause_tickets: perms.canPauseTickets,
      can_use_admin_ai: perms.canUseAdminAi,
      updated_at: new Date().toISOString(),
    });
    if (error) return { success: false, error: error.message };
    await broadcastPermissionChange();
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
    .select("id, username, role, credits, streak_days, temp_banned_until, created_at, active_name_style_key")
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
    nameStyleKey: (u as Record<string, unknown>).active_name_style_key as string | undefined,
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
    .select("id, user_id, subject, description, status, category, priority, created_at, updated_at, closed_at, closed_by, attachment_url, reward_credits, reward_note, reward_granted_at, reward_pending, escalated_to_admin, escalated_to_user_id, suggestion_outcome")
    .order("created_at", { ascending: false })
    .limit(100);

  if (!data || data.length === 0) return [];

  const allIds = Array.from(
    new Set([
      ...data.map((t) => t.user_id),
      ...data.map((t) => t.closed_by).filter((id): id is string => !!id),
      ...data.map((t) => (t as Record<string, unknown>).escalated_to_user_id as string | null).filter((id): id is string => !!id),
    ])
  );
  const { data: profiles } = await admin.from("profiles").select("id, username, active_name_style_key").in("id", allIds);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p as { username: string | null; active_name_style_key: string | null }]));

  return data.map((t) => {
    const escalatedToUserId = (t as Record<string, unknown>).escalated_to_user_id as string | null ?? null;
    return {
      id: t.id,
      userId: t.user_id,
      username: byId.get(t.user_id)?.username ?? "?",
      nameStyleKey: byId.get(t.user_id)?.active_name_style_key ?? undefined,
      subject: t.subject ?? "(kein Betreff)",
      message: t.description ?? "",
      status: t.status ?? "open",
      category: t.category ?? "other",
      priority: t.priority ?? "normal",
      createdAt: t.created_at,
      updatedAt: (t as Record<string, unknown>).updated_at as string ?? t.created_at,
      closedAt: t.closed_at,
      closedByUsername: t.closed_by ? (byId.get(t.closed_by)?.username ?? null) : null,
      attachmentUrl: (t as Record<string, unknown>).attachment_url as string | null ?? null,
      rewardCredits: (t as Record<string, unknown>).reward_credits as number | null ?? null,
      rewardNote: (t as Record<string, unknown>).reward_note as string | null ?? null,
      rewardGrantedAt: (t as Record<string, unknown>).reward_granted_at as string | null ?? null,
      rewardPending: ((t as Record<string, unknown>).reward_pending as boolean) ?? false,
      escalatedToAdmin: ((t as Record<string, unknown>).escalated_to_admin as boolean) ?? false,
      escalatedToUserId,
      escalatedToUsername: escalatedToUserId ? (byId.get(escalatedToUserId)?.username ?? null) : null,
      suggestionOutcome: ((t as Record<string, unknown>).suggestion_outcome as "accepted" | "declined" | null) ?? null,
    };
  });
}

/** Lists all moderators and admins for the escalation picker. Requires mod auth (not admin-only). */
export async function getEscalationTargets(): Promise<EscalationTarget[]> {
  await requireMod();
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, username, role")
    .in("role", ["moderator", "admin"])
    .order("username", { ascending: true });
  if (!data || data.length === 0) return [];
  return data.map((p) => ({
    id: p.id,
    username: (p.username as string) ?? "?",
    role: (p.role as "moderator" | "admin"),
  }));
}

export async function getTicketMessages(ticketId: string): Promise<TicketMessage[]> {
  await requireMod();
  const admin = createAdminClient();
  const { data } = await admin
    .from("ticket_messages")
    .select("id, ticket_id, user_id, message, is_staff, created_at, attachment_url")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  if (!data || data.length === 0) return [];

  const userIds = Array.from(new Set(data.map((m) => m.user_id)));
  const { data: profiles } = await admin.from("profiles").select("id, username, active_name_style_key, avatar_url").in("id", userIds);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p as { username: string | null; active_name_style_key: string | null; avatar_url: string | null }]));

  return data.map((m) => ({
    id: m.id,
    ticketId: m.ticket_id,
    userId: m.user_id,
    username: byId.get(m.user_id)?.username ?? "?",
    nameStyleKey: byId.get(m.user_id)?.active_name_style_key ?? undefined,
    avatarUrl: byId.get(m.user_id)?.avatar_url ?? null,
    message: m.message ?? "",
    isStaff: m.is_staff ?? false,
    createdAt: m.created_at,
    attachmentUrl: (m as Record<string, unknown>).attachment_url as string | null ?? null,
  }));
}

export async function modMarkInProgress(
  ticketId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser, user.id);
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
  message: string,
  attachmentUrl?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser, user.id);
    if (!perms.canCloseTickets) return { success: false, error: "Keine Berechtigung." };
    if (!message.trim()) return { success: false, error: "Nachricht darf nicht leer sein." };
    const admin = createAdminClient();
    const msgPayload: Record<string, unknown> = { ticket_id: ticketId, user_id: user.id, message: message.trim(), is_staff: true };
    if (attachmentUrl) msgPayload.attachment_url = attachmentUrl;
    const { error } = await admin.from("ticket_messages").insert(msgPayload);
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
    const perms = await effectivePerms(isAdminUser, user.id);
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
    void logActivity("mod:warn", `Benutzer verwarnt: ${targetUserId}`, { modId: user.id, targetUserId, reason: reason.trim() || null });
    return { success: true };
  } catch (e) {
    void logDebugEvent({ level: "error", scope: "mod", message: "modWarnUser fehlgeschlagen", detail: String(e), context: { targetUserId } });
    return { success: false, error: String(e) };
  }
}

export async function modAddNote(
  targetUserId: string,
  note: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser, user.id);
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
    const perms = await effectivePerms(isAdminUser, user.id);
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
    void logActivity("mod:tempban", `Temp-Ban gesetzt: ${targetUserId} für ${cappedHours}h`, { modId: user.id, targetUserId, hours: cappedHours, reason: reason.trim() || null });
    return { success: true };
  } catch (e) {
    void logDebugEvent({ level: "error", scope: "mod", message: "modTempBan fehlgeschlagen", detail: String(e), context: { targetUserId, hours } });
    return { success: false, error: String(e) };
  }
}

export async function modLiftBan(
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser, user.id);
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
    void logActivity("mod:liftban", `Ban aufgehoben: ${targetUserId}`, { modId: user.id, targetUserId });
    return { success: true };
  } catch (e) {
    void logDebugEvent({ level: "error", scope: "mod", message: "modLiftBan fehlgeschlagen", detail: String(e), context: { targetUserId } });
    return { success: false, error: String(e) };
  }
}

export async function modCloseTicket(
  ticketId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser, user.id);
    if (!perms.canCloseTickets) return { success: false, error: "Keine Berechtigung zum Schließen." };
    const admin = createAdminClient();
    const { data: ticket } = await admin
      .from("tickets")
      .select("user_id, reward_pending, reward_credits")
      .eq("id", ticketId)
      .single();

    const now = new Date().toISOString();
    const hasPendingReward = !!(ticket as Record<string, unknown>)?.reward_pending;
    const rewardCredits = (ticket as Record<string, unknown>)?.reward_credits as number | null;

    const closeUpdate: Record<string, unknown> = {
      status: "closed", closed_at: now, closed_by: user.id,
    };
    if (hasPendingReward) {
      closeUpdate.reward_pending = false;
      closeUpdate.reward_granted_at = now;
    }

    const [ticketRes, actionRes] = await Promise.all([
      admin.from("tickets").update(closeUpdate).eq("id", ticketId),
      admin.from("mod_actions").insert({
        mod_id: user.id, target_user_id: ticket?.user_id ?? null,
        action_type: "ticket_close", reason: reason.trim() || null,
        details: { ticket_id: ticketId },
      }),
    ]);
    if (ticketRes.error) return { success: false, error: ticketRes.error.message };
    if (actionRes.error) return { success: false, error: actionRes.error.message };

    // Pay out pending reward
    if (hasPendingReward && rewardCredits && rewardCredits > 0 && ticket?.user_id) {
      const { data: targetProfile } = await admin.from("profiles").select("credits").eq("id", ticket.user_id).single();
      const newCredits = ((targetProfile?.credits as number) ?? 0) + rewardCredits;
      await admin.from("profiles").update({ credits: newCredits }).eq("id", ticket.user_id);
      // Mark the underlying ticket_rewards rows as paid so the canonical tickets.ts
      // payout path can't pay the SAME reward again on a later close/status-change.
      await admin.from("ticket_rewards")
        .update({ paid_at: now })
        .eq("ticket_id", ticketId)
        .eq("deferred", true)
        .is("paid_at", null);
    }

    if (ticket?.user_id) {
      let notifyMsg = reason.trim()
        ? `Dein Ticket wurde geschlossen. Begründung: ${reason.trim()}`
        : "Dein Support-Ticket wurde geschlossen.";
      if (hasPendingReward && rewardCredits && rewardCredits > 0) {
        notifyMsg += ` · +${rewardCredits} Credits wurden gutgeschrieben!`;
      }
      await notifyUser({
        userId: ticket.user_id,
        type: "ticket_status",
        title: "Ticket geschlossen",
        message: notifyMsg,
        link: "/support",
      });
    }
    return { success: true };
  } catch (e) {
    void logDebugEvent({ level: "error", scope: "mod", message: "modCloseTicket fehlgeschlagen", detail: String(e), context: { ticketId } });
    return { success: false, error: String(e) };
  }
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
    const perms = await effectivePerms(isAdminUser, user.id);
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
    const perms = await effectivePerms(isAdminUser, user.id);
    if (!perms.canAddCredits) return { success: false, error: "Keine Berechtigung." };
    if (amount === 0) return { success: false, error: "Betrag darf nicht 0 sein." };
    // Non-admin moderators may not grant credits to themselves, and are capped per action.
    if (!isAdminUser && targetUserId === user.id) {
      return { success: false, error: "Du kannst dir nicht selbst Credits gutschreiben." };
    }
    if (!isAdminUser) {
      const cap = perms.maxRewardPerTicket && perms.maxRewardPerTicket > 0 ? perms.maxRewardPerTicket : 100000;
      if (Math.abs(amount) > cap) {
        return { success: false, error: `Betrag überschreitet dein Limit (max. ${cap} CR pro Aktion).` };
      }
    }
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
    void logActivity("mod:credits", `Credits ${amount > 0 ? "gutgeschrieben" : "abgezogen"}: ${amount > 0 ? "+" : ""}${amount} CR → ${targetUserId}`, { modId: user.id, targetUserId, amount, newTotal: newCredits, reason: reason.trim() || null });
    return { success: true };
  } catch (e) {
    void logDebugEvent({ level: "error", scope: "mod", message: "modAddCredits fehlgeschlagen", detail: String(e), context: { targetUserId, amount } });
    return { success: false, error: String(e) };
  }
}

// ---------------------------------------------------------------------------
// Ticket v2: delete, priority, status, reward — gated by extended permissions
// ---------------------------------------------------------------------------

export async function modDeleteTicket(
  ticketId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser, user.id);
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
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser, user.id);
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
    const perms = await effectivePerms(isAdminUser, user.id);
    if (!perms.canUpdateTicketStatus) return { success: false, error: "Keine Berechtigung." };
    const admin = createAdminClient();
    const isClosing = status === "closed" || status === "resolved";
    const now = new Date().toISOString();

    const { data: ticket } = await admin
      .from("tickets")
      .select("user_id, subject, reward_pending, reward_credits")
      .eq("id", ticketId)
      .single();

    const hasPendingReward = isClosing && !!(ticket as Record<string, unknown>)?.reward_pending;
    const rewardCredits = (ticket as Record<string, unknown>)?.reward_credits as number | null;

    const updatePayload: Record<string, unknown> = {
      status, updated_at: now,
      ...(isClosing ? { closed_at: now, closed_by: user.id } : {}),
    };
    if (hasPendingReward) {
      updatePayload.reward_pending = false;
      updatePayload.reward_granted_at = now;
    }

    const { error } = await admin.from("tickets").update(updatePayload).eq("id", ticketId);
    if (error) return { success: false, error: error.message };

    // Pay out pending reward
    if (hasPendingReward && rewardCredits && rewardCredits > 0 && ticket?.user_id) {
      const { data: targetProfile } = await admin.from("profiles").select("credits").eq("id", ticket.user_id).single();
      const newCredits = ((targetProfile?.credits as number) ?? 0) + rewardCredits;
      await admin.from("profiles").update({ credits: newCredits }).eq("id", ticket.user_id);
      // Mark the underlying ticket_rewards rows as paid so the canonical tickets.ts
      // payout path can't pay the SAME reward again on a later close/status-change.
      await admin.from("ticket_rewards")
        .update({ paid_at: now })
        .eq("ticket_id", ticketId)
        .eq("deferred", true)
        .is("paid_at", null);
    }

    if (ticket?.user_id) {
      const LABELS: Record<string, string> = { open: "Offen", in_progress: "In Bearbeitung", paused: "Pausiert", resolved: "Gelöst/Geschlossen", closed: "Gelöst/Geschlossen" };
      let notifyMsg = `Dein Ticket „${ticket.subject}" ist jetzt: ${LABELS[status] ?? status}`;
      if (hasPendingReward && rewardCredits && rewardCredits > 0) {
        notifyMsg += ` · +${rewardCredits} Credits wurden gutgeschrieben!`;
      }
      await notifyUser({
        userId: ticket.user_id,
        type: "ticket_status",
        title: "Ticket-Status geändert",
        message: notifyMsg,
        link: `/?openTicket=${ticketId}`,
      });
    }
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function modPauseTicket(
  ticketId: string,
  pause: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser, user.id);
    if (!perms.canPauseTickets) return { success: false, error: "Keine Berechtigung zum Pausieren von Tickets." };
    const admin = createAdminClient();
    const newStatus = pause ? "paused" : "in_progress";
    const { error } = await admin
      .from("tickets")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", ticketId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function modGrantTicketReward(
  ticketId: string,
  opts: { credits?: number; note?: string; deferred?: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser, user.id);
    if (!perms.canRewardTickets) return { success: false, error: "Keine Berechtigung für Ticketbelohnungen." };

    const admin = createAdminClient();
    const credits = opts.credits ?? 0;

    // Cumulative limit check: sum all unpaid rewards for this ticket
    if (perms.maxRewardPerTicket > 0 && credits > 0) {
      const { data: existing } = await admin
        .from("ticket_rewards")
        .select("credits")
        .eq("ticket_id", ticketId)
        .is("paid_at", null);
      const existingTotal = (existing ?? []).reduce((s, r) => s + ((r as Record<string, unknown>).credits as number), 0);
      if (existingTotal + credits > perms.maxRewardPerTicket) {
        const remaining = Math.max(0, perms.maxRewardPerTicket - existingTotal);
        return {
          success: false,
          error: remaining === 0
            ? `Limit erreicht: bereits ${existingTotal} Credits vergeben (max ${perms.maxRewardPerTicket}).`
            : `Limit überschritten: nur noch ${remaining} Credits verfügbar (${existingTotal} + ${credits} = ${existingTotal + credits} > max ${perms.maxRewardPerTicket}).`,
        };
      }
    }

    const { data: ticket } = await admin.from("tickets").select("user_id, subject, status").eq("id", ticketId).single();
    if (!ticket) return { success: false, error: "Ticket nicht gefunden." };

    const now = new Date().toISOString();
    const ticketStatus = (ticket as Record<string, unknown>).status as string;
    const isAlreadyClosed = ticketStatus === "closed" || ticketStatus === "resolved";
    // Deferred defaults to true; but closed tickets always pay immediately
    const deferred = opts.deferred !== false && !isAlreadyClosed;

    const { error: insertErr } = await admin.from("ticket_rewards").insert({
      ticket_id: ticketId,
      granted_by: user.id,
      credits,
      note: opts.note ?? null,
      deferred,
      granted_at: now,
      paid_at: deferred ? null : now,
    });
    if (insertErr) return { success: false, error: insertErr.message };

    if (!deferred && credits > 0) {
      const { data: targetProfile } = await admin.from("profiles").select("credits").eq("id", ticket.user_id).single();
      const newCredits = ((targetProfile?.credits as number) ?? 0) + credits;
      await admin.from("profiles").update({ credits: newCredits }).eq("id", ticket.user_id);
    }

    // Sync summary columns
    await syncTicketRewardSummary(admin, ticketId, user.id, now);

    await notifyUser({
      userId: ticket.user_id,
      type: "admin_credits",
      title: deferred ? "🏆 Belohnung angepinnt!" : "🏆 Belohnung erhalten!",
      message: credits > 0
        ? deferred
          ? `Dein Ticket enthält +${credits} Credits Belohnung — wird ausgezahlt wenn das Ticket gelöst wird.`
          : `Du hast +${credits} Credits für dein Ticket „${ticket.subject}" erhalten!`
        : "Belohnung vergeben.",
      link: `/?openTicket=${ticketId}`,
    });
    return { success: true };
  } catch (e) {
    void logDebugEvent({ level: "error", scope: "mod", message: "modGrantTicketReward fehlgeschlagen", detail: String(e), context: { ticketId, credits: opts.credits } });
    return { success: false, error: String(e) };
  }
}

export async function modRemoveTicketReward(
  rewardId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser, user.id);
    if (!perms.canRewardTickets) return { success: false, error: "Keine Berechtigung." };

    const admin = createAdminClient();
    const { data: reward } = await admin
      .from("ticket_rewards")
      .select("id, ticket_id, paid_at")
      .eq("id", rewardId)
      .single();
    if (!reward) return { success: false, error: "Belohnung nicht gefunden." };
    if ((reward as Record<string, unknown>).paid_at) return { success: false, error: "Bereits ausgezahlte Belohnungen können nicht entfernt werden." };

    const { error } = await admin.from("ticket_rewards").delete().eq("id", rewardId);
    if (error) return { success: false, error: error.message };

    const now = new Date().toISOString();
    await syncTicketRewardSummary(admin, (reward as Record<string, unknown>).ticket_id as string, user.id, now);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Decide a SUGGESTION ticket: accept (→ resolved, with an optional immediate
 * auto-reward wired straight into the reward system) or decline (→ closed).
 * This is the formal "Vorschlag angenommen/abgelehnt" flow — distinct from a
 * generic status change, and tracked via tickets.suggestion_outcome.
 */
export async function modDecideSuggestion(
  ticketId: string,
  decision: "accepted" | "declined",
  opts: { rewardCredits?: number; note?: string } = {}
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, isAdminUser } = await requireMod();
    const perms = await effectivePerms(isAdminUser, user.id);
    if (!perms.canCloseTickets && !perms.canUpdateTicketStatus) {
      return { success: false, error: "Keine Berechtigung, Vorschläge zu entscheiden." };
    }

    const admin = createAdminClient();
    const { data: ticket } = await admin
      .from("tickets")
      .select("user_id, subject, category, status")
      .eq("id", ticketId)
      .single();
    if (!ticket) return { success: false, error: "Ticket nicht gefunden." };
    if ((ticket as Record<string, unknown>).category !== "suggestion") {
      return { success: false, error: "Nur Vorschläge können angenommen oder abgelehnt werden." };
    }

    const now = new Date().toISOString();
    const credits = Math.max(0, Math.floor(opts.rewardCredits ?? 0));

    if (decision === "accepted") {
      // Auto-reward (immediate) — respects the reward permission + per-ticket limit.
      if (credits > 0) {
        if (!perms.canRewardTickets) {
          return { success: false, error: "Keine Berechtigung für Belohnungen — nimm ohne Belohnung an oder bitte einen Admin." };
        }
        if (perms.maxRewardPerTicket > 0) {
          const { data: existing } = await admin
            .from("ticket_rewards").select("credits").eq("ticket_id", ticketId).is("paid_at", null);
          const existingTotal = (existing ?? []).reduce((s, r) => s + ((r as Record<string, unknown>).credits as number), 0);
          if (existingTotal + credits > perms.maxRewardPerTicket) {
            const remaining = Math.max(0, perms.maxRewardPerTicket - existingTotal);
            return { success: false, error: `Belohnungslimit: nur noch ${remaining} Credits verfügbar (max ${perms.maxRewardPerTicket}).` };
          }
        }
        const { error: rErr } = await admin.from("ticket_rewards").insert({
          ticket_id: ticketId, granted_by: user.id, credits,
          note: opts.note?.trim() || "Vorschlag angenommen", deferred: false, granted_at: now, paid_at: now,
        });
        if (rErr) return { success: false, error: rErr.message };
        const { data: tp } = await admin.from("profiles").select("credits").eq("id", ticket.user_id).single();
        await admin.from("profiles").update({ credits: ((tp?.credits as number) ?? 0) + credits }).eq("id", ticket.user_id);
        await syncTicketRewardSummary(admin, ticketId, user.id, now);
        try {
          await admin.from("audit_logs").insert({
            user_id: user.id, action: "ticket_reward_paid",
            payload: { ticketId, recipientUserId: ticket.user_id, creditsAwarded: credits, reason: "suggestion_accepted" },
          });
        } catch { /* non-fatal */ }
      }

      await admin.from("tickets").update({
        status: "resolved", suggestion_outcome: "accepted",
        updated_at: now, closed_at: now, closed_by: user.id,
      }).eq("id", ticketId);

      await notifyUser({
        userId: ticket.user_id,
        type: "ticket_status",
        title: "✅ Vorschlag angenommen!",
        message: credits > 0
          ? `Dein Vorschlag „${ticket.subject}" wurde angenommen — +${credits} Credits als Dankeschön!`
          : `Dein Vorschlag „${ticket.subject}" wurde angenommen. Danke!`,
        link: `/?openTicket=${ticketId}`,
      });
    } else {
      await admin.from("tickets").update({
        status: "closed", suggestion_outcome: "declined",
        updated_at: now, closed_at: now, closed_by: user.id,
      }).eq("id", ticketId);

      await notifyUser({
        userId: ticket.user_id,
        type: "ticket_status",
        title: "Vorschlag abgelehnt",
        message: opts.note?.trim()
          ? `Dein Vorschlag „${ticket.subject}" wurde abgelehnt: ${opts.note.trim()}`
          : `Dein Vorschlag „${ticket.subject}" wurde leider abgelehnt.`,
        link: `/?openTicket=${ticketId}`,
      });
    }

    try {
      await admin.from("audit_logs").insert({
        user_id: user.id, action: "suggestion_decided",
        payload: { ticketId, decision, credits, recipientUserId: ticket.user_id, subject: (ticket as Record<string, unknown>).subject },
      });
    } catch { /* non-fatal */ }

    return { success: true };
  } catch (e) {
    void logDebugEvent({ level: "error", scope: "mod", message: "modDecideSuggestion fehlgeschlagen", detail: String(e), context: { ticketId, decision } });
    return { success: false, error: String(e) };
  }
}

async function syncTicketRewardSummary(
  admin: ReturnType<typeof createAdminClient>,
  ticketId: string,
  grantedBy: string,
  now: string,
): Promise<void> {
  const { data: rewards } = await admin
    .from("ticket_rewards")
    .select("credits, deferred, paid_at")
    .eq("ticket_id", ticketId);
  const pending = (rewards ?? []).filter((r) => (r as Record<string, unknown>).deferred && !(r as Record<string, unknown>).paid_at);
  const pendingTotal = pending.reduce((s, r) => s + ((r as Record<string, unknown>).credits as number), 0);
  await admin.from("tickets").update({
    reward_credits: pendingTotal > 0 ? pendingTotal : null,
    reward_pending: pendingTotal > 0,
    reward_granted_by: grantedBy,
    updated_at: now,
  }).eq("id", ticketId);
}

export async function modEscalateTicket(
  ticketId: string,
  targetUserId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await requireMod();
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("username").eq("id", user.id).single();
    const modUsername = (profile as Record<string, unknown>)?.username as string ?? "Mod";

    const { data: ticket } = await admin.from("tickets").select("user_id, subject, escalated_to_admin").eq("id", ticketId).single();
    if (!ticket) return { success: false, error: "Ticket nicht gefunden." };
    if ((ticket as Record<string, unknown>).escalated_to_admin) return { success: false, error: "Bereits weitergeleitet." };

    const updatePayload: Record<string, unknown> = {
      escalated_to_admin: true,
      updated_at: new Date().toISOString(),
    };
    if (targetUserId) updatePayload.escalated_to_user_id = targetUserId;

    const { error } = await admin.from("tickets").update(updatePayload).eq("id", ticketId);
    if (error) return { success: false, error: error.message };

    // Resolve target username for notification message
    let targetUsername: string | null = null;
    if (targetUserId) {
      const { data: tgt } = await admin.from("profiles").select("username").eq("id", targetUserId).single();
      targetUsername = (tgt as Record<string, unknown>)?.username as string ?? null;
    }

    const subject = (ticket as Record<string, unknown>).subject as string;
    const link = `/mod?tab=tickets&open=${ticketId}`;

    // Personal notification to target user (if specified)
    if (targetUserId) {
      await notifyUser({
        userId: targetUserId,
        type: "ticket_new",
        title: "⬆ Ticket an dich weitergeleitet",
        message: `${modUsername} hat Ticket „${subject}" an dich weitergeleitet.`,
        link,
      });
    }

    // General staff notification
    const targetNote = targetUsername ? ` an ${targetUsername}` : " an Staff";
    await notifyStaff({
      type: "ticket_new",
      title: "⬆ Ticket weitergeleitet",
      message: `${modUsername} hat Ticket „${subject}"${targetNote} weitergeleitet.`,
      link,
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ---------------------------------------------------------------------------
// Per-moderator permission overrides (admin only for writes)
// ---------------------------------------------------------------------------

/** Lists all moderator/admin accounts with their individual permission overrides. */
export async function getModeratorUsers(): Promise<ModeratorWithPermissions[]> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: mods } = await admin
    .from("profiles")
    .select("id, username, role, mod_permissions_override")
    .in("role", ["moderator", "admin"])
    .order("username", { ascending: true });
  if (!mods || mods.length === 0) return [];

  const globalPerms = await getModPermissions();
  return mods.map((m) => {
    const override = (m.mod_permissions_override as Partial<ModPermissions> | null) ?? null;
    const isAdminRole = m.role === "admin";
    const effective: ModPermissions = isAdminRole
      ? ADMIN_MOD_PERMISSIONS
      : override
      ? { ...globalPerms, ...override }
      : globalPerms;
    return {
      id: m.id,
      username: m.username ?? "?",
      role: m.role ?? "moderator",
      override,
      effective,
    };
  });
}

export interface PopupModSummary {
  recentActions: { id: string; actionType: string; reason: string | null; createdAt: string }[];
  openTicketCount: number;
}

/** Lightweight mod summary for the profile popup — recent actions + open ticket count. */
export async function getPopupModSummary(userId: string): Promise<PopupModSummary> {
  await requireMod();
  const admin = createAdminClient();
  const [actionsRes, ticketsRes] = await Promise.all([
    admin
      .from("mod_actions")
      .select("id, action_type, reason, created_at")
      .eq("target_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "open"),
  ]);
  return {
    recentActions: (actionsRes.data ?? []).map((r) => ({
      id: r.id as string,
      actionType: r.action_type as string,
      reason: (r.reason as string | null) ?? null,
      createdAt: r.created_at as string,
    })),
    openTicketCount: ticketsRes.count ?? 0,
  };
}

/** Returns the individual permission override stored for a single moderator. */
export async function getModUserPermissions(
  modUserId: string
): Promise<{ success: boolean; override: Partial<ModPermissions> | null; error?: string }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("mod_permissions_override")
      .eq("id", modUserId)
      .single();
    return { success: true, override: (data?.mod_permissions_override as Partial<ModPermissions> | null) ?? null };
  } catch (e) {
    return { success: false, override: null, error: String(e) };
  }
}

/** Saves (or clears) the individual permission override for a single moderator.
 * Pass null to remove all overrides and fall back to global defaults. */
export async function setModUserPermissions(
  modUserId: string,
  override: Partial<ModPermissions> | null
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { error } = await admin
      .from("profiles")
      .update({ mod_permissions_override: override })
      .eq("id", modUserId);
    if (error) return { success: false, error: error.message };
    await broadcastPermissionChange();
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Called automatically when a user is assigned the "moderator" role.
 * Writes the current global mod_permissions defaults as their individual
 * override — so the admin immediately sees all checkboxes populated and
 * can remove specific permissions with precision (individuelle > Gruppe).
 */
export async function syncPermissionsOnModRoleAssign(
  userId: string
): Promise<void> {
  try {
    const globalPerms = await getModPermissions();
    const admin = createAdminClient();
    // Store full copy of group defaults as individual override.
    // This makes every permission visible and individually editable in the UI.
    // The golden rule still applies: individual overrides always win.
    await admin
      .from("profiles")
      .update({ mod_permissions_override: globalPerms })
      .eq("id", userId);
    await broadcastPermissionChange();
  } catch {
    // non-critical — user still gets group defaults via effectivePerms fallback
  }
}

/**
 * Called when a user's role is changed away from "moderator".
 * Clears their individual override so no stale mod permissions linger.
 */
export async function clearModPermissionsOverride(
  userId: string
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin
      .from("profiles")
      .update({ mod_permissions_override: null })
      .eq("id", userId);
    await broadcastPermissionChange();
  } catch {
    // non-critical
  }
}
