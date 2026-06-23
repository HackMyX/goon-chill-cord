"use client";

import { useState, useTransition } from "react";
import {
  Shield, Users, Ticket, Activity, AlertTriangle, Ban, StickyNote,
  ChevronDown, Check, X, Coins, Clock, Search, Info, LogOut,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import { useSoundManager } from "@/lib/sound-manager";
import { TopBar } from "@/components/layout/top-bar";
import {
  modWarnUser, modAddNote, modTempBan, modLiftBan, modCloseTicket, modAddCredits,
} from "@/lib/actions/mod";
import type { ModPermissions, ModActionRow, ModUserSummary, ModTicket } from "@/lib/mod";

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

function ActionTypeBadge({ type }: { type: ModActionRow["actionType"] }) {
  const map: Record<ModActionRow["actionType"], { label: string; cls: string }> = {
    warning: { label: "Verwarnung", cls: "bg-amber-500/20 text-amber-300" },
    note: { label: "Notiz", cls: "bg-sky-500/20 text-sky-300" },
    temp_ban: { label: "Temp-Ban", cls: "bg-red-500/20 text-red-300" },
    ticket_close: { label: "Ticket", cls: "bg-purple-500/20 text-purple-300" },
    credits_add: { label: "Credits", cls: "bg-emerald-500/20 text-emerald-300" },
  };
  const { label, cls } = map[type] ?? { label: type, cls: "bg-zinc-700 text-zinc-300" };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>{label}</span>;
}

// ---------------------------------------------------------------------------
// Action tab
// ---------------------------------------------------------------------------

function ActionLog({ actions }: { actions: ModActionRow[] }) {
  return (
    <div className="flex flex-col gap-2">
      {actions.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">Noch keine Aktionen.</p>
      )}
      {actions.map((a) => (
        <div key={a.id} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
          <ActionTypeBadge type={a.actionType} />
          <div className="flex-1 min-w-0">
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
          <span className="text-[10px] text-zinc-600 flex-shrink-0">{timeAgo(a.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users tab
// ---------------------------------------------------------------------------

function UserActionsPanel({
  user: u, perms, onDone,
}: {
  user: ModUserSummary;
  perms: ModPermissions;
  onDone: () => void;
}) {
  const [tab, setTab] = useState<"warn" | "note" | "ban" | "credits">("warn");
  const [reason, setReason] = useState("");
  const [banHours, setBanHours] = useState(1);
  const [creditsAmount, setCreditsAmount] = useState(100);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const sound = useSoundManager();
  const { currencyName } = useSiteConfig();

  const isBanned = u.tempBannedUntil && new Date(u.tempBannedUntil) > new Date();

  function flash(msg: string, ok: boolean) {
    setMessage(msg);
    if (ok) { sound.win(); } else { sound.error(); }
    setTimeout(() => setMessage(null), 3000);
  }

  function doAction() {
    sound.click();
    startTransition(async () => {
      let res: { success: boolean; error?: string };
      if (tab === "warn") res = await modWarnUser(u.id, reason);
      else if (tab === "note") res = await modAddNote(u.id, reason);
      else if (tab === "ban") res = await modTempBan(u.id, banHours, reason);
      else res = await modAddCredits(u.id, creditsAmount, reason);

      if (res.success) { flash("Erfolgreich.", true); setReason(""); onDone(); }
      else flash(res.error ?? "Fehler.", false);
    });
  }

  async function liftBan() {
    sound.click();
    const res = await modLiftBan(u.id);
    if (res.success) { flash("Ban aufgehoben.", true); onDone(); }
    else flash(res.error ?? "Fehler.", false);
  }

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-[#0b0814] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {perms.canWarnUsers && (
          <button onClick={() => setTab("warn")} className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${tab === "warn" ? "bg-amber-500/25 text-amber-200" : "bg-white/5 text-zinc-500 hover:bg-white/10"}`}>
            <AlertTriangle className="inline-block h-3 w-3 mr-1" />Verwarnen
          </button>
        )}
        {perms.canWarnUsers && (
          <button onClick={() => setTab("note")} className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${tab === "note" ? "bg-sky-500/25 text-sky-200" : "bg-white/5 text-zinc-500 hover:bg-white/10"}`}>
            <StickyNote className="inline-block h-3 w-3 mr-1" />Notiz
          </button>
        )}
        {perms.canTempBanUsers && (
          <button onClick={() => setTab("ban")} className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${tab === "ban" ? "bg-red-500/25 text-red-200" : "bg-white/5 text-zinc-500 hover:bg-white/10"}`}>
            <Ban className="inline-block h-3 w-3 mr-1" />Temp-Ban
          </button>
        )}
        {perms.canAddCredits && (
          <button onClick={() => setTab("credits")} className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${tab === "credits" ? "bg-emerald-500/25 text-emerald-200" : "bg-white/5 text-zinc-500 hover:bg-white/10"}`}>
            <Coins className="inline-block h-3 w-3 mr-1" />Credits
          </button>
        )}
        {isBanned && perms.canTempBanUsers && (
          <button onClick={liftBan} className="rounded-full bg-red-500/20 px-3 py-1 text-[11px] font-bold text-red-300 hover:bg-red-500/30">
            <X className="inline-block h-3 w-3 mr-1" />Ban aufheben
          </button>
        )}
      </div>

      {tab === "ban" && (
        <div className="mb-2 flex items-center gap-2">
          <label className="text-[11px] text-zinc-400">Dauer:</label>
          <input type="number" min={1} max={perms.maxTempBanHours} value={banHours}
            onChange={(e) => setBanHours(Number(e.target.value))}
            className="w-20 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100" />
          <span className="text-[11px] text-zinc-500">Stunden (max. {perms.maxTempBanHours}h)</span>
        </div>
      )}

      {tab === "credits" && (
        <div className="mb-2 flex items-center gap-2">
          <label className="text-[11px] text-zinc-400">Betrag:</label>
          <input type="number" value={creditsAmount}
            onChange={(e) => setCreditsAmount(Number(e.target.value))}
            className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100" />
          <span className="text-[11px] text-zinc-500">{currencyName}</span>
        </div>
      )}

      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={perms.warnRequiresReason && tab !== "note" ? "Begründung (Pflicht)..." : "Begründung (optional)..."}
        className="mb-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={doAction}
          disabled={pending}
          className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-60"
        >
          <Check className="h-3 w-3" />Ausführen
        </button>
        {message && <span className="text-xs text-zinc-400">{message}</span>}
      </div>
    </div>
  );
}

function UsersTab({ users: initialUsers, perms, onRefresh }: {
  users: ModUserSummary[];
  perms: ModPermissions;
  onRefresh: () => void;
}) {
  const [users] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const filtered = users.filter((u) => u.username.toLowerCase().includes(query.toLowerCase()));
  const { currencyName } = useSiteConfig();

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nutzer suchen..."
          className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2 pl-10 pr-3 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
        />
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map((u) => {
          const isBanned = u.tempBannedUntil && new Date(u.tempBannedUntil) > new Date();
          return (
            <div key={u.id} className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <button
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
                onClick={() => setExpanded(expanded === u.id ? null : u.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${isBanned ? "bg-red-500" : u.role === "admin" ? "bg-amber-400" : u.role === "moderator" ? "bg-sky-400" : "bg-zinc-600"}`} />
                  <span className="font-semibold text-zinc-200 truncate">{u.username}</span>
                  {u.role !== "user" && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${u.role === "admin" ? "bg-amber-500/20 text-amber-300" : "bg-sky-500/20 text-sky-300"}`}>
                      {u.role === "admin" ? "Admin" : "Mod"}
                    </span>
                  )}
                  {isBanned && <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-300">GESPERRT</span>}
                  {u.warningCount > 0 && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                      {u.warningCount}× verwarnt
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {perms.canViewUserDetails && (
                    <span className="hidden text-[11px] text-zinc-500 sm:block">
                      {fmt(u.credits)} {currencyName} · {u.streakDays}🔥
                    </span>
                  )}
                  <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${expanded === u.id ? "rotate-180" : ""}`} />
                </div>
              </button>

              {expanded === u.id && (
                <div className="border-t border-white/5 px-4 pb-4">
                  {perms.canViewUserDetails && (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-zinc-500 sm:grid-cols-4">
                      <span>Credits: <strong className="text-zinc-300">{fmt(u.credits)}</strong></span>
                      <span>Streak: <strong className="text-zinc-300">{u.streakDays} Tage</strong></span>
                      <span>Verwarnungen: <strong className="text-zinc-300">{u.warningCount}</strong></span>
                      <span>Notizen: <strong className="text-zinc-300">{u.noteCount}</strong></span>
                      {isBanned && (
                        <span className="col-span-4 text-red-400">
                          Gesperrt bis: {new Date(u.tempBannedUntil!).toLocaleString("de-DE")}
                        </span>
                      )}
                    </div>
                  )}
                  <UserActionsPanel user={u} perms={perms} onDone={onRefresh} />
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">Keine Nutzer gefunden.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tickets tab
// ---------------------------------------------------------------------------

function TicketsTab({ tickets, perms, onRefresh }: {
  tickets: ModTicket[];
  perms: ModPermissions;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ id: string; msg: string; ok: boolean } | null>(null);
  const sound = useSoundManager();

  function handleClose(ticketId: string) {
    sound.click();
    startTransition(async () => {
      const res = await modCloseTicket(ticketId, reason);
      if (res.success) {
        setMessage({ id: ticketId, msg: "Ticket geschlossen.", ok: true });
        sound.win();
        setReason("");
        onRefresh();
      } else {
        setMessage({ id: ticketId, msg: res.error ?? "Fehler.", ok: false });
        sound.error();
      }
      setTimeout(() => setMessage(null), 3000);
    });
  }

  const open = tickets.filter((t) => t.status === "open");
  const closed = tickets.filter((t) => t.status !== "open");

  function TicketItem({ t }: { t: ModTicket }) {
    const isOpen = t.status === "open";
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
        <button
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
          onClick={() => setExpanded(expanded === t.id ? null : t.id)}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className={`h-2 w-2 rounded-full flex-shrink-0 ${isOpen ? "bg-emerald-400" : "bg-zinc-600"}`} />
            <span className="font-semibold text-zinc-200 truncate">{t.subject}</span>
            <span className="text-[11px] text-zinc-500">von {t.username}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] text-zinc-600">{timeAgo(t.createdAt)}</span>
            <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${expanded === t.id ? "rotate-180" : ""}`} />
          </div>
        </button>

        {expanded === t.id && (
          <div className="border-t border-white/5 px-4 pb-4">
            <p className="mt-3 text-sm text-zinc-300 whitespace-pre-wrap">{t.message}</p>
            {!isOpen && t.closedByUsername && (
              <p className="mt-2 text-[11px] text-zinc-500">
                Geschlossen von <strong>{t.closedByUsername}</strong> · {t.closedAt ? timeAgo(t.closedAt) : ""}
              </p>
            )}
            {isOpen && perms.canCloseTickets && (
              <div className="mt-3 flex flex-col gap-2">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Abschluss-Begründung (optional)..."
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleClose(t.id)}
                    disabled={pending}
                    className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-60"
                  >
                    <Check className="h-3 w-3" />Ticket schließen
                  </button>
                  {message?.id === t.id && (
                    <span className="text-xs text-zinc-400">{message.msg}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-emerald-300">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Offen ({open.length})
        </h3>
        {open.length === 0 && <p className="text-sm text-zinc-500">Keine offenen Tickets.</p>}
        <div className="flex flex-col gap-2">
          {open.map((t) => <TicketItem key={t.id} t={t} />)}
        </div>
      </div>
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-500">
          <span className="h-2 w-2 rounded-full bg-zinc-600" />
          Geschlossen ({closed.length})
        </h3>
        <div className="flex flex-col gap-2">
          {closed.slice(0, 20).map((t) => <TicketItem key={t.id} t={t} />)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({ users, tickets, perms, myActions }: {
  users: ModUserSummary[];
  tickets: ModTicket[];
  perms: ModPermissions;
  myActions: ModActionRow[];
}) {
  const { currencyName } = useSiteConfig();
  const bannedCount = users.filter((u) => u.tempBannedUntil && new Date(u.tempBannedUntil) > new Date()).length;
  const openTickets = tickets.filter((t) => t.status === "open").length;
  const totalWarnings = users.reduce((s, u) => s + u.warningCount, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Nutzer gesamt", value: users.length, icon: Users, color: "text-purple-300" },
          { label: "Offene Tickets", value: openTickets, icon: Ticket, color: "text-amber-300" },
          { label: "Gesperrte Nutzer", value: bannedCount, icon: Ban, color: "text-red-300" },
          { label: "Verwarnungen ges.", value: totalWarnings, icon: AlertTriangle, color: "text-orange-300" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="flex flex-col gap-1 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
            <div className="flex items-center gap-1.5">
              <Icon className={`h-4 w-4 ${color}`} />
              <span className="text-[11px] text-zinc-500">{label}</span>
            </div>
            <span className={`text-2xl font-extrabold ${color}`}>{value}</span>
          </div>
        ))}
      </div>

      {/* My recent actions */}
      <div>
        <h3 className="mb-3 text-sm font-bold text-zinc-300">Meine letzten Aktionen</h3>
        {myActions.length === 0 ? (
          <p className="text-sm text-zinc-500">Noch keine Aktionen.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {myActions.slice(0, 8).map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs">
                <ActionTypeBadge type={a.actionType} />
                <span className="text-zinc-400">→ <strong className="text-zinc-200">{a.targetUsername ?? "?"}</strong></span>
                {a.reason && <span className="text-zinc-500 truncate flex-1">· {a.reason}</span>}
                <span className="text-zinc-600 flex-shrink-0">{timeAgo(a.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Permissions */}
      <div>
        <h3 className="mb-3 text-sm font-bold text-zinc-300">Deine Berechtigungen</h3>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {[
            ["Tickets ansehen", perms.canViewTickets],
            ["Tickets schließen", perms.canCloseTickets],
            ["Nutzer verwarnen", perms.canWarnUsers],
            ["Temp-Ban", perms.canTempBanUsers],
            ["Nutzerdetails", perms.canViewUserDetails],
            ["Audit-Log", perms.canViewAuditLog],
            ["Credits vergeben", perms.canAddCredits],
          ].map(([label, enabled]) => (
            <div key={label as string} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${enabled ? "bg-emerald-500/10 text-emerald-300" : "bg-zinc-800 text-zinc-600"}`}>
              {enabled ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main shell
// ---------------------------------------------------------------------------

type ModTab = "overview" | "users" | "tickets" | "actions";

interface ModShellProps {
  modUsername: string;
  credits: number;
  streakDays: number;
  permissions: ModPermissions;
  users: ModUserSummary[];
  tickets: ModTicket[];
  recentActions: ModActionRow[];
  myActions: ModActionRow[];
}

export function ModShell({
  modUsername,
  credits,
  streakDays,
  permissions,
  users,
  tickets,
  recentActions,
  myActions,
}: ModShellProps) {
  const [activeTab, setActiveTab] = useState<ModTab>("overview");
  const router = useRouter();
  const sound = useSoundManager();

  const tabs: { id: ModTab; label: string; icon: typeof Shield; show: boolean }[] = [
    { id: "overview", label: "Übersicht", icon: Activity, show: true },
    { id: "users", label: "Nutzer", icon: Users, show: permissions.canViewUserDetails || permissions.canWarnUsers || permissions.canTempBanUsers },
    { id: "tickets", label: "Tickets", icon: Ticket, show: permissions.canViewTickets },
    { id: "actions", label: "Aktionen", icon: Activity, show: permissions.canViewAuditLog || true },
  ];

  function refresh() { router.refresh(); }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar credits={credits} streakDays={streakDays} isModerator={true} />
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-extrabold text-zinc-100">
            <Shield className="h-6 w-6 text-sky-400" />
            Moderations-Panel
          </h1>
          <p className="mt-1 text-sm text-zinc-500">Eingeloggt als <strong className="text-zinc-300">{modUsername}</strong></p>
        </div>
        <Link
          href="/"
          onMouseEnter={sound.hover}
          onClick={sound.click}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
        >
          <LogOut className="h-3.5 w-3.5" />
          Zurück
        </Link>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.id}
            onMouseEnter={sound.hover}
            onClick={() => { sound.click(); setActiveTab(t.id); }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all ${
              activeTab === t.id
                ? "bg-sky-500/20 text-sky-200 shadow-[0_0_12px_rgba(14,165,233,0.2)]"
                : "text-zinc-500 hover:text-zinc-200"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t.label}</span>
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
        <TicketsTab tickets={tickets} perms={permissions} onRefresh={refresh} />
      )}
      {activeTab === "actions" && (
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-bold text-zinc-300">Alle Moderations-Aktionen</h3>
          <ActionLog actions={recentActions} />
        </div>
      )}
    </div>
    </div>
  );
}
