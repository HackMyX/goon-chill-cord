"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isModerator } from "@/lib/admin";
import { notifyUser, notifyStaff } from "@/lib/notifications-internal";

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

export interface TicketDetail extends Ticket {
  messages: TicketMessage[];
}

// ─── User actions ─────────────────────────────────────────────────────────────

export async function createTicket(input: {
  subject: string;
  description: string;
  category?: TicketCategory;
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

  const { data, error } = await admin
    .from("tickets")
    .insert({ user_id: user.id, subject, description, status: "open", category, priority: "normal" })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "Ticket konnte nicht erstellt werden — ist die Tickets-Migration eingespielt?" };
  }

  const username = profile?.username ?? "Ein Spieler";

  await notifyStaff({
    type: "ticket_new",
    title: category === "suggestion" ? "Neuer Verbesserungsvorschlag" : "Neues Support-Ticket",
    message: `${username}: ${subject}`,
    link: "/admin?tab=tickets",
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
    .select("id, user_id, subject, description, status, category, priority, closed_at, closed_by, created_at, updated_at, ticket_messages(count)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(30);

  return attachUsernames(admin, data ?? []);
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
    .select("id, user_id, subject, description, status, category, priority, closed_at, closed_by, created_at, updated_at, ticket_messages(count)")
    .eq("id", ticketId);

  if (!isModerator(profile)) {
    query.eq("user_id", user.id);
  }

  const { data } = await query.single();
  if (!data) return null;

  const { data: messages } = await admin
    .from("ticket_messages")
    .select("id, ticket_id, user_id, message, is_staff, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  const [ticket] = await attachUsernames(admin, [data]);
  const userIds = Array.from(new Set((messages ?? []).map((m) => m.user_id)));
  const usernames = await fetchUsernames(admin, userIds);

  return {
    ...ticket,
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      ticketId: m.ticket_id,
      userId: m.user_id,
      username: usernames.get(m.user_id) ?? "Unbekannt",
      message: m.message,
      isStaff: m.is_staff,
      createdAt: m.created_at,
    })),
  };
}

export async function addTicketMessage(input: {
  ticketId: string;
  message: string;
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
  if (ticket.status === "closed") return { success: false, error: "Dieses Ticket ist geschlossen." };

  await admin.from("ticket_messages").insert({
    ticket_id: input.ticketId,
    user_id: user.id,
    message,
    is_staff: isStaff,
  });

  // Update updated_at on the ticket
  await admin
    .from("tickets")
    .update({ updated_at: new Date().toISOString(), status: isStaff && ticket.status === "open" ? "in_progress" : ticket.status })
    .eq("id", input.ticketId);

  const username = profile?.username ?? "Support";

  if (isStaff) {
    // Notify the ticket owner
    await notifyUser({
      userId: ticket.user_id,
      type: "ticket_reply",
      title: "Antwort auf dein Ticket",
      message: `${username} hat auf dein Ticket „${ticket.subject}" geantwortet.`,
      link: `/support`,
    });
  } else {
    // Notify staff of user reply
    await notifyStaff({
      type: "ticket_reply",
      title: "User-Antwort auf Ticket",
      message: `${username}: ${message.slice(0, 80)}`,
      link: "/admin?tab=tickets",
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
    .select("id, user_id, subject, description, status, category, priority, closed_at, closed_by, created_at, updated_at, ticket_messages(count)")
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

  const { data: ticket } = await admin.from("tickets").select("user_id, subject").eq("id", input.ticketId).single();
  if (!ticket) return { success: false, error: "Ticket nicht gefunden." };

  const isClosing = input.status === "closed" || input.status === "resolved";
  const now = new Date().toISOString();
  await admin
    .from("tickets")
    .update({
      status: input.status,
      updated_at: now,
      ...(isClosing ? { closed_at: now, closed_by: user.id } : {}),
    })
    .eq("id", input.ticketId);

  const STATUS_LABELS: Record<TicketStatus, string> = {
    open: "Offen",
    in_progress: "In Bearbeitung",
    resolved: "Gelöst",
    closed: "Geschlossen",
  };

  await notifyUser({
    userId: ticket.user_id,
    type: "ticket_status",
    title: "Ticket-Status geändert",
    message: `Dein Ticket „${ticket.subject}" ist jetzt: ${STATUS_LABELS[input.status]}`,
    link: `/support`,
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
  if (error) return { success: false, error: "Löschen fehlgeschlagen." };

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

// `tickets`/`ticket_messages` only carry a FK to `auth.users`, not to
// `profiles` — PostgREST can't embed `profiles(username)` across that gap
// (confirmed via PGRST200 "Could not find a relationship"), which is why
// every admin/user ticket list silently came back empty. Fetch usernames
// in a second batched query instead, same pattern the rest of the codebase
// (auctions.ts, trading.ts) already uses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchUsernames(admin: ReturnType<typeof createAdminClient>, userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const { data } = await admin.from("profiles").select("id, username").in("id", userIds);
  return new Map((data ?? []).map((p: { id: string; username: string | null }) => [p.id, p.username ?? "Unbekannt"]));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function attachUsernames(admin: ReturnType<typeof createAdminClient>, rows: any[]): Promise<Ticket[]> {
  const allUserIds = Array.from(new Set([
    ...rows.map((r) => r.user_id),
    ...rows.filter((r) => r.closed_by).map((r) => r.closed_by),
  ]));
  const usernames = await fetchUsernames(admin, allUserIds);
  return rows.map((row) => mapTicket(row, usernames.get(row.user_id), row.closed_by ? usernames.get(row.closed_by) : undefined));
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
  };
}
