"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert, ShieldCheck, RefreshCw, Loader2, AlertTriangle,
  Users, Wifi, Clock, Ban, ChevronDown, ChevronUp, Eye, EyeOff,
} from "lucide-react";
import { getSecurityData, banUserById, type SecurityDataResult, type LoginEventRow, type DuplicateIpRow } from "@/lib/actions/security";
import { useSoundManager } from "@/lib/sound-manager";
import type { ProfileRow } from "@/components/admin/admin-shell";

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
  onBan,
}: {
  row: DuplicateIpRow;
  onBan: (userId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [masked, setMasked] = useState(true);
  const display = masked ? row.ip_address.replace(/(\d+\.\d+)\.\d+\.\d+/, "$1.***.**") : row.ip_address;

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/[0.04] overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono font-bold text-red-300">{display}</code>
            <button
              onClick={(e) => { e.stopPropagation(); setMasked((m) => !m); }}
              className="rounded p-0.5 text-zinc-500 hover:text-zinc-300"
              title={masked ? "IP anzeigen" : "IP verbergen"}
            >
              {masked ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            </button>
          </div>
          <p className="text-[11px] text-zinc-500">
            {row.user_count} Accounts · zuletzt vor <RelTime iso={row.last_seen} />
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-bold text-red-300">
          {row.user_count}×
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-zinc-500 shrink-0" /> : <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-white/[0.06] px-4 py-3">
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-zinc-400">BETROFFENE ACCOUNTS</p>
          <div className="flex flex-col gap-1">
            {row.user_ids.map((id, i) => (
              <div key={id} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-1.5">
                <span className="font-mono text-xs text-zinc-300">{row.usernames?.[i] ?? id.slice(0, 8)}</span>
                <span className="flex-1 font-mono text-[10px] text-zinc-600">{id}</span>
                <button
                  onClick={() => onBan(id)}
                  className="flex items-center gap-1 rounded-lg border border-red-500/30 px-2 py-1 text-[10px] font-semibold text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Ban className="h-3 w-3" />
                  Bannen
                </button>
              </div>
            ))}
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
            <th className="px-3 py-2 font-semibold text-zinc-400 whitespace-nowrap">Vor</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row, i) => (
            <tr key={row.id} className={i % 2 === 0 ? "bg-white/[0.01]" : ""}>
              <td className="px-3 py-1.5 font-medium text-zinc-200">{row.username}</td>
              <td className="px-3 py-1.5 font-mono text-zinc-400">{row.ip_address}</td>
              <td className="max-w-[200px] truncate px-3 py-1.5 text-zinc-500">{row.user_agent ?? "—"}</td>
              <td className="px-3 py-1.5 text-zinc-500 whitespace-nowrap"><RelTime iso={row.created_at} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 30 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 border-t border-white/10 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {showAll ? <><ChevronUp className="h-3 w-3" /> Weniger anzeigen</> : <><ChevronDown className="h-3 w-3" /> Alle {rows.length} Logins anzeigen</>}
        </button>
      )}
    </div>
  );
}

export function SecurityTab({ profiles }: { profiles: ProfileRow[] }) {
  const [data, setData] = useState<SecurityDataResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [banningId, setBanningId] = useState<string | null>(null);
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
    if (res.success) {
      sound.win();
      await load();
    } else {
      alert(res.error ?? "Fehler.");
    }
  }

  const hasDuplicates = (data?.duplicateIps?.length ?? 0) > 0;

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
            <p className="text-xs text-zinc-500">IP-Tracking · Duplikat-Erkennung · Login-Verlauf</p>
          </div>
        </div>
        <button
          onClick={() => { sound.click(); load(); }}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-zinc-400 hover:border-white/30 disabled:opacity-40 transition-colors"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
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
            <StatCard
              label="Logins (24h)"
              value={data.stats?.loginsLast24h ?? 0}
              color="border-blue-500/20 bg-blue-500/[0.04]"
            />
            <StatCard
              label="Logins (7 Tage)"
              value={data.stats?.loginsLast7d ?? 0}
              color="border-purple-500/20 bg-purple-500/[0.04]"
            />
            <StatCard
              label="Einzigartige IPs (7d)"
              value={data.stats?.uniqueIpsLast7d ?? 0}
              color="border-cyan-500/20 bg-cyan-500/[0.04]"
            />
            <StatCard
              label="IP-Duplikate"
              value={data.stats?.duplicateIpCount ?? 0}
              sub="Gleiche IP, mehrere Accounts"
              color={hasDuplicates ? "border-red-500/40 bg-red-500/[0.08]" : "border-emerald-500/20 bg-emerald-500/[0.04]"}
            />
          </div>

          {/* Duplicate IPs Alert */}
          {hasDuplicates ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <h3 className="text-sm font-bold text-red-300">IP-Duplikate erkannt ({data.duplicateIps!.length})</h3>
              </div>
              <p className="text-xs text-zinc-500">
                Diese IP-Adressen wurden von mehreren verschiedenen Accounts verwendet. Das kann auf geteilte
                Netzwerke, VPNs oder Mehrfach-Account-Missbrauch hinweisen.
              </p>
              {data.duplicateIps!.map((row) => (
                <DuplicateIpCard
                  key={row.ip_address}
                  row={row}
                  onBan={(id) => void handleBan(id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-3">
              <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
              <p className="text-sm text-emerald-300">Keine IP-Duplikate in den letzten Logins gefunden.</p>
            </div>
          )}

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

          {/* Bannen info */}
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
