"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  MessageCircle,
  X,
  Send,
  Bug,
  Lightbulb,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  Clock,
  CheckCheck,
  XCircle,
  Bot,
  Globe,
  GripHorizontal,
  Paperclip,
  Trophy,
  Shield,
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
  type TicketCategory,
} from "@/lib/actions/tickets";
import { useSoundManager } from "@/lib/sound-manager";
import { UserAiChat } from "@/components/ai/user-ai-chat";
import { GlobalChatPanel } from "@/components/global/global-chat-panel";
import { AdminAiChat } from "@/components/admin/admin-ai-chat";

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

type PanelView = "list" | "new" | "detail";
type Tab = "support" | "ai" | "chat" | "admin-ai";

const CATEGORY_META: Record<TicketCategory, { label: string; caption: string; icon: typeof Bug; placeholder: string }> = {
  bug: {
    label: "Problem melden",
    caption: "Etwas funktioniert nicht wie erwartet? Melde Bugs direkt an den Support.",
    icon: Bug,
    placeholder: "Details zum Problem — je mehr Infos, desto schneller können wir helfen…",
  },
  suggestion: {
    label: "Verbesserungsvorschlag",
    caption: "Du hast eine Idee? Schick sie den Admins.",
    icon: Lightbulb,
    placeholder: "Beschreibe deine Idee — was soll sich ändern oder neu dazukommen?",
  },
};

export function SupportButton() {
  return (
    <Suspense fallback={null}>
      <SupportButtonInner />
    </Suspense>
  );
}

function SupportButtonInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("support");
  const [view, setView] = useState<PanelView>("list");
  const [pendingOpenTicketId, setPendingOpenTicketId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const [category, setCategory] = useState<TicketCategory>("bug");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);
  const [userRole, setUserRole] = useState<string>("user");

  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const sound = useSoundManager();

  // Resize state
  const [panelW, setPanelW] = useState(352);
  const [panelH, setPanelH] = useState(560);
  const isResizing = useRef(false);
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    isResizing.current = true;
    resizeStart.current = { x: e.clientX, y: e.clientY, w: panelW, h: panelH };
    function onMove(ev: MouseEvent) {
      if (!isResizing.current) return;
      const dx = resizeStart.current.x - ev.clientX;
      const dy = resizeStart.current.y - ev.clientY;
      setPanelW(Math.max(320, Math.min(800, resizeStart.current.w + dx)));
      setPanelH(Math.max(460, Math.min(Math.floor(window.innerHeight * 0.93), resizeStart.current.h + dy)));
    }
    function onUp() {
      isResizing.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setVisible(false); return; }
      const { data: profile } = await supabase.from("profiles").select("support_banned, role").eq("id", user.id).single();
      setVisible(!profile?.support_banned);
      if (profile?.role) setUserRole(profile.role);
    });
  }, []);

  useEffect(() => {
    const id = searchParams.get("openTicket");
    if (id) setPendingOpenTicketId(id);
  }, [searchParams]);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    const result = await getUserTickets();
    setTickets(result);
    setLoading(false);
    return result;
  }, []);

  useEffect(() => {
    if (!pendingOpenTicketId || !visible) return;
    const ticketId = pendingOpenTicketId;
    setPendingOpenTicketId(null);
    setOpen(true);
    setTab("support");
    setLoading(true);
    getTicketDetail(ticketId).then((d) => {
      if (d) { setDetail(d); setView("detail"); }
      else { setView("list"); loadTickets(); }
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpenTicketId, visible]);

  function handleOpen() {
    setOpen(true);
    setView("list");
    loadTickets();
  }

  function openNew(cat: TicketCategory) {
    setCategory(cat);
    setView("new");
    setFormError(null);
    setFormSuccess(false);
  }

  async function openDetail(ticket: Ticket) {
    setView("detail");
    setLoading(true);
    const d = await getTicketDetail(ticket.id);
    setDetail(d);
    setLoading(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setAttachmentFile(file);
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setAttachmentPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setAttachmentPreview(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;
    setSubmitting(true);
    setFormError(null);

    let attachmentUrl: string | undefined;
    if (attachmentFile) {
      try {
        const supabase = createClient();
        const ext = attachmentFile.name.split(".").pop() ?? "bin";
        const path = `ticket-${Date.now()}.${ext}`;
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from("ticket-attachments")
          .upload(path, attachmentFile, { upsert: false });
        if (!uploadErr && uploadData) {
          const { data: urlData } = supabase.storage.from("ticket-attachments").getPublicUrl(uploadData.path);
          attachmentUrl = urlData.publicUrl;
        }
      } catch { /* ignore upload errors — ticket still created without attachment */ }
    }

    const res = await createTicket({
      subject: subject.trim(),
      description: description.trim(),
      category,
      attachmentUrl,
    });
    setSubmitting(false);
    if (res.success) {
      sound.save();
      setFormSuccess(true);
      setSubject("");
      setDescription("");
      setAttachmentFile(null);
      setAttachmentPreview(null);
      setTimeout(() => { setFormSuccess(false); setView("list"); loadTickets(); }, 2000);
    } else {
      sound.error();
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

  if (pathname?.startsWith("/world")) return null;
  if (!visible) return null;

  const isStaffUser = userRole === "admin" || userRole === "moderator";
  const TABS: { id: Tab; icon: typeof Bot; label: string }[] = [
    { id: "support",  icon: MessageCircle, label: "Support" },
    { id: "ai",       icon: Bot,           label: "KI" },
    { id: "chat",     icon: Globe,         label: "Chat" },
    ...(isStaffUser ? [{ id: "admin-ai" as Tab, icon: Shield, label: userRole === "admin" ? "Admin KI" : "Mod KI" }] : []),
  ];

  return (
    <>
      {!open && (
        <div className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
          <div className="flex flex-col items-center gap-2">
            {/* Pills centered above button */}
            <div className="pointer-events-none flex flex-col items-center gap-1 whitespace-nowrap">
              <span className="rounded-xl bg-purple-600 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-white shadow-[0_0_14px_rgba(147,51,234,0.75),0_2px_8px_rgba(0,0,0,0.4)]">
                Hilfe & Chat
              </span>
              <span className="rounded-xl border border-amber-400/40 bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.25)]">
                🏆 Gute Reports = Credits!
              </span>
            </div>
            <button
              onClick={handleOpen}
              title="Support, KI-Assistent & Global Chat"
              className="relative flex h-14 w-14 items-center justify-center rounded-full bg-purple-600 text-white shadow-[0_4px_20px_rgba(147,51,234,0.55)] transition-all hover:scale-110 hover:bg-purple-500 hover:shadow-[0_4px_30px_rgba(147,51,234,0.8)]"
            >
              <span className="absolute inset-0 animate-ping rounded-full bg-purple-400 opacity-10" />
              <MessageCircle className="h-6 w-6" />
            </button>
          </div>
        </div>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div
            className="fixed bottom-0 right-0 z-50 flex flex-col overflow-hidden border border-white/10 bg-[#0b0814] shadow-[0_8px_40px_rgba(0,0,0,0.65)] sm:bottom-6 sm:right-6 sm:rounded-2xl"
            style={{ width: panelW, height: panelH, maxHeight: "95vh", maxWidth: "100vw" }}
          >
            {/* Resize handle — drag to expand top-left */}
            <div
              onMouseDown={startResize}
              title="Größe ändern"
              className="absolute left-0 top-0 z-10 flex h-7 w-7 cursor-nw-resize items-center justify-center rounded-br-xl bg-white/[0.03] text-zinc-700 opacity-0 transition-opacity hover:opacity-100 hover:text-zinc-400"
              style={{ touchAction: "none" }}
            >
              <GripHorizontal className="h-3 w-3 rotate-45" />
            </div>

            {/* Header */}
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 shrink-0">
              {tab === "support" && (view === "new" || view === "detail") && (
                <button
                  onClick={() => { setView("list"); setDetail(null); setFormSuccess(false); setFormError(null); }}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              <span className="flex-1 text-sm font-bold text-zinc-100">
                {tab === "support" && view === "list" && "Support"}
                {tab === "support" && view === "new" && CATEGORY_META[category].label}
                {tab === "support" && view === "detail" && (detail?.subject ?? "Ticket")}
                {tab === "ai" && "KI-Assistent"}
                {tab === "chat" && "Global Chat"}
                {tab === "admin-ai" && (userRole === "admin" ? "Admin-Assistent" : "Mod-Assistent")}
              </span>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/10 shrink-0">
              {TABS.map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => { setTab(id); if (id === "support") loadTickets(); }}
                  className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-[11px] font-bold transition-colors ${
                    tab === id
                      ? "border-b-2 border-purple-400 text-purple-300"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className={`min-h-0 flex-1 overflow-hidden ${tab === "support" ? "overflow-y-auto" : "flex"}`}>

              {/* ── Support tab ── */}
              {tab === "support" && (
                <div className="flex flex-col">
                  {view === "list" && (
                    <>
                      {loading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>}
                      {!loading && tickets.length === 0 && (
                        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                          <MessageCircle className="h-8 w-8 text-zinc-700" />
                          <p className="text-sm text-zinc-500">Du hast noch keine Tickets.</p>
                        </div>
                      )}
                      {!loading && tickets.map((ticket) => {
                        const meta = CATEGORY_META[ticket.category];
                        const CatIcon = meta.icon;
                        return (
                          <button
                            key={ticket.id}
                            onClick={() => openDetail(ticket)}
                            className="flex flex-col gap-1.5 border-b border-white/[0.05] px-4 py-3 text-left transition-colors hover:bg-purple-500/[0.05] last:border-b-0"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="flex items-center gap-1.5 text-sm font-semibold leading-tight text-zinc-200">
                                <CatIcon className="h-3 w-3 shrink-0 text-zinc-500" />
                                {ticket.subject}
                              </p>
                              <StatusBadge status={ticket.status} />
                            </div>
                            <p className="text-[11px] text-zinc-500">
                              {new Date(ticket.updatedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                              {" · "}{ticket.messageCount} Nachricht{ticket.messageCount !== 1 ? "en" : ""}
                            </p>
                          </button>
                        );
                      })}
                      {/* Reward showcase — always visible in list */}
                      <div className="mx-3 my-3 overflow-hidden rounded-xl border border-amber-400/30 bg-amber-500/10">
                        <div className="flex items-center gap-2 border-b border-amber-400/20 px-3 py-2">
                          <Trophy className="h-4 w-4 text-amber-400 shrink-0" />
                          <span className="text-xs font-bold text-amber-300">Belohnungen für dein Feedback</span>
                        </div>
                        <div className="px-3 py-2.5 text-[11px] leading-relaxed text-amber-200/80">
                          Hilfreiche Problemmeldungen und gute Ideen werden vom Team mit individuellen <span className="font-bold text-amber-300">Credits-Belohnungen</span> honoriert — je detaillierter dein Report, desto größer die Chance!
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 border-t border-white/10 bg-white/[0.02] p-4">
                        {(Object.entries(CATEGORY_META) as [TicketCategory, typeof CATEGORY_META.bug][]).map(([cat, meta]) => {
                          const CatIcon = meta.icon;
                          return (
                            <div key={cat} className="flex flex-col gap-1.5">
                              <p className="text-[11px] leading-snug text-zinc-500">{meta.caption}</p>
                              <button
                                onClick={() => openNew(cat)}
                                className="flex items-center justify-center gap-2 rounded-lg border border-purple-400/30 bg-purple-500/10 px-3 py-2 text-xs font-bold text-purple-300 hover:bg-purple-500/20"
                              >
                                <CatIcon className="h-3.5 w-3.5" />
                                {meta.label}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {view === "new" && (
                    <form onSubmit={handleCreate} className="flex flex-col gap-3 p-4">
                      {/* Reward banner — prominent, before the form */}
                      <div className="overflow-hidden rounded-xl border border-amber-400/35 bg-gradient-to-r from-amber-500/15 to-amber-600/10 shadow-[0_0_16px_rgba(245,158,11,0.1)]">
                        <div className="flex items-center gap-2.5 px-3 pt-3 pb-1">
                          <Trophy className="h-5 w-5 text-amber-400 shrink-0" />
                          <span className="text-sm font-extrabold text-amber-300">Credits-Belohnung möglich!</span>
                        </div>
                        <p className="px-3 pb-3 text-[11px] leading-relaxed text-amber-200/75">
                          {category === "suggestion"
                            ? "Gute Verbesserungsideen werden vom Team mit individuellen Credits belohnt. Je konkreter dein Vorschlag, desto größer die Chance!"
                            : "Hilfreiche Bug-Reports helfen uns enorm — als Dankeschön gibt es individuelle Credits-Belohnungen für präzise Meldungen!"}
                        </p>
                      </div>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-zinc-400">Betreff</span>
                        <input
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          maxLength={120}
                          placeholder="Kurze Beschreibung…"
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
                          placeholder={CATEGORY_META[category].placeholder}
                          className="resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-400/60"
                        />
                      </label>
                      {/* File attachment */}
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-zinc-400">Screenshot / Anhang (optional)</span>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/15 bg-black/20 px-3 py-2 text-xs text-zinc-500 hover:border-purple-400/40 hover:text-zinc-300 transition-colors">
                          <Paperclip className="h-3.5 w-3.5 shrink-0" />
                          {attachmentFile ? attachmentFile.name : "Datei auswählen…"}
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={handleFileChange}
                            className="sr-only"
                          />
                        </label>
                        {attachmentPreview && (
                          <img src={attachmentPreview} alt="Vorschau" className="max-h-28 rounded-lg object-cover" />
                        )}
                      </div>
                      {formError && <p className="text-xs text-red-400">{formError}</p>}
                      {formSuccess && (
                        <p className="flex items-center gap-1.5 text-xs text-emerald-400">
                          <CheckCheck className="h-3.5 w-3.5" />
                          {category === "suggestion" ? "Vorschlag wurde gesendet!" : "Ticket wurde gesendet!"}
                        </p>
                      )}
                      <button
                        type="submit"
                        disabled={submitting || !subject.trim() || !description.trim()}
                        className="flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500 disabled:opacity-50"
                      >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {submitting ? "Wird gesendet…" : category === "suggestion" ? "Vorschlag senden" : "Ticket senden"}
                      </button>
                    </form>
                  )}

                  {view === "detail" && (
                    <div className="flex flex-col">
                      {loading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>}
                      {!loading && detail && (
                        <>
                          <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-2">
                            <StatusBadge status={detail.status} />
                            {detail.status !== "closed" && (
                              <button onClick={handleClose} className="text-[11px] text-zinc-500 hover:text-red-400">
                                Ticket schließen
                              </button>
                            )}
                          </div>
                          {/* Reward celebration banner */}
                          {detail.rewardGrantedAt && (
                            <div className="relative overflow-hidden border-b border-amber-400/30 bg-gradient-to-r from-amber-500/20 to-amber-600/10 px-4 py-3">
                              <div className="absolute inset-0 -translate-x-full animate-[mine-shimmer_3s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-amber-400/10 to-transparent" />
                              <div className="relative flex items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/20">
                                  <Trophy className="h-5 w-5 text-amber-400" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-sm font-extrabold text-amber-300">
                                    Belohnung erhalten!{detail.rewardCredits ? ` +${detail.rewardCredits} Credits` : ""}
                                  </span>
                                  <span className="text-[10px] text-amber-400/70">
                                    {detail.rewardNote ?? "Danke für dein wertvolles Feedback!"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                          <div className="border-b border-white/[0.05] bg-white/[0.02] px-4 py-3">
                            <p className="text-xs text-zinc-500">Deine Beschreibung:</p>
                            <p className="mt-1 text-sm leading-relaxed text-zinc-300">{detail.description}</p>
                            {detail.attachmentUrl && (
                              <a
                                href={detail.attachmentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 flex items-center gap-1.5 text-[11px] text-purple-400 hover:text-purple-300"
                              >
                                <Paperclip className="h-3 w-3" />
                                Anhang ansehen
                              </a>
                            )}
                          </div>
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
                                  className="flex items-center justify-center rounded-lg bg-purple-600 px-3 py-2 text-white hover:bg-purple-500 disabled:opacity-50"
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
              )}

              {/* ── AI tab ── */}
              {tab === "ai" && (
                <div className="h-full w-full">
                  <UserAiChat />
                </div>
              )}

              {/* ── Chat tab ── */}
              {tab === "chat" && (
                <div className="h-full w-full">
                  <GlobalChatPanel panelHeight={panelH} isStaff={userRole === "admin" || userRole === "moderator"} />
                </div>
              )}

              {/* ── Admin / Mod KI tab ── */}
              {tab === "admin-ai" && (
                <div className="h-full w-full overflow-y-auto p-4">
                  <AdminAiChat context={userRole === "admin" ? "admin" : "mod"} />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
