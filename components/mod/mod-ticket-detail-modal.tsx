"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Send, Loader2, MessageCircle, Clock, CheckCircle2, XCircle,
  Bug, Lightbulb, ArrowUpRight, Paperclip, NotepadText, Trophy,
  Coins, Trash2, PauseCircle, PlayCircle, CheckCheck, ChevronDown,
  ShieldAlert, User, Calendar, Tag, Zap,
} from "lucide-react";
import {
  getTicketMessages, modReplyToTicket, modUpdateTicketStatus,
  modSetTicketPriority, modDeleteTicket, modGrantTicketReward,
  modRemoveTicketReward, modPauseTicket, modEscalateTicket,
  modCloseTicket,
} from "@/lib/actions/mod";
import {
  addInternalNote, getInternalNotes, getTicketRewards,
  type InternalNote, type TicketReward,
} from "@/lib/actions/tickets";
import type { ModTicket, ModPermissions, TicketMessage } from "@/lib/mod";
import { createClient } from "@/lib/supabase/client";
import { useSoundManager } from "@/lib/sound-manager";

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  paused: "Pausiert",
  resolved: "Gelöst",
  closed: "Geschlossen",
};

const STATUS_STYLE: Record<string, string> = {
  open: "text-emerald-300 bg-emerald-500/15 border-emerald-500/40",
  in_progress: "text-blue-300 bg-blue-500/15 border-blue-500/40",
  paused: "text-slate-300 bg-slate-500/15 border-slate-500/40",
  resolved: "text-purple-300 bg-purple-500/15 border-purple-500/40",
  closed: "text-zinc-400 bg-zinc-500/15 border-zinc-500/40",
};

const STATUS_GLOW: Record<string, string> = {
  open: "shadow-[0_0_16px_rgba(52,211,153,0.4)]",
  in_progress: "shadow-[0_0_16px_rgba(96,165,250,0.4)]",
  paused: "shadow-[0_0_16px_rgba(148,163,184,0.3)]",
  resolved: "shadow-[0_0_16px_rgba(192,132,252,0.4)]",
  closed: "shadow-[0_0_12px_rgba(113,113,122,0.25)]",
};

const STATUS_DOT: Record<string, string> = {
  open: "bg-emerald-400",
  in_progress: "bg-blue-400",
  paused: "bg-slate-400",
  resolved: "bg-purple-400",
  closed: "bg-zinc-500",
};

const STATUS_ICONS: Record<string, typeof MessageCircle> = {
  open: MessageCircle,
  in_progress: Clock,
  paused: PauseCircle,
  resolved: CheckCircle2,
  closed: XCircle,
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "Niedrig",
  normal: "Normal",
  high: "Hoch",
  urgent: "Dringend",
};

const PRIORITY_STYLE: Record<string, string> = {
  low: "text-zinc-400 bg-zinc-500/10 border-zinc-500/30",
  normal: "text-blue-300 bg-blue-500/10 border-blue-500/30",
  high: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  urgent: "text-red-300 bg-red-500/15 border-red-500/40",
};

const PRIORITY_GLOW: Record<string, string> = {
  low: "",
  normal: "shadow-[0_0_10px_rgba(96,165,250,0.25)]",
  high: "shadow-[0_0_12px_rgba(245,158,11,0.35)]",
  urgent: "shadow-[0_0_16px_rgba(239,68,68,0.45)]",
};

const ALL_STATUSES = ["open", "in_progress", "paused", "resolved", "closed"] as const;
const ALL_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isImageUrl(url: string) {
  try {
    const p = new URL(url).pathname.toLowerCase();
    return /\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/.test(p);
  } catch {
    return /\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/i.test(url);
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatShort(iso: string) {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "gerade eben";
  if (m < 60) return `vor ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h}h`;
  return `vor ${Math.floor(h / 24)}d`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const Icon = STATUS_ICONS[status] ?? MessageCircle;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLE[status] ?? ""} ${STATUS_GLOW[status] ?? ""}`}>
      <Icon className="h-3 w-3" />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${PRIORITY_STYLE[priority] ?? ""} ${PRIORITY_GLOW[priority] ?? ""}`}>
      {PRIORITY_LABEL[priority] ?? priority}
    </span>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/[0.06] ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <div className="flex gap-2">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-7 w-20" />)}
      </div>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export interface ModTicketDetailModalProps {
  ticket: ModTicket;
  perms: ModPermissions;
  onClose: () => void;
  onUpdated: () => void;
}

export function ModTicketDetailModal({ ticket, perms, onClose, onUpdated }: ModTicketDetailModalProps) {
  const [mounted, setMounted] = useState(false);
  const [msgs, setMsgs] = useState<TicketMessage[]>([]);
  const [rewards, setRewards] = useState<TicketReward[]>([]);
  const [internalNotes, setInternalNotes] = useState<InternalNote[]>([]);
  const [loading, setLoading] = useState(true);

  const [liveStatus, setLiveStatus] = useState(ticket.status);
  const [livePriority, setLivePriority] = useState(ticket.priority ?? "normal");

  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [replyAttachFile, setReplyAttachFile] = useState<File | null>(null);
  const [statusChanging, setStatusChanging] = useState(false);
  const [priorityChanging, setPriorityChanging] = useState(false);
  const [statusFlash, setStatusFlash] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [showCloseForm, setShowCloseForm] = useState(false);

  const [showNotes, setShowNotes] = useState(false);
  const [showRewards, setShowRewards] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [rewardCredits, setRewardCredits] = useState(500);
  const [rewardNote, setRewardNote] = useState("");
  const [rewardDeferred, setRewardDeferred] = useState(true);
  const [rewarding, setRewarding] = useState(false);
  const [rewardMsg, setRewardMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const sound = useSoundManager();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const isClosed = liveStatus === "closed" || liveStatus === "resolved";
  const isPaused = liveStatus === "paused";
  const isActionable = !isClosed;
  const alreadyRewarded = !!ticket.rewardGrantedAt;
  const rewardIsPending = !alreadyRewarded && ticket.rewardPending;
  const totalRewards = rewards.reduce((s, r) => s + r.credits, 0);

  const CategoryIcon = ticket.category === "bug" ? Bug : Lightbulb;
  const categoryStyle = ticket.category === "bug"
    ? "border-orange-500/30 bg-orange-500/10 text-orange-300"
    : "border-amber-500/30 bg-amber-500/10 text-amber-300";

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loadData = useCallback(async () => {
    const [msgList, notes, rwd] = await Promise.all([
      getTicketMessages(ticket.id),
      getInternalNotes(ticket.id),
      getTicketRewards(ticket.id),
    ]);
    setMsgs(msgList);
    setInternalNotes(notes);
    setRewards(rwd);
    setLoading(false);
  }, [ticket.id]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    if (!loading && msgs.length) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    }
  }, [loading, msgs.length]);

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`mod-ticket-modal-${ticket.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public",
        table: "ticket_messages", filter: `ticket_id=eq.${ticket.id}`,
      }, () => void loadData())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [ticket.id, loadData]);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    let attachmentUrl: string | null = null;
    if (replyAttachFile) {
      const supabase = createClient();
      const ext = replyAttachFile.name.split(".").pop() ?? "bin";
      const { data: up, error: ue } = await supabase.storage
        .from("ticket-attachments")
        .upload(`mod-modal-${ticket.id}-${Date.now()}.${ext}`, replyAttachFile, { upsert: false });
      if (!ue && up) {
        const { data: ud } = supabase.storage.from("ticket-attachments").getPublicUrl(up.path);
        attachmentUrl = ud.publicUrl;
      }
    }
    await modReplyToTicket(ticket.id, reply.trim(), attachmentUrl);
    setReply("");
    setReplyAttachFile(null);
    await loadData();
    setSending(false);
    onUpdated();
  }

  async function handleStatusChange(s: string) {
    if (statusChanging || liveStatus === s) return;
    setStatusChanging(true);
    setLiveStatus(s);
    sound.click();
    await modUpdateTicketStatus(ticket.id, s);
    setStatusFlash(s);
    setTimeout(() => setStatusFlash(null), 1400);
    setStatusChanging(false);
    onUpdated();
  }

  async function handleClose() {
    setStatusChanging(true);
    sound.click();
    await modCloseTicket(ticket.id, closeReason.trim());
    setLiveStatus("closed");
    setShowCloseForm(false);
    setCloseReason("");
    setStatusFlash("closed");
    setTimeout(() => setStatusFlash(null), 1400);
    setStatusChanging(false);
    onUpdated();
  }

  async function handlePriorityChange(p: string) {
    if (priorityChanging || livePriority === p) return;
    setPriorityChanging(true);
    setLivePriority(p);
    sound.click();
    await modSetTicketPriority(ticket.id, p);
    setPriorityChanging(false);
    onUpdated();
  }

  async function handlePause() {
    setPausing(true);
    sound.click();
    const pausing_ = liveStatus !== "paused";
    const res = await modPauseTicket(ticket.id, pausing_);
    if (res.success) {
      setLiveStatus(pausing_ ? "paused" : "in_progress");
    }
    setPausing(false);
    onUpdated();
  }

  async function handleEscalate() {
    setEscalating(true);
    sound.click();
    await modEscalateTicket(ticket.id);
    setEscalating(false);
    onUpdated();
    onClose();
  }

  async function handleDelete() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 4000);
      return;
    }
    setDeleting(true);
    sound.click();
    await modDeleteTicket(ticket.id);
    onUpdated();
    onClose();
  }

  async function handleAddNote() {
    if (!newNote.trim()) return;
    setAddingNote(true);
    await addInternalNote(ticket.id, newNote.trim());
    setNewNote("");
    const notes = await getInternalNotes(ticket.id);
    setInternalNotes(notes);
    setAddingNote(false);
  }

  async function handleGrantReward() {
    if (rewardCredits < 1) return;
    setRewarding(true);
    sound.click();
    const max = perms.maxRewardPerTicket;
    const cr = max > 0 ? Math.min(rewardCredits, max) : rewardCredits;
    const res = await modGrantTicketReward(ticket.id, {
      credits: cr,
      note: rewardNote.trim() || undefined,
      deferred: rewardDeferred,
    });
    setRewarding(false);
    if (res.success) {
      sound.win?.();
      setRewardMsg({ text: `+${cr} CR ${rewardDeferred ? "angepinnt" : "sofort vergeben"}!`, ok: true });
      setRewardCredits(500);
      setRewardNote("");
      const rwd = await getTicketRewards(ticket.id);
      setRewards(rwd);
      onUpdated();
    } else {
      sound.error();
      setRewardMsg({ text: res.error ?? "Fehler.", ok: false });
    }
    setTimeout(() => setRewardMsg(null), 4000);
  }

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="mod-ticket-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[350] flex items-center justify-center p-3 sm:p-6"
        style={{ background: "rgba(0,0,0,0.9)", backdropFilter: "blur(6px)" }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.93, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: "spring", damping: 24, stiffness: 300 }}
          className="relative flex h-full max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/[0.08] shadow-[0_32px_100px_rgba(0,0,0,0.85)]"
          style={{ background: "linear-gradient(145deg, #0d0b1a 0%, #0a0a14 100%)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── HEADER ── */}
          <div
            className="relative flex shrink-0 flex-col gap-2 border-b border-white/[0.07] px-5 py-4"
            style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.10) 0%, rgba(139,92,246,0.06) 50%, transparent 100%)" }}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${categoryStyle}`}>
                <CategoryIcon className="h-4 w-4" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h2 className="text-lg font-black leading-tight text-zinc-50 break-words">{ticket.subject}</h2>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                  <User className="h-3 w-3" />
                  <span className="font-semibold text-zinc-300">{ticket.username}</span>
                  <span>·</span>
                  <Calendar className="h-3 w-3" />
                  <span>{formatDate(ticket.createdAt)}</span>
                  {ticket.escalatedToAdmin && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/40 bg-orange-500/15 px-2 py-0.5 font-bold text-orange-300">
                        <ShieldAlert className="h-2.5 w-2.5" />An Admin eskaliert
                      </span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <AnimatePresence mode="wait">
                <motion.div
                  key={liveStatus}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.18 }}
                >
                  <StatusPill status={liveStatus} />
                </motion.div>
              </AnimatePresence>
              <PriorityPill priority={livePriority} />
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${categoryStyle}`}>
                <CategoryIcon className="h-2.5 w-2.5" />
                {ticket.category === "bug" ? "Problem" : "Vorschlag"}
              </span>
              {rewards.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                  <Trophy className="h-2.5 w-2.5" />+{totalRewards.toLocaleString("de-DE")} CR
                </span>
              )}
              {statusFlash && (
                <motion.span
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1 text-[11px] font-bold text-emerald-400"
                >
                  <CheckCheck className="h-3.5 w-3.5" />Gespeichert
                </motion.span>
              )}
            </div>
          </div>

          {/* ── BODY ── */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* LEFT SIDEBAR */}
            <div className="flex w-68 shrink-0 flex-col overflow-y-auto border-r border-white/[0.06]" style={{ width: "17rem" }}>
              {/* Status controls */}
              {perms.canUpdateTicketStatus && (
                <div className="border-b border-white/[0.06] px-3 py-3">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Status ändern
                  </p>
                  <div className="flex flex-col gap-1">
                    {ALL_STATUSES.map((s) => {
                      const Icon = STATUS_ICONS[s] ?? MessageCircle;
                      const active = liveStatus === s;
                      return (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(s)}
                          disabled={statusChanging}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all duration-150 disabled:opacity-50 ${
                            active
                              ? `${STATUS_STYLE[s]} ${STATUS_GLOW[s]}`
                              : "border-white/[0.07] text-zinc-500 hover:border-white/20 hover:text-zinc-300"
                          }`}
                        >
                          {statusChanging && active
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Icon className="h-3 w-3" />}
                          {STATUS_LABEL[s]}
                          {active && <div className={`ml-auto h-1.5 w-1.5 rounded-full ${STATUS_DOT[s]}`} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Close with reason */}
              {perms.canCloseTickets && isActionable && (
                <div className="border-b border-white/[0.06] px-3 py-3">
                  <button
                    onClick={() => setShowCloseForm((v) => !v)}
                    className="flex w-full items-center gap-2 text-[11px] font-bold text-rose-400 transition-colors hover:text-rose-300"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Mit Begründung schließen
                    <ChevronDown className={`ml-auto h-3 w-3 transition-transform ${showCloseForm ? "rotate-180" : ""}`} />
                  </button>
                  <AnimatePresence>
                    {showCloseForm && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 flex flex-col gap-2">
                          <textarea
                            value={closeReason}
                            onChange={(e) => setCloseReason(e.target.value)}
                            rows={2}
                            maxLength={500}
                            placeholder="Schließgrund (optional)…"
                            className="resize-none rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-rose-400/40"
                          />
                          <button
                            onClick={handleClose}
                            disabled={statusChanging}
                            className="flex items-center justify-center gap-1.5 rounded-lg bg-rose-600/80 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-rose-500/80 disabled:opacity-50 transition-colors"
                          >
                            {statusChanging ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                            Schließen
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Pause/Resume */}
              {perms.canPauseTickets && isActionable && (
                <div className="border-b border-white/[0.06] px-3 py-3">
                  <button
                    onClick={handlePause}
                    disabled={pausing}
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                      isPaused
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                        : "border-slate-500/30 bg-slate-500/10 text-slate-300 hover:bg-slate-500/20"
                    }`}
                  >
                    {pausing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isPaused ? <PlayCircle className="h-3.5 w-3.5" /> : <PauseCircle className="h-3.5 w-3.5" />}
                    {isPaused ? "Fortsetzen" : "Pausieren"}
                  </button>
                </div>
              )}

              {/* Priority controls */}
              {perms.canSetTicketPriority && (
                <div className="border-b border-white/[0.06] px-3 py-3">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Priorität
                  </p>
                  <div className="flex flex-col gap-1">
                    {ALL_PRIORITIES.map((p) => {
                      const active = livePriority === p;
                      return (
                        <button
                          key={p}
                          onClick={() => handlePriorityChange(p)}
                          disabled={priorityChanging}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all duration-150 disabled:opacity-50 ${
                            active
                              ? `${PRIORITY_STYLE[p]} ${PRIORITY_GLOW[p]}`
                              : "border-white/[0.07] text-zinc-500 hover:border-white/20 hover:text-zinc-300"
                          }`}
                        >
                          {priorityChanging && active
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Tag className="h-3 w-3" />}
                          {PRIORITY_LABEL[p]}
                          {active && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Ticket original message */}
              <div className="border-b border-white/[0.06] px-3 py-3">
                <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-500">Nachricht</p>
                <p className="text-[11px] leading-relaxed text-zinc-300 whitespace-pre-wrap">{ticket.message}</p>
              </div>

              {/* Attachment */}
              {ticket.attachmentUrl && (
                <div className="border-b border-white/[0.06] px-3 py-3">
                  <p className="mb-1.5 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    <Paperclip className="h-3 w-3" />Anhang
                  </p>
                  {isImageUrl(ticket.attachmentUrl) ? (
                    <a href={ticket.attachmentUrl} target="_blank" rel="noopener noreferrer">
                      <img src={ticket.attachmentUrl} alt="Anhang" className="max-h-32 w-full rounded-lg object-cover border border-white/10 hover:opacity-90 transition-opacity cursor-pointer" />
                    </a>
                  ) : (
                    <a href={ticket.attachmentUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5 text-[11px] text-indigo-300 hover:bg-indigo-500/20 transition-colors">
                      <Paperclip className="h-3 w-3" />Datei öffnen
                    </a>
                  )}
                </div>
              )}

              {/* Closed info */}
              {(isClosed && ticket.closedAt) && (
                <div className="border-b border-white/[0.06] px-3 py-2">
                  <p className="text-[10px] text-zinc-600">
                    Geschlossen {formatShort(ticket.closedAt)}
                    {ticket.closedByUsername ? ` von ${ticket.closedByUsername}` : ""}
                  </p>
                </div>
              )}

              {/* Internal Notes */}
              <div className="border-b border-white/[0.06] px-3 py-3">
                <button
                  onClick={() => setShowNotes((v) => !v)}
                  className="flex w-full items-center gap-2 text-[11px] font-bold text-sky-400 transition-colors hover:text-sky-300"
                >
                  <NotepadText className="h-3.5 w-3.5" />
                  Interne Notizen
                  <span className="rounded-full bg-sky-500/20 px-1.5 py-0.5 text-[9px]">{internalNotes.length}</span>
                  <ChevronDown className={`ml-auto h-3 w-3 transition-transform ${showNotes ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence>
                  {showNotes && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 flex flex-col gap-2">
                        {internalNotes.length === 0 && (
                          <p className="text-[10px] text-zinc-600">Keine Notizen vorhanden.</p>
                        )}
                        {internalNotes.map((note) => (
                          <div key={note.id} className="rounded-lg border border-sky-500/15 bg-sky-500/5 px-2.5 py-2">
                            <p className="text-[9px] font-bold text-sky-400">
                              {note.username} · {formatShort(note.createdAt)}
                            </p>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-300">{note.note}</p>
                          </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <textarea
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            rows={2}
                            maxLength={1000}
                            placeholder="Notiz (nur Staff sichtbar)…"
                            className="flex-1 resize-none rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-sky-400/40"
                          />
                          <button
                            onClick={handleAddNote}
                            disabled={addingNote || !newNote.trim()}
                            className="self-end rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-[11px] font-bold text-sky-300 hover:bg-sky-500/20 disabled:opacity-50 transition-colors"
                          >
                            {addingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : "OK"}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Rewards */}
              {perms.canRewardTickets && (
                <div className="border-b border-white/[0.06] px-3 py-3">
                  <button
                    onClick={() => setShowRewards((v) => !v)}
                    className="flex w-full items-center gap-2 text-[11px] font-bold text-amber-400 transition-colors hover:text-amber-300"
                  >
                    <Trophy className="h-3.5 w-3.5" />
                    Belohnungen
                    {rewards.length > 0 && (
                      <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px]">
                        +{totalRewards.toLocaleString("de-DE")} CR
                      </span>
                    )}
                    <ChevronDown className={`ml-auto h-3 w-3 transition-transform ${showRewards ? "rotate-180" : ""}`} />
                  </button>
                  <AnimatePresence>
                    {showRewards && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 flex flex-col gap-2">
                          {rewards.map((r) => (
                            <div key={r.id} className="flex items-center gap-1.5 rounded-lg border border-amber-500/15 bg-amber-500/5 px-2.5 py-2 text-[10px]">
                              <div className="h-5 w-5 shrink-0 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-[8px] font-black text-amber-300">
                                {r.grantedByUsername.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-amber-200">+{r.credits.toLocaleString("de-DE")} CR</p>
                                {r.note && <p className="text-zinc-500 truncate">{r.note}</p>}
                              </div>
                              {r.paidAt ? (
                                <span className="shrink-0 rounded-full bg-emerald-500/15 border border-emerald-500/25 px-1.5 py-0.5 text-[8px] font-black text-emerald-400">✓</span>
                              ) : r.deferred ? (
                                <span className="shrink-0 rounded-full bg-amber-500/15 border border-amber-500/25 px-1.5 py-0.5 text-[8px] font-black text-amber-400">⏳</span>
                              ) : (
                                <span className="shrink-0 rounded-full bg-sky-500/15 border border-sky-500/25 px-1.5 py-0.5 text-[8px] font-black text-sky-400">⚡</span>
                              )}
                              {!r.paidAt && (
                                <button
                                  onClick={async () => {
                                    const res = await modRemoveTicketReward(r.id);
                                    if (res.success) {
                                      const rwd = await getTicketRewards(ticket.id);
                                      setRewards(rwd);
                                      onUpdated();
                                    }
                                  }}
                                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              )}
                            </div>
                          ))}

                          {!alreadyRewarded && (
                            <div className="space-y-2 pt-1">
                              <div className="flex gap-1 rounded-lg border border-white/8 bg-black/20 p-1">
                                <button
                                  onClick={() => setRewardDeferred(true)}
                                  className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[10px] font-bold transition-all ${rewardDeferred ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-zinc-500 hover:text-zinc-300"}`}
                                >
                                  ⏳ Abschluss
                                </button>
                                <button
                                  onClick={() => setRewardDeferred(false)}
                                  className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[10px] font-bold transition-all ${!rewardDeferred ? "bg-sky-500/20 text-sky-300 border border-sky-500/30" : "text-zinc-500 hover:text-zinc-300"}`}
                                >
                                  ⚡ Sofort
                                </button>
                              </div>
                              <div className="flex gap-1.5">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[9px] text-zinc-600 flex items-center gap-0.5"><Coins className="h-2.5 w-2.5" />Credits{perms.maxRewardPerTicket > 0 && ` (max ${perms.maxRewardPerTicket})`}</span>
                                  <input
                                    type="number" min={0}
                                    max={perms.maxRewardPerTicket > 0 ? perms.maxRewardPerTicket : undefined}
                                    value={rewardCredits}
                                    onChange={(e) => setRewardCredits(Math.max(0, Number(e.target.value)))}
                                    className="w-20 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-amber-400/40"
                                  />
                                </div>
                                <div className="flex flex-1 flex-col gap-0.5">
                                  <span className="text-[9px] text-zinc-600">Notiz</span>
                                  <input
                                    type="text" value={rewardNote}
                                    onChange={(e) => setRewardNote(e.target.value)}
                                    maxLength={100} placeholder="optional…"
                                    className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-400/40"
                                  />
                                </div>
                              </div>
                              <button
                                onClick={handleGrantReward}
                                disabled={rewarding || rewardCredits < 1}
                                className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold text-white transition-colors disabled:opacity-50 ${rewardDeferred ? "bg-amber-600 hover:bg-amber-500" : "bg-sky-600 hover:bg-sky-500"}`}
                              >
                                {rewarding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trophy className="h-3 w-3" />}
                                {rewardDeferred ? "Anpinnen" : "Sofort vergeben"}
                              </button>
                              {rewardMsg && (
                                <p className={`text-center text-[10px] font-semibold ${rewardMsg.ok ? "text-emerald-400" : "text-red-400"}`}>{rewardMsg.text}</p>
                              )}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Escalate */}
              {perms.canCloseTickets && !ticket.escalatedToAdmin && isActionable && (
                <div className="border-b border-white/[0.06] px-3 py-3">
                  <button
                    onClick={handleEscalate}
                    disabled={escalating}
                    className="flex w-full items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-bold text-orange-300 transition-colors hover:bg-orange-500/20 disabled:opacity-50"
                  >
                    {escalating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                    An Admin eskalieren
                  </button>
                </div>
              )}

              {/* Delete */}
              {perms.canDeleteTickets && (
                <div className="mt-auto border-t border-white/[0.06] px-3 py-3">
                  <button
                    onClick={handleDelete}
                    className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                      deleteConfirm
                        ? "border-red-500/50 bg-red-500/20 text-red-300"
                        : "border-white/10 text-zinc-600 hover:border-red-500/30 hover:text-red-400"
                    }`}
                  >
                    {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    {deleteConfirm ? "Wirklich löschen?" : "Ticket löschen"}
                  </button>
                </div>
              )}
            </div>

            {/* ── RIGHT: MESSAGES + REPLY ── */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {loading && <LoadingSkeleton />}

                {!loading && (
                  <div className="flex flex-col gap-4">
                    {msgs.length === 0 && (
                      <div className="flex flex-col items-center gap-2 py-16 text-center">
                        <MessageCircle className="h-10 w-10 text-zinc-700" />
                        <p className="text-sm text-zinc-600">Noch keine Antworten in diesem Ticket.</p>
                      </div>
                    )}

                    {msgs.map((msg, i) => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i * 0.04, 0.3) }}
                        className={`flex gap-3 ${msg.isStaff ? "flex-row-reverse" : "flex-row"}`}
                      >
                        {msg.avatarUrl ? (
                          <img src={msg.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full border border-white/10 object-cover" />
                        ) : (
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-black ${
                            msg.isStaff ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-200" : "bg-zinc-700/40 border-zinc-600/30 text-zinc-300"
                          }`}>
                            {msg.username.charAt(0).toUpperCase()}
                          </div>
                        )}

                        <div className={`max-w-[76%] flex flex-col gap-1 ${msg.isStaff ? "items-end" : "items-start"}`}>
                          <div className={`flex items-center gap-2 ${msg.isStaff ? "flex-row-reverse" : ""}`}>
                            <span className="text-[11px] font-semibold text-zinc-200">{msg.username}</span>
                            {msg.isStaff && (
                              <span className="rounded-full border border-indigo-500/30 bg-indigo-500/20 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-indigo-300">
                                Staff
                              </span>
                            )}
                            <span className="text-[10px] text-zinc-600">{timeAgo(msg.createdAt)}</span>
                          </div>
                          <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                            msg.isStaff
                              ? "rounded-tr-sm bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 border border-indigo-500/25 text-zinc-100"
                              : "rounded-tl-sm bg-white/[0.05] border border-white/[0.08] text-zinc-300"
                          }`}>
                            <p className="whitespace-pre-wrap">{msg.message}</p>
                            {msg.attachmentUrl && (
                              <div className="mt-2">
                                {isImageUrl(msg.attachmentUrl) ? (
                                  <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer">
                                    <img src={msg.attachmentUrl} alt="Anhang" className="max-h-52 rounded-lg object-cover cursor-pointer hover:opacity-90 border border-white/10 transition-opacity" />
                                  </a>
                                ) : (
                                  <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[10px] text-indigo-300 hover:bg-indigo-500/20">
                                    <Paperclip className="h-3 w-3" />Anhang öffnen
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Reply form */}
              {!isClosed ? (
                <div className="shrink-0 border-t border-white/[0.06] bg-black/20 px-5 py-4">
                  <form onSubmit={handleReply}>
                    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-indigo-300">
                      <Zap className="h-3.5 w-3.5" />Als Moderator antworten
                    </p>
                    <div className="flex gap-2">
                      <textarea
                        ref={replyRef}
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleReply(e as unknown as React.FormEvent);
                        }}
                        rows={3}
                        maxLength={2000}
                        placeholder="Antwort eingeben… (Ctrl+Enter zum Senden)"
                        className="flex-1 resize-none rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-indigo-400/50 transition-colors"
                      />
                      <div className="flex flex-col gap-1.5">
                        <label className="flex cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-zinc-400 transition hover:border-indigo-400/40 hover:text-zinc-200" title="Datei anhängen">
                          <Paperclip className="h-4 w-4" />
                          <input type="file" accept="image/*,video/*,.pdf" className="sr-only" onChange={(e) => setReplyAttachFile(e.target.files?.[0] ?? null)} />
                        </label>
                        <button
                          type="submit"
                          disabled={sending || !reply.trim()}
                          className="flex flex-1 items-center justify-center rounded-xl bg-indigo-600 px-3 py-2 text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                        >
                          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    {replyAttachFile && (
                      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-zinc-400">
                        <Paperclip className="h-3 w-3 text-indigo-400" />
                        <span className="truncate max-w-xs">{replyAttachFile.name}</span>
                        <button type="button" onClick={() => setReplyAttachFile(null)} className="ml-auto text-zinc-600 hover:text-red-400">×</button>
                      </div>
                    )}
                  </form>
                </div>
              ) : (
                <div className="shrink-0 border-t border-white/[0.06] bg-black/10 px-5 py-3 text-center text-[11px] text-zinc-600">
                  Dieses Ticket ist geschlossen. Status ändern, um wieder antworten zu können.
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
