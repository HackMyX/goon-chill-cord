"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isModerator } from "@/lib/admin";
import { notifyUser, notifyStaff } from "@/lib/notifications-internal";
import { logDebugEvent } from "@/lib/debug-log-server";

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketCategory = "bug" | "suggestion";
export type TicketPriority = "low" | "normal" | "high" | "urgent";

export interface Ticket {
  id: string;
  userId: string;
  username: string;
  subject: string;
  description: string;
  status: TicketStatus;
  category: TicketCategory;
  priority: TicketPriority;
  closedAt: string | null;
  closedByUsername: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  escalatedToAdmin?: boolean;
  attachmentUrl?: string | null;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  userId: string;
  username: string;
  nameStyleKey?: string;
  avatarUrl?: string | null;
  message: string;
  isStaff: boolean;
  createdAt: string;
  attachmentUrl?: string | null;
}

export interface InternalNote {
  id: string;
  ticketId: string;
  userId: string;
  username: string;
  note: string;
  createdAt: string;
}

export interface TicketReward {
  id: string;
  ticketId: string;
  credits: number;
  note?: string | null;
  deferred: boolean;
  grantedBy: string;
  grantedByUsername: string;
  grantedByAvatarUrl?: string | null;
  grantedAt: string;
  paidAt?: string | null;
}

export interface TicketDetail extends Ticket {
  messages: TicketMessage[];
  internalNotes: InternalNote[];
  attachmentUrl?: string | null;
  rewardCredits?: number | null;
  rewardNote?: string | null;
  rewardGrantedAt?: string | null;
  rewardPending?: boolean;
  rewards: TicketReward[];
}

// ─── User actions ─────────────────────────────────────────────────────────────

export async function createTicket(input: {
  subject: string;
  description: string;
  category?: TicketCategory;
  attachmentUrl?: string;
}): Promise<{ success: boolean; error?: string; ticketId?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const subject = input.subject.trim().slice(0, 120);
  const description = input.description.trim().slice(0, 2000);
  const category: TicketCategory = input.category === "suggestion" ? "suggestion" : "bug";
  if (!subject || !description) return { success: false, error: "Betreff und Beschreibung sind erforderlich." };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("username, support_banned").eq("id", user.id).single();
  if (profile?.support_banned) {
    return { success: false, error: "Du hast aktuell keinen Zugriff auf den Support." };
  }

  const insertPayload: Record<string, unknown> = { user_id: user.id, subject, description, status: "open", category, priority: "normal" };
  if (input.attachmentUrl) insertPayload.attachment_url = input.attachmentUrl;

  const { data, error } = await admin
    .from("tickets")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error || !data) {
    void logDebugEvent({ level: "error", scope: "tickets", message: "createTicket DB-Fehler", detail: error?.message, context: { subject, category } });
    return { success: false, error: "Ticket konnte nicht erstellt werden — ist die Tickets-Migration eingespielt?" };
  }

  const username = profile?.username ?? "Ein Spieler";

  await notifyStaff({
    type: "ticket_new",
    title: category === "suggestion" ? "Neuer Verbesserungsvorschlag" : "Neues Support-Ticket",
    message: `${username}: ${subject}`,
    link: `/mod?tab=tickets&open=${data.id}`,
  });

  revalidatePath("/admin");
  return { success: true, ticketId: data.id };
}

export async function getUserTickets(): Promise<Ticket[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("tickets")
    .select("id, user_id, subject, description, status, category, priority, closed_at, closed_by, created_at, updated_at, attachment_url, ticket_messages(count)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(30);

  return attachUsernames(admin, data ?? []);
}

/** Load all rewards for a ticket — staff only. */
export async function getTicketRewards(ticketId: string): Promise<TicketReward[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!isModerator(profile)) return [];

  const { data: raw } = await admin
    .from("ticket_rewards")
    .select("id, ticket_id, granted_by, credits, note, deferred, granted_at, paid_at")
    .eq("ticket_id", ticketId)
    .order("granted_at", { ascending: true });

  const grantorIds = Array.from(new Set((raw ?? []).map((r) => r.granted_by as string)));
  const grantorInfo = await fetchUsernames(admin, grantorIds);

  return (raw ?? []).map((r) => ({
    id: r.id as string,
    ticketId: r.ticket_id as string,
    credits: r.credits as number,
    note: r.note as string | null ?? null,
    deferred: r.deferred as boolean,
    grantedBy: r.granted_by as string,
    grantedByUsername: grantorInfo.get(r.granted_by as string)?.username ?? "Staff",
    grantedByAvatarUrl: grantorInfo.get(r.granted_by as string)?.avatarUrl ?? null,
    grantedAt: r.granted_at as string,
    paidAt: r.paid_at as string | null ?? null,
  }));
}

export async function getTicketDetail(ticketId: string): Promise<TicketDetail | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role, username").eq("id", user.id).single();

  // Users can only view their own tickets; staff can view all
  const query = admin
    .from("tickets")
    .select("id, user_id, subject, description, status, category, priority, closed_at, closed_by, created_at, updated_at, attachment_url, reward_credits, reward_note, reward_granted_at, reward_pending, ticket_messages(count)")
    .eq("id", ticketId);

  if (!isModerator(profile)) {
    query.eq("user_id", user.id);
  }

  const { data } = await query.single();
  if (!data) return null;

  const { data: messages } = await admin
    .from("ticket_messages")
    .select("id, ticket_id, user_id, message, is_staff, created_at, attachment_url")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  const [ticket] = await attachUsernames(admin, [data]);
  const userIds = Array.from(new Set((messages ?? []).map((m) => m.user_id)));
  const usernames = await fetchUsernames(admin, userIds);

  // Load internal notes for staff only
  let internalNotesList: InternalNote[] = [];
  if (isModerator(profile)) {
    const { data: notes } = await admin
      .from("ticket_internal_notes")
      .select("id, ticket_id, user_id, note, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    if (notes?.length) {
      const noteUserIds = Array.from(new Set((notes).map((n: { user_id: string }) => n.user_id)));
      const noteUsernames = await fetchUsernames(admin, noteUserIds);
      internalNotesList = (notes).map((n: { id: string; ticket_id: string; user_id: string; note: string; created_at: string }) => ({
        id: n.id,
        ticketId: n.ticket_id,
        userId: n.user_id,
        username: noteUsernames.get(n.user_id)?.username ?? "Unbekannt",
        note: n.note,
        createdAt: n.created_at,
      }));
    }
  }

  // Load rewards history
  const { data: rewardsRaw } = await admin
    .from("ticket_rewards")
    .select("id, ticket_id, granted_by, credits, note, deferred, granted_at, paid_at")
    .eq("ticket_id", ticketId)
    .order("granted_at", { ascending: true });

  const grantorIds = Array.from(new Set((rewardsRaw ?? []).map((r) => r.granted_by as string)));
  const grantorInfo = await fetchUsernames(admin, grantorIds);

  const rewards: TicketReward[] = (rewardsRaw ?? []).map((r) => ({
    id: r.id as string,
    ticketId: r.ticket_id as string,
    credits: r.credits as number,
    note: r.note as string | null ?? null,
    deferred: r.deferred as boolean,
    grantedBy: r.granted_by as string,
    grantedByUsername: grantorInfo.get(r.granted_by as string)?.username ?? "Staff",
    grantedByAvatarUrl: grantorInfo.get(r.granted_by as string)?.avatarUrl ?? null,
    grantedAt: r.granted_at as string,
    paidAt: r.paid_at as string | null ?? null,
  }));

  return {
    ...ticket,
    internalNotes: internalNotesList,
    attachmentUrl: (data as Record<string, unknown>).attachment_url as string | null ?? null,
    rewardCredits: (data as Record<string, unknown>).reward_credits as number | null ?? null,
    rewardNote: (data as Record<string, unknown>).reward_note as string | null ?? null,
    rewardGrantedAt: (data as Record<string, unknown>).reward_granted_at as string | null ?? null,
    rewardPending: ((data as Record<string, unknown>).reward_pending as boolean) ?? false,
    rewards,
    messages: (messages ?? []).map((m) => {
      const userInfo = usernames.get(m.user_id);
      return {
        id: m.id,
        ticketId: m.ticket_id,
        userId: m.user_id,
        username: userInfo?.username ?? "Unbekannt",
        nameStyleKey: userInfo?.nameStyleKey,
        avatarUrl: userInfo?.avatarUrl ?? null,
        message: m.message,
        isStaff: m.is_staff,
        createdAt: m.created_at,
        attachmentUrl: (m as Record<string, unknown>).attachment_url as string | null ?? null,
      };
    }),
  };
}

// ─── Internal notes (staff only) ──────────────────────────────────────────────

export async function getInternalNotes(ticketId: string): Promise<InternalNote[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!isModerator(profile)) return [];
  const { data } = await admin
    .from("ticket_internal_notes")
    .select("id, ticket_id, user_id, note, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (!data?.length) return [];
  const noteUserIds = Array.from(new Set(data.map((n: { user_id: string }) => n.user_id)));
  const noteUsernames = await fetchUsernames(admin, noteUserIds);
  return data.map((n: { id: string; ticket_id: string; user_id: string; note: string; created_at: string }) => ({
    id: n.id,
    ticketId: n.ticket_id,
    userId: n.user_id,
    username: noteUsernames.get(n.user_id)?.username ?? "Unbekannt",
    note: n.note,
    createdAt: n.created_at,
  }));
}

export async function addInternalNote(
  ticketId: string,
  note: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!isModerator(profile)) return { success: false, error: "Kein Zugriff." };
  const trimmed = note.trim().slice(0, 1000);
  if (!trimmed) return { success: false, error: "Notiz darf nicht leer sein." };
  const { error } = await admin
    .from("ticket_internal_notes")
    .insert({ ticket_id: ticketId, user_id: user.id, note: trimmed });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function addTicketMessage(input: {
  ticketId: string;
  message: string;
  attachmentUrl?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const message = input.message.trim().slice(0, 2000);
  if (!message) return { success: false, error: "Nachricht darf nicht leer sein." };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role, username, support_banned").eq("id", user.id).single();
  const isStaff = isModerator(profile);
  if (!isStaff && profile?.support_banned) {
    return { success: false, error: "Du hast aktuell keinen Zugriff auf den Support." };
  }

  // Users may only message their own tickets
  const { data: ticket } = await admin
    .from("tickets")
    .select("id, user_id, subject, status")
    .eq("id", input.ticketId)
    .single();

  if (!ticket) return { success: false, error: "Ticket nicht gefunden." };
  if (!isStaff && ticket.user_id !== user.id) return { success: false, error: "Kein Zugriff." };
  if (ticket.status === "closed" || ticket.status === "resolved") return { success: false, error: "Dieses Ticket ist geschlossen." };

  const msgPayload: Record<string, unknown> = { ticket_id: input.ticketId, user_id: user.id, message, is_staff: isStaff };
  if (input.attachmentUrl) msgPayload.attachment_url = input.attachmentUrl;
  await admin.from("ticket_messages").insert(msgPayload);

  // Update updated_at on the ticket
  await admin
    .from("tickets")
    .update({ updated_at: new Date().toISOString(), status: isStaff && ticket.status === "open" ? "in_progress" : ticket.status })
    .eq("id", input.ticketId);

  const username = profile?.username ?? "Support";

  if (isStaff) {
    // Notify the ticket owner — link opens the support widget at this ticket
    await notifyUser({
      userId: ticket.user_id,
      type: "ticket_reply",
      title: "Antwort auf dein Ticket",
      message: `${username} hat auf dein Ticket „${ticket.subject}" geantwortet.`,
      link: `/?openTicket=${input.ticketId}`,
    });
  } else {
    await notifyStaff({
      type: "ticket_reply",
      title: "User-Antwort auf Ticket",
      message: `${username}: ${message.slice(0, 80)}`,
      link: `/mod?tab=tickets&open=${input.ticketId}`,
    });
  }

  revalidatePath("/admin");
  return { success: true };
}

export async function closeTicket(ticketId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("tickets")
    .select("user_id")
    .eq("id", ticketId)
    .single();

  if (!ticket || ticket.user_id !== user.id) return { success: false, error: "Kein Zugriff." };

  const now = new Date().toISOString();
  await admin.from("tickets").update({ status: "closed", updated_at: now, closed_at: now, closed_by: user.id }).eq("id", ticketId);
  revalidatePath("/admin");
  return { success: true };
}

// ─── Admin/Staff actions ───────────────────────────────────────────────────────

export async function getAdminTickets(): Promise<Ticket[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role, username").eq("id", user.id).single();
  if (!isModerator(profile)) return [];

  const { data } = await admin
    .from("tickets")
    .select("id, user_id, subject, description, status, category, priority, closed_at, closed_by, created_at, updated_at, attachment_url, escalated_to_admin, ticket_messages(count)")
    .order("updated_at", { ascending: false })
    .limit(100);

  return attachUsernames(admin, data ?? []);
}

export async function updateTicketStatus(input: {
  ticketId: string;
  status: TicketStatus;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role, username").eq("id", user.id).single();
  if (!isModerator(profile)) return { success: false, error: "Kein Zugriff." };

  const { data: ticket } = await admin.from("tickets").select("user_id, subject, reward_pending, reward_credits, reward_note, reward_granted_by").eq("id", input.ticketId).single();
  if (!ticket) return { success: false, error: "Ticket nicht gefunden." };

  const isClosing = input.status === "closed" || input.status === "resolved";
  const hasPendingReward = !!(ticket as Record<string, unknown>).reward_pending;

  // Payout logic: check new ticket_rewards table first, fall back to legacy column
  let totalPayout = 0;
  if (isClosing) {
    const { data: pendingRewards } = await admin
      .from("ticket_rewards")
      .select("id, credits")
      .eq("ticket_id", input.ticketId)
      .eq("deferred", true)
      .is("paid_at", null);
    const newTableTotal = (pendingRewards ?? []).reduce((s, r) => s + ((r as Record<string, unknown>).credits as number), 0);
    // Backward compat: legacy column if no ticket_rewards entries exist
    const legacyTotal = newTableTotal === 0 && hasPendingReward
      ? ((ticket as Record<string, unknown>).reward_credits as number ?? 0) : 0;
    totalPayout = newTableTotal + legacyTotal;

    if (newTableTotal > 0) {
      // Mark all deferred unpaid rewards as paid
      await admin.from("ticket_rewards")
        .update({ paid_at: new Date().toISOString() })
        .eq("ticket_id", input.ticketId)
        .eq("deferred", true)
        .is("paid_at", null);
    }
  }

  const effectiveStatus: TicketStatus = (isClosing && hasPendingReward) ? "resolved" : input.status;
  const now = new Date().toISOString();

  const updatePayload: Record<string, unknown> = {
    status: effectiveStatus,
    updated_at: now,
    ...(isClosing ? { closed_at: now, closed_by: user.id } : {}),
  };

  if (isClosing && (hasPendingReward || totalPayout > 0)) {
    if (totalPayout > 0) {
      const { data: targetProfile } = await admin.from("profiles").select("credits").eq("id", ticket.user_id).single();
      const newCredits = ((targetProfile?.credits as number) ?? 0) + totalPayout;
      await admin.from("profiles").update({ credits: newCredits }).eq("id", ticket.user_id);
    }
    updatePayload.reward_pending = false;
    updatePayload.reward_granted_at = now;
    updatePayload.reward_credits = totalPayout > 0 ? totalPayout : (ticket as Record<string, unknown>).reward_credits;
    const grantedBy = (ticket as Record<string, unknown>).reward_granted_by as string | null;
    if (!grantedBy) updatePayload.reward_granted_by = user.id;
  }

  await admin.from("tickets").update(updatePayload).eq("id", input.ticketId);

  const STATUS_LABELS: Record<TicketStatus, string> = {
    open: "Offen",
    in_progress: "In Bearbeitung",
    resolved: "Gelöst/Geschlossen",
    closed: "Gelöst/Geschlossen",
  };

  let notifyMsg = `Dein Ticket „${ticket.subject}" ist jetzt: ${STATUS_LABELS[effectiveStatus]}`;
  if (isClosing && (hasPendingReward || totalPayout > 0)) {
    notifyMsg += totalPayout > 0 ? ` · +${totalPayout} Credits wurden gutgeschrieben!` : " · Deine Belohnung wurde ausgezahlt!";
  }

  await notifyUser({
    userId: ticket.user_id,
    type: "ticket_status",
    title: "Ticket-Status geändert",
    message: notifyMsg,
    link: `/?openTicket=${input.ticketId}`,
  });

  revalidatePath("/admin");
  return { success: true };
}

/** Staff-only cleanup — any ticket status can be deleted by admins/mods. */
export async function deleteTicket(ticketId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role, username").eq("id", user.id).single();
  if (!isModerator(profile)) return { success: false, error: "Kein Zugriff." };

  await admin.from("ticket_messages").delete().eq("ticket_id", ticketId);
  const { error } = await admin.from("tickets").delete().eq("id", ticketId);
  if (error) {
    void logDebugEvent({ level: "error", scope: "tickets", message: "deleteTicket fehlgeschlagen", detail: error.message, context: { ticketId } });
    return { success: false, error: "Löschen fehlgeschlagen." };
  }

  revalidatePath("/admin");
  return { success: true };
}

export async function setTicketPriority(input: {
  ticketId: string;
  priority: TicketPriority;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!isModerator(profile)) return { success: false, error: "Kein Zugriff." };

  const validPriorities: TicketPriority[] = ["low", "normal", "high", "urgent"];
  if (!validPriorities.includes(input.priority)) return { success: false, error: "Ungültige Priorität." };

  await admin.from("tickets").update({ priority: input.priority, updated_at: new Date().toISOString() }).eq("id", input.ticketId);
  revalidatePath("/admin");
  return { success: true };
}

/** Bulk-delete multiple tickets — admin/mod only. */
export async function deleteTicketsBulk(ticketIds: string[]): Promise<{ success: boolean; error?: string; deleted: number }> {
  if (ticketIds.length === 0) return { success: true, deleted: 0 };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt.", deleted: 0 };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!isModerator(profile)) return { success: false, error: "Kein Zugriff.", deleted: 0 };

  await admin.from("ticket_messages").delete().in("ticket_id", ticketIds);
  const { data, error } = await admin.from("tickets").delete().in("id", ticketIds).select("id");
  if (error) return { success: false, error: "Löschen fehlgeschlagen.", deleted: 0 };

  revalidatePath("/admin");
  return { success: true, deleted: data?.length ?? 0 };
}

/** Grant a reward for a helpful ticket — mod/admin. Inserts into ticket_rewards table. */
export async function adminGrantTicketReward(
  ticketId: string,
  opts: { credits?: number; note?: string; deferred?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role, username").eq("id", user.id).single();
  if (!isModerator(profile)) return { success: false, error: "Kein Zugriff." };

  const { data: ticket } = await admin.from("tickets").select("user_id, subject, status").eq("id", ticketId).single();
  if (!ticket) return { success: false, error: "Ticket nicht gefunden." };

  const credits = opts.credits ?? 0;
  const deferred = opts.deferred !== false;
  const now = new Date().toISOString();
  const ticketStatus = (ticket as Record<string, unknown>).status as string;
  const isAlreadyClosed = ticketStatus === "closed" || ticketStatus === "resolved";

  // For closed tickets, always pay immediately regardless of deferred flag
  const actuallyDeferred = deferred && !isAlreadyClosed;

  const { error: insertErr } = await admin.from("ticket_rewards").insert({
    ticket_id: ticketId,
    granted_by: user.id,
    credits,
    note: opts.note ?? null,
    deferred: actuallyDeferred,
    granted_at: now,
    paid_at: actuallyDeferred ? null : now,
  });
  if (insertErr) return { success: false, error: insertErr.message };

  if (!actuallyDeferred && credits > 0) {
    const { data: targetProfile } = await admin.from("profiles").select("credits").eq("id", ticket.user_id).single();
    const newCredits = ((targetProfile?.credits as number) ?? 0) + credits;
    await admin.from("profiles").update({ credits: newCredits }).eq("id", ticket.user_id);
  }

  // Sync summary columns on ticket
  await syncTicketRewardSummaryAdmin(admin, ticketId, user.id, now);

  await notifyUser({
    userId: ticket.user_id,
    type: "admin_credits",
    title: actuallyDeferred ? "🏆 Belohnung angepinnt!" : "🏆 Belohnung erhalten!",
    message: credits > 0
      ? actuallyDeferred
        ? `Dein Ticket „${ticket.subject}" enthält +${credits} Credits Belohnung — wird ausgezahlt wenn das Ticket gelöst wird.`
        : `Du hast +${credits} Credits für dein Ticket „${ticket.subject}" erhalten!`
      : `Belohnung vergeben.`,
    link: `/?openTicket=${ticketId}`,
  });

  revalidatePath("/admin");
  return { success: true };
}

/** Remove an unpaid reward — mod/admin only. */
export async function adminRemoveTicketReward(
  rewardId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!isModerator(profile)) return { success: false, error: "Kein Zugriff." };

  const { data: reward } = await admin
    .from("ticket_rewards")
    .select("id, ticket_id, paid_at")
    .eq("id", rewardId)
    .single();
  if (!reward) return { success: false, error: "Belohnung nicht gefunden." };
  if ((reward as Record<string, unknown>).paid_at) return { success: false, error: "Bereits ausgezahlte Belohnungen können nicht entfernt werden." };

  const { error } = await admin.from("ticket_rewards").delete().eq("id", rewardId);
  if (error) return { success: false, error: error.message };

  await syncTicketRewardSummaryAdmin(admin, (reward as Record<string, unknown>).ticket_id as string, user.id, new Date().toISOString());

  revalidatePath("/admin");
  return { success: true };
}

async function syncTicketRewardSummaryAdmin(
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

/** Delete tickets by creation date range — admin/mod only. */
export async function deleteTicketsByDateRange(input: {
  before: string;
  statuses?: TicketStatus[];
}): Promise<{ success: boolean; error?: string; deleted: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt.", deleted: 0 };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!isModerator(profile)) return { success: false, error: "Kein Zugriff.", deleted: 0 };

  let query = admin.from("tickets").select("id").lt("created_at", input.before);
  if (input.statuses && input.statuses.length > 0) {
    query = query.in("status", input.statuses);
  }
  const { data: rows } = await query;
  const ids = (rows ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) return { success: true, deleted: 0 };

  await admin.from("ticket_messages").delete().in("ticket_id", ids);
  const { data, error } = await admin.from("tickets").delete().in("id", ids).select("id");
  if (error) return { success: false, error: "Löschen fehlgeschlagen.", deleted: 0 };

  revalidatePath("/admin");
  return { success: true, deleted: data?.length ?? 0 };
}

/** Escalate a ticket to admin attention — mod or admin only. */
export async function escalateTicketToAdmin(ticketId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role, username").eq("id", user.id).single();
  if (!isModerator(profile)) return { success: false, error: "Kein Zugriff." };

  const { data: ticket } = await admin.from("tickets").select("user_id, subject, status, escalated_to_admin").eq("id", ticketId).single();
  if (!ticket) return { success: false, error: "Ticket nicht gefunden." };
  if ((ticket as Record<string, unknown>).escalated_to_admin) return { success: false, error: "Ticket wurde bereits weitergeleitet." };

  const { error } = await admin.from("tickets").update({ escalated_to_admin: true, updated_at: new Date().toISOString() }).eq("id", ticketId);
  if (error) return { success: false, error: error.message };

  const modUsername = (profile as Record<string, unknown>).username as string ?? "Mod";
  await notifyStaff({
    type: "ticket_new",
    title: "⬆ Ticket an Admin weitergeleitet",
    message: `${modUsername} hat Ticket „${(ticket as Record<string, unknown>).subject}" an Admins weitergeleitet.`,
    link: `/admin?tab=tickets&open=${ticketId}`,
  });

  revalidatePath("/admin");
  revalidatePath("/mod");
  return { success: true };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// `tickets`/`ticket_messages` only carry a FK to `auth.users`, not to
// `profiles` — PostgREST can't embed `profiles(username)` across that gap
// (confirmed via PGRST200 "Could not find a relationship"), which is why
// every admin/user ticket list silently came back empty. Fetch usernames
// in a second batched query instead, same pattern the rest of the codebase
// (auctions.ts, trading.ts) already uses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchUsernames(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
): Promise<Map<string, { username: string; nameStyleKey?: string; avatarUrl?: string | null }>> {
  if (userIds.length === 0) return new Map();
  const { data } = await admin.from("profiles").select("id, username, active_name_style_key, avatar_url").in("id", userIds);
  return new Map(
    (data ?? []).map((p: { id: string; username: string | null; active_name_style_key?: string | null; avatar_url?: string | null }) => [
      p.id,
      {
        username: p.username ?? "Unbekannt",
        nameStyleKey: p.active_name_style_key ?? undefined,
        avatarUrl: p.avatar_url ?? null,
      },
    ])
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function attachUsernames(admin: ReturnType<typeof createAdminClient>, rows: any[]): Promise<Ticket[]> {
  const allUserIds = Array.from(new Set([
    ...rows.map((r) => r.user_id),
    ...rows.filter((r) => r.closed_by).map((r) => r.closed_by),
  ]));
  const usernames = await fetchUsernames(admin, allUserIds);
  return rows.map((row) => mapTicket(row, usernames.get(row.user_id)?.username, row.closed_by ? usernames.get(row.closed_by)?.username : undefined));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTicket(row: any, username?: string, closedByUsername?: string): Ticket {
  const msgCountRaw = Array.isArray(row.ticket_messages) ? row.ticket_messages[0]?.count : 0;
  return {
    id: row.id,
    userId: row.user_id,
    username: username ?? "Unbekannt",
    subject: row.subject,
    description: row.description,
    status: row.status as TicketStatus,
    category: (row.category as TicketCategory) ?? "bug",
    priority: (row.priority as TicketPriority) ?? "normal",
    closedAt: row.closed_at ?? null,
    closedByUsername: closedByUsername ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: typeof msgCountRaw === "number" ? msgCountRaw : Number(msgCountRaw) || 0,
    escalatedToAdmin: (row.escalated_to_admin as boolean) ?? false,
    attachmentUrl: (row.attachment_url as string | null) ?? null,
  };
}
