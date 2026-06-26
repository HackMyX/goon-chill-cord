"use client";

import { useState, useTransition, useEffect, useMemo, useRef, Suspense, type ReactNode } from "react";
import {
  Shield, Users, Ticket, Activity, AlertTriangle, Ban, StickyNote,
  ChevronDown, Check, X, Coins, Clock, Search, LogOut, Trash2, Loader2,
  Sparkles, LayoutDashboard, RefreshCw, History, NotepadText, FileText,
  Trophy, Paperclip, MessageSquare, Bug, Lightbulb, ArrowUpRight,
  PauseCircle, PlayCircle, SortAsc, SortDesc, BarChart3, Filter,
  Maximize2, CalendarDays,
} from "lucide-react";
import { AdminAiChat } from "@/components/admin/admin-ai-chat";
import { GlobalChatPanel } from "@/components/global/global-chat-panel";
import { createClient } from "@/lib/supabase/client";
import { StyledUsername } from "@/components/ui/styled-username";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import { useSoundManager } from "@/lib/sound-manager";
import { TopBar } from "@/components/layout/top-bar";
import {
  modWarnUser, modAddNote, modTempBan, modLiftBan, modCloseTicket, modAddCredits,
  modRemoveWarning, getModUserHistory, getTicketMessages, modMarkInProgress, modReplyToTicket,
  modDeleteTicket, modSetTicketPriority, modUpdateTicketStatus, modGrantTicketReward,
  modRemoveTicketReward, modEscalateTicket, modPauseTicket, getMyEffectivePermissions,
} from "@/lib/actions/mod";
import { addInternalNote, getInternalNotes, getTicketRewards, deleteTicketsBulk, deleteTicketsByDateRange, type InternalNote, type TicketReward } from "@/lib/actions/tickets";
import { ModTicketDetailModal } from "@/components/mod/mod-ticket-detail-modal";
import type { ModPermissions, ModActionRow, ModUserSummary, ModTicket, TicketMessage } from "@/lib/mod";
import { ADMIN_MOD_PERMISSIONS } from "@/lib/mod";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number) { return new Intl.NumberFormat("de-DE").format(n); }

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "gerade eben";
  if (m < 60) return `vor ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h}h`;
  return `vor ${Math.floor(h / 24)}d`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
}

function isImageUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/.test(path);
  } catch {
    return /\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/i.test(url);
  }
}

// ---------------------------------------------------------------------------
// Action type badge
// ---------------------------------------------------------------------------

const ACTION_MAP: Record<ModActionRow["actionType"], { label: string; cls: string; Icon: typeof AlertTriangle }> = {
  warning: { label: "Verwarnung", cls: "bg-amber-500/20 text-amber-300 border-amber-500/30", Icon: AlertTriangle },
  note: { label: "Notiz", cls: "bg-sky-500/20 text-sky-300 border-sky-500/30", Icon: StickyNote },
  temp_ban: { label: "Temp-Ban", cls: "bg-red-500/20 text-red-300 border-red-500/30", Icon: Ban },
  ticket_close: { label: "Ticket", cls: "bg-purple-500/20 text-purple-300 border-purple-500/30", Icon: Ticket },
  credits_add: { label: "Credits", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", Icon: Coins },
};

function ActionTypeBadge({ type }: { type: ModActionRow["actionType"] }) {
  const { label, cls, Icon } = ACTION_MAP[type] ?? {
    label: type, cls: "bg-zinc-700 text-zinc-300 border-zinc-600", Icon: Activity,
  };
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// User History Panel — warnings, notes, bans, credits all in one timeline
// ---------------------------------------------------------------------------

function UserHistoryPanel({ userId, perms, onWarningRemoved }: {
  userId: string;
  perms: ModPermissions;
  onWarningRemoved: () => void;
}) {
  const [history, setHistory] = useState<ModActionRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [filter, setFilter] = useState<ModActionRow["actionType"] | "all">("all");
  const sound = useSoundManager();

  useEffect(() => {
    setLoading(true);
    getModUserHistory(userId).then((list) => { setHistory(list); setLoading(false); });
  }, [userId]);

  async function handleRemoveWarning(id: string) {
    sound.click();
    setRemoving(id);
    const res = await modRemoveWarning(id);
    setRemoving(null);
    if (res.success) {
      setHistory((h) => (h ?? []).filter((x) => x.id !== id));
      sound.win();
      onWarningRemoved();
    } else {
      sound.error();
    }
  }

  if (loading) {
    return (
      <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Lade Verlauf…
      </div>
    );
  }

  if (!history || history.length === 0) return null;

  const filterOptions: Array<{ key: ModActionRow["actionType"] | "all"; label: string }> = [
    { key: "all", label: "Alle" },
    { key: "warning", label: "Verw." },
    { key: "note", label: "Notizen" },
    { key: "temp_ban", label: "Bans" },
    { key: "credits_add", label: "Credits" },
  ];

  const shown = filter === "all" ? history : history.filter((h) => h.actionType === filter);

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-2 flex-wrap">
        <History className="h-3.5 w-3.5 text-zinc-600" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-600">
          Mod-Verlauf ({history.length})
        </span>
        <div className="ml-auto flex gap-1 flex-wrap">
          {filterOptions.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors ${
                filter === key
                  ? "bg-sky-500/25 text-sky-300"
                  : "bg-white/5 text-zinc-500 hover:bg-white/10 hover:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex max-h-52 flex-col gap-1.5 overflow-y-auto pr-1">
        {shown.length === 0 ? (
          <p className="py-3 text-center text-[11px] text-zinc-600">Keine Einträge.</p>
        ) : (
          shown.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-2.5 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2"
            >
              <ActionTypeBadge type={item.actionType} />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-zinc-300">
                  {item.reason
                    ? item.reason
                    : <span className="italic text-zinc-600">(keine Begründung)</span>
                  }
                </p>
                <p className="text-[10px] text-zinc-600">
                  von {item.modUsername ?? "Mod"} · {timeAgo(item.createdAt)}
                  {item.expiresAt && (
                    <> · <span className="text-red-400">bis {fmtDate(item.expiresAt)}</span></>
                  )}
                </p>
              </div>
              {item.actionType === "warning" && perms.canWarnUsers && (
                <button
                  onClick={() => handleRemoveWarning(item.id)}
                  disabled={removing === item.id}
                  title="Verwarnung entfernen"
                  className="shrink-0 rounded-lg border border-red-500/20 p-1.5 text-red-400 hover:bg-red-500/15 disabled:opacity-40 transition-colors"
                >
                  {removing === item.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Trash2 className="h-3 w-3" />
                  }
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// User Actions Panel
// ---------------------------------------------------------------------------

const BAN_PRESETS = [1, 6, 12, 24, 48, 168] as const;
const CREDIT_PRESETS = [100, 500, 1000, -100, -500] as const;

function UserActionsPanel({ user: u, perms, onDone }: {
  user: ModUserSummary;
  perms: ModPermissions;
  onDone: () => void;
}) {
  const availableTabs = useMemo(() => {
    const tabs: Array<"warn" | "note" | "ban" | "credits"> = [];
    if (perms.canWarnUsers) { tabs.push("warn"); tabs.push("note"); }
    if (perms.canTempBanUsers) tabs.push("ban");
    if (perms.canAddCredits) tabs.push("credits");
    return tabs;
  }, [perms]);

  const [tab, setTab] = useState<"warn" | "note" | "ban" | "credits">(availableTabs[0] ?? "warn");
  const [reason, setReason] = useState("");
  const [banHours, setBanHours] = useState(24);
  const [creditsAmount, setCreditsAmount] = useState(100);
  const [confirmBan, setConfirmBan] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const sound = useSoundManager();
  const { currencyName } = useSiteConfig();

  const isBanned = !!(u.tempBannedUntil && new Date(u.tempBannedUntil) > new Date());
  const cappedHours = Math.min(banHours, perms.maxTempBanHours);

  function flash(text: string, ok: boolean) {
    setMessage({ text, ok });
    if (ok) sound.win(); else sound.error();
    setTimeout(() => setMessage(null), 3000);
  }

  function doAction() {
    if (tab === "ban" && !confirmBan) { setConfirmBan(true); return; }
    sound.click();
    setConfirmBan(false);
    startTransition(async () => {
      let res: { success: boolean; error?: string };
      if (tab === "warn") res = await modWarnUser(u.id, reason);
      else if (tab === "note") res = await modAddNote(u.id, reason);
      else if (tab === "ban") res = await modTempBan(u.id, cappedHours, reason);
      else res = await modAddCredits(u.id, creditsAmount, reason);

      if (res.success) {
        flash(tab === "ban" ? `${cappedHours}h Ban gesetzt.` : "Erfolgreich.", true);
        setReason("");
        onDone();
      } else {
        flash(res.error ?? "Fehler.", false);
      }
    });
  }

  async function liftBan() {
    sound.click();
    const res = await modLiftBan(u.id);
    if (res.success) { flash("Ban aufgehoben.", true); onDone(); }
    else flash(res.error ?? "Fehler.", false);
  }

  if (availableTabs.length === 0 && !isBanned) return null;

  const tabMeta = {
    warn:    { label: "Verwarnen", Icon: AlertTriangle, active: "bg-amber-500/20 text-amber-200 border-amber-500/30" },
    note:    { label: "Notiz",     Icon: NotepadText,   active: "bg-sky-500/20 text-sky-200 border-sky-500/30" },
    ban:     { label: "Temp-Ban",  Icon: Ban,           active: "bg-red-500/20 text-red-200 border-red-500/30" },
    credits: { label: "Credits",   Icon: Coins,         active: "bg-emerald-500/20 text-emerald-200 border-emerald-500/30" },
  } as const;
  const inactiveCls = "bg-white/5 text-zinc-500 hover:bg-white/8 hover:text-zinc-300 border-transparent";

  return (
    <div className="mt-4 rounded-2xl border border-white/8 bg-black/30 p-4">
      {/* Tab pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {availableTabs.map((t) => {
          const { label, Icon, active } = tabMeta[t];
          return (
            <button
              key={t}
              onClick={() => { setTab(t); setConfirmBan(false); }}
              className={`flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-bold transition-colors ${tab === t ? active : inactiveCls}`}
            >
              <Icon className="h-3 w-3" />{label}
            </button>
          );
        })}
        {isBanned && perms.canTempBanUsers && (
          <button
            onClick={liftBan}
            className="flex items-center gap-1 rounded-full border border-red-400/30 bg-red-400/10 px-3 py-1 text-[11px] font-bold text-red-300 hover:bg-red-400/20 transition-colors"
          >
            <X className="h-3 w-3" />Ban aufheben
          </button>
        )}
      </div>

      {/* Ban duration presets */}
      {tab === "ban" && (
        <div className="mb-3">
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
            Dauer (max. {perms.maxTempBanHours}h)
          </label>
          <div className="flex flex-wrap gap-1.5">
            {BAN_PRESETS.filter((h) => h <= perms.maxTempBanHours).map((h) => (
              <button
                key={h}
                onClick={() => setBanHours(h)}
                className={`rounded-lg border px-3 py-1 text-[11px] font-bold transition-colors ${
                  banHours === h
                    ? "border-red-400/50 bg-red-500/20 text-red-300"
                    : "border-white/10 text-zinc-500 hover:border-white/20 hover:text-zinc-300"
                }`}
              >
                {h >= 168 ? "1 Woche" : h >= 24 ? `${h / 24}d` : `${h}h`}
              </button>
            ))}
            <input
              type="number" min={1} max={perms.maxTempBanHours} value={banHours}
              onChange={(e) => setBanHours(Math.max(1, Math.min(perms.maxTempBanHours, Number(e.target.value))))}
              className="w-16 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-center text-[11px] text-zinc-100 outline-none focus:border-red-400/40"
            />
          </div>
        </div>
      )}

      {/* Credits presets */}
      {tab === "credits" && (
        <div className="mb-3">
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
            Betrag ({currencyName})
          </label>
          <div className="flex flex-wrap gap-1.5">
            {CREDIT_PRESETS.map((amount) => (
              <button
                key={amount}
                onClick={() => setCreditsAmount(amount)}
                className={`rounded-lg border px-3 py-1 text-[11px] font-bold transition-colors ${
                  creditsAmount === amount
                    ? amount > 0
                      ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-300"
                      : "border-red-400/50 bg-red-500/20 text-red-300"
                    : "border-white/10 text-zinc-500 hover:border-white/20 hover:text-zinc-300"
                }`}
              >
                {amount > 0 ? "+" : ""}{fmt(amount)}
              </button>
            ))}
            <input
              type="number" value={creditsAmount}
              onChange={(e) => setCreditsAmount(Number(e.target.value) || 0)}
              className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-center text-[11px] text-zinc-100 outline-none focus:border-emerald-400/40"
            />
          </div>
        </div>
      )}

      {/* Reason textarea */}
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder={perms.warnRequiresReason && tab === "warn" ? "Begründung (Pflicht)…" : "Begründung (optional)…"}
        className="mb-3 w-full resize-none rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-purple-400/40 placeholder:text-zinc-600"
      />

      {/* Action / confirm */}
      <div className="flex flex-wrap items-center gap-2">
        {confirmBan ? (
          <>
            <span className="text-xs text-amber-400">
              Sicher? {cappedHours}h Ban für <strong>{u.username}</strong>?
            </span>
            <button
              onClick={doAction} disabled={pending}
              className="flex items-center gap-1 rounded-xl bg-red-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Ja, sperren
            </button>
            <button
              onClick={() => setConfirmBan(false)}
              className="rounded-xl bg-zinc-700 px-4 py-1.5 text-xs font-bold text-zinc-300 hover:bg-zinc-600"
            >
              Abbrechen
            </button>
          </>
        ) : (
          <button
            onClick={doAction}
            disabled={pending || (perms.warnRequiresReason && tab === "warn" && !reason.trim())}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-bold text-white transition-colors disabled:opacity-50 ${
              tab === "ban"
                ? "bg-red-600 hover:bg-red-500"
                : tab === "credits" && creditsAmount < 0
                  ? "bg-red-700 hover:bg-red-600"
                  : tab === "credits"
                    ? "bg-emerald-700 hover:bg-emerald-600"
                    : "bg-purple-600 hover:bg-purple-500"
            }`}
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            {tab === "ban" ? "Sperren" : tab === "credits" ? "Credits senden" : "Ausführen"}
          </button>
        )}
        {message && (
          <span className={`text-xs font-medium ${message.ok ? "text-emerald-400" : "text-red-400"}`}>
            {message.ok && <Check className="mr-1 inline h-3 w-3" />}
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users Tab
// ---------------------------------------------------------------------------

type UserFilter = "all" | "banned" | "warned";
type UserSortField = "username" | "credits" | "streak" | "warnings" | "joined";

function UsersTab({ users: initialUsers, perms, onRefresh }: {
  users: ModUserSummary[];
  perms: ModPermissions;
  onRefresh: () => void;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [userFilter, setUserFilter] = useState<UserFilter>("all");
  const [sortBy, setSortBy] = useState<UserSortField>(() =>
    typeof window !== "undefined" ? (localStorage.getItem("mod:u:sort") as UserSortField) ?? "joined" : "joined"
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() =>
    typeof window !== "undefined" ? (localStorage.getItem("mod:u:dir") as "asc" | "desc") ?? "desc" : "desc"
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const { currencyName } = useSiteConfig();

  // Sync with server refresh
  useEffect(() => { setUsers(initialUsers); }, [initialUsers]);

  function setSort(v: UserSortField) { setSortBy(v); localStorage.setItem("mod:u:sort", v); }
  function toggleDir() { const d = sortDir === "desc" ? "asc" : "desc"; setSortDir(d); localStorage.setItem("mod:u:dir", d); }

  const bannedCount = useMemo(
    () => users.filter((u) => u.tempBannedUntil && new Date(u.tempBannedUntil) > new Date()).length,
    [users]
  );
  const warnedCount = useMemo(() => users.filter((u) => u.warningCount > 0).length, [users]);

  const filtered = useMemo(() => {
    let list = [...users];
    if (userFilter === "banned") list = list.filter((u) => u.tempBannedUntil && new Date(u.tempBannedUntil) > new Date());
    if (userFilter === "warned") list = list.filter((u) => u.warningCount > 0);
    if (query.trim()) list = list.filter((u) => u.username.toLowerCase().includes(query.toLowerCase()));
    const mul = sortDir === "desc" ? -1 : 1;
    list.sort((a, b) => {
      if (sortBy === "username") return mul * a.username.localeCompare(b.username);
      if (sortBy === "credits") return mul * (b.credits - a.credits);
      if (sortBy === "streak") return mul * (b.streakDays - a.streakDays);
      if (sortBy === "warnings") return mul * (b.warningCount - a.warningCount);
      // joined
      return mul * (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });
    return list;
  }, [users, userFilter, query, sortBy, sortDir]);

  function handleWarningRemoved(userId: string) {
    setUsers((prev) =>
      prev.map((u) => u.id === userId ? { ...u, warningCount: Math.max(0, u.warningCount - 1) } : u)
    );
    onRefresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search + filter chips */}
      <div className="flex flex-col gap-2 rounded-2xl border border-white/8 bg-white/[0.02] p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nutzer suchen…"
            className="w-full rounded-xl border border-white/8 bg-black/20 py-2 pl-9 pr-9 text-xs text-zinc-200 outline-none transition-colors focus:border-sky-400/40 placeholder:text-zinc-600"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {([
              { key: "all",    label: `Alle (${users.length})` },
              { key: "banned", label: `Gesperrt (${bannedCount})` },
              { key: "warned", label: `Verwarnt (${warnedCount})` },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setUserFilter(key)}
                className={`rounded-xl border px-2.5 py-1 text-xs font-bold transition-colors ${
                  userFilter === key
                    ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
                    : "border-white/8 bg-white/[0.02] text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Filter className="h-3 w-3 text-zinc-600" />
            <select
              value={sortBy}
              onChange={(e) => setSort(e.target.value as UserSortField)}
              className="cursor-pointer appearance-none rounded-xl border border-white/8 bg-black/30 py-1 pl-2.5 pr-5 text-xs text-zinc-400 outline-none focus:border-sky-500/40"
            >
              <option value="joined">Beitrittsdatum</option>
              <option value="username">Name A–Z</option>
              <option value="credits">Credits</option>
              <option value="streak">Streak</option>
              <option value="warnings">Verwarnungen</option>
            </select>
            <button
              onClick={toggleDir}
              title={sortDir === "desc" ? "Absteigend" : "Aufsteigend"}
              className="flex h-7 w-7 items-center justify-center rounded-xl border border-white/8 text-zinc-500 transition-colors hover:border-white/20 hover:text-zinc-300"
            >
              {sortDir === "desc" ? <SortDesc className="h-3.5 w-3.5" /> : <SortAsc className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-zinc-600">
          {filtered.length} von {users.length} Nutzern
          {(query || userFilter !== "all") && (
            <> · <button
              onClick={() => { setQuery(""); setUserFilter("all"); }}
              className="text-sky-400 hover:text-sky-300 transition-colors"
            >Filter zurücksetzen</button></>
          )}
        </p>
      </div>

      {/* User list */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Search className="mx-auto mb-2 h-8 w-8 text-zinc-700" />
            <p className="text-sm text-zinc-500">Keine Nutzer gefunden.</p>
          </div>
        ) : (
          filtered.map((u) => {
            const isBanned = !!(u.tempBannedUntil && new Date(u.tempBannedUntil) > new Date());
            const isExpanded = expanded === u.id;
            return (
              <div
                key={u.id}
                className={`overflow-hidden rounded-2xl border transition-colors ${
                  isBanned
                    ? "border-red-500/20 bg-red-500/5"
                    : isExpanded
                      ? "border-sky-500/20 bg-sky-500/5"
                      : "border-white/8 bg-white/[0.02] hover:border-white/[0.12]"
                }`}
              >
                <button
                  className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
                  onClick={() => setExpanded(isExpanded ? null : u.id)}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      isBanned ? "bg-red-500" :
                      u.role === "admin" ? "bg-amber-400" :
                      u.role === "moderator" ? "bg-sky-400" :
                      "bg-zinc-600"
                    }`} />
                    <span className="truncate font-semibold text-zinc-100"><StyledUsername name={u.username} styleKey={u.nameStyleKey} disablePopup /></span>
                    {u.role !== "user" && (
                      <span className={`hidden rounded-full px-2 py-0.5 text-[10px] font-bold sm:inline-block ${
                        u.role === "admin" ? "bg-amber-500/20 text-amber-300" : "bg-sky-500/20 text-sky-300"
                      }`}>
                        {u.role === "admin" ? "Admin" : "Mod"}
                      </span>
                    )}
                    {isBanned && (
                      <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-300">
                        GESPERRT
                      </span>
                    )}
                    {u.warningCount > 0 && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                        {u.warningCount}× verwarnt
                      </span>
                    )}
                    {u.noteCount > 0 && (
                      <span className="hidden rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-500 sm:inline-block">
                        {u.noteCount} Notiz{u.noteCount !== 1 ? "en" : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {perms.canViewUserDetails && (
                      <span className="hidden text-[11px] text-zinc-500 sm:block">
                        {fmt(u.credits)} {currencyName} · {u.streakDays}🔥
                      </span>
                    )}
                    <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-white/5 px-4 pb-5 pt-4">
                    {perms.canViewUserDetails && (
                      <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                          <p className="text-zinc-600">Credits</p>
                          <p className="mt-0.5 font-bold text-zinc-200">{fmt(u.credits)}</p>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                          <p className="text-zinc-600">Streak</p>
                          <p className="mt-0.5 font-bold text-zinc-200">{u.streakDays}d 🔥</p>
                        </div>
                        <div className={`rounded-xl border px-3 py-2 ${u.warningCount > 0 ? "border-amber-500/20 bg-amber-500/5" : "border-white/5 bg-white/[0.02]"}`}>
                          <p className="text-zinc-600">Verwarnungen</p>
                          <p className={`mt-0.5 font-bold ${u.warningCount > 0 ? "text-amber-300" : "text-zinc-200"}`}>
                            {u.warningCount}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                          <p className="text-zinc-600">Dabei seit</p>
                          <p className="mt-0.5 font-bold text-zinc-200">{fmtDate(u.createdAt)}</p>
                        </div>
                        {isBanned && (
                          <div className="col-span-full rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2">
                            <p className="text-[10px] text-red-400">
                              Gesperrt bis:{" "}
                              <strong>{new Date(u.tempBannedUntil!).toLocaleString("de-DE")}</strong>
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <UserHistoryPanel
                      userId={u.id}
                      perms={perms}
                      onWarningRemoved={() => handleWarningRemoved(u.id)}
                    />
                    <UserActionsPanel user={u} perms={perms} onDone={onRefresh} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category + Priority badges
// ---------------------------------------------------------------------------

function CategoryBadge({ category }: { category: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    bug:        { label: "Bug",        cls: "bg-red-500/20 text-red-300 border-red-500/30" },
    suggestion: { label: "Vorschlag",  cls: "bg-sky-500/20 text-sky-300 border-sky-500/30" },
    other:      { label: "Sonstiges",  cls: "bg-zinc-700/50 text-zinc-400 border-zinc-600/40" },
  };
  const { label, cls } = map[category] ?? { label: category, cls: "bg-zinc-700/50 text-zinc-400 border-zinc-600/40" };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`}>{label}</span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  if (!priority || priority === "normal") return null;
  const map: Record<string, { label: string; cls: string }> = {
    low:    { label: "Niedrig", cls: "bg-zinc-700/50 text-zinc-500 border-zinc-600/40" },
    high:   { label: "Hoch",    cls: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
    urgent: { label: "Dringend", cls: "bg-red-500/25 text-red-300 border-red-500/40" },
  };
  const { label, cls } = map[priority] ?? { label: priority, cls: "bg-zinc-700/50 text-zinc-400 border-zinc-600/40" };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`}>{label}</span>
  );
}

// ---------------------------------------------------------------------------
// Ticket Item — own state, thread messages, category/priority, in_progress
// ---------------------------------------------------------------------------

const ALL_TICKET_STATUSES = ["open", "in_progress", "paused", "closed"] as const;
const ALL_TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const STATUS_LABEL: Record<string, string> = { open: "Offen", in_progress: "In Bearb.", paused: "Pausiert", resolved: "Gelöst", closed: "Geschlossen" };
const PRIORITY_LABEL: Record<string, string> = { low: "Niedrig", normal: "Normal", high: "Hoch", urgent: "Dringend" };

function TicketItem({ t, perms, onRefresh, defaultOpen, isSelected, onToggleSelect }: {
  t: ModTicket;
  perms: ModPermissions;
  onRefresh: () => void;
  defaultOpen?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [closeReason, setCloseReason] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyAttachFile, setReplyAttachFile] = useState<File | null>(null);
  const [msgs, setMsgs] = useState<TicketMessage[] | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showReward, setShowReward] = useState(false);
  const [rewardCredits, setRewardCredits] = useState(500);
  const [rewardNote, setRewardNote] = useState("");
  const [rewardDeferred, setRewardDeferred] = useState(true);
  const [rewards, setRewards] = useState<TicketReward[]>([]);
  const [internalNotes, setInternalNotes] = useState<InternalNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const isPaused = t.status === "paused";
  const isActionable = t.status === "open" || t.status === "in_progress" || isPaused;
  const isInProgress = t.status === "in_progress";
  const isClosed = t.status === "closed" || t.status === "resolved";
  const alreadyRewarded = !!t.rewardGrantedAt;
  const rewardIsPending = !alreadyRewarded && t.rewardPending;
  const [escalating, setEscalating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const sound = useSoundManager();
  const itemRef = useRef<HTMLDivElement>(null);
  const prevDefaultOpen = useRef(defaultOpen ?? false);

  // On mount: if already flagged as "open via deep link", open fullscreen modal.
  useEffect(() => {
    if (!defaultOpen) return;
    const timer = setTimeout(() => setModalOpen(true), 150);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dynamic deep-link: if defaultOpen flips to true after initial mount, open modal.
  useEffect(() => {
    if (defaultOpen && !prevDefaultOpen.current) {
      const timer = setTimeout(() => setModalOpen(true), 150);
      prevDefaultOpen.current = true;
      return () => clearTimeout(timer);
    }
    prevDefaultOpen.current = defaultOpen ?? false;
  }, [defaultOpen]);

  useEffect(() => {
    if (!open || msgs !== null) return;
    setLoadingMsgs(true);
    Promise.all([
      getTicketMessages(t.id),
      getInternalNotes(t.id),
      getTicketRewards(t.id),
    ]).then(([list, notes, rwd]) => {
      setMsgs(list);
      setInternalNotes(notes);
      setRewards(rwd);
      setLoadingMsgs(false);
    });
  }, [open, t.id, msgs]);

  function showFlash(text: string, ok: boolean) {
    setFlash({ text, ok });
    if (ok) sound.win(); else sound.error();
    setTimeout(() => setFlash(null), 3500);
  }

  function handleClose() {
    sound.click();
    startTransition(async () => {
      const res = await modCloseTicket(t.id, closeReason);
      if (res.success) { showFlash("Ticket geschlossen.", true); setCloseReason(""); onRefresh(); }
      else showFlash(res.error ?? "Fehler.", false);
    });
  }

  function handleInProgress() {
    sound.click();
    startTransition(async () => {
      const res = await modMarkInProgress(t.id);
      if (res.success) { showFlash("Als 'In Bearbeitung' markiert.", true); onRefresh(); }
      else showFlash(res.error ?? "Fehler.", false);
    });
  }

  function handlePause() {
    sound.click();
    startTransition(async () => {
      const res = await modPauseTicket(t.id, true);
      if (res.success) { showFlash("Ticket pausiert.", true); onRefresh(); }
      else showFlash(res.error ?? "Fehler.", false);
    });
  }

  function handleResume() {
    sound.click();
    startTransition(async () => {
      const res = await modPauseTicket(t.id, false);
      if (res.success) { showFlash("Ticket fortgesetzt.", true); onRefresh(); }
      else showFlash(res.error ?? "Fehler.", false);
    });
  }

  function handleReply() {
    if (!replyText.trim()) return;
    sound.click();
    startTransition(async () => {
      let attachmentUrl: string | null = null;
      if (replyAttachFile) {
        const supabase = createClient();
        const filePath = `mod-replies/${t.id}/${Date.now()}-${replyAttachFile.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("ticket-attachments")
          .upload(filePath, replyAttachFile, { upsert: false });
        if (uploadError) {
          showFlash(`Anhang-Upload fehlgeschlagen: ${uploadError.message}`, false);
          return;
        }
        if (uploadData) {
          const { data: urlData } = supabase.storage.from("ticket-attachments").getPublicUrl(uploadData.path);
          attachmentUrl = urlData.publicUrl;
        }
      }
      const res = await modReplyToTicket(t.id, replyText, attachmentUrl);
      if (res.success) {
        showFlash("Antwort gesendet.", true);
        setReplyText("");
        setReplyAttachFile(null);
        setMsgs(null);
        onRefresh();
      } else showFlash(res.error ?? "Fehler.", false);
    });
  }

  function handleDelete() {
    if (!deleteConfirm) { setDeleteConfirm(true); setTimeout(() => setDeleteConfirm(false), 4000); return; }
    sound.click();
    setDeleteConfirm(false);
    startTransition(async () => {
      const res = await modDeleteTicket(t.id);
      if (res.success) { showFlash("Ticket gelöscht.", true); onRefresh(); }
      else showFlash(res.error ?? "Fehler.", false);
    });
  }

  function handleStatusChange(status: string) {
    sound.click();
    startTransition(async () => {
      const res = await modUpdateTicketStatus(t.id, status);
      if (res.success) { showFlash(`Status: ${STATUS_LABEL[status] ?? status}`, true); onRefresh(); }
      else showFlash(res.error ?? "Fehler.", false);
    });
  }

  function handlePriorityChange(priority: string) {
    sound.click();
    startTransition(async () => {
      const res = await modSetTicketPriority(t.id, priority);
      if (res.success) { showFlash(`Priorität: ${PRIORITY_LABEL[priority] ?? priority}`, true); onRefresh(); }
      else showFlash(res.error ?? "Fehler.", false);
    });
  }

  function handleGrantReward() {
    sound.click();
    startTransition(async () => {
      const res = await modGrantTicketReward(t.id, {
        credits: rewardCredits > 0 ? rewardCredits : undefined,
        note: rewardNote.trim() || undefined,
        deferred: rewardDeferred,
      });
      if (res.success) {
        showFlash(`+${rewardCredits} Credits ${rewardDeferred ? "angepinnt" : "sofort vergeben"}!`, true);
        setShowReward(false);
        setRewardCredits(500);
        setRewardNote("");
        const rwd = await getTicketRewards(t.id);
        setRewards(rwd);
        onRefresh();
      } else showFlash(res.error ?? "Fehler.", false);
    });
  }

  async function handleAddNote() {
    if (!newNote.trim()) return;
    setAddingNote(true);
    const res = await addInternalNote(t.id, newNote.trim());
    setAddingNote(false);
    if (res.success) {
      setNewNote("");
      const notes = await getInternalNotes(t.id);
      setInternalNotes(notes);
    } else {
      showFlash(res.error ?? "Fehler beim Speichern.", false);
    }
  }

  const statusCls = isPaused
    ? "border-slate-500/25 bg-slate-500/5"
    : isInProgress
      ? "border-amber-500/20 bg-amber-500/5"
      : isActionable
        ? "border-purple-500/20 bg-purple-500/5"
        : "border-white/8 bg-white/[0.02]";

  const dotCls = isPaused
    ? "bg-slate-400"
    : isInProgress
      ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]"
      : isActionable
        ? "bg-purple-400 shadow-[0_0_6px_rgba(168,85,247,0.6)]"
        : "bg-zinc-600";

  return (
    <div ref={itemRef} className={`overflow-hidden rounded-2xl border transition-colors ${statusCls}`}>
      <div className="relative flex w-full items-center">
        {/* Checkbox for bulk select */}
        {onToggleSelect && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelect(t.id); }}
            className={`ml-3 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
              isSelected
                ? "border-indigo-500 bg-indigo-500 text-white"
                : "border-white/20 bg-transparent hover:border-indigo-400/60"
            }`}
          >
            {isSelected && <Check className="h-3 w-3" />}
          </button>
        )}
      <button
        className="relative flex flex-1 items-center gap-3 py-3.5 pr-4 pl-5 text-left transition-colors hover:bg-white/[0.03]"
        onClick={() => setOpen((o) => !o)}
      >
        {/* Status dot */}
        <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotCls}`} />

        {/* Category icon */}
        {t.category === "bug"
          ? <Bug className="h-3.5 w-3.5 shrink-0 text-red-400/60" />
          : <Lightbulb className="h-3.5 w-3.5 shrink-0 text-sky-400/60" />}

        {/* Subject + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-zinc-100">{t.subject}</span>
            {t.escalatedToAdmin && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-orange-500/40 bg-orange-500/15 px-1.5 py-0.5 text-[9px] font-bold text-orange-300">
                <ArrowUpRight className="h-2.5 w-2.5" />Eskaliert
              </span>
            )}
            {isPaused && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-slate-500/30 bg-slate-500/15 px-1.5 py-0.5 text-[9px] font-bold text-slate-300">
                ⏸ Pausiert
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px]">
            <span className="font-medium text-zinc-400">{t.username}</span>
            {(alreadyRewarded || rewardIsPending) && <Trophy className="h-3 w-3 text-amber-400" />}
            {t.attachmentUrl && <Paperclip className="h-3 w-3 text-zinc-600" />}
          </div>
        </div>

        {/* Right: priority + time + maximize + chevron */}
        <div className="flex shrink-0 items-center gap-2">
          <PriorityBadge priority={t.priority} />
          <span className="w-14 text-right text-[10px] text-zinc-600">{timeAgo(t.updatedAt ?? t.createdAt)}</span>
          <ChevronDown className={`h-4 w-4 text-zinc-600 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
        {/* Vollbild button */}
        <button
          onClick={(e) => { e.stopPropagation(); setModalOpen(true); }}
          title="Vollbild öffnen"
          className="mr-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] text-zinc-600 transition-all hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-400"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && (
        <div className="border-t border-white/5 px-4 pb-4 pt-3">
          {/* Meta */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-zinc-500">
              von <strong className="text-zinc-300">{t.username}</strong>
              {" · "}{new Date(t.createdAt).toLocaleString("de-DE")}
            </span>
            <CategoryBadge category={t.category} />
            <PriorityBadge priority={t.priority} />
          </div>

          {/* Status + priority controls (if permitted) */}
          {(perms.canUpdateTicketStatus || perms.canSetTicketPriority) && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
              {perms.canUpdateTicketStatus && (
                <>
                  <span className="text-[10px] text-zinc-600">Status:</span>
                  {ALL_TICKET_STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      disabled={pending || t.status === s}
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors disabled:opacity-50 ${
                        t.status === s
                          ? "border-sky-500/40 bg-sky-500/20 text-sky-300"
                          : "border-white/10 text-zinc-500 hover:border-white/30 hover:text-zinc-300"
                      }`}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </>
              )}
              {perms.canSetTicketPriority && (
                <>
                  <span className="ml-2 text-[10px] text-zinc-600">Prio:</span>
                  {ALL_TICKET_PRIORITIES.map((p) => (
                    <button
                      key={p}
                      onClick={() => handlePriorityChange(p)}
                      disabled={pending || t.priority === p}
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors disabled:opacity-50 ${
                        t.priority === p
                          ? "border-orange-500/40 bg-orange-500/20 text-orange-300"
                          : "border-white/10 text-zinc-500 hover:border-white/30 hover:text-zinc-300"
                      }`}
                    >
                      {PRIORITY_LABEL[p]}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Original message */}
          <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{t.message}</p>
            {t.attachmentUrl && (
              <div className="mt-2">
                {isImageUrl(t.attachmentUrl) ? (
                  <a href={t.attachmentUrl} target="_blank" rel="noopener noreferrer">
                    <img
                      src={t.attachmentUrl}
                      alt="Anhang"
                      className="max-h-48 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity border border-white/10"
                    />
                  </a>
                ) : (
                  <a
                    href={t.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[11px] text-purple-400 hover:text-purple-300"
                  >
                    <Paperclip className="h-3 w-3" />
                    Anhang ansehen
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Thread messages */}
          {loadingMsgs && (
            <div className="mt-3 flex items-center gap-2 text-xs text-zinc-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />Lade Nachrichten…
            </div>
          )}
          {msgs && msgs.length > 0 && (
            <div className="mt-3 flex flex-col gap-3">
              {msgs.map((m) => (
                <div key={m.id} className={`flex gap-2.5 ${m.isStaff ? "flex-row-reverse" : "flex-row"}`}>
                  {/* Avatar */}
                  {m.avatarUrl ? (
                    <img src={m.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full border border-white/10 object-cover" />
                  ) : (
                    <div className={`h-7 w-7 shrink-0 rounded-full border flex items-center justify-center text-[10px] font-black ${
                      m.isStaff ? "bg-sky-500/20 border-sky-500/40 text-sky-200" : "bg-zinc-700/40 border-zinc-600/30 text-zinc-300"
                    }`}>
                      {m.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {/* Bubble */}
                  <div className={`max-w-[78%] flex flex-col gap-0.5 ${m.isStaff ? "items-end" : "items-start"}`}>
                    <div className={`flex items-center gap-1.5 ${m.isStaff ? "flex-row-reverse" : ""}`}>
                      <span className="text-[11px] font-semibold text-zinc-200">{m.username}</span>
                      {m.isStaff && (
                        <span className="rounded-full bg-sky-500/20 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-sky-300 border border-sky-500/30">
                          Staff
                        </span>
                      )}
                      <span className="text-[10px] text-zinc-600">{timeAgo(m.createdAt)}</span>
                    </div>
                    <div className={`rounded-2xl px-3 py-2 text-sm ${
                      m.isStaff ? "rounded-tr-sm bg-sky-500/15 border border-sky-500/20 text-sky-100" : "rounded-tl-sm bg-white/[0.05] border border-white/8 text-zinc-300"
                    }`}>
                      <p className="whitespace-pre-wrap">{m.message}</p>
                      {m.attachmentUrl && (
                        <div className="mt-1.5">
                          {isImageUrl(m.attachmentUrl) ? (
                            <a href={m.attachmentUrl} target="_blank" rel="noopener noreferrer">
                              <img src={m.attachmentUrl} alt="Anhang" className="max-h-40 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity border border-white/10" />
                            </a>
                          ) : (
                            <a href={m.attachmentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300">
                              <Paperclip className="h-3 w-3" />Anhang ansehen
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Reward history + management */}
          {(rewards.length > 0 || alreadyRewarded || rewardIsPending) && (
            <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
              <div className="flex items-center gap-2 border-b border-amber-500/15 px-3 py-2">
                <Trophy className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[11px] font-black text-amber-300">Belohnungen</span>
                {perms.maxRewardPerTicket > 0 && (() => {
                  const usedTotal = rewards.filter(r => !r.paidAt).reduce((s, r) => s + r.credits, 0);
                  const pct = Math.min(100, (usedTotal / perms.maxRewardPerTicket) * 100);
                  return (
                    <div className="ml-auto flex items-center gap-2">
                      <div className="h-1.5 w-20 rounded-full bg-black/30 overflow-hidden">
                        <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-amber-500">{fmt(usedTotal)}/{fmt(perms.maxRewardPerTicket)} CR</span>
                    </div>
                  );
                })()}
              </div>
              {/* Reward rows */}
              {rewards.length > 0 ? (
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
                      <span className="text-[11px] font-extrabold text-amber-200">+{fmt(r.credits)} CR</span>
                      {r.note && <span className="text-[10px] text-zinc-500 truncate">— {r.note}</span>}
                      <div className="ml-auto flex items-center gap-1.5 shrink-0">
                        {r.paidAt ? (
                          <span className="rounded-full bg-emerald-500/15 border border-emerald-500/25 px-1.5 py-0.5 text-[8px] font-black text-emerald-400">✓ ausgezahlt</span>
                        ) : r.deferred ? (
                          <span className="rounded-full bg-amber-500/15 border border-amber-500/25 px-1.5 py-0.5 text-[8px] font-black text-amber-400">⏳ bei Abschluss</span>
                        ) : (
                          <span className="rounded-full bg-sky-500/15 border border-sky-500/25 px-1.5 py-0.5 text-[8px] font-black text-sky-400">⚡ sofort</span>
                        )}
                        {!r.paidAt && perms.canRewardTickets && (
                          <button
                            onClick={() => startTransition(async () => {
                              const res = await modRemoveTicketReward(r.id);
                              if (res.success) {
                                const rwd = await getTicketRewards(t.id);
                                setRewards(rwd);
                                onRefresh();
                              } else showFlash(res.error ?? "Fehler.", false);
                            })}
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
              ) : (
                <div className="px-3 py-2 text-[11px] text-zinc-600">
                  {alreadyRewarded
                    ? `Belohnung ausgezahlt${t.rewardCredits ? ` · +${t.rewardCredits} Credits` : ""}`
                    : rewardIsPending
                    ? `Belohnung angepinnt${t.rewardCredits ? ` · +${t.rewardCredits} Credits` : ""} · Auszahlung bei Lösung`
                    : null}
                </div>
              )}
            </div>
          )}

          {/* Closed status */}
          {isClosed && t.closedByUsername && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-zinc-700/50 bg-zinc-800/30 px-3 py-2 text-[11px] text-zinc-500">
              <Check className="h-3 w-3 shrink-0 text-emerald-500" />
              Geschlossen von <strong className="text-zinc-300">{t.closedByUsername}</strong>
              {t.closedAt && <> · {timeAgo(t.closedAt)}</>}
            </div>
          )}

          {/* Actions */}
          {isActionable && perms.canCloseTickets && (
            <div className="mt-4 space-y-2">
              <div className="flex gap-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={2}
                  placeholder="Antwort an den Nutzer…"
                  className="flex-1 resize-none rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-sky-400/40 placeholder:text-zinc-600"
                />
                <div className="flex shrink-0 flex-col gap-1 self-end">
                  <label className="flex cursor-pointer items-center gap-1 rounded-xl border border-white/10 bg-black/20 px-2 py-1.5 text-[10px] text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-200">
                    <Paperclip className="h-3 w-3" />
                    {replyAttachFile ? replyAttachFile.name.slice(0, 12) + "…" : "Datei"}
                    <input type="file" className="hidden" accept="image/*,.pdf,.txt,.log" onChange={(e) => setReplyAttachFile(e.target.files?.[0] ?? null)} />
                  </label>
                  <button
                    onClick={handleReply} disabled={pending || !replyText.trim()}
                    className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-sky-500 disabled:opacity-50"
                  >
                    {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Antworten
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-2">
                <textarea
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  rows={1}
                  placeholder="Abschluss-Notiz (optional)…"
                  className="flex-1 resize-none rounded-xl border border-white/8 bg-black/20 px-3 py-1.5 text-xs text-zinc-100 outline-none focus:border-purple-400/40 placeholder:text-zinc-600"
                />
                {!isInProgress && !perms.canUpdateTicketStatus && (
                  <button
                    onClick={handleInProgress} disabled={pending}
                    className="flex shrink-0 items-center gap-1 rounded-xl border border-amber-500/30 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-300 transition-colors hover:bg-amber-500/25 disabled:opacity-50"
                  >
                    In Bearbeitung
                  </button>
                )}
                <button
                  onClick={handleClose} disabled={pending}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-purple-500 disabled:opacity-60"
                >
                  {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Schließen
                </button>
              </div>
            </div>
          )}

          {/* Extended actions row */}
          {(perms.canDeleteTickets || perms.canRewardTickets || perms.canPauseTickets || (perms.canCloseTickets && !t.escalatedToAdmin)) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
              {/* Pause / Resume */}
              {perms.canPauseTickets && !isClosed && (isPaused ? (
                <button
                  onClick={handleResume}
                  disabled={pending}
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
                  Fortsetzen
                </button>
              ) : (isActionable && (
                <button
                  onClick={handlePause}
                  disabled={pending}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-500/30 bg-slate-500/10 px-3 py-1.5 text-xs font-bold text-slate-300 transition-colors hover:bg-slate-500/20 disabled:opacity-50"
                >
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PauseCircle className="h-3.5 w-3.5" />}
                  Pausieren
                </button>
              )))}
              {perms.canCloseTickets && !t.escalatedToAdmin && isActionable && (
                <button
                  onClick={async () => {
                    sound.click();
                    setEscalating(true);
                    const res = await modEscalateTicket(t.id);
                    setEscalating(false);
                    if (res.success) { showFlash("An Admin weitergeleitet.", true); onRefresh(); }
                    else showFlash(res.error ?? "Fehler.", false);
                  }}
                  disabled={pending || escalating}
                  className="flex items-center gap-1.5 rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-bold text-orange-300 transition-colors hover:bg-orange-500/20 disabled:opacity-50"
                >
                  {escalating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                  An Admin weiterleiten
                </button>
              )}
              {perms.canRewardTickets && !alreadyRewarded && !rewardIsPending && (
                <button
                  onClick={() => setShowReward((v) => !v)}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
                    showReward
                      ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                      : "border-white/10 text-zinc-500 hover:border-amber-500/30 hover:text-amber-400"
                  }`}
                >
                  <Trophy className="h-3.5 w-3.5" />
                  Belohnung anpinnen
                </button>
              )}
              {perms.canDeleteTickets && (
                <button
                  onClick={handleDelete}
                  disabled={pending}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                    deleteConfirm
                      ? "border-red-500/50 bg-red-500/20 text-red-300"
                      : "border-white/10 text-zinc-600 hover:border-red-500/30 hover:text-red-400"
                  }`}
                >
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {deleteConfirm ? "Wirklich löschen?" : "Löschen"}
                </button>
              )}
            </div>
          )}

          {/* Reward form */}
          {showReward && perms.canRewardTickets && (() => {
            const usedTotal = rewards.filter(r => !r.paidAt).reduce((s, r) => s + r.credits, 0);
            const remaining = perms.maxRewardPerTicket > 0 ? Math.max(0, perms.maxRewardPerTicket - usedTotal) : Infinity;
            const wouldExceed = perms.maxRewardPerTicket > 0 && rewardCredits > remaining;
            return (
              <div className="mt-3 rounded-xl border border-amber-500/25 bg-gradient-to-b from-amber-500/8 to-transparent p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold text-amber-300">Neue Belohnung</p>
                  {perms.maxRewardPerTicket > 0 && (
                    <span className={`text-[10px] font-bold ${remaining === 0 ? "text-red-400" : "text-amber-500"}`}>
                      noch {fmt(remaining)} CR verfügbar
                    </span>
                  )}
                </div>
                {/* Auszahlungstyp toggle */}
                <div className="flex gap-1.5 rounded-xl border border-white/8 bg-black/20 p-1">
                  <button
                    onClick={() => setRewardDeferred(true)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-bold transition-all ${
                      rewardDeferred ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <span>⏳</span> Bei Abschluss
                  </button>
                  <button
                    onClick={() => setRewardDeferred(false)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-bold transition-all ${
                      !rewardDeferred ? "bg-sky-500/20 text-sky-300 border border-sky-500/30" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <span>⚡</span> Sofort auszahlen
                  </button>
                </div>
                <p className="text-[10px] text-zinc-600">
                  {rewardDeferred
                    ? "Credits werden automatisch bei Ticket-Lösung gutgeschrieben und sind im Ticket sichtbar."
                    : "Credits werden dem User sofort gutgeschrieben."}
                </p>
                <div className="flex gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-zinc-500">Credits</span>
                    <input
                      type="number" min={0}
                      max={perms.maxRewardPerTicket > 0 ? remaining : undefined}
                      value={rewardCredits}
                      onChange={(e) => {
                        const v = Math.max(0, Number(e.target.value));
                        setRewardCredits(remaining !== Infinity ? Math.min(v, remaining) : v);
                      }}
                      className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400/40"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <span className="text-[10px] text-zinc-500">Notiz (optional)</span>
                    <input
                      type="text" value={rewardNote} onChange={(e) => setRewardNote(e.target.value)}
                      maxLength={100} placeholder="z.B. Super Bug-Report!"
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-400/40"
                    />
                  </div>
                </div>
                {wouldExceed && (
                  <p className="text-[10px] text-red-400 font-bold">Limit überschritten — max. noch {fmt(remaining)} CR möglich.</p>
                )}
                {remaining === 0 && perms.maxRewardPerTicket > 0 && (
                  <p className="text-[10px] text-red-400 font-bold">Belohnungslimit für dieses Ticket bereits ausgeschöpft.</p>
                )}
                <button
                  onClick={handleGrantReward}
                  disabled={pending || rewardCredits < 1 || wouldExceed || (perms.maxRewardPerTicket > 0 && remaining === 0)}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-white transition-colors disabled:opacity-50 ${
                    rewardDeferred ? "bg-amber-600 hover:bg-amber-500" : "bg-sky-600 hover:bg-sky-500"
                  }`}
                >
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trophy className="h-3.5 w-3.5" />}
                  {rewardDeferred ? "Anpinnen" : "Sofort vergeben"}
                </button>
              </div>
            );
          })()}

          {/* Internal notes (staff only) */}
          <div className="mt-3 border-t border-white/5 pt-3">
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
                  <p className="text-[11px] text-zinc-600">Noch keine internen Notizen.</p>
                )}
                {internalNotes.map((note) => (
                  <div key={note.id} className="rounded-lg border border-sky-500/15 bg-sky-500/5 px-3 py-2">
                    <p className="text-[10px] font-bold text-sky-400">{note.username} · {timeAgo(note.createdAt)}</p>
                    <p className="mt-0.5 text-xs text-zinc-300">{note.note}</p>
                  </div>
                ))}
                <div className="flex gap-2">
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    placeholder="Interne Notiz (nur für Staff sichtbar)…"
                    className="flex-1 resize-none rounded-lg border border-white/8 bg-black/20 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-sky-400/40 placeholder:text-zinc-600"
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={addingNote || !newNote.trim()}
                    className="flex shrink-0 items-center gap-1 self-end rounded-lg border border-sky-500/30 bg-sky-500/15 px-2.5 py-1.5 text-[11px] font-bold text-sky-300 hover:bg-sky-500/25 disabled:opacity-50"
                  >
                    {addingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Speichern
                  </button>
                </div>
              </div>
            )}
          </div>

          {flash && (
            <p className={`mt-2 text-xs font-medium ${flash.ok ? "text-emerald-400" : "text-red-400"}`}>
              {flash.text}
            </p>
          )}
        </div>
      )}

      {/* Vollbild-Modal */}
      {modalOpen && (
        <ModTicketDetailModal
          ticket={t}
          perms={perms}
          onClose={() => setModalOpen(false)}
          onUpdated={() => { setModalOpen(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tickets Tab
// ---------------------------------------------------------------------------

type TicketStatusFilter = "open" | "in_progress" | "paused" | "closed" | "all";
type SortField = "updated" | "created" | "priority" | "status";

const PRIO_ORDER: Record<string, number> = { urgent: 4, high: 3, normal: 2, low: 1 };
const STATUS_SORT_ORDER: Record<string, number> = { open: 0, in_progress: 1, paused: 2, resolved: 3, closed: 4 };

function TicketsTab({ tickets, perms, onRefresh, openTicketId, onTicketOpened }: {
  tickets: ModTicket[];
  perms: ModPermissions;
  onRefresh: () => void;
  openTicketId?: string | null;
  onTicketOpened?: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [showDateRange, setShowDateRange] = useState(false);
  const [dateRangeBefore, setDateRangeBefore] = useState("");
  const [dateRangeStatuses, setDateRangeStatuses] = useState<string[]>(["closed", "resolved"]);
  const [dateDeleting, setDateDeleting] = useState(false);
  const [dateDeleteMsg, setDateDeleteMsg] = useState<{ text: string; ok: boolean } | null>(null);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function selectAll() { setSelected(new Set(displayed.map((t) => t.id))); }
  function clearSelect() { setSelected(new Set()); }

  async function handleBulkDelete() {
    if (!bulkConfirm) { setBulkConfirm(true); setTimeout(() => setBulkConfirm(false), 4000); return; }
    setBulkDeleting(true);
    setBulkConfirm(false);
    const ids = [...selected];
    await deleteTicketsBulk(ids);
    setSelected(new Set());
    setBulkDeleting(false);
    onRefresh();
  }

  async function handleDateRangeDelete() {
    if (!dateRangeBefore) return;
    setDateDeleting(true);
    const res = await deleteTicketsByDateRange({
      before: new Date(dateRangeBefore).toISOString(),
      statuses: dateRangeStatuses.length > 0 ? (dateRangeStatuses as ("closed" | "resolved")[]) : undefined,
    });
    setDateDeleting(false);
    if (res.success) {
      setDateDeleteMsg({ text: `${res.deleted} Ticket${res.deleted !== 1 ? "s" : ""} gelöscht.`, ok: true });
      onRefresh();
    } else {
      setDateDeleteMsg({ text: res.error ?? "Fehler.", ok: false });
    }
    setTimeout(() => setDateDeleteMsg(null), 4000);
  }

  const [statusFilter, setStatusFilter] = useState<TicketStatusFilter>(() => {
    if (openTicketId) return "all";
    if (typeof window !== "undefined") return (localStorage.getItem("mod:t:sf") as TicketStatusFilter) ?? "open";
    return "open";
  });
  const [catFilter, setCatFilter] = useState<"all" | "bug" | "suggestion">(() => {
    if (typeof window !== "undefined") return (localStorage.getItem("mod:t:cf") as "all" | "bug" | "suggestion") ?? "all";
    return "all";
  });
  const [prioFilter, setPrioFilter] = useState<string>(() => {
    if (typeof window !== "undefined") return localStorage.getItem("mod:t:pf") ?? "all";
    return "all";
  });
  const [sortBy, setSortBy] = useState<SortField>(() => {
    if (typeof window !== "undefined") return (localStorage.getItem("mod:t:sort") as SortField) ?? "updated";
    return "updated";
  });
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() => {
    if (typeof window !== "undefined") return (localStorage.getItem("mod:t:dir") as "asc" | "desc") ?? "desc";
    return "desc";
  });
  const [search, setSearch] = useState("");

  function setStatus(v: TicketStatusFilter) { setStatusFilter(v); localStorage.setItem("mod:t:sf", v); }
  function setCat(v: "all" | "bug" | "suggestion") { setCatFilter(v); localStorage.setItem("mod:t:cf", v); }
  function setPrio(v: string) { setPrioFilter(v); localStorage.setItem("mod:t:pf", v); }
  function setSort(v: SortField) { setSortBy(v); localStorage.setItem("mod:t:sort", v); }
  function toggleDir() { const d = sortDir === "desc" ? "asc" : "desc"; setSortDir(d); localStorage.setItem("mod:t:dir", d); }

  useEffect(() => {
    if (!openTicketId) return;
    setStatusFilter("all");
    const timer = setTimeout(() => onTicketOpened?.(), 600);
    return () => clearTimeout(timer);
  }, [openTicketId, onTicketOpened]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("mod-tickets-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tickets" }, () => onRefresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tickets" }, () => onRefresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => ({
    open: tickets.filter((t) => t.status === "open").length,
    in_progress: tickets.filter((t) => t.status === "in_progress").length,
    paused: tickets.filter((t) => t.status === "paused").length,
    closed: tickets.filter((t) => t.status === "closed" || t.status === "resolved").length,
    bugs: tickets.filter((t) => t.category === "bug").length,
    suggestions: tickets.filter((t) => t.category === "suggestion").length,
  }), [tickets]);

  const displayed = useMemo(() => {
    let arr = [...tickets];
    if (statusFilter !== "all") {
      arr = arr.filter((t) => statusFilter === "closed"
        ? (t.status === "closed" || t.status === "resolved")
        : t.status === statusFilter);
    }
    if (catFilter !== "all") arr = arr.filter((t) => t.category === catFilter);
    if (prioFilter !== "all") arr = arr.filter((t) => t.priority === prioFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      arr = arr.filter((t) =>
        t.subject.toLowerCase().includes(s) ||
        t.username.toLowerCase().includes(s) ||
        t.message.toLowerCase().includes(s)
      );
    }
    const mul = sortDir === "desc" ? -1 : 1;
    arr.sort((a, b) => {
      if (sortBy === "priority") return mul * ((PRIO_ORDER[b.priority] ?? 2) - (PRIO_ORDER[a.priority] ?? 2));
      if (sortBy === "status") return mul * ((STATUS_SORT_ORDER[b.status] ?? 99) - (STATUS_SORT_ORDER[a.status] ?? 99));
      if (sortBy === "created") return mul * (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      // default: updated
      return mul * (new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime());
    });
    return arr;
  }, [tickets, statusFilter, catFilter, prioFilter, search, sortBy, sortDir]);

  const hasActiveFilter = search.trim() || statusFilter !== "all" || catFilter !== "all" || prioFilter !== "all";

  const STATS = [
    { label: "Offen",       count: counts.open,        dot: "bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.5)]", bg: "from-purple-950/30", text: "text-purple-300",  border: "border-purple-500/20"  },
    { label: "Bearbeitung", count: counts.in_progress,  dot: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]",  bg: "from-amber-950/20",  text: "text-amber-300",  border: "border-amber-500/20"   },
    { label: "Pausiert",    count: counts.paused,       dot: "bg-slate-400",                                         bg: "from-slate-950/20",  text: "text-slate-300",  border: "border-slate-500/20"   },
    { label: "Erledigt",    count: counts.closed,       dot: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]", bg: "from-emerald-950/20",text: "text-emerald-300",border: "border-emerald-500/20"  },
    { label: "Bugs",        count: counts.bugs,         dot: "bg-red-400",                                           bg: "from-red-950/20",    text: "text-red-300",    border: "border-red-500/20"     },
    { label: "Vorschläge",  count: counts.suggestions,  dot: "bg-sky-400",                                           bg: "from-sky-950/20",    text: "text-sky-300",    border: "border-sky-500/20"     },
  ];

  const STATUS_PILLS: Array<{ key: TicketStatusFilter; label: string; dot: string; cnt: number }> = [
    { key: "all",         label: "Alle",        dot: "bg-zinc-500",    cnt: tickets.length      },
    { key: "open",        label: "Offen",       dot: "bg-purple-400",  cnt: counts.open         },
    { key: "in_progress", label: "In Bearb.",   dot: "bg-amber-400",   cnt: counts.in_progress  },
    { key: "paused",      label: "Pausiert",    dot: "bg-slate-400",   cnt: counts.paused       },
    { key: "closed",      label: "Erledigt",    dot: "bg-emerald-500", cnt: counts.closed       },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {STATS.map(({ label, count, dot, bg, text, border }) => (
          <div key={label} className={`flex flex-col gap-1 rounded-xl border ${border} bg-gradient-to-b ${bg} via-transparent to-transparent p-3`}>
            <div className="flex items-center gap-1.5">
              <div className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
              <span className="truncate text-[10px] text-zinc-500">{label}</span>
            </div>
            <span className={`text-2xl font-black tracking-tight ${text}`}>{count}</span>
          </div>
        ))}
      </div>

      {/* Filter + sort controls */}
      <div className="flex flex-col gap-2.5 rounded-2xl border border-white/8 bg-white/[0.02] p-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tickets durchsuchen (Betreff, User, Inhalt)…"
            className="w-full rounded-xl border border-white/8 bg-black/20 py-2 pl-9 pr-9 text-xs text-zinc-200 outline-none focus:border-sky-500/40 placeholder:text-zinc-600"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Status filter */}
        <div className="flex flex-wrap items-center gap-1">
          {STATUS_PILLS.map(({ key, label, dot, cnt }) => {
            const active = statusFilter === key;
            return (
              <button
                key={key}
                onClick={() => setStatus(key)}
                className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold transition-colors ${
                  active ? "border-sky-500/40 bg-sky-500/15 text-sky-200" : "border-white/8 text-zinc-500 hover:border-white/20 hover:text-zinc-300"
                }`}
              >
                {key !== "all" && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />}
                {label}
                {key !== "all" && cnt > 0 && (
                  <span className={`rounded-full px-1 text-[9px] font-black ${active ? "bg-sky-500/30 text-sky-200" : "bg-white/10 text-zinc-500"}`}>{cnt}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Category + Priority + Sort row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Category */}
          <div className="flex items-center gap-1 rounded-xl border border-white/5 bg-black/20 p-1">
            {([["all", "Alle", null], ["bug", "Bugs", <Bug key="b" className="h-3 w-3" />], ["suggestion", "Ideen", <Lightbulb key="l" className="h-3 w-3" />]] as [string, string, ReactNode][]).map(([key, label, icon]) => (
              <button
                key={key}
                onClick={() => setCat(key as "all" | "bug" | "suggestion")}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition-colors ${
                  catFilter === key ? "bg-white/10 text-zinc-200" : "text-zinc-600 hover:text-zinc-400"
                }`}
              >
                {icon}{label}
              </button>
            ))}
          </div>

          {/* Priority */}
          <div className="flex items-center gap-1 rounded-xl border border-white/5 bg-black/20 p-1">
            {([["all","Alle","text-zinc-600"],["urgent","Dringend","text-red-400/80"],["high","Hoch","text-orange-400/80"],["normal","Normal","text-amber-400/80"],["low","Niedrig","text-zinc-500"]] as [string, string, string][]).map(([key, label, cls]) => (
              <button
                key={key}
                onClick={() => setPrio(key)}
                className={`rounded-lg px-2 py-1 text-[11px] font-bold transition-colors ${
                  prioFilter === key ? "bg-white/10 text-zinc-200" : `${cls} hover:text-zinc-300`
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Sort controls */}
          <div className="ml-auto flex items-center gap-1.5">
            <Filter className="h-3 w-3 text-zinc-600" />
            <select
              value={sortBy}
              onChange={(e) => setSort(e.target.value as SortField)}
              className="cursor-pointer appearance-none rounded-xl border border-white/8 bg-black/30 py-1 pl-2.5 pr-5 text-xs text-zinc-400 outline-none focus:border-sky-500/40"
            >
              <option value="updated">Letzte Aktivität</option>
              <option value="created">Erstellt</option>
              <option value="priority">Priorität</option>
              <option value="status">Status</option>
            </select>
            <button
              onClick={toggleDir}
              title={sortDir === "desc" ? "Absteigend" : "Aufsteigend"}
              className="flex h-7 w-7 items-center justify-center rounded-xl border border-white/8 text-zinc-500 transition-colors hover:border-white/20 hover:text-zinc-300"
            >
              {sortDir === "desc" ? <SortDesc className="h-3.5 w-3.5" /> : <SortAsc className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Result info + bulk controls row */}
      <div className="flex flex-wrap items-center gap-2 min-h-[24px]">
        {hasActiveFilter && (
          <p className="text-[11px] text-zinc-600">
            {displayed.length} {displayed.length === 1 ? "Ticket" : "Tickets"} gefunden
            {tickets.length !== displayed.length && (
              <> · <button
                onClick={() => { setSearch(""); setStatus("all"); setCat("all"); setPrio("all"); }}
                className="text-sky-400 hover:text-sky-300 transition-colors"
              >Filter zurücksetzen</button></>
            )}
          </p>
        )}

        {perms.canDeleteTickets && displayed.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            {/* Auswahl-Kontrollen */}
            {selected.size === 0 ? (
              <button
                onClick={selectAll}
                className="text-[11px] text-zinc-600 hover:text-zinc-300 transition-colors"
              >
                Alle auswählen
              </button>
            ) : (
              <>
                <span className="text-[11px] font-semibold text-indigo-300">
                  {selected.size} ausgewählt
                </span>
                <button onClick={clearSelect} className="text-[11px] text-zinc-600 hover:text-zinc-300 transition-colors">
                  Aufheben
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-50 ${
                    bulkConfirm
                      ? "border-red-500/50 bg-red-500/20 text-red-300"
                      : "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  }`}
                >
                  {bulkDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  {bulkConfirm ? "Wirklich löschen?" : `${selected.size} löschen`}
                </button>
              </>
            )}

            {/* Zeitraum löschen toggle */}
            <button
              onClick={() => setShowDateRange((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                showDateRange
                  ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                  : "border-white/10 text-zinc-600 hover:border-amber-500/30 hover:text-amber-400"
              }`}
            >
              <CalendarDays className="h-3 w-3" />
              Zeitraum
            </button>
          </div>
        )}
      </div>

      {/* Date range delete panel */}
      {showDateRange && perms.canDeleteTickets && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="mb-3 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-amber-400">
            <CalendarDays className="h-3.5 w-3.5" />Tickets nach Zeitraum löschen
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-zinc-500">Tickets älter als</label>
              <input
                type="date"
                value={dateRangeBefore}
                onChange={(e) => setDateRangeBefore(e.target.value)}
                className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-amber-400/40"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-zinc-500">Nur mit Status</label>
              <div className="flex gap-1">
                {(["closed", "resolved", "open", "in_progress"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setDateRangeStatuses((prev) =>
                      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                    )}
                    className={`rounded-lg border px-2 py-1 text-[10px] font-bold transition-colors ${
                      dateRangeStatuses.includes(s)
                        ? "border-amber-500/40 bg-amber-500/20 text-amber-200"
                        : "border-white/10 text-zinc-600 hover:text-zinc-400"
                    }`}
                  >
                    {s === "closed" ? "Geschlossen" : s === "resolved" ? "Gelöst" : s === "open" ? "Offen" : "In Bearb."}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleDateRangeDelete}
              disabled={dateDeleting || !dateRangeBefore}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-1.5 text-[11px] font-bold text-red-300 hover:bg-red-500/25 disabled:opacity-50 transition-colors"
            >
              {dateDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Löschen
            </button>
          </div>
          {dateDeleteMsg && (
            <p className={`mt-2 text-xs font-semibold ${dateDeleteMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
              {dateDeleteMsg.text}
            </p>
          )}
        </div>
      )}

      {/* Ticket list */}
      {tickets.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] py-16 text-center">
          <Ticket className="mx-auto mb-3 h-10 w-10 text-zinc-700" />
          <p className="text-sm font-semibold text-zinc-500">Keine Tickets vorhanden.</p>
        </div>
      ) : displayed.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] py-10 text-center">
          <Search className="mx-auto mb-2 h-7 w-7 text-zinc-700" />
          <p className="text-sm text-zinc-600">Keine Tickets passen zu deinen Filtern.</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.015]">
          {displayed.map((t) => (
            <TicketItem
              key={t.id}
              t={t}
              perms={perms}
              onRefresh={onRefresh}
              defaultOpen={openTicketId === t.id}
              isSelected={selected.has(t.id)}
              onToggleSelect={perms.canDeleteTickets ? toggleSelect : undefined}
            />
          ))}
          {displayed.length >= 50 && (
            <p className="py-3 text-center text-[11px] text-zinc-600">Zeige {displayed.length} Tickets — verfeinere den Filter für genauere Ergebnisse.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab({ users, tickets, perms, myActions }: {
  users: ModUserSummary[];
  tickets: ModTicket[];
  perms: ModPermissions;
  myActions: ModActionRow[];
}) {
  const bannedCount = users.filter((u) => u.tempBannedUntil && new Date(u.tempBannedUntil) > new Date()).length;
  const openTickets = tickets.filter((t) => t.status === "open" || t.status === "in_progress").length;
  const pausedTickets = tickets.filter((t) => t.status === "paused").length;
  const escalatedTickets = tickets.filter((t) => t.escalatedToAdmin).length;
  const totalWarnings = users.reduce((s, u) => s + u.warningCount, 0);
  const totalNotes = users.reduce((s, u) => s + u.noteCount, 0);

  const stats = [
    { label: "Nutzer gesamt",   value: users.length,      Icon: Users,         color: "text-sky-300",    glow: "from-sky-500/10" },
    { label: "Offene Tickets",  value: openTickets,       Icon: Ticket,        color: "text-purple-300", glow: "from-purple-500/10" },
    { label: "Temp-Gesperrt",   value: bannedCount,       Icon: Ban,           color: "text-red-300",    glow: "from-red-500/10" },
    { label: "Aktive Verw.",    value: totalWarnings,     Icon: AlertTriangle, color: "text-amber-300",  glow: "from-amber-500/10" },
    { label: "Pausiert",        value: pausedTickets,     Icon: PauseCircle,   color: "text-slate-300",  glow: "from-slate-500/10" },
    { label: "Eskaliert",       value: escalatedTickets,  Icon: ArrowUpRight,  color: "text-orange-300", glow: "from-orange-500/10" },
  ];

  const permRows = [
    { label: "Tickets ansehen",    val: perms.canViewTickets,       Icon: Ticket },
    { label: "Tickets schließen",  val: perms.canCloseTickets,      Icon: Check },
    { label: "Tickets löschen",    val: perms.canDeleteTickets,     Icon: Trash2 },
    { label: "Ticket-Status",      val: perms.canUpdateTicketStatus,Icon: Activity },
    { label: "Ticket-Priorität",   val: perms.canSetTicketPriority, Icon: BarChart3 },
    { label: "Tickets pausieren",  val: perms.canPauseTickets,      Icon: PauseCircle },
    { label: "Ticket-Belohnungen", val: perms.canRewardTickets,     Icon: Trophy },
    { label: "Nutzer verwarnen",   val: perms.canWarnUsers,         Icon: AlertTriangle },
    { label: "Temp-Ban",           val: perms.canTempBanUsers,      Icon: Ban },
    { label: "Nutzerdetails",      val: perms.canViewUserDetails,   Icon: Users },
    { label: "Audit-Log",          val: perms.canViewAuditLog,      Icon: Activity },
    { label: "Credits vergeben",   val: perms.canAddCredits,        Icon: Coins },
    { label: "Chat leeren",        val: perms.canClearChat,         Icon: MessageSquare },
    { label: `Max Ban: ${perms.maxTempBanHours}h`,
      val: perms.canTempBanUsers, Icon: Clock },
    { label: perms.maxRewardPerTicket > 0 ? `Max Reward: ${fmt(perms.maxRewardPerTicket)} CR` : "Reward: unbegrenzt",
      val: perms.canRewardTickets, Icon: Sparkles },
    { label: perms.warnRequiresReason ? "Begr. Pflicht" : "Begr. Optional",
      val: true, Icon: FileText },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {stats.map(({ label, value, Icon, color, glow }) => (
          <div key={label} className={`relative overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-br ${glow} to-transparent px-4 py-4`}>
            <div className="pointer-events-none absolute right-3 top-3 opacity-[0.07]">
              <Icon className="h-10 w-10" />
            </div>
            <p className="text-[11px] text-zinc-500">{label}</p>
            <p className={`mt-1 text-3xl font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* My recent actions */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-300">
          <Activity className="h-4 w-4 text-sky-400" />
          Meine letzten Aktionen
        </h3>
        {myActions.length === 0 ? (
          <div className="rounded-2xl border border-white/5 py-10 text-center">
            <p className="text-sm text-zinc-600">Noch keine Aktionen durchgeführt.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {myActions.slice(0, 8).map((a) => (
              <div key={a.id} className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-xs">
                <ActionTypeBadge type={a.actionType} />
                <span className="text-zinc-500">
                  → <strong className="text-zinc-300">{a.targetUsername ?? "?"}</strong>
                </span>
                {a.reason && (
                  <span className="min-w-0 flex-1 truncate text-zinc-600">· {a.reason}</span>
                )}
                <span className="shrink-0 text-zinc-700">{timeAgo(a.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Permissions */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-300">
          <Shield className="h-4 w-4 text-sky-400" />
          Deine Berechtigungen
        </h3>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {permRows.map(({ label, val, Icon }) => (
            <div
              key={label}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-medium ${
                val
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                  : "border-white/5 bg-white/[0.02] text-zinc-700"
              }`}
            >
              <Icon className={`h-3 w-3 shrink-0 ${val ? "text-emerald-400" : "text-zinc-700"}`} />
              {label}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-zinc-700">
          {totalNotes > 0 && `${totalNotes} Mod-Notizen gesamt · `}
          {totalWarnings} aktive Verwarnungen gesamt
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action Log Tab
// ---------------------------------------------------------------------------

function ActionLog({ actions }: { actions: ModActionRow[] }) {
  const [filter, setFilter] = useState<ModActionRow["actionType"] | "all">("all");

  const shown = filter === "all" ? actions : actions.filter((a) => a.actionType === filter);

  const typeFilters: Array<{ key: ModActionRow["actionType"] | "all"; label: string }> = [
    { key: "all",          label: "Alle" },
    { key: "warning",      label: "Verwarnungen" },
    { key: "note",         label: "Notizen" },
    { key: "temp_ban",     label: "Bans" },
    { key: "ticket_close", label: "Tickets" },
    { key: "credits_add",  label: "Credits" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {typeFilters.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
              filter === key
                ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
                : "border-white/8 bg-white/[0.02] text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        {shown.length === 0 ? (
          <div className="py-12 text-center">
            <Activity className="mx-auto mb-2 h-8 w-8 text-zinc-700" />
            <p className="text-sm text-zinc-600">Keine Aktionen gefunden.</p>
          </div>
        ) : (
          shown.map((a) => (
            <div key={a.id} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
              <ActionTypeBadge type={a.actionType} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1 text-xs text-zinc-400">
                  <span className="font-semibold text-zinc-200">{a.modUsername ?? "Mod"}</span>
                  <span>→</span>
                  <span className="font-semibold text-zinc-200">{a.targetUsername ?? "(kein Ziel)"}</span>
                </div>
                {a.reason && <p className="mt-0.5 text-[11px] text-zinc-500">{a.reason}</p>}
                {a.expiresAt && (
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-red-400">
                    <Clock className="h-2.5 w-2.5" />
                    Bis {new Date(a.expiresAt).toLocaleString("de-DE")}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[10px] text-zinc-600">{timeAgo(a.createdAt)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Shell
// ---------------------------------------------------------------------------

type ModTab = "overview" | "users" | "tickets" | "actions" | "chat" | "ki";

interface ModShellProps {
  modUsername: string;
  credits: number;
  streakDays: number;
  permissions: ModPermissions;
  users: ModUserSummary[];
  tickets: ModTicket[];
  recentActions: ModActionRow[];
  myActions: ModActionRow[];
  isAdminUser?: boolean;
  userId?: string;
}

const ADMIN_PERMS = ADMIN_MOD_PERMISSIONS;

function ModShellInner({
  modUsername, credits, streakDays, permissions: rawPerms,
  users, tickets, recentActions, myActions, isAdminUser = false, userId,
}: ModShellProps) {
  const [permissions, setPermissions] = useState<ModPermissions>(
    isAdminUser ? ADMIN_PERMS : rawPerms
  );
  const searchParams = useSearchParams();
  const router = useRouter();
  const sound = useSoundManager();

  const [activeTab, setActiveTab] = useState<ModTab>(() => {
    const q = searchParams.get("tab");
    return (q === "tickets" || q === "users" || q === "actions" || q === "chat" || q === "ki") ? q : "overview";
  });
  const [deepOpenTicketId, setDeepOpenTicketId] = useState<string | null>(
    () => searchParams.get("open")
  );
  const [refreshing, setRefreshing] = useState(false);
  const [newTicketCount, setNewTicketCount] = useState(0);

  // Realtime: show a "neue Tickets" banner whenever a ticket is inserted while
  // the mod is on this page — without forcing a full page refresh automatically.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("mod-panel-tickets")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tickets" },
        () => setNewTicketCount((n) => n + 1)
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  // Realtime: live-update permissions whenever admin changes them (global or per-user).
  // Admin broadcasts on "mod-permissions-live" after every permission save.
  useEffect(() => {
    if (isAdminUser) return; // admins always have full perms, no need to re-fetch
    const supabase = createClient();
    const channel = supabase
      .channel("mod-permissions-live")
      .on("broadcast", { event: "permissions_changed" }, () => {
        getMyEffectivePermissions().then((p) => setPermissions(p));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [isAdminUser]);

  useEffect(() => {
    const q = searchParams.get("tab");
    if (q === "tickets" || q === "users" || q === "actions" || q === "chat" || q === "ki") setActiveTab(q);
    const open = searchParams.get("open");
    if (open) setDeepOpenTicketId(open);
  }, [searchParams]);

  const openTicketsCount = tickets.filter((t) => t.status === "open" || t.status === "in_progress").length;

  const tabs: { id: ModTab; label: string; Icon: typeof Shield; badge?: number; show: boolean }[] = [
    { id: "overview", label: "Übersicht",     Icon: LayoutDashboard, show: true },
    { id: "users",    label: "Nutzer",         Icon: Users,           badge: users.length,
      show: permissions.canViewUserDetails || permissions.canWarnUsers || permissions.canTempBanUsers },
    { id: "tickets",  label: "Tickets",        Icon: Ticket,          badge: openTicketsCount,
      show: permissions.canViewTickets },
    { id: "actions",  label: "Aktionen",       Icon: History,         show: true },
    { id: "chat",     label: "Chat",           Icon: MessageSquare,   show: true },
    { id: "ki",       label: "KI-Assistent",   Icon: Sparkles,        show: true },
  ];

  function refresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 1200);
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar credits={credits} streakDays={streakDays} isModerator={!isAdminUser} isAdmin={isAdminUser} />

      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        {/* Header */}
        <div className="relative mb-8 overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-950/50 via-purple-950/20 to-transparent p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(14,165,233,0.12),transparent_65%)]" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-3 text-2xl font-extrabold text-zinc-100">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/15 shadow-[0_0_20px_rgba(14,165,233,0.2)]">
                  <Shield className="h-5 w-5 text-sky-400" />
                </div>
                Moderations-Panel
              </h1>
              <p className="mt-1.5 text-sm text-zinc-500">
                Eingeloggt als <strong className="text-zinc-300">{modUsername}</strong>
                {isAdminUser && (
                  <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                    Admin
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={refresh} disabled={refreshing}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                Aktualisieren
              </button>
              <Link
                href="/"
                onMouseEnter={sound.hover}
                onClick={sound.click}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
              >
                <LogOut className="h-3.5 w-3.5" />
                Zurück
              </Link>
            </div>
          </div>
        </div>

        {/* Realtime new-ticket banner */}
        {newTicketCount > 0 && (
          <button
            onClick={() => { setNewTicketCount(0); refresh(); setActiveTab("tickets"); }}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-purple-500/40 bg-purple-500/10 px-4 py-2.5 text-sm font-bold text-purple-200 transition-colors hover:bg-purple-500/20"
          >
            <Ticket className="h-4 w-4 animate-pulse" />
            {newTicketCount} neue{newTicketCount !== 1 ? " Tickets" : "s Ticket"} eingegangen — Klick zum Aktualisieren
          </button>
        )}

        {/* Tab bar */}
        <div className="mb-6 flex gap-1 rounded-2xl border border-white/8 bg-black/30 p-1">
          {tabs.filter((t) => t.show).map((t) => (
            <button
              key={t.id}
              onMouseEnter={sound.hover}
              onClick={() => { sound.click(); setActiveTab(t.id); }}
              className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all ${
                activeTab === t.id
                  ? "bg-sky-500/20 text-sky-200 shadow-[0_0_16px_rgba(14,165,233,0.2)]"
                  : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
              }`}
            >
              <t.Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">{t.label}</span>
              {t.id === "tickets" && openTicketsCount > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-purple-500 px-0.5 text-[9px] font-black text-white">
                  {openTicketsCount > 9 ? "9+" : openTicketsCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === "overview" && (
          <OverviewTab users={users} tickets={tickets} perms={permissions} myActions={myActions} />
        )}
        {activeTab === "users" && (
          <UsersTab users={users} perms={permissions} onRefresh={refresh} />
        )}
        {activeTab === "tickets" && (
          <TicketsTab
            tickets={tickets} perms={permissions} onRefresh={refresh}
            openTicketId={deepOpenTicketId} onTicketOpened={() => setDeepOpenTicketId(null)}
          />
        )}
        {activeTab === "actions" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-sky-400" />
              <h3 className="text-sm font-bold text-zinc-300">Alle Moderations-Aktionen</h3>
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
                {recentActions.length}
              </span>
            </div>
            <ActionLog actions={recentActions} />
          </div>
        )}
        {activeTab === "chat" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-purple-400" />
              <h3 className="text-sm font-bold text-zinc-300">Global Chat</h3>
              {!permissions.canClearChat && !isAdminUser && (
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
                  Kein Lösch-Recht
                </span>
              )}
            </div>
            <div className="overflow-hidden rounded-2xl border border-white/8 bg-black/30" style={{ height: "calc(100vh - 340px)", minHeight: "500px" }}>
              <GlobalChatPanel isStaff={permissions.canClearChat || isAdminUser} />
            </div>
          </div>
        )}
        {activeTab === "ki" && (
          <div className="mx-auto max-w-3xl" style={{ height: "calc(100vh - 280px)", minHeight: "500px" }}>
            <AdminAiChat context={isAdminUser ? "admin" : "mod"} />
          </div>
        )}
      </div>
    </div>
  );
}

export function ModShell(props: ModShellProps) {
  return (
    <Suspense fallback={null}>
      <ModShellInner {...props} />
    </Suspense>
  );
}
