"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare, X, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getGlobalChatMessages, sendGlobalChatMessage, type GlobalChatMessage } from "@/lib/actions/global-chat";
import { useSoundManager } from "@/lib/sound-manager";
import { StyledUsername } from "@/components/ui/styled-username";

const MAX_DISPLAY = 6;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function rawToMsg(r: Record<string, unknown>): GlobalChatMessage {
  return {
    id: r.id as string,
    userId: r.user_id as string | null,
    username: (r.username as string) ?? "Anon",
    role: (r.role as string) ?? "user",
    content: r.content as string,
    isSystem: (r.is_system as boolean) ?? false,
    metadata: null,
    createdAt: r.created_at as string,
    avatarUrl: (r.avatar_url as string) ?? null,
  };
}

export function WorldChatBubble({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<GlobalChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sound = useSoundManager();

  useEffect(() => {
    let cancelled = false;
    getGlobalChatMessages(MAX_DISPLAY).then((msgs) => {
      if (!cancelled) setMessages(msgs);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("world-chat-bubble")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "global_chat_messages" },
        (payload) => {
          const row = rawToMsg(payload.new as Record<string, unknown>);
          setMessages((prev) => [...prev.slice(-(MAX_DISPLAY - 1)), row]);
          if (!open) {
            setUnread((n) => n + 1);
            sound.tick();
          } else {
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }, 50);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, sound]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 80);
    }
  }, [open]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    const res = await sendGlobalChatMessage(text);
    setSending(false);
    if (!res.success) setInput(text);
  }

  return (
    <div
      className="pointer-events-auto"
      style={{
        position: "absolute",
        bottom: "80px",
        right: "16px",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "8px",
      }}
    >
      {open && (
        <div
          className="flex flex-col rounded-2xl border border-white/10 bg-black/80 shadow-[0_8px_40px_rgba(0,0,0,0.7)] backdrop-blur-md"
          style={{ width: "280px", maxHeight: "340px" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between rounded-t-2xl border-b border-white/10 px-3 py-2">
            <span className="text-xs font-bold text-zinc-200">Global Chat</span>
            <button
              onClick={() => setOpen(false)}
              className="rounded-full p-0.5 text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5" style={{ minHeight: "120px", maxHeight: "220px" }}>
            {messages.length === 0 && (
              <p className="text-center text-[10px] text-zinc-600 py-4">Noch keine Nachrichten</p>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className="flex gap-2">
                <div className="shrink-0 mt-0.5">
                  {msg.avatarUrl ? (
                    <img src={msg.avatarUrl} alt="" className="h-4 w-4 rounded-full object-cover" />
                  ) : (
                    <div className="h-4 w-4 rounded-full bg-purple-500/30 flex items-center justify-center text-[7px] font-bold text-purple-300">
                      {(msg.username ?? "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <span className="text-[9px] font-bold mr-1">
                    <StyledUsername
                      name={msg.username ?? "Anon"}
                      styleKey={msg.nameStyleKey}
                      userId={msg.userId}
                      size="sm"
                      staticMode
                    />
                  </span>
                  <span className="text-[9px] text-zinc-500">{formatTime(msg.createdAt)}</span>
                  <p className="text-[11px] text-zinc-200 break-words leading-tight mt-0.5">{msg.content}</p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex gap-1.5 rounded-b-2xl border-t border-white/10 p-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Nachricht…"
              maxLength={200}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-400/60"
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 hover:bg-purple-500 transition-colors"
            >
              {sending ? "…" : "↑"}
            </button>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => { sound.click(); setOpen((o) => !o); }}
        onMouseEnter={sound.hover}
        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/70 text-zinc-300 shadow-[0_4px_20px_rgba(0,0,0,0.6)] backdrop-blur-md transition-all hover:border-purple-400/60 hover:text-purple-300 hover:shadow-[0_0_18px_rgba(168,85,247,0.4)]"
      >
        {open ? <ChevronDown className="h-4.5 w-4.5" /> : <MessageSquare className="h-4.5 w-4.5" />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-purple-500 text-[9px] font-bold text-white shadow-[0_0_8px_rgba(168,85,247,0.7)]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </div>
  );
}
