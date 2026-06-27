"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Loader2, MessageSquare, Crown, Shield, Zap, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getGlobalChatMessages, sendGlobalChatMessage, clearGlobalChat, type GlobalChatMessage } from "@/lib/actions/global-chat";
import { useSoundManager } from "@/lib/sound-manager";
import { BadgePill } from "@/components/ui/badge-pill";
import { PrioBadgeRow } from "@/components/ui/prio-badge-row";
import { badgeRank } from "@/lib/badges";
import { StyledUsername } from "@/components/ui/styled-username";
import { useFineConfig } from "@/lib/fine-config-context";

const ROLE_BADGE: Record<string, { label: string; color: string } | undefined> = {
  admin:     { label: "Admin", color: "text-amber-300" },
  moderator: { label: "Mod",   color: "text-sky-300"   },
  system:    { label: "System",color: "text-purple-300" },
};

const ROLE_ICON: Record<string, typeof Crown | undefined> = {
  admin:     Crown,
  moderator: Shield,
  system:    Zap,
};

const ROLE_AVATAR_RING: Record<string, string> = {
  admin:     "ring-amber-400/60",
  moderator: "ring-sky-400/60",
  user:      "ring-white/10",
};

const ROLE_INITIAL_BG: Record<string, string> = {
  admin:     "bg-amber-500/20 text-amber-300",
  moderator: "bg-sky-500/20 text-sky-300",
  user:      "bg-zinc-700 text-zinc-300",
};

function pickDisplayBadge(badges: string[], role: string): string | null {
  // If role is admin or moderator, prefer the matching badge regardless
  if (role === "admin" && badges.includes("admin")) return "admin";
  if (role === "moderator" && badges.includes("mod")) return "mod";

  // Highest-priority owned badge by the canonical site-wide order (badgeRank),
  // so this fallback agrees with resolveDisplayBadges everywhere else. Only
  // used when a user has no prio_badges set at all.
  if (badges.length === 0) return null;
  return [...badges].sort((a, b) => badgeRank(a) - badgeRank(b))[0] ?? null;
}


function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function UserAvatar({ avatarUrl, username, role, size = 22 }: {
  avatarUrl: string | null;
  username: string;
  role: string;
  size?: number;
}) {
  const ring = ROLE_AVATAR_RING[role] ?? ROLE_AVATAR_RING.user;
  const initBg = ROLE_INITIAL_BG[role] ?? ROLE_INITIAL_BG.user;
  const initial = username.charAt(0).toUpperCase();

  return (
    <div
      className={`shrink-0 rounded-full ring-1 overflow-hidden ${ring}`}
      style={{ width: size, height: size, minWidth: size }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={username} className="h-full w-full object-cover" />
      ) : (
        <div className={`flex h-full w-full items-center justify-center text-[9px] font-bold ${initBg}`}>
          {initial}
        </div>
      )}
    </div>
  );
}

interface CurrentUser {
  id: string;
  username: string;
  avatarUrl: string | null;
  role: string;
}

interface GlobalChatPanelProps {
  panelHeight?: number;
  isStaff?: boolean;
}

export function GlobalChatPanel({ panelHeight, isStaff = false }: GlobalChatPanelProps) {
  const fineConfig = useFineConfig();
  const [messages, setMessages] = useState<GlobalChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = useRef(createClient());
  const sound = useSoundManager();
  // Tracks the ID of an optimistic (not-yet-confirmed) message so appendMessage can replace it
  const pendingOptimisticRef = useRef<string | null>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const latestIdRef = useRef<string | null>(null);

  // Fetch current user profile for optimistic messages
  useEffect(() => {
    const client = supabase.current;
    client.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      client
        .from("profiles")
        .select("username, avatar_url, role")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setCurrentUser({
              id: user.id,
              username: data.username as string,
              avatarUrl: (data.avatar_url as string | null) ?? null,
              role: (data.role as string) ?? "user",
            });
          }
        });
    });
  }, []);

  useEffect(() => {
    getGlobalChatMessages(fineConfig.chatMaxHistory).then((msgs) => {
      setMessages(msgs);
      if (msgs.length > 0) latestIdRef.current = msgs[msgs.length - 1].id;
      setLoading(false);
      setTimeout(scrollToBottom, 50);
    });
  }, [scrollToBottom]); // intentionally excludes chatMaxHistory — re-running would reset the chat

  const appendMessage = useCallback((row: Record<string, unknown>) => {
    const id = row.id as string;
    // Capture the optimistic ID before the state update
    const optId = pendingOptimisticRef.current;
    const metadata = (row.metadata as Record<string, unknown>) ?? null;
    const badges = metadata?.badges as string[] | undefined;
    const prioBadges = metadata?.prio_badges as string[] | undefined;
    const nameStyleKey = metadata?.name_style_key as string | undefined;

    setMessages((prev) => {
      // Remove the optimistic placeholder if present
      const cleaned = optId ? prev.filter((m) => m.id !== optId) : prev;
      // Dedup: don't add if real message already present
      if (cleaned.some((m) => m.id === id)) return cleaned;
      return [
        ...cleaned,
        {
          id,
          userId: row.user_id as string | null,
          username: row.username as string,
          role: (row.role as string) ?? "user",
          content: row.content as string,
          isSystem: (row.is_system as boolean) ?? false,
          metadata,
          createdAt: row.created_at as string,
          avatarUrl: (row.avatar_url as string) ?? null,
          badges: Array.isArray(badges) ? badges : undefined,
          prioBadges: Array.isArray(prioBadges) ? prioBadges : undefined,
          nameStyleKey,
        },
      ];
    });

    // Clear the optimistic ref once the real message landed
    if (optId) pendingOptimisticRef.current = null;
    latestIdRef.current = id;
    setTimeout(scrollToBottom, 30);
  }, [scrollToBottom]);

  useEffect(() => {
    const client = supabase.current;
    const channel = client
      .channel("global-chat-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "global_chat_messages" },
        (payload) => appendMessage(payload.new as Record<string, unknown>)
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "global_chat_messages" },
        () => {
          getGlobalChatMessages(fineConfig.chatMaxHistory).then((msgs) => {
            setMessages(msgs);
            if (msgs.length > 0) latestIdRef.current = msgs[msgs.length - 1].id;
          });
        }
      )
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [appendMessage]);

  // Polling fallback
  useEffect(() => {
    const poll = setInterval(async () => {
      const fresh = await getGlobalChatMessages(fineConfig.chatMaxHistory);
      if (fresh.length === 0) {
        setMessages([]);
        return;
      }
      const newestId = fresh[fresh.length - 1].id;
      if (newestId === latestIdRef.current) return;
      setMessages((prev) => {
        // Remove any stale optimistic messages on poll sync
        const withoutOptimistic = pendingOptimisticRef.current
          ? prev.filter((m) => m.id !== pendingOptimisticRef.current)
          : prev;
        const existingIds = new Set(withoutOptimistic.map((m) => m.id));
        const added = fresh.filter((m) => !existingIds.has(m.id));
        if (added.length === 0 && fresh.length < withoutOptimistic.length) {
          latestIdRef.current = newestId;
          return fresh;
        }
        if (added.length === 0) return withoutOptimistic;
        latestIdRef.current = newestId;
        return [...withoutOptimistic, ...added];
      });
      setTimeout(scrollToBottom, 30);
    }, fineConfig.chatPollIntervalMs);
    return () => clearInterval(poll);
  }, [scrollToBottom, fineConfig.chatPollIntervalMs, fineConfig.chatMaxHistory]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const text = input.trim();

    setError(null);
    setInput(""); // clear input immediately — feels instant
    sound.click();

    // Optimistic: show message right away if we know the user
    if (currentUser) {
      const tempId = `__opt_${Date.now()}`;
      pendingOptimisticRef.current = tempId;
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          userId: currentUser.id,
          username: currentUser.username,
          role: currentUser.role,
          content: text,
          isSystem: false,
          metadata: null,
          createdAt: new Date().toISOString(),
          avatarUrl: currentUser.avatarUrl,
          // No badges or name style on optimistic — the real message will carry the snapshot
          nameStyleKey: undefined,
        },
      ]);
      setTimeout(scrollToBottom, 30);
    }

    setSending(true);
    const res = await sendGlobalChatMessage(text);
    setSending(false);

    if (!res.success) {
      if (pendingOptimisticRef.current) {
        const optId = pendingOptimisticRef.current;
        pendingOptimisticRef.current = null;
        setMessages((prev) => prev.filter((m) => m.id !== optId));
      }
      setInput(text);
      sound.error();
      setError(res.error ?? "Fehler.");
    } else {
      // Eagerly resolve the optimistic — don't rely on realtime alone (can be delayed or miss).
      // Realtime will dedup via the existingIds check in appendMessage when it fires.
      const optId = pendingOptimisticRef.current;
      pendingOptimisticRef.current = null;
      const fresh = await getGlobalChatMessages(fineConfig.chatMaxHistory);
      if (fresh.length > 0) {
        latestIdRef.current = fresh[fresh.length - 1].id;
        setMessages((prev) => {
          const withoutOpt = optId ? prev.filter((m) => m.id !== optId) : prev;
          const existingIds = new Set(withoutOpt.map((m) => m.id));
          const added = fresh.filter((m) => !existingIds.has(m.id));
          return added.length > 0 ? [...withoutOpt, ...added] : withoutOpt;
        });
        setTimeout(scrollToBottom, 30);
      }
    }
  }

  async function handleClear() {
    if (!clearConfirm) {
      setClearConfirm(true);
      setTimeout(() => setClearConfirm(false), 4000);
      return;
    }
    setClearing(true);
    setClearConfirm(false);
    sound.click();
    const res = await clearGlobalChat();
    setClearing(false);
    if (res.success) {
      sound.win?.();
      setMessages([]);
    } else {
      sound.error();
      setError(res.error ?? "Fehler beim Leeren.");
      setTimeout(() => setError(null), 3000);
    }
  }

  const msgAreaStyle = panelHeight
    ? { height: panelHeight - 44 - 40 - 56 }
    : undefined;

  return (
    <div className="flex flex-col h-full bg-black/[0.18] backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/[0.08] bg-white/[0.03] px-4 py-2.5 shrink-0">
        <MessageSquare className="h-3.5 w-3.5 text-purple-400" />
        <span className="text-xs font-bold text-zinc-300">Global Chat</span>
        <span className="ml-auto h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
        {isStaff && (
          <button
            onClick={handleClear}
            disabled={clearing}
            title={clearConfirm ? "Wirklich leeren?" : "Chat leeren"}
            className={`ml-2 flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition-colors ${
              clearConfirm
                ? "border-red-500/60 bg-red-500/20 text-red-300 hover:bg-red-500/30"
                : "border-white/10 text-zinc-500 hover:border-red-500/40 hover:text-red-400"
            } disabled:opacity-50`}
          >
            {clearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            {clearConfirm ? "Wirklich?" : ""}
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto chat-scroll px-3 py-2 space-y-0.5 min-h-0"
        style={msgAreaStyle}
      >
        {loading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <p className="text-center text-xs text-zinc-600 py-6">Noch keine Nachrichten. Seid die Ersten!</p>
        )}
        {messages.map((msg) => {
          const isOptimistic = msg.id.startsWith("__opt_");
          const isSystemMsg = msg.isSystem;
          const badge = ROLE_BADGE[msg.role];
          const RoleIcon = ROLE_ICON[msg.role];

          if (isSystemMsg) {
            const meta = msg.metadata;
            const rarity = (meta?.rarity as string) ?? "";
            const msgType = (meta?.type as string) ?? "";
            const isClear = msgType === "chat_clear";
            const isReward = msgType === "ticket_reward";
            return (
              <div key={msg.id} className="flex justify-center chat-msg-enter">
                <span
                  className={`chat-sys-msg ${
                    isClear
                      ? "bg-zinc-800/30 text-zinc-600 border-zinc-700/25"
                      : isReward
                      ? "bg-amber-500/10 text-amber-300/90 border-amber-400/25"
                      : rarity === "ultra"
                      ? "bg-fuchsia-500/10 text-fuchsia-300/90 border-fuchsia-500/20"
                      : rarity === "mythisch"
                      ? "bg-purple-500/10 text-purple-300/90 border-purple-500/20"
                      : "bg-blue-500/8 text-blue-300/80 border-blue-500/15"
                  }`}
                >
                  {msg.content}
                </span>
              </div>
            );
          }

          const isSpecial = msg.role === "admin" || msg.role === "moderator";
          const displayBadge = msg.badges && msg.badges.length > 0
            ? pickDisplayBadge(msg.badges, msg.role)
            : null;

          return (
            <div
              key={msg.id}
              className={`chat-msg-enter group flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-white/[0.03] ${
                isSpecial ? "hover:bg-amber-500/[0.04]" : ""
              } ${isOptimistic ? "opacity-50" : ""}`}
            >
              <div className="shrink-0">
                <UserAvatar avatarUrl={msg.avatarUrl} username={msg.username} role={msg.role} size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 leading-none">
                  {RoleIcon && (
                    <RoleIcon className={`h-2.5 w-2.5 shrink-0 ${badge?.color ?? "text-zinc-400"}`} />
                  )}
                  <span className={`text-[10px] font-bold truncate max-w-[110px] ${badge?.color ?? "text-zinc-300"}`}>
                    <StyledUsername name={msg.username} styleKey={msg.nameStyleKey} size="sm" userId={msg.userId} />
                  </span>
                  {badge && msg.role !== "user" && (
                    <span className={`text-[9px] opacity-55 shrink-0 ${badge.color}`}>({badge.label})</span>
                  )}
                  {msg.prioBadges && msg.prioBadges.length > 0
                    ? <PrioBadgeRow badgeKeys={msg.prioBadges} size="xs" max={2} />
                    : displayBadge && <BadgePill badgeKey={displayBadge} />
                  }
                  <span className="text-[9px] text-zinc-600 ml-auto shrink-0 tabular-nums">
                    {isOptimistic ? "…" : formatTime(msg.createdAt)}
                  </span>
                </div>
                <p className="text-[11px] leading-snug text-zinc-300/90 break-words mt-0.5">{msg.content}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/[0.08] bg-white/[0.02] p-2.5 shrink-0">
        {error && <p className="mb-1.5 text-[10px] text-red-400">{error}</p>}
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={fineConfig.chatMaxMessageLength}
            placeholder="Nachricht an alle…"
            className="min-w-0 flex-1 rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-400/60 focus:bg-white/[0.09] transition-colors"
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
