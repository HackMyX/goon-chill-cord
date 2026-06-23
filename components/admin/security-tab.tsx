"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import {
  ShieldAlert, ShieldCheck, RefreshCw, Loader2, AlertTriangle,
  Users, Wifi, Clock, Ban, ChevronDown, ChevronUp, Eye, EyeOff,
  CheckCircle2, Trash2, Plus, X,
} from "lucide-react";
import {
  getSecurityData, banUserById, addIpIgnoreGroup, removeIpIgnoreGroup,
  type SecurityDataResult, type LoginEventRow, type DuplicateIpRow, type IgnoreGroupEntry,
} from "@/lib/actions/security";
import { useSoundManager } from "@/lib/sound-manager";

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color: string }) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <p className="text-xs font-semibold tracking-wide text-zinc-400">{label}</p>
      <p className="mt-1 text-3xl font-black text-zinc-50">{typeof value === "number" ? value.toLocaleString("de-DE") : value}</p>
      {sub && <p className="text-[11px] text-zinc-500">{sub}</p>}
    </div>
  );
}

function RelTime({ iso }: { iso: string }) {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return <span>{sec}s</span>;
  const min = Math.floor(sec / 60);
  if (min < 60) return <span>{min}m</span>;
  const hr = Math.floor(min / 60);
  if (hr < 24) return <span>{hr}h</span>;
  return <span>{Math.floor(hr / 24)}d</span>;
}

function DuplicateIpCard({
  row,
  ignored,
  onBan,
  onIgnore,
}: {
  row: DuplicateIpRow;
  ignored?: boolean;
  onBan?: (userId: string) => void;
  onIgnore?: (userIds: string[], reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [masked, setMasked] = useState(true);
  const [reason, setReason] = useState("");
  const display = masked ? row.ip_address.replace(/(\d+\.\d+)\.\d+\.\d+/, "$1.***.**") : row.ip_address;
  const sound = useSoundManager();

  return (
    <div className={`overflow-hidden rounded-xl border ${ignored ? "border-emerald-500/20 bg-emerald-500/[0.03] opacity-70" : "border-red-500/30 bg-red-500/[0.04]"}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
      >
        {ignored
          ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          : <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <code className={`font-mono text-sm font-bold ${ignored ? "text-emerald-300" : "text-red-300"}`}>{display}</code>
            <button
              onClick={(e) => { e.stopPropagation(); setMasked((m) => !m); }}
              className="rounded p-0.5 text-zinc-500 hover:text-zinc-300"
              title={masked ? "IP anzeigen" : "IP verbergen"}
            >
              {masked ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            </button>
            {ignored && <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">Ignoriert</span>}
          </div>
          <p className="text-[11px] text-zinc-500">
            {row.user_count} Accounts · zuletzt vor <RelTime iso={row.last_seen} />
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${ignored ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
          {row.user_count}×
        </span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" /> : <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />}
      </button>

      {open && (
        <div className="border-t border-white/[0.06] px-4 py-3">
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-zinc-400">BETROFFENE ACCOUNTS</p>
          <div className="mb-3 flex flex-col gap-1">
            {row.user_ids.map((id, i) => (
              <div key={id} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-1.5">
                <span className="font-mono text-xs text-zinc-300">{row.usernames?.[i] ?? id.slice(0, 8)}</span>
                <span className="flex-1 font-mono text-[10px] text-zinc-600">{id}</span>
                {!ignored && onBan && (
                  <button
                    onMouseEnter={sound.hover}
                    onClick={() => onBan(id)}
                    className="flex items-center gap-1 rounded-lg border border-red-500/30 px-2 py-1 text-[10px] font-semibold text-red-400 transition-colors hover:bg-red-500/10"
                  >
                    <Ban className="h-3 w-3" />
                    Bannen
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Ignore action — only on active (non-ignored) cards */}
          {!ignored && onIgnore && (
            <div className="flex flex-col gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-3">
              <p className="text-[11px] font-semibold text-emerald-300">
                Alle Accounts dieser IP zur Ignoreliste hinzufügen
              </p>
              <p className="text-[10px] text-zinc-500">
                z.B. wenn die Accounts zu Familienmitgliedern oder Mitbewohnern gehören. Diese IP-Gruppe erscheint dann nicht mehr als Warnung.
              </p>
              <div className="flex items-center gap-2">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Grund (optional, z.B. Brüder im selben Haushalt)"
                  className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-zinc-100 outline-none focus:border-emerald-400/60"
                />
                <button
                  onMouseEnter={sound.hover}
                  onClick={() => { sound.click(); onIgnore(row.user_ids, reason); setReason(""); setOpen(false); }}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-500"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Ignorieren
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IgnoreList({
  entries,
  onRemove,
}: {
  entries: IgnoreGroupEntry[];
  onRemove: (id: string) => void;
}) {
  const sound = useSoundManager();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? entries : entries.slice(0, 5);

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        <h3 className="text-sm font-bold text-emerald-300">Ignoreliste ({entries.length} Gruppe{entries.length !== 1 ? "n" : ""})</h3>
      </div>
      <p className="text-xs text-zinc-500">
        Diese Account-Gruppen teilen sich bekanntermaßen eine IP-Adresse (z.B. Familienmitglieder) und werden nicht als Duplikate gemeldet.
      </p>

      <div className="flex flex-col gap-2">
        {visible.map((entry) => (
          <div key={entry.id} className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {entry.usernames.map((name, i) => (
                  <span key={entry.userIds[i]} className="rounded-full bg-white/[0.06] px-2 py-0.5 font-semibold text-zinc-200">
                    {name ?? entry.userIds[i].slice(0, 8)}
                  </span>
                ))}
              </div>
              {entry.reason && (
                <p className="mt-1 text-[11px] text-zinc-500">{entry.reason}</p>
              )}
              <p className="mt-0.5 flex items-center gap-1 text-[10px] text-zinc-600">
                <Clock className="h-2.5 w-2.5" />
                Hinzugefügt {new Date(entry.createdAt).toLocaleDateString("de-DE")}
              </p>
            </div>
            <button
              onMouseEnter={sound.hover}
              onClick={() => { sound.click(); onRemove(entry.id); }}
              title="Aus Ignoreliste entfernen"
              className="shrink-0 rounded-lg border border-red-500/20 p-1.5 text-zinc-600 transition-colors hover:border-red-400/40 hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {entries.length > 5 && (
        <button
          onMouseEnter={sound.hover}
          onClick={() => { sound.click(); setExpanded((v) => !v); }}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 py-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
        >
          {expanded
            ? <><ChevronUp className="h-3 w-3" /> Weniger anzeigen</>
            : <><ChevronDown className="h-3 w-3" /> Alle {entries.length} Einträge anzeigen</>}
        </button>
      )}
    </div>
  );
}

function ManualIgnoreForm({
  onAdd,
}: {
  onAdd: (userIds: string[], reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState("");
  const [reason, setReason] = useState("");
  const sound = useSoundManager();

  function submit() {
    const parsed = ids.split(/[\n,\s]+/).map((s) => s.trim()).filter(Boolean);
    if (parsed.length < 2) return;
    onAdd(parsed, reason);
    setIds("");
    setReason("");
    setOpen(false);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      <button
        onMouseEnter={sound.hover}
        onClick={() => { sound.click(); setOpen((o) => !o); }}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-zinc-400 transition-colors hover:text-zinc-200"
      >
        <Plus className="h-4 w-4" />
        Manuell zur Ignoreliste hinzufügen
        {open ? <ChevronUp className="ml-auto h-4 w-4" /> : <ChevronDown className="ml-auto h-4 w-4" />}
      </button>

      {open && (
        <div className="border-t border-white/10 px-4 pb-4 pt-3 flex flex-col gap-3">
          <p className="text-[11px] text-zinc-500">
            User-IDs (UUIDs) eintragen — eine pro Zeile oder kommagetrennt. Mindestens 2 IDs.
          </p>
          <textarea
            value={ids}
            onChange={(e) => setIds(e.target.value)}
            rows={3}
            placeholder={"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\nyyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"}
            className="w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-emerald-400/60"
          />
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Grund (optional)"
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-zinc-100 outline-none focus:border-emerald-400/60"
          />
          <div className="flex items-center gap-2">
            <button
              onMouseEnter={sound.hover}
              onClick={() => { sound.click(); submit(); }}
              disabled={ids.split(/[\n,\s]+/).filter(Boolean).length < 2}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              Hinzufügen
            </button>
            <button
              onMouseEnter={sound.hover}
              onClick={() => { sound.click(); setOpen(false); }}
              className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" />
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LoginTable({ rows }: { rows: LoginEventRow[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, 30);

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-white/10 bg-white/[0.02]">
          <tr>
            <th className="px-3 py-2 font-semibold text-zinc-400">User</th>
            <th className="px-3 py-2 font-semibold text-zinc-400">IP</th>
            <th className="px-3 py-2 font-semibold text-zinc-400">User-Agent</th>
            <th className="px-3 py-2 whitespace-nowrap font-semibold text-zinc-400">Vor</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row, i) => (
            <tr key={row.id} className={i % 2 === 0 ? "bg-white/[0.01]" : ""}>
              <td className="px-3 py-1.5 font-medium text-zinc-200">{row.username}</td>
              <td className="px-3 py-1.5 font-mono text-zinc-400">{row.ip_address}</td>
              <td className="max-w-[200px] truncate px-3 py-1.5 text-zinc-500">{row.user_agent ?? "—"}</td>
              <td className="whitespace-nowrap px-3 py-1.5 text-zinc-500"><RelTime iso={row.created_at} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 30 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 border-t border-white/10 py-2 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
        >
          {showAll
            ? <><ChevronUp className="h-3 w-3" /> Weniger anzeigen</>
            : <><ChevronDown className="h-3 w-3" /> Alle {rows.length} Logins anzeigen</>}
        </button>
      )}
    </div>
  );
}

export function SecurityTab() {
  const [data, setData] = useState<SecurityDataResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [banningId, setBanningId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sound = useSoundManager();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getSecurityData();
    setData(res);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleBan(userId: string) {
    sound.click();
    if (!confirm(`Account ${userId.slice(0, 8)}... wirklich bannen?`)) return;
    setBanningId(userId);
    const res = await banUserById(userId);
    setBanningId(null);
    if (res.success) { sound.win(); await load(); }
    else { sound.error(); alert(res.error ?? "Fehler."); }
  }

  function handleIgnore(userIds: string[], reason: string) {
    sound.click();
    startTransition(async () => {
      const res = await addIpIgnoreGroup(userIds, reason);
      if (res.success) { sound.win(); await load(); }
      else { sound.error(); alert(res.error ?? "Fehler beim Hinzufügen."); }
    });
  }

  function handleRemoveIgnore(id: string) {
    sound.click();
    startTransition(async () => {
      const res = await removeIpIgnoreGroup(id);
      if (res.success) { sound.win(); await load(); }
      else { sound.error(); alert(res.error ?? "Fehler beim Entfernen."); }
    });
  }

  const hasDuplicates = (data?.duplicateIps?.length ?? 0) > 0;
  const hasIgnored = (data?.ignoredDuplicateIps?.length ?? 0) > 0;
  const hasIgnoreList = (data?.ignoreList?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`rounded-xl p-2.5 ${hasDuplicates ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"}`}>
            {hasDuplicates ? <ShieldAlert className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-100">Sicherheitszentrum</h2>
            <p className="text-xs text-zinc-500">IP-Tracking · Duplikat-Erkennung · Ignoreliste · Login-Verlauf</p>
          </div>
        </div>
        <button
          onClick={() => { sound.click(); load(); }}
          disabled={loading || pending}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:border-white/30 disabled:opacity-40"
        >
          {loading || pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Aktualisieren
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
        </div>
      )}

      {!loading && !data?.success && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-4 text-sm text-amber-200">
          {data?.error ?? "Fehler beim Laden der Sicherheitsdaten."}
          <p className="mt-1 text-xs text-amber-400/70">Stelle sicher, dass die login_events Tabelle in der DB existiert.</p>
        </div>
      )}

      {!loading && data?.success && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Logins (24h)" value={data.stats?.loginsLast24h ?? 0} color="border-blue-500/20 bg-blue-500/[0.04]" />
            <StatCard label="Logins (7 Tage)" value={data.stats?.loginsLast7d ?? 0} color="border-purple-500/20 bg-purple-500/[0.04]" />
            <StatCard label="Einzigartige IPs (7d)" value={data.stats?.uniqueIpsLast7d ?? 0} color="border-cyan-500/20 bg-cyan-500/[0.04]" />
            <StatCard
              label="IP-Duplikate"
              value={data.stats?.duplicateIpCount ?? 0}
              sub={(data.stats?.ignoredCount ?? 0) > 0 ? `${data.stats!.ignoredCount} ignoriert` : "Gleiche IP, mehrere Accounts"}
              color={hasDuplicates ? "border-red-500/40 bg-red-500/[0.08]" : "border-emerald-500/20 bg-emerald-500/[0.04]"}
            />
          </div>

          {/* Active duplicate warnings */}
          {hasDuplicates ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <h3 className="text-sm font-bold text-red-300">
                  IP-Duplikate erkannt ({data.duplicateIps!.length})
                </h3>
              </div>
              <p className="text-xs text-zinc-500">
                Diese IP-Adressen wurden von mehreren verschiedenen Accounts verwendet. Das kann auf geteilte
                Netzwerke, VPNs oder Mehrfach-Account-Missbrauch hinweisen. Bekannte Gruppen (z.B. Familienmitglieder)
                kannst du unten ignorieren — sie verschwinden dann aus dieser Liste.
              </p>
              {data.duplicateIps!.map((row) => (
                <DuplicateIpCard
                  key={row.ip_address}
                  row={row}
                  onBan={(id) => void handleBan(id)}
                  onIgnore={(userIds, reason) => handleIgnore(userIds, reason)}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-3">
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" />
              <p className="text-sm text-emerald-300">Keine unbekannten IP-Duplikate in den letzten Logins gefunden.</p>
            </div>
          )}

          {/* Ignorelist management */}
          <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.015] p-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-zinc-200">IP-Duplikat Ignoreliste</h3>
            </div>
            <p className="text-xs text-zinc-500">
              Hier werden Account-Gruppen gepflegt, die eine IP-Adresse legitim teilen (z.B. Geschwister, WG-Mitbewohner).
              Diese Gruppen erscheinen nicht mehr in den Duplikat-Warnungen. Einträge können jederzeit wieder entfernt werden.
            </p>

            {hasIgnoreList && (
              <IgnoreList
                entries={data.ignoreList!}
                onRemove={(id) => handleRemoveIgnore(id)}
              />
            )}

            {!hasIgnoreList && (
              <p className="text-xs text-zinc-600">Noch keine Einträge. Klicke bei einem Duplikat-Alarm auf „Ignorieren" oder füge manuell hinzu.</p>
            )}

            <ManualIgnoreForm onAdd={(userIds, reason) => handleIgnore(userIds, reason)} />
          </div>

          {/* Ignored duplicates — collapsed by default, just for reference */}
          {hasIgnored && <IgnoredSection rows={data.ignoredDuplicateIps!} />}

          {/* Login history */}
          {(data.recentLogins?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-zinc-400" />
                <h3 className="text-sm font-bold text-zinc-300">Login-Verlauf (letzte {data.recentLogins!.length} Einträge)</h3>
              </div>
              <LoginTable rows={data.recentLogins!} />
            </div>
          )}

          {(data.recentLogins?.length ?? 0) === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] py-10 text-center">
              <Users className="h-8 w-8 text-zinc-700" />
              <p className="text-sm text-zinc-500">Noch keine Login-Events erfasst.</p>
              <p className="text-xs text-zinc-600">Ab dem nächsten Discord-Login wird alles hier geloggt.</p>
            </div>
          )}

          {banningId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
              <div className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-zinc-900 px-6 py-4">
                <Loader2 className="h-5 w-5 animate-spin text-red-400" />
                <span className="text-sm text-zinc-200">Account wird gebannt…</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function IgnoredSection({ rows }: { rows: DuplicateIpRow[] }) {
  const [open, setOpen] = useState(false);
  const sound = useSoundManager();

  return (
    <div className="flex flex-col gap-2">
      <button
        onMouseEnter={sound.hover}
        onClick={() => { sound.click(); setOpen((o) => !o); }}
        className="flex items-center gap-2 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {open ? "Ignorierte Duplikate ausblenden" : `${rows.length} ignorierte IP-Gruppe${rows.length !== 1 ? "n" : ""} anzeigen`}
      </button>
      {open && (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <DuplicateIpCard key={row.ip_address} row={row} ignored />
          ))}
        </div>
      )}
    </div>
  );
}
