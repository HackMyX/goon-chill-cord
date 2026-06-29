"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  MessageSquare,
  Send,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLiveConfig } from "@/lib/use-live-config";
import { getHomepageChatConfig } from "@/lib/actions/homepage-chat-config";
import {
  getGlobalChatMessages,
  sendGlobalChatMessage,
  type GlobalChatMessage,
} from "@/lib/actions/global-chat";
import { BadgePill } from "@/components/ui/badge-pill";
import { PrioBadgeRow } from "@/components/ui/prio-badge-row";
import { StyledUsername } from "@/components/ui/styled-username";
import { badgeRank } from "@/lib/badges";
import { useSoundManager } from "@/lib/sound-manager";
import type { HomepageChatConfig } from "@/lib/homepage-chat-config-types";
import Link from "next/link";

/** Single highest-prestige owned badge — fallback when a user set no prio badges
 *  (mirrors the global chat / resolveDisplayBadges everywhere else). */
function pickDisplayBadge(badges: string[], role: string): string | null {
  if (role === "admin" && badges.includes("admin")) return "admin";
  if (role === "moderator" && badges.includes("mod")) return "mod";
  if (badges.length === 0) return null;
  return [...badges].sort((a, b) => badgeRank(a) - badgeRank(b))[0] ?? null;
}

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
    const isWin = msgType === "win" || (!isClear && !isReward && !!rarity);
    const time = formatAbsolute(msg.createdAt);

    // Geleert-Hinweis: dezente, zentrierte Zeile mit Uhrzeit ("wann zuletzt geleert").
    if (isClear) {
      const content = (
        <div className="my-1 flex items-center justify-center gap-2 text-[10px] text-zinc-600">
          <span className="h-px flex-1 max-w-[40px] bg-zinc-700/40" />
          <span className="flex items-center gap-1">🧹 {msg.content}<span className="text-zinc-700">· {time}</span></span>
          <span className="h-px flex-1 max-w-[40px] bg-zinc-700/40" />
        </div>
      );
      return doAnimate
        ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>{content}</motion.div>
        : content;
    }

    // Gewinn-Broadcast: schicker, seltenheits-gefärbter Banner mit Glow + Uhrzeit.
    if (isWin) {
      const c =
        rarity === "ultra" ? { from: "rgba(251,191,36,0.22)", brd: "rgba(251,191,36,0.55)", txt: "#fde68a", glow: "rgba(251,191,36,0.4)" }
        : rarity === "mythisch" ? { from: "rgba(236,72,153,0.20)", brd: "rgba(236,72,153,0.5)", txt: "#fbcfe8", glow: "rgba(236,72,153,0.4)" }
        : rarity === "episch" ? { from: "rgba(168,85,247,0.20)", brd: "rgba(168,85,247,0.5)", txt: "#e9d5ff", glow: "rgba(168,85,247,0.38)" }
        : { from: "rgba(56,189,248,0.18)", brd: "rgba(56,189,248,0.45)", txt: "#bae6fd", glow: "rgba(56,189,248,0.35)" };
      const content = (
        <div className="my-1 flex justify-center px-1">
          <div
            className="relative flex max-w-full items-center gap-2 overflow-hidden rounded-xl border px-3 py-1.5 text-center"
            style={{ borderColor: c.brd, background: `linear-gradient(100deg, ${c.from}, rgba(10,8,18,0.6))`, boxShadow: `0 0 18px -4px ${c.glow}` }}
          >
            <span className="absolute inset-0 -translate-x-full animate-[bonus-sheen_3s_linear_infinite] bg-gradient-to-r from-transparent via-white/15 to-transparent" style={{ backgroundSize: "250% 100%" }} />
            <span className="relative text-[11px] font-bold leading-snug" style={{ color: c.txt }}>{msg.content}</span>
            <span className="relative shrink-0 text-[9px] font-semibold tabular-nums text-white/45">{time}</span>
          </div>
        </div>
      );
      return doAnimate
        ? <motion.div initial={{ opacity: 0, scale: 0.92, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 320, damping: 22 }}>{content}</motion.div>
        : content;
    }

    // Sonstige System-Nachrichten (z.B. Ticket-Belohnung) — dezente Pille + Uhrzeit.
    const content = (
      <div className="flex items-center justify-center gap-1.5">
        <span className={`chat-sys-msg ${isReward ? "bg-amber-500/10 text-amber-300/90 border-amber-400/25" : "bg-blue-500/8 text-blue-300/80 border-blue-500/15"}`}>
          {msg.content}
        </span>
        <span className="text-[9px] tabular-nums text-zinc-600">{time}</span>
      </div>
    );
    return doAnimate
      ? <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>{content}</motion.div>
      : content;
  }

  const nameStyleKey = msg.nameStyleKey ?? (msg.metadata?.name_style_key as string | undefined);
  // Respect the user's chosen PRIORITY badges (exactly like every other chat /
  // profile), not a random slice of all owned badges. Prio badges win; otherwise
  // fall back to the single highest-prestige owned badge.
  const prioBadges = config.showBadges && msg.prioBadges && msg.prioBadges.length > 0
    ? msg.prioBadges.slice(0, config.maxBadgeCount)
    : null;
  const fallbackBadge = config.showBadges && !prioBadges && msg.badges && msg.badges.length > 0
    ? pickDisplayBadge(msg.badges, msg.role)
    : null;

  const inner = (
    <div
      className={`flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-white/[0.03] transition-colors ${
        isOptimistic ? "opacity-50" : ""
      } ${config.compactMode ? "py-0.5" : ""}`}
    >
      {config.showAvatars && (
        <div className="shrink-0">
          <UserAvatar
            avatarUrl={msg.avatarUrl}
            username={msg.username}
            role={msg.role}
            size={config.compactMode ? 20 : 24}
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 leading-none">
          <span className={`${fontCls} font-bold truncate max-w-[120px]`}>
            <StyledUsername
              name={msg.username}
              styleKey={nameStyleKey}
              size="sm"
              userId={msg.userId}
              staticMode
            />
          </span>
          {prioBadges
            ? <PrioBadgeRow badgeKeys={prioBadges} size="xs" max={config.maxBadgeCount} />
            : fallbackBadge && <BadgePill badgeKey={fallbackBadge} />}
          {config.showTimestamps && (
            <span className="text-[9px] text-zinc-600 ml-auto shrink-0 tabular-nums">
              {isOptimistic
                ? "…"
                : config.showTimestampsRelative
                ? formatRelative(msg.createdAt)
                : formatAbsolute(msg.createdAt)}
            </span>
          )}
        </div>
        <p className={`${fontCls} leading-snug text-zinc-300/90 break-words mt-0.5`}>
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
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
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

export function HomepageChatSidebar({ config: initialConfig }: HomepageChatSidebarProps) {
  const [config, setConfig] = useState(initialConfig);
  useLiveConfig("homepage-chat-live", getHomepageChatConfig, setConfig);
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
  // Newest COMMITTED message time (ms) currently applied — guards against
  // out-of-order / stale poll snapshots re-injecting old messages.
  const newestTimeRef = useRef(0);
  const pendingOptimisticRef = useRef<string | null>(null);
  // Live mirror of config.maxMessages so polling/append read it without forcing
  // the realtime channel to resubscribe whenever the admin tweaks the limit.
  const maxRef = useRef(config.maxMessages);
  maxRef.current = config.maxMessages;
  const loadedRef = useRef(false);
  const supabase = useRef(createClient());
  const sound = useSoundManager();
  const soundRef = useRef(sound);
  soundRef.current = sound;
  // Ref mirrors of open/username so appendMessage doesn't depend on them
  // as state values — if it did, changing isOpen would cause the Supabase
  // channel to be torn down and re-created every time the user opens or
  // closes the sidebar, creating a window where messages are missed.
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const ownUsernameRef = useRef(ownUsername);
  ownUsernameRef.current = ownUsername;

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

  // ── Open state beim (Neu-)Laden der Startseite ───────────────────────────
  // Gewünscht: der Chat soll sich auf der Startseite IMMER öffnen, sobald sie
  // neu/erstmals lädt — der gemerkte (zugeklappte) localStorage-Zustand wird
  // dafür bewusst IGNORIERT. Auf Desktop also immer offen; auf Mobile bleibt es
  // beim Config-Default, damit der Chat nicht den ganzen Handy-Bildschirm verdeckt.
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 1023px)").matches;
    setIsOpen(mobile ? config.defaultOpenMobile : true);
    setHydrated(true);
  }, [config.defaultOpenMobile]);

  // ── Signal an den globalen SupportButton („Hilfe & Chat") ────────────────
  // Auf Mobile liegt der schwebende Hilfe-&-Chat-Button (unten rechts) sonst
  // GENAU über dem Sende-Button des geöffneten Chats. Wir broadcasten daher den
  // Mobile-Offen-Zustand, damit der SupportButton sich solange ausblendet —
  // beim Schließen taucht er automatisch wieder auf.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("gnc:homepage-chat-open", { detail: isMobile && isOpen })
    );
  }, [isMobile, isOpen]);
  // Beim Verlassen der Startseite IMMER „geschlossen" melden, damit der
  // SupportButton auf anderen Seiten nicht fälschlich versteckt bleibt.
  useEffect(
    () => () => {
      window.dispatchEvent(
        new CustomEvent("gnc:homepage-chat-open", { detail: false })
      );
    },
    []
  );

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
      if (msgs.length > 0) {
        latestIdRef.current = msgs[msgs.length - 1].id;
        newestTimeRef.current = Date.parse(msgs[msgs.length - 1].createdAt) || 0;
      }
      setLoading(false);
      loadedRef.current = true;
      setTimeout(scrollToBottom, 50);
    });
  }, [config.maxMessages, scrollToBottom]);

  // ── Append incoming message ───────────────────────────────────────────────
  // Uses isOpenRef / ownUsernameRef instead of capturing isOpen/ownUsername
  // directly — this keeps the callback reference stable across open/close
  // toggles so the Supabase channel (subscribed to appendMessage) is never
  // torn down unnecessarily.
  const appendMessage = useCallback(
    (row: Record<string, unknown>) => {
      const id = row.id as string;
      const optId = pendingOptimisticRef.current;
      const metadata = (row.metadata as Record<string, unknown>) ?? null;
      const badges = metadata?.badges as string[] | undefined;
      const prioBadges = metadata?.prio_badges as string[] | undefined;
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
            prioBadges: Array.isArray(prioBadges) ? prioBadges : undefined,
            nameStyleKey,
          },
        ];
        // Always keep chronological order so a late/out-of-order INSERT can never
        // appear at the bottom as if it were the newest message.
        next.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
        return next.slice(-maxRef.current);
      });

      if (optId) pendingOptimisticRef.current = null;
      latestIdRef.current = id;
      newestTimeRef.current = Math.max(newestTimeRef.current, Date.parse(row.created_at as string) || 0);

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

      if (loadedRef.current && config.mentionSound) {
        const content = (row.content as string) ?? "";
        const uname = ownUsernameRef.current ?? "";
        if (uname && content.toLowerCase().includes(`@${uname.toLowerCase()}`)) {
          soundRef.current.mentionReceive();
        }
      }

      if (!isOpenRef.current) {
        setNewMsgCount((c) => c + 1);
      } else {
        setTimeout(scrollToBottom, 30);
      }
    },
    // isOpen, ownUsername and maxMessages intentionally excluded — read via refs
    // so this callback stays stable across sidebar open/close and profile load.
    [config.messageAnimation, config.mentionSound, scrollToBottom]
  );

  // ── Realtime subscription + polling fallback ──────────────────────────────
  // Realtime alone can silently drop INSERTs (backgrounded tab, transient
  // socket loss), which is why messages "only showed up once I typed". A poll
  // re-syncs from the server so nothing is ever missed — exactly like the big
  // chat panel.
  useEffect(() => {
    const client = supabase.current;
    const channel = client
      .channel("homepage-chat-sidebar")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "global_chat_messages" },
        (payload) => appendMessage(payload.new as Record<string, unknown>)
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "global_chat_messages" },
        () => {
          getGlobalChatMessages(maxRef.current).then((msgs) => {
            setMessages(msgs);
            latestIdRef.current = msgs.length > 0 ? msgs[msgs.length - 1].id : null;
            newestTimeRef.current = msgs.length > 0 ? (Date.parse(msgs[msgs.length - 1].createdAt) || 0) : 0;
          });
        }
      )
      .subscribe();

    // Poll re-syncs from the server so a silently-dropped realtime INSERT is never
    // missed. `fresh` is the AUTHORITATIVE newest-N window (server-sorted, deduped),
    // so we REPLACE state with it instead of appending "messages not in current
    // state" — the old append logic re-injected previously-sliced messages at the
    // bottom, which is exactly how stale messages from "old times" reappeared.
    const pollMs = 4000;
    const poll = setInterval(async () => {
      const fresh = await getGlobalChatMessages(maxRef.current);
      if (fresh.length === 0) {
        setMessages((prev) => (prev.length === 0 ? prev : []));
        latestIdRef.current = null; newestTimeRef.current = 0;
        return;
      }
      const newest = fresh[fresh.length - 1];
      if (newest.id === latestIdRef.current) return;            // nothing new
      const newestTime = Date.parse(newest.createdAt) || 0;
      if (newestTime < newestTimeRef.current) return;           // stale/out-of-order snapshot → ignore
      newestTimeRef.current = newestTime;
      latestIdRef.current = newest.id;
      setMessages((prev) => {
        const optId = pendingOptimisticRef.current;
        const opt = optId ? prev.find((m) => m.id === optId) : null;
        // Keep a still-pending optimistic bubble at the end until the server returns it.
        return opt && !fresh.some((m) => m.id === opt.id) ? [...fresh, opt] : fresh;
      });
      if (isOpenRef.current) setTimeout(scrollToBottom, 30);
    }, pollMs);

    return () => {
      client.removeChannel(channel);
      clearInterval(poll);
    };
  }, [appendMessage, scrollToBottom]);

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
      // Eagerly resolve the optimistic immediately after confirmed send.
      // homepage-chat-sidebar has no polling fallback — without this, a missed
      // realtime event leaves the "…" stuck until reload.
      const optId = pendingOptimisticRef.current;
      pendingOptimisticRef.current = null;
      const fresh = await getGlobalChatMessages(maxRef.current);
      if (fresh.length > 0) {
        const newest = fresh[fresh.length - 1];
        latestIdRef.current = newest.id;
        newestTimeRef.current = Math.max(newestTimeRef.current, Date.parse(newest.createdAt) || 0);
        // fresh is authoritative: the just-sent message is now committed and in it,
        // so replace state with fresh (drop the optimistic). Keep the optimistic
        // appended only if replication lag means it isn't in fresh yet.
        setMessages((prev) => {
          const opt = optId ? prev.find((m) => m.id === optId) : null;
          const stillMissing = opt && !fresh.some((m) => m.userId === opt.userId && m.content === opt.content);
          return stillMissing ? [...fresh, opt] : fresh;
        });
        setTimeout(scrollToBottom, 50);
      }
      setOnCooldown(true);
      setTimeout(() => setOnCooldown(false), COOLDOWN_MS);
    }
  }

  // ── Don't render until hydrated (avoids SSR mismatch) ────────────────────
  if (!hydrated || !config.enabled) return null;

  const blurCls = getBlurClass(config.blurIntensity);
  const isLeft = config.sidebarPosition !== "right";

  // ── MOBILE: persistent eye toggle + bottom sheet ──────────────────────────
  if (isMobile) {
    return (
      <>
        {/* Auge-Toggle — NUR sichtbar, solange der Chat geschlossen ist. Beim
            Öffnen verschwindet er (zusammen mit dem Hilfe-&-Chat-Button), damit
            der Sende-Button frei erreichbar ist; geschlossen wird über das X im
            Chat-Header. bottom-20 hält Abstand zum SupportButton (bottom-4). */}
        {!isOpen && (
          <button
            onClick={toggleOpen}
            className="fixed bottom-20 right-4 z-50 flex items-center justify-center h-10 w-10 rounded-full border bg-black/70 border-white/15 backdrop-blur-md shadow-xl transition-all active:scale-95 hover:border-purple-400/50 hover:bg-purple-600/30 hover:shadow-[0_0_16px_rgba(147,51,234,0.4)]"
            aria-label="Chat öffnen"
          >
            <Eye className="h-5 w-5 text-purple-400" />
            {newMsgCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-purple-600 text-[8px] font-bold text-white shadow-[0_0_8px_rgba(147,51,234,0.7)]">
                {newMsgCount > 9 ? "9+" : newMsgCount}
              </span>
            )}
          </button>
        )}

        {/* Mobile chat sheet — reicht von DIREKT UNTER der Topbar bis zum unteren
            Rand (statt fester 70vh). So „rutscht" er beim Öffnen weit hoch, es
            ist viel Platz, und der Sende-Button hat unten echten Abstand. */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              key="mobile-chat"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              className={`fixed bottom-0 left-0 right-0 z-40 flex flex-col border-t border-white/10 bg-black/80 ${blurCls}`}
              style={{
                top: "var(--gnc-topbar-h, 56px)",
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
      className={`fixed bottom-0 z-40 border-white/10 ${
        isLeft ? "left-0 border-r" : "right-0 border-l"
      } ${blurCls}`}
      style={{
        // Startet SAUBER direkt unter der Topbar (gemessene Höhe), nie dahinter.
        top: "var(--gnc-topbar-h, 56px)",
        background: `linear-gradient(to bottom, rgba(0,0,0,${(config.bgOpacity + 10) / 100}), rgba(0,0,0,${config.bgOpacity / 100}))`,
      }}
    >
      {/* Inner content — has overflow-hidden to clip messages/panel */}
      <div className="absolute inset-0 overflow-hidden flex flex-col">
        {/* Collapsed strip content */}
        {!isOpen && (
          <div className="flex flex-1 flex-col items-center pt-6 pb-6 gap-3">
            <div className="relative">
              <MessageSquare
                className="h-5 w-5 text-purple-400 shrink-0"
                style={{
                  filter: newMsgCount > 0
                    ? "drop-shadow(0 0 8px rgba(147,51,234,0.9))"
                    : "drop-shadow(0 0 4px rgba(147,51,234,0.5))",
                }}
              />
              {newMsgCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-purple-600 text-[8px] font-bold text-white shadow-[0_0_8px_rgba(147,51,234,0.7)]">
                  {newMsgCount > 9 ? "9+" : newMsgCount}
                </span>
              )}
            </div>
            <div className="mt-4">
              <span
                className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-600"
                style={{ writingMode: "vertical-rl" }}
              >
                Chat
              </span>
            </div>
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
      </div>

      {/* Toggle tab — extends outside sidebar (parent has no overflow-hidden) */}
      <button
        onClick={toggleOpen}
        className={`absolute top-1/2 -translate-y-1/2 z-20 flex flex-col items-center justify-center h-16 w-6 transition-all group border bg-gradient-to-b from-purple-600/20 via-purple-500/12 to-purple-600/20 hover:from-purple-600/40 hover:via-purple-500/25 hover:to-purple-600/40 hover:border-purple-400/50 hover:shadow-[0_0_20px_rgba(147,51,234,0.5)] ${
          isLeft
            ? "right-0 translate-x-full rounded-r-xl border-l-0 border-purple-500/25 shadow-[3px_0_14px_rgba(147,51,234,0.2)]"
            : "left-0 -translate-x-full rounded-l-xl border-r-0 border-purple-500/25 shadow-[-3px_0_14px_rgba(147,51,234,0.2)]"
        } ${newMsgCount > 0 && !isOpen ? "border-purple-400/50 !shadow-[3px_0_18px_rgba(147,51,234,0.5)]" : ""}`}
        aria-label={isOpen ? "Chat schließen" : "Chat öffnen"}
      >
        {isLeft ? (
          isOpen ? (
            <ChevronLeft className="h-4 w-4 text-purple-300 group-hover:text-purple-100 transition-colors" />
          ) : (
            <ChevronRight className="h-4 w-4 text-purple-300 group-hover:text-purple-100 transition-colors" />
          )
        ) : isOpen ? (
          <ChevronRight className="h-4 w-4 text-purple-300 group-hover:text-purple-100 transition-colors" />
        ) : (
          <ChevronLeft className="h-4 w-4 text-purple-300 group-hover:text-purple-100 transition-colors" />
        )}
      </button>
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
          {/* Online-Anzeige + grüner Punkt = klickbarer Button → Community-Seite */}
          <Link
            href="/community"
            title="Zur Community-Seite — alle Spieler ansehen"
            className="group flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300 transition-colors hover:border-emerald-400/50 hover:bg-emerald-500/20 hover:text-emerald-200"
          >
            <Users className="h-3 w-3" />
            {config.showOnlineCount && onlineCount > 0 && <span className="tabular-nums">{onlineCount}</span>}
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
            </span>
          </Link>
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
      <div className="flex-1 overflow-y-auto chat-scroll px-2 py-1.5 space-y-0.5 min-h-0">
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
        <div className="border-t border-white/10 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] shrink-0">
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
