"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MessageCircle,
  X,
  Send,
  Plus,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  Clock,
  CheckCheck,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  createTicket,
  getUserTickets,
  getTicketDetail,
  addTicketMessage,
  closeTicket,
  type Ticket,
  type TicketDetail,
  type TicketStatus,
} from "@/lib/actions/tickets";

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  resolved: "Gelöst",
  closed: "Geschlossen",
};

const STATUS_STYLE: Record<TicketStatus, string> = {
  open: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  in_progress: "text-blue-300 bg-blue-500/10 border-blue-500/30",
  resolved: "text-purple-300 bg-purple-500/10 border-purple-500/30",
  closed: "text-zinc-400 bg-zinc-500/10 border-zinc-500/30",
};

const STATUS_ICON: Record<TicketStatus, typeof MessageCircle> = {
  open: MessageCircle,
  in_progress: Clock,
  resolved: CheckCircle2,
  closed: XCircle,
};

function StatusBadge({ status }: { status: TicketStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[status]}`}>
      <Icon className="h-2.5 w-2.5" />
      {STATUS_LABEL[status]}
    </span>
  );
}

type View = "list" | "new" | "detail";

export function SupportButton() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("list");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(false);

  // New ticket form
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);

  // Reply
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setVisible(!!user);
    });
  }, []);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    const result = await getUserTickets();
    setTickets(result);
    setLoading(false);
  }, []);

  function handleOpen() {
    setOpen(true);
    setView("list");
    loadTickets();
  }

  async function openDetail(ticket: Ticket) {
    setView("detail");
    setLoading(true);
    const d = await getTicketDetail(ticket.id);
    setDetail(d);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;
    setSubmitting(true);
    setFormError(null);
    const res = await createTicket({ subject: subject.trim(), description: description.trim() });
    setSubmitting(false);
    if (res.success) {
      setFormSuccess(true);
      setSubject("");
      setDescription("");
      setTimeout(() => {
        setFormSuccess(false);
        setView("list");
        loadTickets();
      }, 2000);
    } else {
      setFormError(res.error ?? "Fehler beim Erstellen.");
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim() || !detail) return;
    setSending(true);
    await addTicketMessage({ ticketId: detail.id, message: reply.trim() });
    setReply("");
    const updated = await getTicketDetail(detail.id);
    setDetail(updated);
    setSending(false);
  }

  async function handleClose() {
    if (!detail) return;
    await closeTicket(detail.id);
    const updated = await getTicketDetail(detail.id);
    setDetail(updated);
    loadTickets();
  }

  if (!visible) return null;

  return (
    <>
      {!open && (
        <button
          onClick={handleOpen}
          title="Support & Tickets"
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-purple-600 text-white shadow-[0_4px_20px_rgba(147,51,234,0.55)] transition-all hover:scale-110 hover:bg-purple-500 hover:shadow-[0_4px_30px_rgba(147,51,234,0.8)]"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="fixed bottom-6 right-6 z-50 flex w-[22rem] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0814] shadow-[0_8px_40px_rgba(0,0,0,0.65)]">

            {/* Header */}
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              {(view === "new" || view === "detail") && (
                <button
                  onClick={() => { setView("list"); setDetail(null); setFormSuccess(false); setFormError(null); }}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              <span className="flex-1 text-sm font-bold text-zinc-100">
                {view === "list" && "Support"}
                {view === "new" && "Neues Ticket"}
                {view === "detail" && (detail?.subject ?? "Ticket")}
              </span>
              {view === "list" && (
                <button
                  onClick={() => { setView("new"); setFormError(null); setFormSuccess(false); }}
                  className="flex items-center gap-1 rounded-lg border border-purple-400/30 bg-purple-500/10 px-2.5 py-1 text-xs font-semibold text-purple-300 hover:bg-purple-500/20"
                >
                  <Plus className="h-3 w-3" />
                  Neu
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="max-h-[70vh] overflow-y-auto">

              {/* Ticket list */}
              {view === "list" && (
                <div className="flex flex-col">
                  {loading && (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                    </div>
                  )}
                  {!loading && tickets.length === 0 && (
                    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                      <MessageCircle className="h-8 w-8 text-zinc-700" />
                      <p className="text-sm text-zinc-500">Du hast noch keine Tickets.</p>
                      <button
                        onClick={() => { setView("new"); setFormError(null); }}
                        className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-500"
                      >
                        Erstes Ticket erstellen
                      </button>
                    </div>
                  )}
                  {!loading && tickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      onClick={() => openDetail(ticket)}
                      className="flex flex-col gap-1.5 border-b border-white/[0.05] px-4 py-3 text-left transition-colors hover:bg-purple-500/[0.05] last:border-b-0"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-tight text-zinc-200">{ticket.subject}</p>
                        <StatusBadge status={ticket.status} />
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        {new Date(ticket.updatedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                        {" · "}
                        {ticket.messageCount} Nachricht{ticket.messageCount !== 1 ? "en" : ""}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {/* New ticket form */}
              {view === "new" && (
                <form onSubmit={handleCreate} className="flex flex-col gap-3 p-4">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-zinc-400">Betreff</span>
                    <input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      maxLength={120}
                      placeholder="Kurze Beschreibung des Anliegens…"
                      className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-400/60"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-zinc-400">Beschreibung</span>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      maxLength={2000}
                      placeholder="Details zum Problem — je mehr Infos, desto schneller können wir helfen…"
                      className="resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-400/60"
                    />
                  </label>
                  {formError && <p className="text-xs text-red-400">{formError}</p>}
                  {formSuccess && (
                    <p className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <CheckCheck className="h-3.5 w-3.5" />
                      Ticket wurde gesendet!
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={submitting || !subject.trim() || !description.trim()}
                    className="flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {submitting ? "Wird gesendet…" : "Ticket senden"}
                  </button>
                </form>
              )}

              {/* Ticket detail */}
              {view === "detail" && (
                <div className="flex flex-col">
                  {loading && (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                    </div>
                  )}
                  {!loading && detail && (
                    <>
                      {/* Status bar */}
                      <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-2">
                        <StatusBadge status={detail.status} />
                        {detail.status !== "closed" && (
                          <button
                            onClick={handleClose}
                            className="text-[11px] text-zinc-500 hover:text-red-400"
                          >
                            Ticket schließen
                          </button>
                        )}
                      </div>

                      {/* Original description */}
                      <div className="border-b border-white/[0.05] bg-white/[0.02] px-4 py-3">
                        <p className="text-xs text-zinc-500">Deine Beschreibung:</p>
                        <p className="mt-1 text-sm leading-relaxed text-zinc-300">{detail.description}</p>
                      </div>

                      {/* Messages */}
                      <div className="flex flex-col gap-0.5 px-3 py-2">
                        {detail.messages.length === 0 && (
                          <p className="py-4 text-center text-xs text-zinc-600">Noch keine Antworten.</p>
                        )}
                        {detail.messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`rounded-xl px-3 py-2 ${msg.isStaff ? "ml-4 bg-purple-500/10" : "mr-4 bg-white/[0.03]"}`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-bold ${msg.isStaff ? "text-purple-300" : "text-zinc-400"}`}>
                                {msg.isStaff ? "🛡 " : ""}{msg.username}
                              </span>
                              <span className="text-[10px] text-zinc-600">
                                {new Date(msg.createdAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs leading-relaxed text-zinc-300">{msg.message}</p>
                          </div>
                        ))}
                      </div>

                      {/* Reply */}
                      {detail.status !== "closed" && (
                        <form onSubmit={handleReply} className="border-t border-white/10 p-3">
                          <div className="flex gap-2">
                            <input
                              value={reply}
                              onChange={(e) => setReply(e.target.value)}
                              maxLength={2000}
                              placeholder="Antwort schreiben…"
                              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-400/60"
                            />
                            <button
                              type="submit"
                              disabled={sending || !reply.trim()}
                              className="flex items-center justify-center rounded-lg bg-purple-600 px-3 py-2 text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
                            >
                              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </form>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
