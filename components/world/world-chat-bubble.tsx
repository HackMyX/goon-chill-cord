"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, X, ChevronDown, Send, Maximize2, Minimize2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getGlobalChatMessages, sendGlobalChatMessage, type GlobalChatMessage } from "@/lib/actions/global-chat";
import { useSoundManager } from "@/lib/sound-manager";
import { StyledUsername } from "@/components/ui/styled-username";

const MAX_DISPLAY = 50;
const DEFAULT_W = 320;
const DEFAULT_H = 420;
const MIN_W = 240;
const MAX_W = 560;
const MIN_H = 300;
const MAX_H = 640;
const EXPANDED_W = 460;
const EXPANDED_H = 560;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function rawToMsg(r: Record<string, unknown>): GlobalChatMessage {
  const meta = r.metadata as Record<string, unknown> | null;
  return {
    id: r.id as string,
    userId: r.user_id as string | null,
    username: (r.username as string) ?? "Anon",
    role: (r.role as string) ?? "user",
    content: r.content as string,
    isSystem: (r.is_system as boolean) ?? false,
    metadata: meta,
    createdAt: r.created_at as string,
    avatarUrl: (r.avatar_url as string) ?? null,
    nameStyleKey: (meta?.name_style_key as string) ?? undefined,
  };
}

export function WorldChatBubble({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<GlobalChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sound = useSoundManager();

  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 768 || ("ontouchstart" in window)); }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Resize state
  const [width, setWidth] = useState(DEFAULT_W);
  const [height, setHeight] = useState(DEFAULT_H);
  const dragStart = useRef<{ mx: number; my: number; w: number; h: number } | null>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
  }, []);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    getGlobalChatMessages(MAX_DISPLAY).then((msgs) => {
      if (!cancelled) setMessages(msgs);
    });
    return () => { cancelled = true; };
  }, []);

  // Realtime subscription — global_chat_messages INSERT
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("world-chat-bubble-v2")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "global_chat_messages" },
        (payload) => {
          const row = rawToMsg(payload.new as Record<string, unknown>);
          setMessages((prev) => {
            const next = [...prev, row];
            return next.length > MAX_DISPLAY ? next.slice(next.length - MAX_DISPLAY) : next;
          });
          if (!open) {
            setUnread((n) => n + 1);
            sound.tick();
          } else {
            scrollToBottom();
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, sound, scrollToBottom]);

  // Auto-scroll and clear unread when opened
  useEffect(() => {
    if (open) {
      setUnread(0);
      scrollToBottom();
    }
  }, [open, scrollToBottom]);

  // Handle expand/collapse toggle
  function toggleExpand() {
    sound.click();
    setExpanded((v) => {
      const next = !v;
      setWidth(next ? EXPANDED_W : DEFAULT_W);
      setHeight(next ? EXPANDED_H : DEFAULT_H);
      return next;
    });
    scrollToBottom();
  }

  // Resize drag
  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragStart.current = { mx: e.clientX, my: e.clientY, w: width, h: height };

    function onMove(ev: MouseEvent) {
      if (!dragStart.current) return;
      const dx = dragStart.current.mx - ev.clientX; // dragging left → grows
      const dy = dragStart.current.my - ev.clientY; // dragging up → grows
      setWidth(Math.min(MAX_W, Math.max(MIN_W, dragStart.current.w + dx)));
      setHeight(Math.min(MAX_H, Math.max(MIN_H, dragStart.current.h + dy)));
    }
    function onUp() {
      dragStart.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [width, height]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    sound.click();
    const res = await sendGlobalChatMessage(text);
    setSending(false);
    if (!res.success) {
      setInput(text);
      sound.error();
    } else {
      // Ensure message is visible immediately — don't wait for realtime alone
      const fresh = await getGlobalChatMessages(MAX_DISPLAY);
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const added = fresh.filter((m) => !existingIds.has(m.id));
        if (added.length === 0) return prev;
        const next = [...prev, ...added];
        return next.length > MAX_DISPLAY ? next.slice(next.length - MAX_DISPLAY) : next;
      });
      scrollToBottom();
    }
  }

  const panelW = open ? width : "auto";

  // On mobile: position top-right to avoid overlap with game controls (joystick bottom-left, action buttons bottom-right)
  const mobileStyle: React.CSSProperties = isMobile
    ? { position: "absolute", top: "70px", right: "12px", zIndex: 50, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }
    : { position: "absolute", bottom: "80px", right: "16px", zIndex: 50, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" };

  return (
    <div
      className="pointer-events-auto"
      style={mobileStyle}
    >
      {open && (
        <div
          className="flex flex-col rounded-2xl border border-white/[0.09] bg-black/[0.42] shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
          style={{
            width: typeof panelW === "number" ? `${panelW}px` : panelW,
            height: `${height}px`,
            position: "relative",
            transition: dragStart.current ? "none" : "width 0.2s ease, height 0.2s ease",
          }}
        >
          {/* Resize handle — top-left corner */}
          <div
            onMouseDown={onResizeMouseDown}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "22px",
              height: "22px",
              cursor: "nw-resize",
              zIndex: 10,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "flex-start",
              padding: "4px",
            }}
            title="Größe ändern"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 9L9 1M1 5L5 1M5 9L9 5" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>

          {/* Header */}
          <div className="flex shrink-0 items-center justify-between rounded-t-2xl border-b border-white/10 px-3 py-2.5 pl-6">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold text-zinc-200">Global Chat</span>
              <span className="text-[10px] text-zinc-600 font-medium">({messages.length} Nachrichten)</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleExpand}
                title={expanded ? "Kleiner" : "Größer"}
                className="rounded-lg p-1 text-zinc-500 hover:text-zinc-200 transition-colors hover:bg-white/5"
              >
                {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => { sound.click(); setOpen(false); }}
                className="rounded-lg p-1 text-zinc-500 hover:text-zinc-200 transition-colors hover:bg-white/5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto chat-scroll px-3 py-2 space-y-1 min-h-0">
            {messages.length === 0 && (
              <p className="text-center text-[10px] text-zinc-600 py-6">Noch keine Nachrichten — schreib als Erster!</p>
            )}
            {messages.map((msg) => {
              if (msg.isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center chat-msg-enter">
                    <span className={`chat-sys-msg ${
                      (msg.metadata?.rarity as string) === "ultra"
                        ? "bg-fuchsia-500/10 text-fuchsia-300/90 border-fuchsia-500/20"
                        : (msg.metadata?.rarity as string) === "mythisch"
                        ? "bg-purple-500/10 text-purple-300/90 border-purple-500/20"
                        : "bg-blue-500/8 text-blue-300/80 border-blue-500/15"
                    }`}>
                      {msg.content}
                    </span>
                  </div>
                );
              }
              return (
                <div key={msg.id} className="chat-msg-enter flex items-center gap-2 rounded-lg px-1.5 py-0.5 hover:bg-white/[0.03] transition-colors">
                  <div className="shrink-0">
                    {msg.avatarUrl ? (
                      <img src={msg.avatarUrl} alt="" className="h-5 w-5 rounded-full object-cover ring-1 ring-white/10" />
                    ) : (
                      <div className="h-5 w-5 rounded-full bg-purple-500/25 flex items-center justify-center text-[8px] font-bold text-purple-300">
                        {(msg.username ?? "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 leading-none">
                      <span className="text-[10px] font-bold shrink-0 truncate max-w-[100px]">
                        <StyledUsername
                          name={msg.username ?? "Anon"}
                          styleKey={msg.nameStyleKey}
                          userId={msg.userId}
                          size="sm"
                          staticMode
                        />
                      </span>
                      <span className="text-[9px] text-zinc-600 shrink-0 tabular-nums ml-auto">{formatTime(msg.createdAt)}</span>
                    </div>
                    <p className="text-[11px] text-zinc-200/90 break-words leading-snug mt-0.5">{msg.content}</p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex shrink-0 gap-1.5 rounded-b-2xl border-t border-white/[0.07] bg-black/[0.2] p-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder="Nachricht an alle…"
              maxLength={200}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-400/60 focus:bg-white/8 transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="flex items-center justify-center rounded-xl bg-purple-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40 hover:bg-purple-500 transition-colors shadow-[0_0_10px_rgba(147,51,234,0.4)]"
            >
              {sending ? <span className="animate-pulse">…</span> : <Send className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => { sound.click(); setOpen((o) => !o); }}
        onMouseEnter={sound.hover}
        className="relative flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/75 text-zinc-300 shadow-[0_4px_24px_rgba(0,0,0,0.7)] backdrop-blur-md transition-all hover:border-purple-400/70 hover:text-purple-300 hover:shadow-[0_0_20px_rgba(168,85,247,0.45)] active:scale-95"
      >
        {open ? <ChevronDown className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-purple-500 text-[9px] font-black text-white shadow-[0_0_10px_rgba(168,85,247,0.8)] animate-bounce">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </div>
  );
}
