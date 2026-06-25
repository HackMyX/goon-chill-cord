"use client";

import { useState, useTransition, useEffect, useMemo, useRef, Suspense } from "react";
import {
  Shield, Users, Ticket, Activity, AlertTriangle, Ban, StickyNote,
  ChevronDown, Check, X, Coins, Clock, Search, LogOut, Trash2, Loader2,
  Sparkles, LayoutDashboard, RefreshCw, History, NotepadText, FileText,
  Trophy, Paperclip, MessageSquare, Bug, Lightbulb, ArrowUpRight,
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
  modEscalateTicket, getMyEffectivePermissions,
} from "@/lib/actions/mod";
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

function UsersTab({ users: initialUsers, perms, onRefresh }: {
  users: ModUserSummary[];
  perms: ModPermissions;
  onRefresh: () => void;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [userFilter, setUserFilter] = useState<UserFilter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const { currencyName } = useSiteConfig();

  // Sync with server refresh
  useEffect(() => { setUsers(initialUsers); }, [initialUsers]);

  const bannedCount = useMemo(
    () => users.filter((u) => u.tempBannedUntil && new Date(u.tempBannedUntil) > new Date()).length,
    [users]
  );
  const warnedCount = useMemo(() => users.filter((u) => u.warningCount > 0).length, [users]);

  const filtered = useMemo(() => {
    let list = users;
    if (userFilter === "banned") list = list.filter((u) => u.tempBannedUntil && new Date(u.tempBannedUntil) > new Date());
    if (userFilter === "warned") list = list.filter((u) => u.warningCount > 0);
    if (query.trim()) list = list.filter((u) => u.username.toLowerCase().includes(query.toLowerCase()));
    return list;
  }, [users, userFilter, query]);

  function handleWarningRemoved(userId: string) {
    setUsers((prev) =>
      prev.map((u) => u.id === userId ? { ...u, warningCount: Math.max(0, u.warningCount - 1) } : u)
    );
    onRefresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search + filter chips */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nutzer suchen…"
            className="w-full rounded-xl border border-white/8 bg-white/[0.03] py-2.5 pl-10 pr-3 text-sm text-zinc-100 outline-none transition-colors focus:border-sky-400/40"
          />
        </div>
        <div className="flex gap-1.5">
          {([
            { key: "all",    label: `Alle (${users.length})` },
            { key: "banned", label: `Gesperrt (${bannedCount})` },
            { key: "warned", label: `Verwarnt (${warnedCount})` },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setUserFilter(key)}
              className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                userFilter === key
                  ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
                  : "border-white/8 bg-white/[0.02] text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
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

const ALL_TICKET_STATUSES = ["open", "in_progress", "closed"] as const;
const ALL_TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const STATUS_LABEL: Record<string, string> = { open: "Offen", in_progress: "In Bearb.", resolved: "Gelöst/Geschlossen", closed: "Gelöst/Geschlossen" };
const PRIORITY_LABEL: Record<string, string> = { low: "Niedrig", normal: "Normal", high: "Hoch", urgent: "Dringend" };

function TicketItem({ t, perms, onRefresh, defaultOpen }: {
  t: ModTicket;
  perms: ModPermissions;
  onRefresh: () => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [closeReason, setCloseReason] = useState("");
  const [replyText, setReplyText] = useState("");
  const [msgs, setMsgs] = useState<TicketMessage[] | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showReward, setShowReward] = useState(false);
  const [rewardCredits, setRewardCredits] = useState(500);
  const [rewardNote, setRewardNote] = useState("");
  const isActionable = t.status === "open" || t.status === "in_progress";
  const isInProgress = t.status === "in_progress";
  const isClosed = t.status === "closed" || t.status === "resolved";
  const alreadyRewarded = !!t.rewardGrantedAt;
  const rewardIsPending = !alreadyRewarded && t.rewardPending;
  const [escalating, setEscalating] = useState(false);
  const sound = useSoundManager();
  const itemRef = useRef<HTMLDivElement>(null);
  const prevDefaultOpen = useRef(defaultOpen ?? false);

  // On mount: if already flagged as "open via deep link", scroll into view.
  useEffect(() => {
    if (!defaultOpen) return;
    const timer = setTimeout(() => {
      itemRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dynamic deep-link: if defaultOpen flips to true after initial mount, open + scroll.
  useEffect(() => {
    if (defaultOpen && !prevDefaultOpen.current) {
      setOpen(true);
      const timer = setTimeout(() => {
        itemRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 250);
      prevDefaultOpen.current = true;
      return () => clearTimeout(timer);
    }
    prevDefaultOpen.current = defaultOpen ?? false;
  }, [defaultOpen]);

  useEffect(() => {
    if (!open || msgs !== null) return;
    setLoadingMsgs(true);
    getTicketMessages(t.id).then((list) => { setMsgs(list); setLoadingMsgs(false); });
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

  function handleReply() {
    if (!replyText.trim()) return;
    sound.click();
    startTransition(async () => {
      const res = await modReplyToTicket(t.id, replyText);
      if (res.success) {
        showFlash("Antwort gesendet.", true);
        setReplyText("");
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
      });
      if (res.success) {
        showFlash(`+${rewardCredits} Credits vergeben!`, true);
        setShowReward(false);
        onRefresh();
      } else showFlash(res.error ?? "Fehler.", false);
    });
  }

  const statusCls = isActionable
    ? isInProgress
      ? "border-amber-500/20 bg-amber-500/5"
      : "border-purple-500/20 bg-purple-500/5"
    : "border-white/8 bg-white/[0.02]";

  const dotCls = isActionable
    ? isInProgress
      ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]"
      : "bg-purple-400 shadow-[0_0_6px_rgba(168,85,247,0.6)]"
    : "bg-zinc-600";

  return (
    <div ref={itemRef} className={`overflow-hidden rounded-2xl border transition-colors ${statusCls}`}>
      <button
        className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className={`h-2 w-2 shrink-0 rounded-full ${dotCls}`} />
            <span className="break-words font-semibold text-zinc-100">{t.subject}</span>
            {t.escalatedToAdmin && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-orange-500/40 bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-300">
                <ArrowUpRight className="h-2.5 w-2.5" />
                Weitergeleitet
              </span>
            )}
            {alreadyRewarded && <Trophy className="h-3 w-3 shrink-0 text-amber-400" aria-label="Bereits belohnt" />}
            {t.attachmentUrl && <Paperclip className="h-3 w-3 shrink-0 text-zinc-500" aria-label="Hat Anhang" />}
          </div>
          <span className="text-[11px] text-zinc-500">von <StyledUsername name={t.username} styleKey={t.nameStyleKey} size="sm" disablePopup /></span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isInProgress && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">In Bearb.</span>
          )}
          {t.status === "open" && (
            <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300">Offen</span>
          )}
          <span className="text-[10px] text-zinc-600">{timeAgo(t.createdAt)}</span>
          <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="border-t border-white/5 px-4 pb-4 pt-3">
          {/* Meta */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-zinc-500">
              von <strong className="text-zinc-300"><StyledUsername name={t.username} styleKey={t.nameStyleKey} size="sm" disablePopup /></strong>
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
              <a
                href={t.attachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center gap-1.5 text-[11px] text-purple-400 hover:text-purple-300"
              >
                <Paperclip className="h-3 w-3" />
                Anhang ansehen
              </a>
            )}
          </div>

          {/* Thread messages */}
          {loadingMsgs && (
            <div className="mt-3 flex items-center gap-2 text-xs text-zinc-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />Lade Nachrichten…
            </div>
          )}
          {msgs && msgs.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {msgs.map((m) => (
                <div key={m.id} className={`flex gap-2.5 ${m.isStaff ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    m.isStaff ? "rounded-tr-sm bg-sky-500/20 text-sky-100" : "rounded-tl-sm bg-white/5 text-zinc-300"
                  }`}>
                    <p className="whitespace-pre-wrap">{m.message}</p>
                    <p className={`mt-1 text-[10px] ${m.isStaff ? "text-sky-400/70 text-right" : "text-zinc-600"}`}>
                      {m.isStaff ? "Staff" : <StyledUsername name={m.username} styleKey={m.nameStyleKey} size="sm" disablePopup />} · {timeAgo(m.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Reward banner */}
          {alreadyRewarded && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
              <Trophy className="h-3.5 w-3.5 shrink-0" />
              Belohnung ausgezahlt{t.rewardCredits ? ` · +${t.rewardCredits} Credits` : ""}
              {t.rewardNote && <span className="text-amber-400/70"> — {t.rewardNote}</span>}
            </div>
          )}
          {rewardIsPending && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-[11px]">
              <Trophy className="h-3.5 w-3.5 shrink-0 animate-pulse text-amber-400" />
              <span className="font-bold text-amber-300">
                Belohnung angepinnt{t.rewardCredits ? ` · +${t.rewardCredits} Credits` : ""}
              </span>
              {t.rewardNote && <span className="text-amber-400/70"> — {t.rewardNote}</span>}
              <span className="ml-auto rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                Auszahlung bei Lösung
              </span>
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
                <button
                  onClick={handleReply} disabled={pending || !replyText.trim()}
                  className="flex shrink-0 items-center gap-1.5 self-end rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-sky-500 disabled:opacity-50"
                >
                  {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Antworten
                </button>
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
          {(perms.canDeleteTickets || perms.canRewardTickets || (perms.canCloseTickets && !t.escalatedToAdmin)) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
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
          {showReward && perms.canRewardTickets && (
            <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-amber-300">Belohnung vergeben</p>
                {perms.maxRewardPerTicket > 0 && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                    max. {fmt(perms.maxRewardPerTicket)} CR
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-zinc-500">Credits</span>
                  <input
                    type="number"
                    min={0}
                    max={perms.maxRewardPerTicket > 0 ? perms.maxRewardPerTicket : undefined}
                    value={rewardCredits}
                    onChange={(e) => {
                      const v = Math.max(0, Number(e.target.value));
                      setRewardCredits(perms.maxRewardPerTicket > 0 ? Math.min(v, perms.maxRewardPerTicket) : v);
                    }}
                    className="w-28 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-amber-400/40"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-[10px] text-zinc-500">Notiz (optional)</span>
                  <input
                    type="text" value={rewardNote} onChange={(e) => setRewardNote(e.target.value)}
                    maxLength={100} placeholder="z.B. Super Bug-Report!"
                    className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-400/40"
                  />
                </label>
              </div>
              {perms.maxRewardPerTicket > 0 && rewardCredits > perms.maxRewardPerTicket && (
                <p className="mt-1.5 text-[10px] text-red-400">
                  Limit überschritten — max. {fmt(perms.maxRewardPerTicket)} CR erlaubt.
                </p>
              )}
              <button
                onClick={handleGrantReward}
                disabled={pending || rewardCredits < 1 || (perms.maxRewardPerTicket > 0 && rewardCredits > perms.maxRewardPerTicket)}
                className="mt-2 flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500 disabled:opacity-50 transition-colors"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trophy className="h-3.5 w-3.5" />}
                Belohnung anpinnen
              </button>
            </div>
          )}

          {flash && (
            <p className={`mt-2 text-xs font-medium ${flash.ok ? "text-emerald-400" : "text-red-400"}`}>
              {flash.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tickets Tab
// ---------------------------------------------------------------------------

const TICKET_STATUS_CONFIG = [
  {
    key: "open",
    label: "Offen",
    dot: "bg-purple-400 shadow-[0_0_6px_rgba(168,85,247,0.6)]",
    badge: "bg-purple-500/20 text-purple-300",
    heading: "text-zinc-200",
    empty: "Keine offenen Tickets. Alles erledigt!",
  },
  {
    key: "in_progress",
    label: "In Bearbeitung",
    dot: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]",
    badge: "bg-amber-500/20 text-amber-300",
    heading: "text-zinc-200",
    empty: "Keine Tickets in Bearbeitung.",
  },
  {
    key: "closed",
    label: "Gelöst/Geschlossen",
    dot: "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]",
    badge: "bg-emerald-500/20 text-emerald-300",
    heading: "text-zinc-400",
    empty: "",
  },
] as const;

type TicketStatusFilter = "open" | "in_progress" | "closed" | "all";

function TicketsTab({ tickets, perms, onRefresh, openTicketId, onTicketOpened }: {
  tickets: ModTicket[];
  perms: ModPermissions;
  onRefresh: () => void;
  openTicketId?: string | null;
  onTicketOpened?: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<TicketStatusFilter>(() =>
    openTicketId ? "all" : "open"
  );

  // When a deep-link ticket arrives (even dynamically), ensure it's visible and
  // delay clearing the id until after the scroll animation has had time to run.
  useEffect(() => {
    if (!openTicketId) return;
    setStatusFilter("all");
    const timer = setTimeout(() => onTicketOpened?.(), 600);
    return () => clearTimeout(timer);
  }, [openTicketId, onTicketOpened]);

  const bugTickets = tickets.filter((t) => t.category === "bug");
  const suggestionTickets = tickets.filter((t) => t.category === "suggestion");

  const countByStatus = {
    open: tickets.filter((t) => t.status === "open").length,
    in_progress: tickets.filter((t) => t.status === "in_progress").length,
    closed: tickets.filter((t) => t.status === "closed" || t.status === "resolved").length,
  };

  const filterButtons: Array<{ key: TicketStatusFilter; label: string; count?: number }> = [
    { key: "all", label: `Alle (${tickets.length})` },
    { key: "open", label: `Offen`, count: countByStatus.open },
    { key: "in_progress", label: `In Bearb.`, count: countByStatus.in_progress },
    { key: "closed", label: `Gelöst/Geschlossen`, count: countByStatus.closed },
  ];

  function renderTicketGroup(group: ModTicket[]) {
    const filtered = statusFilter === "all" ? group : group.filter((t) =>
      statusFilter === "closed"
        ? (t.status === "closed" || t.status === "resolved")
        : t.status === statusFilter
    );

    if (filtered.length === 0) {
      return (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] py-8 text-center">
          <Ticket className="mx-auto mb-2 h-6 w-6 text-zinc-700" />
          <p className="text-sm text-zinc-600">Keine Tickets in diesem Filter.</p>
        </div>
      );
    }

    if (statusFilter === "all") {
      return (
        <div className="flex flex-col gap-3">
          {TICKET_STATUS_CONFIG.map((cfg) => {
            const statusGroup = filtered.filter((t) =>
              cfg.key === "closed"
                ? (t.status === "closed" || t.status === "resolved")
                : t.status === cfg.key
            );
            if (statusGroup.length === 0) return null;
            return (
              <div key={cfg.key}>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <div className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.heading}`}>{cfg.label}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${cfg.badge}`}>{statusGroup.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {(cfg.key === "closed" ? statusGroup.slice(0, 15) : statusGroup).map((t) => (
                    <TicketItem key={t.id} t={t} perms={perms} onRefresh={onRefresh} defaultOpen={openTicketId === t.id} />
                  ))}
                  {cfg.key === "closed" && statusGroup.length > 15 && (
                    <p className="text-center text-[11px] text-zinc-600">+ {statusGroup.length - 15} weitere</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    const sliceLimit = statusFilter === "closed" ? 30 : filtered.length;
    return (
      <div className="flex flex-col gap-2">
        {filtered.slice(0, sliceLimit).map((t) => (
          <TicketItem key={t.id} t={t} perms={perms} onRefresh={onRefresh} defaultOpen={openTicketId === t.id} />
        ))}
        {statusFilter === "closed" && filtered.length > 30 && (
          <p className="text-center text-[11px] text-zinc-600">+ {filtered.length - 30} weitere</p>
        )}
      </div>
    );
  }

  const bugOpen = bugTickets.filter((t) => t.status === "open" || t.status === "in_progress").length;
  const suggestionOpen = suggestionTickets.filter((t) => t.status === "open" || t.status === "in_progress").length;

  return (
    <div className="flex flex-col gap-4">
      {/* Status filter bar */}
      <div className="flex flex-wrap items-center gap-1.5">
        {filterButtons.map(({ key, label, count }) => {
          const active = statusFilter === key;
          return (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
                active
                  ? "border-sky-500/40 bg-sky-500/15 text-sky-200"
                  : "border-white/8 bg-white/[0.02] text-zinc-500 hover:border-white/20 hover:text-zinc-300"
              }`}
            >
              {label}
              {count !== undefined && count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${
                  active ? "bg-sky-500/30 text-sky-200" : "bg-white/10 text-zinc-400"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] py-16 text-center">
          <Ticket className="mx-auto mb-3 h-10 w-10 text-zinc-700" />
          <p className="text-sm font-semibold text-zinc-500">Keine Tickets vorhanden.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Left column: Bugs */}
          <div className="flex flex-col gap-3 rounded-2xl border border-red-500/25 bg-gradient-to-br from-red-950/20 via-transparent to-transparent p-4">
            <div className="flex items-center gap-2 border-b border-red-500/15 pb-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/15">
                <Bug className="h-3.5 w-3.5 text-red-400" />
              </div>
              <h3 className="font-bold text-red-300">Bugs</h3>
              <span className="rounded-full border border-red-500/30 bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-300">
                {bugTickets.length}
              </span>
              {bugOpen > 0 && (
                <span className="ml-auto rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] font-bold text-orange-300">
                  {bugOpen} aktiv
                </span>
              )}
            </div>
            {renderTicketGroup(bugTickets)}
          </div>

          {/* Right column: Verbesserungsvorschläge */}
          <div className="flex flex-col gap-3 rounded-2xl border border-sky-500/25 bg-gradient-to-br from-sky-950/20 via-transparent to-transparent p-4">
            <div className="flex items-center gap-2 border-b border-sky-500/15 pb-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/15">
                <Lightbulb className="h-3.5 w-3.5 text-sky-400" />
              </div>
              <h3 className="font-bold text-sky-300">Verbesserungsvorschläge</h3>
              <span className="rounded-full border border-sky-500/30 bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                {suggestionTickets.length}
              </span>
              {suggestionOpen > 0 && (
                <span className="ml-auto rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300">
                  {suggestionOpen} aktiv
                </span>
              )}
            </div>
            {renderTicketGroup(suggestionTickets)}
          </div>
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
  const totalWarnings = users.reduce((s, u) => s + u.warningCount, 0);
  const totalNotes = users.reduce((s, u) => s + u.noteCount, 0);

  const stats = [
    { label: "Nutzer gesamt",   value: users.length,   Icon: Users,         color: "text-sky-300",    glow: "from-sky-500/10" },
    { label: "Offene Tickets",  value: openTickets,    Icon: Ticket,        color: "text-purple-300", glow: "from-purple-500/10" },
    { label: "Temp-Gesperrt",   value: bannedCount,    Icon: Ban,           color: "text-red-300",    glow: "from-red-500/10" },
    { label: "Aktive Verw.",    value: totalWarnings,  Icon: AlertTriangle, color: "text-amber-300",  glow: "from-amber-500/10" },
  ];

  const permRows = [
    { label: "Tickets ansehen",   val: perms.canViewTickets,    Icon: Ticket },
    { label: "Tickets schließen", val: perms.canCloseTickets,   Icon: Check },
    { label: "Nutzer verwarnen",  val: perms.canWarnUsers,      Icon: AlertTriangle },
    { label: "Temp-Ban",          val: perms.canTempBanUsers,   Icon: Ban },
    { label: "Nutzerdetails",     val: perms.canViewUserDetails, Icon: Users },
    { label: "Audit-Log",         val: perms.canViewAuditLog,   Icon: Activity },
    { label: "Credits vergeben",  val: perms.canAddCredits,     Icon: Coins },
    { label: "Ticket-Belohnungen", val: perms.canRewardTickets, Icon: Trophy },
    { label: `Max Ban: ${perms.maxTempBanHours}h`, val: perms.canTempBanUsers, Icon: Clock },
    { label: perms.maxRewardPerTicket > 0 ? `Max Reward: ${fmt(perms.maxRewardPerTicket)} CR` : "Reward: unbegrenzt", val: perms.canRewardTickets, Icon: Sparkles },
    { label: perms.warnRequiresReason ? "Begr. Pflicht" : "Begr. Optional", val: true, Icon: FileText },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
