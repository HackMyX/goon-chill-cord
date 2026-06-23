"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MessageCircle,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Send,
  Loader2,
  RefreshCw,
  Bug,
  Lightbulb,
  Trash2,
  CheckSquare,
  Square,
  CalendarRange,
  X,
} from "lucide-react";
import {
  getAdminTickets,
  getTicketDetail,
  addTicketMessage,
  updateTicketStatus,
  setTicketPriority,
  deleteTicket,
  deleteTicketsBulk,
  deleteTicketsByDateRange,
  type Ticket,
  type TicketDetail,
  type TicketStatus,
  type TicketCategory,
  type TicketPriority,
} from "@/lib/actions/tickets";
import { useSoundManager } from "@/lib/sound-manager";

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

const ALL_STATUSES: TicketStatus[] = ["open", "in_progress", "resolved", "closed"];
const ALL_PRIORITIES: TicketPriority[] = ["low", "normal", "high", "urgent"];

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: "Niedrig",
  normal: "Normal",
  high: "Hoch",
  urgent: "Dringend",
};

const PRIORITY_STYLE: Record<TicketPriority, string> = {
  low: "text-zinc-400 bg-zinc-500/10 border-zinc-500/30",
  normal: "text-blue-300 bg-blue-500/10 border-blue-500/30",
  high: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  urgent: "text-red-300 bg-red-500/15 border-red-500/40",
};

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${PRIORITY_STYLE[priority]}`}>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

const CATEGORY_LABEL: Record<TicketCategory, string> = {
  bug: "Problem",
  suggestion: "Vorschlag",
};

const CATEGORY_STYLE: Record<TicketCategory, string> = {
  bug: "text-orange-300 bg-orange-500/10 border-orange-500/30",
  suggestion: "text-amber-300 bg-amber-500/10 border-amber-500/30",
};

const CATEGORY_ICON: Record<TicketCategory, typeof Bug> = {
  bug: Bug,
  suggestion: Lightbulb,
};

function StatusBadge({ status }: { status: TicketStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[status]}`}>
      <Icon className="h-2.5 w-2.5" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function CategoryBadge({ category }: { category: TicketCategory }) {
  const Icon = CATEGORY_ICON[category];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${CATEGORY_STYLE[category]}`}>
      <Icon className="h-2.5 w-2.5" />
      {CATEGORY_LABEL[category]}
    </span>
  );
}

function TicketRow({
  ticket,
  onUpdated,
  selected,
  onSelect,
}: {
  ticket: Ticket;
  onUpdated: () => void;
  selected: boolean;
  onSelect: (id: string, value: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  const [priorityChanging, setPriorityChanging] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const sound = useSoundManager();

  async function handleExpand() {
    sound.click();
    if (!expanded) {
      setExpanded(true);
      setLoadingDetail(true);
      const d = await getTicketDetail(ticket.id);
      setDetail(d);
      setLoadingDetail(false);
    } else {
      setExpanded(false);
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    await addTicketMessage({ ticketId: ticket.id, message: reply.trim() });
    setReply("");
    const d = await getTicketDetail(ticket.id);
    setDetail(d);
    setSending(false);
    onUpdated();
  }

  async function handleStatusChange(status: TicketStatus) {
    setStatusChanging(true);
    await updateTicketStatus({ ticketId: ticket.id, status });
    const d = await getTicketDetail(ticket.id);
    setDetail(d);
    setStatusChanging(false);
    onUpdated();
  }

  async function handlePriorityChange(priority: TicketPriority) {
    setPriorityChanging(true);
    await setTicketPriority({ ticketId: ticket.id, priority });
    const d = await getTicketDetail(ticket.id);
    setDetail(d);
    setPriorityChanging(false);
    onUpdated();
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    sound.click();
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 4000);
      return;
    }
    setDeleting(true);
    await deleteTicket(ticket.id);
    setDeleting(false);
    onUpdated();
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <div className="flex items-center">
        {/* Checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(ticket.id, !selected); }}
          className="flex shrink-0 items-center justify-center self-stretch px-3 text-zinc-500 hover:text-purple-400 transition-colors"
          title={selected ? "Abwählen" : "Auswählen"}
        >
          {selected ? <CheckSquare className="h-4 w-4 text-purple-400" /> : <Square className="h-4 w-4" />}
        </button>

        {/* Main row button */}
        <button
          onClick={handleExpand}
          className="flex flex-1 min-w-0 items-center gap-3 py-3 pr-3 text-left hover:bg-white/[0.03] transition-colors"
        >
          <StatusBadge status={ticket.status} />
          <CategoryBadge category={ticket.category} />
          <PriorityBadge priority={ticket.priority ?? "normal"} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-zinc-200">{ticket.subject}</p>
            <p className="text-[11px] text-zinc-500">
              {ticket.username} ·{" "}
              {new Date(ticket.updatedAt).toLocaleString("de-DE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {" "}· {ticket.messageCount} Msg
            </p>
          </div>

          {/* Delete button — visible for all tickets */}
          <span
            role="button"
            tabIndex={0}
            onClick={handleDelete}
            onKeyDown={(e) => e.key === "Enter" && handleDelete(e as unknown as React.MouseEvent)}
            title="Ticket löschen"
            className={`flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition-colors ${
              deleteConfirm
                ? "border-red-500/50 bg-red-500/20 text-red-300"
                : "border-white/10 text-zinc-500 hover:border-red-500/40 hover:text-red-400"
            }`}
          >
            {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            {deleteConfirm ? "Wirklich?" : ""}
          </span>

          {expanded ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-white/[0.06]">
          {loadingDetail && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            </div>
          )}

          {!loadingDetail && detail && (
            <div className="flex flex-col gap-0">
              {/* Status + Priority controls */}
              <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
                <span className="text-xs text-zinc-500">Status:</span>
                {ALL_STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    disabled={statusChanging || detail.status === s}
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold transition-colors ${
                      detail.status === s
                        ? STATUS_STYLE[s]
                        : "border-white/10 text-zinc-500 hover:border-white/30 hover:text-zinc-300"
                    } disabled:opacity-50`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
                {statusChanging && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />}
                <span className="ml-3 text-xs text-zinc-500">Priorität:</span>
                {ALL_PRIORITIES.map((p) => (
                  <button
                    key={p}
                    onClick={() => handlePriorityChange(p)}
                    disabled={priorityChanging || (detail.priority ?? "normal") === p}
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold transition-colors ${
                      (detail.priority ?? "normal") === p
                        ? PRIORITY_STYLE[p]
                        : "border-white/10 text-zinc-500 hover:border-white/30 hover:text-zinc-300"
                    } disabled:opacity-50`}
                  >
                    {PRIORITY_LABEL[p]}
                  </button>
                ))}
                {priorityChanging && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />}
                {(detail.closedAt) && (
                  <span className="ml-auto text-[10px] text-zinc-600">
                    Geschlossen {new Date(detail.closedAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    {detail.closedByUsername ? ` von ${detail.closedByUsername}` : ""}
                  </span>
                )}
              </div>

              {/* Original description */}
              <div className="border-b border-white/[0.06] bg-black/20 px-4 py-3">
                <p className="text-[11px] text-zinc-500 mb-1">Beschreibung von {ticket.username}:</p>
                <p className="text-sm leading-relaxed text-zinc-300">{detail.description}</p>
              </div>

              {/* Messages */}
              <div className="flex flex-col gap-2 px-4 py-3">
                {detail.messages.length === 0 && (
                  <p className="text-center text-xs text-zinc-600">Noch keine Nachrichten.</p>
                )}
                {detail.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-xl px-3 py-2 ${msg.isStaff ? "ml-6 bg-purple-500/10" : "mr-6 bg-white/[0.04]"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold ${msg.isStaff ? "text-purple-300" : "text-zinc-400"}`}>
                        {msg.isStaff ? "🛡 " : ""}{msg.username}
                      </span>
                      <span className="text-[10px] text-zinc-600">
                        {new Date(msg.createdAt).toLocaleString("de-DE", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm leading-relaxed text-zinc-300">{msg.message}</p>
                  </div>
                ))}
              </div>

              {/* Reply */}
              {detail.status !== "closed" && (
                <form onSubmit={handleReply} className="border-t border-white/[0.06] px-4 py-3">
                  <p className="mb-2 text-[11px] font-semibold text-purple-300">Als Staff antworten:</p>
                  <div className="flex gap-2">
                    <textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      rows={2}
                      maxLength={2000}
                      placeholder="Antwort…"
                      className="min-w-0 flex-1 resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-400/60"
                    />
                    <button
                      type="submit"
                      disabled={sending || !reply.trim()}
                      className="flex items-center justify-center rounded-lg bg-purple-600 px-3 py-2 text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type FilterStatus = TicketStatus | "all";
type FilterCategory = TicketCategory | "all";

export function TicketsTab() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<FilterStatus>("open");
  const [categoryFilter, setCategoryFilter] = useState<FilterCategory>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [showDatePanel, setShowDatePanel] = useState(false);
  const [dateBefore, setDateBefore] = useState("");
  const [dateStatuses, setDateStatuses] = useState<TicketStatus[]>([]);
  const [dateDeleteConfirm, setDateDeleteConfirm] = useState(false);
  const sound = useSoundManager();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const result = await getAdminTickets();
      setTickets(result);
      setSelected(new Set());
    } catch {
      setLoadError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const byCategory = categoryFilter === "all" ? tickets : tickets.filter((t) => t.category === categoryFilter);
  const displayed = filter === "all" ? byCategory : byCategory.filter((t) => t.status === filter);

  const countFor = (s: FilterStatus) =>
    s === "all" ? byCategory.length : byCategory.filter((t) => t.status === s).length;

  function toggleSelect(id: string, val: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (val) next.add(id); else next.delete(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === displayed.length && displayed.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(displayed.map((t) => t.id)));
    }
  }

  function flashBulk(msg: string) {
    setBulkMessage(msg);
    setTimeout(() => setBulkMessage(null), 3500);
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    setBulkDeleting(true);
    sound.click();
    const res = await deleteTicketsBulk(Array.from(selected));
    setBulkDeleting(false);
    if (res.success) {
      sound.win?.();
      flashBulk(`${res.deleted} Ticket${res.deleted !== 1 ? "s" : ""} gelöscht.`);
      load();
    } else {
      sound.error();
      flashBulk(res.error ?? "Fehler.");
    }
  }

  async function handleDateRangeDelete() {
    if (!dateBefore) return;
    setBulkDeleting(true);
    sound.click();
    const res = await deleteTicketsByDateRange({
      before: new Date(dateBefore + "T23:59:59Z").toISOString(),
      statuses: dateStatuses.length > 0 ? dateStatuses : undefined,
    });
    setBulkDeleting(false);
    setDateDeleteConfirm(false);
    if (res.success) {
      sound.win?.();
      flashBulk(`${res.deleted} Ticket${res.deleted !== 1 ? "s" : ""} gelöscht.`);
      setDateBefore("");
      setDateStatuses([]);
      setShowDatePanel(false);
      load();
    } else {
      sound.error();
      flashBulk(res.error ?? "Fehler.");
    }
  }

  function toggleDateStatus(s: TicketStatus) {
    setDateStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  const allDisplayedSelected = displayed.length > 0 && selected.size === displayed.length;
  const someSelected = selected.size > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Category filter */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "bug", "suggestion"] as FilterCategory[]).map((c) => {
          const Icon = c === "all" ? null : CATEGORY_ICON[c];
          return (
            <button
              key={c}
              onMouseEnter={sound.hover}
              onClick={() => { sound.click(); setCategoryFilter(c); }}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                categoryFilter === c
                  ? "border-amber-400 bg-amber-500/15 text-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.35)]"
                  : "border-white/10 text-zinc-400 hover:border-white/30"
              }`}
            >
              {Icon && <Icon className="h-3 w-3" />}
              {c === "all" ? "Alle Kategorien" : CATEGORY_LABEL[c]}
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">
                {c === "all" ? tickets.length : tickets.filter((t) => t.category === c).length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Status filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "open", "in_progress", "resolved", "closed"] as FilterStatus[]).map((s) => (
          <button
            key={s}
            onMouseEnter={sound.hover}
            onClick={() => { sound.click(); setFilter(s); }}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              filter === s
                ? "border-purple-400 bg-purple-500/15 text-purple-200 shadow-[0_0_8px_rgba(168,85,247,0.35)]"
                : "border-white/10 text-zinc-400 hover:border-white/30"
            }`}
          >
            {s === "all" ? "Alle" : STATUS_LABEL[s as TicketStatus]}
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">{countFor(s)}</span>
          </button>
        ))}
        <button
          onMouseEnter={sound.hover}
          onClick={() => { sound.click(); load(); }}
          className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-400 hover:border-white/30"
        >
          <RefreshCw className="h-3 w-3" />
          Aktualisieren
        </button>
        <button
          onMouseEnter={sound.hover}
          onClick={() => { sound.click(); setShowDatePanel((v) => !v); }}
          className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition-colors ${showDatePanel ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-white/10 text-zinc-400 hover:border-red-500/30 hover:text-red-400"}`}
        >
          <CalendarRange className="h-3 w-3" />
          Zeitraum-Löschen
        </button>
      </div>

      {/* Zeitraum-Löschen Panel */}
      {showDatePanel && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-red-300 flex items-center gap-2">
              <CalendarRange className="h-4 w-4" />
              Tickets nach Zeitraum löschen
            </h4>
            <button onClick={() => setShowDatePanel(false)} className="text-zinc-500 hover:text-zinc-300">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-zinc-400">Erstellt vor:</label>
              <input
                type="date"
                value={dateBefore}
                onChange={(e) => { setDateBefore(e.target.value); setDateDeleteConfirm(false); }}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-red-400/60"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-zinc-400">Nur Status (leer = alle):</label>
              <div className="flex flex-wrap gap-1">
                {ALL_STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => toggleDateStatus(s)}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${
                      dateStatuses.includes(s)
                        ? STATUS_STYLE[s]
                        : "border-white/10 text-zinc-500 hover:border-white/30"
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {dateBefore && (
            <div className="mt-3 flex items-center gap-2">
              {!dateDeleteConfirm ? (
                <button
                  onClick={() => setDateDeleteConfirm(true)}
                  disabled={bulkDeleting}
                  className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                  Tickets löschen
                </button>
              ) : (
                <>
                  <button
                    onClick={handleDateRangeDelete}
                    disabled={bulkDeleting}
                    className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50"
                  >
                    {bulkDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    Wirklich löschen
                  </button>
                  <button
                    onClick={() => setDateDeleteConfirm(false)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    Abbrechen
                  </button>
                  <span className="text-[11px] text-red-400">
                    Alle Tickets vor {new Date(dateBefore).toLocaleDateString("de-DE")}
                    {dateStatuses.length > 0 ? ` mit Status: ${dateStatuses.map((s) => STATUS_LABEL[s]).join(", ")}` : ""}
                    {" "}werden gelöscht.
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bulk action toolbar */}
      {someSelected && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-purple-500/20 bg-purple-500/5 px-4 py-2.5">
          <span className="text-xs font-semibold text-purple-300">
            {selected.size} ausgewählt
          </span>
          <button
            onClick={toggleSelectAll}
            className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-400 hover:border-white/30"
          >
            {allDisplayedSelected ? "Alle abwählen" : "Alle auswählen"}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-400 hover:border-white/30"
          >
            <X className="h-3 w-3" />
          </button>
          <div className="ml-auto flex items-center gap-2">
            {bulkMessage && <span className="text-xs text-zinc-400">{bulkMessage}</span>}
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50"
            >
              {bulkDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              {selected.size} löschen
            </button>
          </div>
        </div>
      )}

      {/* Select all helper when nothing selected */}
      {!someSelected && displayed.length > 0 && !loading && (
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Square className="h-3.5 w-3.5" />
            Alle auswählen ({displayed.length})
          </button>
          {bulkMessage && <span className="text-xs text-zinc-400">{bulkMessage}</span>}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      )}

      {!loading && displayed.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] py-12 text-center">
          <MessageCircle className="h-8 w-8 text-zinc-700" />
          <p className="text-sm text-zinc-500">
            {filter === "all" ? "Noch keine Tickets vorhanden." : `Keine ${STATUS_LABEL[filter as TicketStatus]}-Tickets.`}
          </p>
        </div>
      )}

      {!loading && displayed.length > 0 && (
        <div className="flex flex-col gap-2">
          {displayed.map((ticket) => (
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              onUpdated={load}
              selected={selected.has(ticket.id)}
              onSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {loadError && !loading && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-200">
          Tabellen nicht gefunden. Führe einmalig{" "}
          <code className="rounded bg-black/40 px-1.5 py-0.5">node scripts/create-tickets.mjs</code> aus.
        </p>
      )}
    </div>
  );
}
