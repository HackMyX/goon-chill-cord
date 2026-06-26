"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  Send,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getGlobalChatMessages,
  sendGlobalChatMessage,
  type GlobalChatMessage,
} from "@/lib/actions/global-chat";
import { BadgePill } from "@/components/ui/badge-pill";
import { StyledUsername } from "@/components/ui/styled-username";
import { useSoundManager } from "@/lib/sound-manager";
import type { HomepageChatConfig } from "@/lib/homepage-chat-config-types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const LS_KEY = "homepage_chat_open";
const COOLDOWN_MS = 2000;

const ROLE_INITIAL_BG: Record<string, string> = {
  admin: "bg-amber-500/20 text-amber-300",
  moderator: "bg-sky-500/20 text-sky-300",
  user: "bg-zinc-700 text-zinc-300",
};

const ROLE_AVATAR_RING: Record<string, string> = {
  admin: "ring-amber-400/60",
  moderator: "ring-sky-400/60",
  user: "ring-white/10",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 10) return "gerade";
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getBlurClass(intensity: string): string {
  const map: Record<string, string> = {
    none: "",
    sm: "backdrop-blur-sm",
    md: "backdrop-blur-md",
    lg: "backdrop-blur-lg",
    xl: "backdrop-blur-xl",
    "2xl": "backdrop-blur-2xl",
  };
  return map[intensity] ?? "backdrop-blur-md";
}

function getFontClass(size: string): string {
  const map: Record<string, string> = {
    xs: "text-xs",
    sm: "text-sm",
    md: "text-base",
  };
  return map[size] ?? "text-xs";
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function UserAvatar({
  avatarUrl,
  username,
  role,
  size = 28,
}: {
  avatarUrl: string | null;
  username: string;
  role: string;
  size?: number;
}) {
  const ring = ROLE_AVATAR_RING[role] ?? ROLE_AVATAR_RING.user;
  const initBg = ROLE_INITIAL_BG[role] ?? ROLE_INITIAL_BG.user;

  return (
    <div
      className={`shrink-0 rounded-full ring-1 overflow-hidden ${ring}`}
      style={{ width: size, height: size, minWidth: size }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={username}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center text-[9px] font-bold ${initBg}`}
        >
          {username.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Message row
// ─────────────────────────────────────────────────────────────────────────────

function highlightMentions(content: string, ownUsername: string | null): React.ReactNode {
  if (!ownUsername) return content;
  const mention = `@${ownUsername.toLowerCase()}`;
  const lower = content.toLowerCase();
  if (!lower.includes(mention)) return content;

  const parts: React.ReactNode[] = [];
  let rest = content;
  while (true) {
    const idx = rest.toLowerCase().indexOf(mention);
    if (idx === -1) break;
    if (idx > 0) parts.push(rest.slice(0, idx));
    parts.push(
      <span
        key={parts.length}
        className="rounded bg-purple-500/25 px-0.5 font-semibold text-purple-300"
      >
        {rest.slice(idx, idx + mention.length)}
      </span>
    );
    rest = rest.slice(idx + mention.length);
  }
  if (rest) parts.push(rest);
  return <>{parts}</>;
}

function MessageRow({
  msg,
  config,
  animate: doAnimate,
  ownUsername,
}: {
  msg: GlobalChatMessage;
  config: HomepageChatConfig;
  animate: boolean;
  ownUsername: string | null;
}) {
  const isOptimistic = msg.id.startsWith("__opt_");
  const fontCls = getFontClass(config.fontSize);

  if (msg.isSystem) {
    const meta = msg.metadata;
    const msgType = (meta?.type as string) ?? "";
    const rarity = (meta?.rarity as string) ?? "";
    const isClear = msgType === "chat_clear";
    const isReward = msgType === "ticket_reward";

    const content = (
      <div
        className={`rounded-lg border pl-3 pr-3 py-2 ${fontCls} my-1 text-center font-semibold ${
          isClear
            ? "bg-zinc-800/60 text-zinc-500 border-zinc-700/50"
            : isReward
            ? "bg-amber-500/15 text-amber-200 border-amber-400/40"
            : rarity === "ultra"
            ? "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-500/30"
            : rarity === "mythisch"
            ? "bg-purple-500/15 text-purple-200 border-purple-500/30"
            : "bg-blue-500/10 text-blue-200 border-blue-500/20"
        }`}
      >
        {msg.content}
      </div>
    );

    if (doAnimate) {
      return (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25 }}
        >
          {content}
        </motion.div>
      );
    }
    return content;
  }

  const badges = msg.metadata?.badges as string[] | undefined;
  const nameStyleKey = msg.metadata?.name_style_key as string | undefined;
  const displayBadges = config.showBadges && badges && badges.length > 0
    ? badges.slice(0, config.maxBadgeCount)
    : [];

  const inner = (
    <div
      className={`flex items-start gap-1.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.025] transition-colors ${
        isOptimistic ? "opacity-60" : ""
      } ${config.compactMode ? "py-0.5" : ""}`}
    >
      {config.showAvatars && (
        <div className="mt-0.5 shrink-0">
          <UserAvatar
            avatarUrl={msg.avatarUrl}
            username={msg.username}
            role={msg.role}
            size={config.compactMode ? 20 : 28}
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <span className={`${fontCls} font-bold truncate max-w-[130px]`}>
            <StyledUsername
              name={msg.username}
              styleKey={nameStyleKey}
              size="sm"
              userId={msg.userId}
              staticMode
            />
          </span>
          {displayBadges.map((bk) => (
            <BadgePill key={bk} badgeKey={bk} />
          ))}
          {config.showTimestamps && (
            <span className="text-[9px] text-zinc-600 ml-auto shrink-0">
              {isOptimistic
                ? "Sendet…"
                : config.showTimestampsRelative
                ? formatRelative(msg.createdAt)
                : formatAbsolute(msg.createdAt)}
            </span>
          )}
        </div>
        <p className={`${fontCls} leading-snug text-zinc-300 break-words mt-0.5`}>
          {config.highlightMentions
            ? highlightMentions(msg.content, ownUsername)
            : msg.content}
        </p>
      </div>
    </div>
  );

  if (doAnimate) {
    return (
      <motion.div
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
      >
        {inner}
      </motion.div>
    );
  }
  return inner;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main sidebar
// ─────────────────────────────────────────────────────────────────────────────

interface HomepageChatSidebarProps {
  config: HomepageChatConfig;
}

export function HomepageChatSidebar({ config }: HomepageChatSidebarProps) {
  const [isOpen, setIsOpen] = useState(false); // start closed; hydrate from localStorage
  const [isMobile, setIsMobile] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const [messages, setMessages] = useState<GlobalChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [onCooldown, setOnCooldown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);
  const [ownUsername, setOwnUsername] = useState<string | null>(null);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const [animateNewIds, setAnimateNewIds] = useState<Set<string>>(new Set());

  const bottomRef = useRef<HTMLDivElement>(null);
  const latestIdRef = useRef<string | null>(null);
  const pendingOptimisticRef = useRef<string | null>(null);
  const loadedRef = useRef(false);
  const supabase = useRef(createClient());
  const sound = useSoundManager();
  const soundRef = useRef(sound);
  soundRef.current = sound;

  // ── Responsive detection ──────────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };
    update(mq);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // ── Hydrate open state from localStorage ─────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored !== null) {
      setIsOpen(stored === "true");
    } else {
      // Use config defaults based on mobile/desktop
      const mobile = window.matchMedia("(max-width: 1023px)").matches;
      setIsOpen(mobile ? config.defaultOpenMobile : config.defaultOpenDesktop);
    }
    setHydrated(true);
  }, [config.defaultOpenDesktop, config.defaultOpenMobile]);

  // ── Check auth + load own username ───────────────────────────────────────
  useEffect(() => {
    supabase.current.auth.getUser().then(async ({ data: { user } }) => {
      setIsAuthed(!!user);
      if (user) {
        const { data } = await supabase.current
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .single();
        if (data?.username) setOwnUsername(data.username as string);
      }
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    if (config.autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [config.autoScroll]);

  // ── Load initial messages ─────────────────────────────────────────────────
  useEffect(() => {
    loadedRef.current = false;
    getGlobalChatMessages(config.maxMessages).then((msgs) => {
      setMessages(msgs);
      if (msgs.length > 0) latestIdRef.current = msgs[msgs.length - 1].id;
      setLoading(false);
      loadedRef.current = true;
      setTimeout(scrollToBottom, 50);
    });
  }, [config.maxMessages, scrollToBottom]);

  // ── Append incoming message ───────────────────────────────────────────────
  const appendMessage = useCallback(
    (row: Record<string, unknown>) => {
      const id = row.id as string;
      const optId = pendingOptimisticRef.current;
      const metadata = (row.metadata as Record<string, unknown>) ?? null;
      const badges = metadata?.badges as string[] | undefined;
      const nameStyleKey = metadata?.name_style_key as string | undefined;

      setMessages((prev) => {
        const cleaned = optId ? prev.filter((m) => m.id !== optId) : prev;
        if (cleaned.some((m) => m.id === id)) return cleaned;
        const next = [
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
            nameStyleKey,
          },
        ];
        // Trim to maxMessages
        return next.slice(-config.maxMessages);
      });

      if (optId) pendingOptimisticRef.current = null;
      latestIdRef.current = id;

      // Mark as animated
      if (config.messageAnimation) {
        setAnimateNewIds((prev) => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });
        setTimeout(() => {
          setAnimateNewIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, 500);
      }

      // Mention sound
      if (loadedRef.current && config.mentionSound) {
        const content = (row.content as string) ?? "";
        const uname = ownUsername ?? "";
        if (uname && content.toLowerCase().includes(`@${uname.toLowerCase()}`)) {
          soundRef.current.mentionReceive();
        }
      }

      // Unread counter when sidebar is closed
      if (!isOpen) {
        setNewMsgCount((c) => c + 1);
      } else {
        setTimeout(scrollToBottom, 30);
      }
    },
    [config.maxMessages, config.messageAnimation, config.mentionSound, isOpen, ownUsername, scrollToBottom]
  );

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    const client = supabase.current;
    const channel = client
      .channel("homepage-chat-sidebar")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "global_chat_messages" },
        (payload) => appendMessage(payload.new as Record<string, unknown>)
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [appendMessage]);

  // ── Toggle sidebar ────────────────────────────────────────────────────────
  function toggleOpen() {
    setIsOpen((v) => {
      const next = !v;
      localStorage.setItem(LS_KEY, String(next));
      if (next) {
        setNewMsgCount(0);
        setTimeout(scrollToBottom, 100);
      }
      return next;
    });
  }

  // ── Send message ──────────────────────────────────────────────────────────
  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending || onCooldown) return;
    const text = input.trim();
    setError(null);
    setInput("");

    const client = supabase.current;
    const { data: { user } } = await client.auth.getUser();
    if (user) {
      const { data: profile } = await client
        .from("profiles")
        .select("username, avatar_url, role")
        .eq("id", user.id)
        .single();

      if (profile) {
        const tempId = `__opt_${Date.now()}`;
        pendingOptimisticRef.current = tempId;
        setMessages((prev) => [
          ...prev,
          {
            id: tempId,
            userId: user.id,
            username: (profile.username as string) ?? "Unbekannt",
            role: (profile.role as string) ?? "user",
            content: text,
            isSystem: false,
            metadata: null,
            createdAt: new Date().toISOString(),
            avatarUrl: (profile.avatar_url as string | null) ?? null,
          },
        ]);
        setTimeout(scrollToBottom, 30);
      }
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
      setError(res.error ?? "Fehler beim Senden.");
    } else {
      // Cooldown
      setOnCooldown(true);
      setTimeout(() => setOnCooldown(false), COOLDOWN_MS);
    }
  }

  // ── Don't render until hydrated (avoids SSR mismatch) ────────────────────
  if (!hydrated || !config.enabled) return null;

  const blurCls = getBlurClass(config.blurIntensity);
  const isLeft = config.sidebarPosition !== "right";

  // ── MOBILE: floating button + bottom sheet ────────────────────────────────
  if (isMobile) {
    return (
      <>
        {/* Floating chat button */}
        {!isOpen && (
          <button
            onClick={toggleOpen}
            className="fixed bottom-6 left-4 z-40 flex items-center justify-center h-12 w-12 rounded-full bg-black/60 border border-white/10 backdrop-blur-md shadow-lg hover:bg-black/80 transition-colors"
            aria-label="Chat öffnen"
          >
            <MessageSquare className="h-5 w-5 text-purple-400" />
            {newMsgCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-[9px] font-bold text-white">
                {newMsgCount > 9 ? "9+" : newMsgCount}
              </span>
            )}
          </button>
        )}

        {/* Mobile overlay */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              key="mobile-chat"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              className={`fixed bottom-0 left-0 right-0 z-40 h-[70vh] flex flex-col border-t border-white/10 bg-black/80 ${blurCls}`}
              style={{
                background: `rgba(0,0,0,${config.bgOpacity / 100 + 0.5})`,
              }}
            >
              <ChatPanel
                messages={messages}
                loading={loading}
                input={input}
                setInput={setInput}
                sending={sending}
                onCooldown={onCooldown}
                error={error}
                config={config}
                isAuthed={isAuthed}
                ownUsername={ownUsername}
                animateNewIds={animateNewIds}
                bottomRef={bottomRef}
                onSend={handleSend}
                onClose={toggleOpen}
                showClose
              />
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  // ── DESKTOP: fixed sidebar ────────────────────────────────────────────────
  const COLLAPSED_W = 44;
  const expandedW = config.sidebarWidth;

  return (
    <motion.div
      animate={{ width: isOpen ? expandedW : COLLAPSED_W }}
      transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
      className={`fixed top-0 bottom-0 z-40 flex flex-col border-white/10 overflow-hidden ${
        isLeft ? "left-0 border-r" : "right-0 border-l"
      } ${blurCls}`}
      style={{
        background: `linear-gradient(to bottom, rgba(0,0,0,${(config.bgOpacity + 10) / 100}), rgba(0,0,0,${config.bgOpacity / 100}))`,
      }}
    >
      {/* Toggle strip (always visible) */}
      <button
        onClick={toggleOpen}
        className={`absolute top-1/2 -translate-y-1/2 z-10 flex h-10 w-5 items-center justify-center rounded bg-black/40 border border-white/10 hover:bg-black/60 transition-colors ${
          isLeft ? "-right-2.5" : "-left-2.5"
        }`}
        aria-label={isOpen ? "Chat schließen" : "Chat öffnen"}
      >
        {isLeft ? (
          isOpen ? (
            <ChevronLeft className="h-3 w-3 text-zinc-400" />
          ) : (
            <ChevronRight className="h-3 w-3 text-zinc-400" />
          )
        ) : isOpen ? (
          <ChevronRight className="h-3 w-3 text-zinc-400" />
        ) : (
          <ChevronLeft className="h-3 w-3 text-zinc-400" />
        )}
      </button>

      {/* Collapsed strip content */}
      {!isOpen && (
        <div className="flex flex-col items-center gap-2 pt-6">
          <MessageSquare className="h-5 w-5 text-purple-400 shrink-0" />
          {newMsgCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-[9px] font-bold text-white">
              {newMsgCount > 9 ? "9+" : newMsgCount}
            </span>
          )}
        </div>
      )}

      {/* Expanded panel */}
      {isOpen && (
        <ChatPanel
          messages={messages}
          loading={loading}
          input={input}
          setInput={setInput}
          sending={sending}
          onCooldown={onCooldown}
          error={error}
          config={config}
          isAuthed={isAuthed}
          ownUsername={ownUsername}
          animateNewIds={animateNewIds}
          bottomRef={bottomRef}
          onSend={handleSend}
        />
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat panel (shared between mobile overlay + desktop expanded)
// ─────────────────────────────────────────────────────────────────────────────

interface ChatPanelProps {
  messages: GlobalChatMessage[];
  loading: boolean;
  input: string;
  setInput: (v: string) => void;
  sending: boolean;
  onCooldown: boolean;
  error: string | null;
  config: HomepageChatConfig;
  isAuthed: boolean;
  ownUsername: string | null;
  animateNewIds: Set<string>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  onSend: (e: React.FormEvent) => void;
  onClose?: () => void;
  showClose?: boolean;
}

function ChatPanel({
  messages,
  loading,
  input,
  setInput,
  sending,
  onCooldown,
  error,
  config,
  isAuthed,
  ownUsername,
  animateNewIds,
  bottomRef,
  onSend,
  onClose,
  showClose = false,
}: ChatPanelProps) {
  const onlineCount = config.showOnlineCount
    ? new Set(
        messages
          .filter(
            (m) =>
              !m.isSystem &&
              m.userId &&
              Date.now() - new Date(m.createdAt).getTime() < 5 * 60 * 1000
          )
          .map((m) => m.userId)
      ).size
    : 0;

  return (
    <div className="flex flex-col h-full w-full min-w-0">
      {/* Header */}
      {config.headerVisible && (
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5 shrink-0">
          <MessageSquare className="h-3.5 w-3.5 text-purple-400 shrink-0" />
          <span className="text-xs font-bold text-zinc-300 truncate flex-1">
            {config.tabTitle}
          </span>
          {config.showOnlineCount && (
            <span className="flex items-center gap-1 text-[10px] text-zinc-500 shrink-0">
              <Users className="h-3 w-3" />
              {onlineCount > 0 && <span>{onlineCount}</span>}
            </span>
          )}
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] shrink-0" />
          {showClose && onClose && (
            <button
              onClick={onClose}
              className="ml-1 shrink-0 rounded p-0.5 text-zinc-500 hover:text-zinc-200 transition-colors"
              aria-label="Chat schließen"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-0.5 min-h-0">
        {loading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <p className="text-center text-xs text-zinc-600 py-6">
            Noch keine Nachrichten. Seid die Ersten!
          </p>
        )}
        {messages.map((msg) => (
          <MessageRow
            key={msg.id}
            msg={msg}
            config={config}
            animate={config.messageAnimation && animateNewIds.has(msg.id)}
            ownUsername={ownUsername}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {config.showInput && (
        <div className="border-t border-white/10 p-2 shrink-0">
          {error && (
            <p className="mb-1 text-[10px] text-red-400 leading-tight">{error}</p>
          )}
          {isAuthed ? (
            <form onSubmit={onSend} className="flex gap-1.5">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={500}
                placeholder={config.inputPlaceholder}
                disabled={onCooldown}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-400/60 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={sending || !input.trim() || onCooldown}
                className="flex items-center justify-center rounded-lg bg-purple-600 px-2.5 py-1.5 text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </button>
            </form>
          ) : (
            <p className="text-center text-[10px] text-zinc-600 py-1">
              Einloggen um zu chatten
            </p>
          )}
        </div>
      )}
    </div>
  );
}
