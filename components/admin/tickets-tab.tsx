"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  Trophy,
  Coins,
  ArrowUpRight,
  Paperclip,
  NotepadText,
  Search,
  PauseCircle,
  Maximize2,
} from "lucide-react";
import { TicketDetailModal } from "@/components/admin/ticket-detail-modal";
import {
  getAdminTickets,
  getTicketDetail,
  getTicketRewards,
  addTicketMessage,
  updateTicketStatus,
  setTicketPriority,
  deleteTicket,
  deleteTicketsBulk,
  deleteTicketsByDateRange,
  adminGrantTicketReward,
  adminRemoveTicketReward,
  addInternalNote,
  getInternalNotes,
  type Ticket,
  type TicketDetail,
  type TicketReward,
  type TicketStatus,
  type TicketCategory,
  type TicketPriority,
  type InternalNote,
} from "@/lib/actions/tickets";
import { createClient } from "@/lib/supabase/client";
import { useSoundManager } from "@/lib/sound-manager";

function isImageUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/.test(path);
  } catch {
    return /\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/i.test(url);
  }
}

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  paused: "Pausiert",
  resolved: "Gelöst",
  closed: "Geschlossen",
};

const STATUS_STYLE: Record<TicketStatus, string> = {
  open: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  in_progress: "text-blue-300 bg-blue-500/10 border-blue-500/30",
  paused: "text-slate-300 bg-slate-500/10 border-slate-500/30",
  resolved: "text-purple-300 bg-purple-500/10 border-purple-500/30",
  closed: "text-zinc-400 bg-zinc-500/10 border-zinc-500/30",
};

const STATUS_ICON: Record<TicketStatus, typeof MessageCircle> = {
  open: MessageCircle,
  in_progress: Clock,
  paused: PauseCircle,
  resolved: CheckCircle2,
  closed: XCircle,
};

const ALL_STATUSES: TicketStatus[] = ["open", "in_progress", "paused", "resolved", "closed"];
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
  autoExpand = false,
  onAutoExpanded,
  onOpenModal,
}: {
  ticket: Ticket;
  onUpdated: () => void;
  selected: boolean;
  onSelect: (id: string, value: boolean) => void;
  autoExpand?: boolean;
  onAutoExpanded?: () => void;
  onOpenModal: (ticket: Ticket) => void;
}) {
  const [expanded, setExpanded] = useState(autoExpand);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoExpand && !expanded) {
      setExpanded(true);
      onAutoExpanded?.();
      setTimeout(() => {
        rowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 250);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoExpand]);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  const [priorityChanging, setPriorityChanging] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showReward, setShowReward] = useState(false);
  const [rewardCredits, setRewardCredits] = useState(500);
  const [rewardNote, setRewardNote] = useState("");
  const [rewardDeferred, setRewardDeferred] = useState(true);
  const [rewarding, setRewarding] = useState(false);
  const [rewardMessage, setRewardMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [rewards, setRewards] = useState<TicketReward[]>([]);
  const [internalNotes, setInternalNotes] = useState<InternalNote[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [replyAttachFile, setReplyAttachFile] = useState<File | null>(null);
  const sound = useSoundManager();

  async function handleExpand() {
    sound.click();
    if (!expanded) {
      setExpanded(true);
      setLoadingDetail(true);
      const [d, rwd] = await Promise.all([
        getTicketDetail(ticket.id),
        getTicketRewards(ticket.id),
      ]);
      setDetail(d);
      setRewards(rwd);
      if (d?.internalNotes) setInternalNotes(d.internalNotes);
      setLoadingDetail(false);
    } else {
      setExpanded(false);
    }
  }

  async function handleAddNote() {
    if (!newNote.trim()) return;
    setAddingNote(true);
    const res = await addInternalNote(ticket.id, newNote.trim());
    setAddingNote(false);
    if (res.success) {
      setNewNote("");
      const notes = await getInternalNotes(ticket.id);
      setInternalNotes(notes);
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    let attachmentUrl: string | null = null;
    if (replyAttachFile) {
      const supabase = createClient();
      const ext = replyAttachFile.name.split(".").pop() ?? "bin";
      const filePath = `msg-${ticket.id}-${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("ticket-attachments")
        .upload(filePath, replyAttachFile, { upsert: false });
      if (!uploadError && uploadData) {
        const { data: urlData } = supabase.storage.from("ticket-attachments").getPublicUrl(uploadData.path);
        attachmentUrl = urlData.publicUrl;
      }
    }
    await addTicketMessage({ ticketId: ticket.id, message: reply.trim(), attachmentUrl });
    setReply("");
    setReplyAttachFile(null);
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

  async function handleGrantReward() {
    setRewarding(true);
    sound.click();
    const res = await adminGrantTicketReward(ticket.id, {
      credits: rewardCredits > 0 ? rewardCredits : undefined,
      note: rewardNote.trim() || undefined,
      deferred: rewardDeferred,
    });
    setRewarding(false);
    if (res.success) {
      sound.win?.();
      setRewardMessage({ text: `+${rewardCredits} Credits ${rewardDeferred ? "angepinnt" : "sofort vergeben"}!`, ok: true });
      setShowReward(false);
      setRewardCredits(500);
      setRewardNote("");
      const rwd = await getTicketRewards(ticket.id);
      setRewards(rwd);
      onUpdated();
    } else {
      sound.error();
      setRewardMessage({ text: res.error ?? "Fehler.", ok: false });
    }
    setTimeout(() => setRewardMessage(null), 4000);
  }

  return (
    <div ref={rowRef} className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <div className="flex items-center">
        {/* Checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(ticket.id, !selected); }}
          className="flex shrink-0 items-center justify-center self-stretch px-3 text-zinc-500 hover:text-purple-400 transition-colors"
          title={selected ? "Abwählen" : "Auswählen"}
        >
          {selected ? <CheckSquare className="h-4 w-4 text-purple-400" /> : <Square className="h-4 w-4" />}
        </button>

        {/* Main row button — single click = expand inline, double click = modal */}
        <button
          onClick={handleExpand}
          onDoubleClick={(e) => { e.stopPropagation(); onOpenModal(ticket); }}
          className="flex flex-1 min-w-0 items-center gap-3 py-3 pr-3 text-left hover:bg-white/[0.03] transition-colors"
        >
          <StatusBadge status={ticket.status} />
          <CategoryBadge category={ticket.category} />
          <PriorityBadge priority={ticket.priority ?? "normal"} />
          <div className="min-w-0 flex-1">
            {ticket.escalatedToAdmin && (
              <span className="mb-0.5 inline-flex items-center gap-1 rounded-full border border-orange-500/40 bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-300">
                <ArrowUpRight className="h-2.5 w-2.5" />
                An Admin weitergeleitet
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <p className="break-words text-sm font-semibold text-zinc-200">{ticket.subject}</p>
              {ticket.attachmentUrl && <Paperclip className="h-3 w-3 shrink-0 text-zinc-500" aria-label="Hat Anhang" />}
              {ticket.suggestionOutcome && (
                <span className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${
                  ticket.suggestionOutcome === "accepted"
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : "border-red-500/40 bg-red-500/15 text-red-300"
                }`}>
                  {ticket.suggestionOutcome === "accepted" ? "✓ Angenommen" : "✕ Abgelehnt"}
                </span>
              )}
            </div>
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

          {/* Vollbild-Modus */}
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onOpenModal(ticket); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onOpenModal(ticket); } }}
            title="Vollbild-Bearbeitung (Doppelklick)"
            className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[10px] font-bold text-zinc-500 transition-colors hover:border-purple-500/40 hover:text-purple-400"
          >
            <Maximize2 className="h-3 w-3" />
          </span>

          {/* Delete button */}
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
              <div className="flex flex-col gap-3 px-4 py-3">
                {detail.messages.length === 0 && (
                  <p className="text-center text-xs text-zinc-600">Noch keine Nachrichten.</p>
                )}
                {detail.messages.map((msg) => (
                  <div key={msg.id} className={`flex gap-2.5 ${msg.isStaff ? "flex-row-reverse" : "flex-row"}`}>
                    {/* Avatar */}
                    {msg.avatarUrl ? (
                      <img src={msg.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full border border-white/10 object-cover" />
                    ) : (
                      <div className={`h-7 w-7 shrink-0 rounded-full border flex items-center justify-center text-[10px] font-black ${
                        msg.isStaff ? "bg-purple-500/20 border-purple-500/40 text-purple-200" : "bg-zinc-700/40 border-zinc-600/30 text-zinc-300"
                      }`}>
                        {msg.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                    {/* Bubble */}
                    <div className={`max-w-[78%] flex flex-col gap-0.5 ${msg.isStaff ? "items-end" : "items-start"}`}>
                      <div className={`flex items-center gap-1.5 ${msg.isStaff ? "flex-row-reverse" : ""}`}>
                        <span className="text-[11px] font-semibold text-zinc-200">{msg.username}</span>
                        {msg.isStaff && (
                          <span className="rounded-full bg-purple-500/20 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-purple-300 border border-purple-500/30">
                            Staff
                          </span>
                        )}
                        <span className="text-[10px] text-zinc-600">
                          {new Date(msg.createdAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className={`rounded-2xl px-3 py-2 text-sm ${
                        msg.isStaff ? "rounded-tr-sm bg-purple-500/15 border border-purple-500/20 text-zinc-100" : "rounded-tl-sm bg-white/[0.05] border border-white/8 text-zinc-300"
                      }`}>
                        <p className="leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                        {msg.attachmentUrl && (
                          <div className="mt-1.5">
                            {isImageUrl(msg.attachmentUrl) ? (
                              <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer">
                                <img src={msg.attachmentUrl} alt="Anhang" className="max-h-48 rounded-lg object-cover cursor-pointer hover:opacity-90 border border-white/10" />
                              </a>
                            ) : (
                              <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2 py-1 text-[10px] text-purple-300 hover:bg-purple-500/20">
                                <Paperclip className="h-3 w-3" /> Anhang öffnen
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
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
                    <div className="flex flex-col gap-1.5">
                      <label className="flex cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-zinc-400 transition hover:border-purple-400/40 hover:text-zinc-200" title="Anhang hinzufügen">
                        <Paperclip className="h-4 w-4" />
                        <input type="file" accept="image/*,video/*,.pdf" className="sr-only" onChange={(e) => setReplyAttachFile(e.target.files?.[0] ?? null)} />
                      </label>
                      <button
                        type="submit"
                        disabled={sending || !reply.trim()}
                        className="flex items-center justify-center rounded-lg bg-purple-600 px-2 py-1.5 text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
                      >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  {replyAttachFile && (
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-zinc-400">
                      <Paperclip className="h-3 w-3 text-purple-400" />
                      <span className="truncate max-w-[200px]">{replyAttachFile.name}</span>
                      <button type="button" onClick={() => setReplyAttachFile(null)} className="ml-auto text-zinc-600 hover:text-red-400">×</button>
                    </div>
                  )}
                </form>
              )}

              {/* Attachment — inline preview for images, link for other files */}
              {detail.attachmentUrl && (
                <div className="border-t border-white/[0.06] px-4 py-3">
                  <p className="mb-1.5 text-[11px] font-semibold text-zinc-500 flex items-center gap-1">
                    <Paperclip className="h-3 w-3" />
                    Anhang
                  </p>
                  {isImageUrl(detail.attachmentUrl) ? (
                    <a href={detail.attachmentUrl} target="_blank" rel="noopener noreferrer">
                      <img
                        src={detail.attachmentUrl}
                        alt="Anhang"
                        className="max-h-56 rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity border border-white/10"
                      />
                    </a>
                  ) : (
                    <a
                      href={detail.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-[11px] text-purple-300 hover:bg-purple-500/20 transition-colors"
                    >
                      <Paperclip className="h-3 w-3" />
                      Datei öffnen
                    </a>
                  )}
                </div>
              )}

              {/* Reward section */}
              <div className="border-t border-white/[0.06] px-4 py-3 space-y-3">
                {/* Reward history */}
                {rewards.length > 0 && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-amber-500/15 px-3 py-2">
                      <Trophy className="h-3.5 w-3.5 text-amber-400" />
                      <span className="text-[11px] font-black text-amber-300">Belohnungen</span>
                      <span className="ml-auto text-[10px] text-amber-500 font-bold">
                        Gesamt: +{rewards.reduce((s, r) => s + r.credits, 0).toLocaleString("de-DE")} CR
                      </span>
                    </div>
                    <div className="flex flex-col divide-y divide-white/5">
                      {rewards.map((r) => (
                        <div key={r.id} className="flex items-center gap-2 px-3 py-2">
                          {r.grantedByAvatarUrl ? (
                            <img src={r.grantedByAvatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full border border-white/10 object-cover" />
                          ) : (
                            <div className="h-5 w-5 shrink-0 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-[8px] font-black text-amber-300">
                              {r.grantedByUsername.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="text-[10px] text-zinc-500">{r.grantedByUsername}</span>
                          <span className="text-[11px] font-extrabold text-amber-200">+{r.credits.toLocaleString("de-DE")} CR</span>
                          {r.note && <span className="text-[10px] text-zinc-500 truncate">— {r.note}</span>}
                          <div className="ml-auto flex items-center gap-1.5 shrink-0">
                            {r.paidAt ? (
                              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/25 px-1.5 py-0.5 text-[8px] font-black text-emerald-400">✓ ausgezahlt</span>
                            ) : r.deferred ? (
                              <span className="rounded-full bg-amber-500/15 border border-amber-500/25 px-1.5 py-0.5 text-[8px] font-black text-amber-400">⏳ bei Abschluss</span>
                            ) : (
                              <span className="rounded-full bg-sky-500/15 border border-sky-500/25 px-1.5 py-0.5 text-[8px] font-black text-sky-400">⚡ sofort</span>
                            )}
                            {!r.paidAt && (
                              <button
                                onClick={async () => {
                                  const res = await adminRemoveTicketReward(r.id);
                                  if (res.success) {
                                    const rwd = await getTicketRewards(ticket.id);
                                    setRewards(rwd);
                                    onUpdated();
                                  } else setRewardMessage({ text: res.error ?? "Fehler.", ok: false });
                                }}
                                className="flex h-5 w-5 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                                title="Belohnung entfernen"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Legacy fallback banners */}
                {rewards.length === 0 && detail.rewardGrantedAt && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                    <Trophy className="h-3.5 w-3.5 shrink-0" />
                    Belohnung ausgezahlt{detail.rewardCredits ? ` · +${detail.rewardCredits} Credits` : ""}
                    {detail.rewardNote && <span className="text-amber-400/70"> — {detail.rewardNote}</span>}
                  </div>
                )}
                {rewards.length === 0 && detail.rewardPending && !detail.rewardGrantedAt && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-[11px]">
                    <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-400 animate-pulse" />
                    <span className="font-bold text-amber-300">
                      Belohnung angepinnt{detail.rewardCredits ? ` · +${detail.rewardCredits} Credits` : ""}
                    </span>
                    {detail.rewardNote && <span className="text-amber-400/70"> — {detail.rewardNote}</span>}
                    <span className="ml-auto rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                      Wird bei Lösung ausgezahlt
                    </span>
                  </div>
                )}

                {/* Add new reward */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShowReward((v) => !v)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                      showReward ? "border-amber-500/40 bg-amber-500/15 text-amber-300" : "border-white/10 text-zinc-500 hover:border-amber-500/30 hover:text-amber-400"
                    }`}
                  >
                    <Trophy className="h-3.5 w-3.5" />
                    {rewards.length > 0 ? "Weitere Belohnung" : "Belohnung vergeben"}
                  </button>
                  {rewardMessage && (
                    <span className={`text-[11px] ${rewardMessage.ok ? "text-emerald-400" : "text-red-400"}`}>{rewardMessage.text}</span>
                  )}
                </div>

                {showReward && (
                  <div className="rounded-xl border border-amber-500/25 bg-gradient-to-b from-amber-500/8 to-transparent p-3 space-y-3">
                    {/* Auszahlungstyp toggle */}
                    <div className="flex gap-1.5 rounded-xl border border-white/8 bg-black/20 p-1">
                      <button
                        onClick={() => setRewardDeferred(true)}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-bold transition-all ${
                          rewardDeferred ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        ⏳ Bei Abschluss
                      </button>
                      <button
                        onClick={() => setRewardDeferred(false)}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-bold transition-all ${
                          !rewardDeferred ? "bg-sky-500/20 text-sky-300 border border-sky-500/30" : "text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        ⚡ Sofort auszahlen
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-zinc-500 flex items-center gap-1"><Coins className="h-3 w-3" /> Credits</span>
                        <input
                          type="number" min={0} value={rewardCredits}
                          onChange={(e) => setRewardCredits(Math.max(0, Number(e.target.value)))}
                          className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-amber-400/40"
                        />
                      </div>
                      <div className="flex flex-1 flex-col gap-1">
                        <span className="text-[10px] text-zinc-500">Notiz (optional)</span>
                        <input
                          type="text" value={rewardNote} onChange={(e) => setRewardNote(e.target.value)}
                          maxLength={100} placeholder="z.B. Super Bug-Report!"
                          className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-400/40"
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleGrantReward}
                      disabled={rewarding || rewardCredits < 1}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-colors disabled:opacity-50 ${
                        rewardDeferred ? "bg-amber-600 hover:bg-amber-500" : "bg-sky-600 hover:bg-sky-500"
                      }`}
                    >
                      {rewarding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trophy className="h-3.5 w-3.5" />}
                      {rewardDeferred ? "Anpinnen" : "Sofort vergeben"}
                    </button>
                  </div>
                )}
              </div>

              {/* Internal notes */}
              <div className="border-t border-white/[0.06] px-4 py-3">
                <button
                  onClick={() => setShowNotes((v) => !v)}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-sky-400 hover:text-sky-300 transition-colors"
                >
                  <NotepadText className="h-3.5 w-3.5" />
                  Interne Notizen ({internalNotes.length})
                  <ChevronDown className={`h-3 w-3 transition-transform ${showNotes ? "rotate-180" : ""}`} />
                </button>
                {showNotes && (
                  <div className="mt-2 flex flex-col gap-2">
                    {internalNotes.length === 0 && (
                      <p className="text-[11px] text-zinc-600">Noch keine internen Notizen für dieses Ticket.</p>
                    )}
                    {internalNotes.map((note) => (
                      <div key={note.id} className="rounded-lg border border-sky-500/15 bg-sky-500/5 px-3 py-2">
                        <p className="text-[10px] font-bold text-sky-400">
                          {note.username} · {new Date(note.createdAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-zinc-300">{note.note}</p>
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <textarea
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        rows={2}
                        maxLength={1000}
                        placeholder="Interne Notiz hinzufügen (nur für Staff sichtbar)…"
                        className="flex-1 resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-sky-400/40"
                      />
                      <button
                        onClick={handleAddNote}
                        disabled={addingNote || !newNote.trim()}
                        className="flex shrink-0 items-center gap-1 self-end rounded-lg border border-sky-500/30 bg-sky-500/15 px-3 py-1.5 text-[11px] font-bold text-sky-300 hover:bg-sky-500/25 disabled:opacity-50 transition-colors"
                      >
                        {addingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : "Speichern"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type FilterStatus = TicketStatus | "all" | "escalated";
type FilterCategory = TicketCategory | "all";

export function TicketsTab({
  openTicketId,
  onTicketOpened,
}: {
  openTicketId?: string | null;
  onTicketOpened?: () => void;
}) {
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
  // auto-open a specific ticket from deep-link / notification click
  const [autoOpenId, setAutoOpenId] = useState<string | null>(openTicketId ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const [modalTicket, setModalTicket] = useState<Ticket | null>(null);
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

  // Realtime: refresh on any ticket INSERT/UPDATE
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-tickets-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tickets" }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tickets" }, () => load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a notification-linked ticket is found, open it in the modal
  useEffect(() => {
    if (autoOpenId && tickets.length > 0) {
      const target = tickets.find((t) => t.id === autoOpenId);
      if (target) {
        setAutoOpenId(null);
        setModalTicket(target);
        onTicketOpened?.();
      }
    }
  }, [autoOpenId, tickets, onTicketOpened]);

  const byCategory = categoryFilter === "all" ? tickets : tickets.filter((t) => t.category === categoryFilter);
  const byStatus = filter === "escalated"
    ? byCategory.filter((t) => t.escalatedToAdmin)
    : filter === "all" ? byCategory : byCategory.filter((t) => t.status === filter);
  const displayed = searchQuery.trim()
    ? byStatus.filter((t) =>
        t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.username.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : byStatus;

  const countFor = (s: FilterStatus) =>
    s === "escalated" ? byCategory.filter((t) => t.escalatedToAdmin).length
    : s === "all" ? byCategory.length : byCategory.filter((t) => t.status === s).length;

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
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tickets suchen (Betreff, Nutzer)…"
          className="w-full rounded-xl border border-white/10 bg-black/30 py-2 pl-9 pr-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-400/50"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

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
        {(["all", "open", "in_progress", "paused", "resolved", "closed", "escalated"] as FilterStatus[]).map((s) => (
          <button
            key={s}
            onMouseEnter={sound.hover}
            onClick={() => { sound.click(); setFilter(s); }}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              filter === s
                ? s === "escalated"
                  ? "border-orange-400 bg-orange-500/15 text-orange-200 shadow-[0_0_8px_rgba(249,115,22,0.35)]"
                  : "border-purple-400 bg-purple-500/15 text-purple-200 shadow-[0_0_8px_rgba(168,85,247,0.35)]"
                : "border-white/10 text-zinc-400 hover:border-white/30"
            }`}
          >
            {s === "escalated" && <ArrowUpRight className="h-3 w-3" />}
            {s === "all" ? "Alle" : s === "escalated" ? "Weitergeleitet" : STATUS_LABEL[s as TicketStatus]}
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
              autoExpand={false}
              onOpenModal={setModalTicket}
            />
          ))}
        </div>
      )}

      {modalTicket && (
        <TicketDetailModal
          ticket={modalTicket}
          onClose={() => setModalTicket(null)}
          onUpdated={load}
        />
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
