"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Loader2, MessageSquare, Crown, Shield, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getGlobalChatMessages, sendGlobalChatMessage, type GlobalChatMessage } from "@/lib/actions/global-chat";
import { useSoundManager } from "@/lib/sound-manager";

const ROLE_BADGE: Record<string, { label: string; color: string } | undefined> = {
  admin:     { label: "Admin", color: "text-amber-300" },
  moderator: { label: "Mod", color: "text-sky-300" },
  system:    { label: "System", color: "text-purple-300" },
};

const ROLE_ICON: Record<string, typeof Crown | undefined> = {
  admin:     Crown,
  moderator: Shield,
  system:    Zap,
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function GlobalChatPanel() {
  const [messages, setMessages] = useState<GlobalChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = useRef(createClient());
  const sound = useSoundManager();

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    getGlobalChatMessages(60).then((msgs) => {
      setMessages(msgs);
      setLoading(false);
      setTimeout(scrollToBottom, 50);
    });
  }, [scrollToBottom]);

  useEffect(() => {
    const client = supabase.current;
    const channel = client
      .channel("global-chat-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "global_chat_messages" },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          setMessages((prev) => [
            ...prev,
            {
              id: row.id as string,
              userId: row.user_id as string | null,
              username: row.username as string,
              role: (row.role as string) ?? "user",
              content: row.content as string,
              isSystem: (row.is_system as boolean) ?? false,
              metadata: (row.metadata as Record<string, unknown>) ?? null,
              createdAt: row.created_at as string,
            },
          ]);
          setTimeout(scrollToBottom, 30);
        }
      )
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [scrollToBottom]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    setError(null);
    sound.click();
    const res = await sendGlobalChatMessage(input.trim());
    setSending(false);
    if (res.success) {
      setInput("");
    } else {
      sound.error();
      setError(res.error ?? "Fehler.");
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5 shrink-0">
        <MessageSquare className="h-3.5 w-3.5 text-purple-400" />
        <span className="text-xs font-bold text-zinc-300">Global Chat</span>
        <span className="ml-auto h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 min-h-0">
        {loading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <p className="text-center text-xs text-zinc-600 py-6">Noch keine Nachrichten. Seid die Ersten!</p>
        )}
        {messages.map((msg) => {
          const isSystemMsg = msg.isSystem;
          const badge = ROLE_BADGE[msg.role];
          const RoleIcon = ROLE_ICON[msg.role];

          if (isSystemMsg) {
            const meta = msg.metadata;
            const rarity = (meta?.rarity as string) ?? "";
            return (
              <div
                key={msg.id}
                className={`rounded-lg px-3 py-2 text-xs text-center font-semibold ${
                  rarity === "ultra"
                    ? "bg-amber-500/15 text-amber-200 border border-amber-500/30"
                    : rarity === "mythisch"
                    ? "bg-purple-500/15 text-purple-200 border border-purple-500/30"
                    : "bg-blue-500/10 text-blue-200 border border-blue-500/20"
                }`}
              >
                {msg.content}
              </div>
            );
          }

          return (
            <div key={msg.id} className="flex items-start gap-2 group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {RoleIcon && <RoleIcon className={`h-3 w-3 shrink-0 ${badge?.color ?? "text-zinc-400"}`} />}
                  <span className={`text-[10px] font-bold truncate ${badge?.color ?? "text-zinc-300"}`}>
                    {msg.username}
                    {badge && <span className="ml-1 opacity-60">({badge.label})</span>}
                  </span>
                  <span className="text-[9px] text-zinc-600 ml-auto shrink-0">
                    {formatTime(msg.createdAt)}
                  </span>
                </div>
                <p className="text-xs leading-snug text-zinc-300 break-words mt-0.5">{msg.content}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/10 p-2.5 shrink-0">
        {error && <p className="mb-1.5 text-[10px] text-red-400">{error}</p>}
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={500}
            placeholder="Nachricht an alle…"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-400/60"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="flex items-center justify-center rounded-lg bg-purple-600 px-3 py-2 text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </form>
      </div>
    </div>
  );
}
