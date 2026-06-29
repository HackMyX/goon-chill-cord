"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Bug, AlertTriangle, Info, RefreshCw, Trash2,
  ChevronDown, ChevronUp, Loader2, Calendar, FileDown,
  CheckCircle2, XCircle, AlertCircle, Activity, FileText, Search, X,
} from "lucide-react";
import {
  getDebugLogs, deleteAllDebugLogs, deleteDebugLogsInRange, deleteDebugLog, resolveUserIdsToNames,
  type DebugLogEntry,
} from "@/lib/actions/debug-log";
import { runSystemHealthChecks, type HealthCheck } from "@/lib/actions/system-health";
import { useSoundManager } from "@/lib/sound-manager";
import { VersionPanel } from "@/components/admin/version-panel";

const LEVEL_STYLE: Record<DebugLogEntry["level"], string> = {
  error: "text-red-300 bg-red-500/10 border-red-500/30",
  warn: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  info: "text-blue-300 bg-blue-500/10 border-blue-500/30",
};

const LEVEL_ICON: Record<DebugLogEntry["level"], typeof Bug> = {
  error: Bug,
  warn: AlertTriangle,
  info: Info,
};

function exportEntryAsPdf(entry: DebugLogEntry) {
  const ts = new Date(entry.createdAt).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const LEVEL_COLOR: Record<DebugLogEntry["level"], string> = {
    error: "#ef4444", warn: "#f59e0b", info: "#3b82f6",
  };
  const color = LEVEL_COLOR[entry.level];
  const detailHtml = entry.detail
    ? `<h3>Stack-Trace / Detail</h3><pre>${escapeHtml(entry.detail)}</pre>`
    : "";
  const contextHtml = entry.context
    ? `<h3>Kontext (JSON)</h3><pre>${escapeHtml(JSON.stringify(entry.context, null, 2))}</pre>`
    : "";
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<title>Debug-Log — ${escapeHtml(entry.message)}</title>
<style>
  body { font-family: monospace; font-size: 12px; color: #111; max-width: 900px; margin: 2rem auto; }
  h1 { font-size: 16px; margin: 0 0 .25rem; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 99px; color: #fff;
    font-weight: 700; font-size: 11px; background: ${color}; margin-right: 8px; }
  .scope { border: 1px solid #ccc; padding: 2px 8px; border-radius: 99px; font-size: 11px; }
  .meta { color: #555; font-size: 11px; margin: .5rem 0 1rem; }
  h3 { font-size: 12px; font-weight: 700; color: #333; margin: 1rem 0 .25rem; border-top: 1px solid #eee; padding-top: .75rem; }
  pre { background: #f5f5f5; padding: .75rem 1rem; border-radius: 6px; white-space: pre-wrap; word-break: break-all; font-size: 11px; line-height: 1.5; }
  @media print { body { margin: .5rem; } }
</style></head><body>
<span class="badge">${entry.level.toUpperCase()}</span><span class="scope">${escapeHtml(entry.scope)}</span>
<h1>${escapeHtml(entry.message)}</h1>
<p class="meta">Zeitstempel: ${ts} &nbsp;|&nbsp; ID: ${escapeHtml(entry.id)}</p>
${detailHtml}${contextHtml}
</body></html>`;
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function exportSystemCheckAsPdf(checks: HealthCheck[], generatedAt: string) {
  const STATUS_COLOR: Record<HealthCheck["status"], string> = {
    ok: "#10b981", warn: "#f59e0b", error: "#ef4444",
  };
  const STATUS_LABEL: Record<HealthCheck["status"], string> = {
    ok: "OK", warn: "WARNUNG", error: "FEHLER",
  };
  const categories = Array.from(new Set(checks.map((c) => c.category)));
  const overallOk = !checks.some((c) => c.status === "error");
  const overallWarn = checks.some((c) => c.status === "warn");
  const overallColor = !overallOk ? "#ef4444" : overallWarn ? "#f59e0b" : "#10b981";
  const overallLabel = !overallOk ? "FEHLER" : overallWarn ? "WARNUNGEN" : "ALLES OK";

  const rowsHtml = categories.map((cat) => {
    const catChecks = checks.filter((c) => c.category === cat);
    const rowsStr = catChecks.map((c) => `
      <tr>
        <td style="padding:4px 8px; color:${STATUS_COLOR[c.status]}; font-weight:700; white-space:nowrap;">${STATUS_LABEL[c.status]}</td>
        <td style="padding:4px 8px; color:#374151;">${escapeHtml(c.name)}</td>
        <td style="padding:4px 8px; color:#6b7280; font-size:11px;">${c.detail ? escapeHtml(c.detail) : ""}</td>
      </tr>`).join("");
    return `
      <tr><td colspan="3" style="padding:10px 8px 4px; font-size:11px; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:.05em; border-top:1px solid #e5e7eb;">${escapeHtml(cat)}</td></tr>
      ${rowsStr}`;
  }).join("");

  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<title>System-Prüfbericht — ${escapeHtml(generatedAt)}</title>
<style>
  body { font-family: -apple-system, Arial, sans-serif; font-size:13px; color:#111; max-width:900px; margin:2rem auto; }
  h1 { font-size:18px; margin:0 0 .25rem; }
  .badge { display:inline-block; padding:3px 12px; border-radius:99px; color:#fff; font-weight:700; font-size:12px; margin-left:10px; background:${overallColor}; }
  .meta { color:#6b7280; font-size:11px; margin:.5rem 0 1.5rem; }
  table { width:100%; border-collapse:collapse; }
  td { vertical-align:top; }
  @media print { body { margin:.5rem; } }
</style></head><body>
<h1>System-Prüfbericht <span class="badge">${overallLabel}</span></h1>
<p class="meta">Erstellt: ${escapeHtml(generatedAt)} &nbsp;|&nbsp; ${checks.length} Prüfungen</p>
<table>${rowsHtml}</table>
</body></html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

function exportAllLogAsPdf(logs: DebugLogEntry[]) {
  if (logs.length === 0) return;
  const LEVEL_COLOR: Record<DebugLogEntry["level"], string> = {
    error: "#ef4444", warn: "#f59e0b", info: "#3b82f6",
  };
  const rows = logs.map((entry) => {
    const ts = new Date(entry.createdAt).toLocaleString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const color = LEVEL_COLOR[entry.level];
    return `<tr>
      <td style="padding:4px 8px; color:${color}; font-weight:700; font-size:10px; white-space:nowrap;">${entry.level.toUpperCase()}</td>
      <td style="padding:4px 8px; font-size:10px; color:#6b7280; white-space:nowrap;">${escapeHtml(ts)}</td>
      <td style="padding:4px 8px; font-size:10px; color:#4b5563;">${escapeHtml(entry.scope)}</td>
      <td style="padding:4px 8px; font-size:11px; color:#1f2937;">${escapeHtml(entry.message)}</td>
      <td style="padding:4px 8px; font-size:10px; color:#9ca3af;">${entry.detail ? escapeHtml(entry.detail.slice(0, 120)) : ""}</td>
    </tr>`;
  }).join("");

  const now = new Date().toLocaleString("de-DE", { dateStyle: "long", timeStyle: "short" });
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<title>Debug-Log Export — ${escapeHtml(now)}</title>
<style>
  body { font-family: monospace; font-size:12px; color:#111; margin:1.5rem; }
  h1 { font-size:14px; margin:0 0 .25rem; }
  .meta { color:#6b7280; font-size:11px; margin:.25rem 0 1rem; }
  table { width:100%; border-collapse:collapse; }
  tr:nth-child(even) { background:#f9f9f9; }
  td { vertical-align:top; border-bottom:1px solid #f0f0f0; }
  @media print { body { margin:.5rem; } }
</style></head><body>
<h1>Debug-Log Export</h1>
<p class="meta">${logs.length} Einträge &nbsp;|&nbsp; Stand: ${escapeHtml(now)}</p>
<table>
  <tr style="font-size:10px; color:#9ca3af; font-weight:700;">
    <td style="padding:4px 8px;">Level</td><td style="padding:4px 8px;">Zeitstempel</td>
    <td style="padding:4px 8px;">Scope</td><td style="padding:4px 8px;">Nachricht</td>
    <td style="padding:4px 8px;">Detail (Auszug)</td>
  </tr>
  ${rows}
</table>
</body></html>`;

  const win = window.open("", "_blank", "width=1100,height=750");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

function replaceUuids(text: string, map: Record<string, string>): string {
  return text.replace(UUID_RE, (id) => map[id.toLowerCase()] ? `@${map[id.toLowerCase()]}` : id);
}

function LogRow({ entry, uuidMap, onDeleted }: { entry: DebugLogEntry; uuidMap: Record<string, string>; onDeleted: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const Icon = LEVEL_ICON[entry.level];
  const sound = useSoundManager();
  const resolvedMessage = replaceUuids(entry.message, uuidMap);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    sound.click();
    setDeleting(true);
    await deleteDebugLog(entry.id);
    setDeleting(false);
    onDeleted();
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <button
        onClick={() => { sound.click(); setExpanded((e) => !e); }}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
      >
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${LEVEL_STYLE[entry.level]}`}>
          <Icon className="h-2.5 w-2.5" />
          {entry.level.toUpperCase()}
        </span>
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
          {entry.scope}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-200">{resolvedMessage}</p>
          <p className="text-[11px] text-zinc-500">
            {new Date(entry.createdAt).toLocaleString("de-DE", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
        </div>
        <span
          role="button"
          tabIndex={0}
          onClick={handleDelete}
          title="Eintrag löschen"
          className="flex shrink-0 items-center rounded-lg border border-white/10 p-1.5 text-zinc-500 hover:border-red-500/40 hover:text-red-400"
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" /> : <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />}
      </button>

      {expanded && (
        <div className="border-t border-white/[0.06] px-4 py-3">
          {entry.detail && (
            <pre className="mb-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 px-3 py-2 text-[11px] leading-relaxed text-zinc-400">
              {replaceUuids(entry.detail, uuidMap)}
            </pre>
          )}
          {entry.context && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
              {replaceUuids(JSON.stringify(entry.context, null, 2), uuidMap)}
            </pre>
          )}
          {!entry.detail && !entry.context && (
            <p className="text-xs text-zinc-600">Keine weiteren Details vorhanden.</p>
          )}
          <button
            onClick={() => { sound.click(); exportEntryAsPdf(entry); }}
            className="mt-3 flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:border-purple-400/50 hover:text-purple-300 transition-colors"
          >
            <FileDown className="h-3.5 w-3.5" />
            Als PDF exportieren
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// System Health Check panel
// ---------------------------------------------------------------------------

function SystemHealthPanel() {
  const [checks, setChecks] = useState<HealthCheck[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const sound = useSoundManager();

  async function load() {
    sound.click();
    setLoading(true);
    try {
      const result = await runSystemHealthChecks();
      setChecks(result);
      setCheckedAt(new Date().toLocaleString("de-DE", { dateStyle: "long", timeStyle: "medium" }));
    }
    catch { setChecks([]); }
    finally { setLoading(false); }
  }

  const categories = checks
    ? Array.from(new Set(checks.map((c) => c.category)))
    : [];

  const overallStatus: "ok" | "warn" | "error" = !checks ? "ok"
    : checks.some((c) => c.status === "error") ? "error"
    : checks.some((c) => c.status === "warn") ? "warn"
    : "ok";

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <Activity className="h-4 w-4 text-purple-400" />
        <span className="text-sm font-bold text-zinc-200">System-Status</span>
        {checks && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            overallStatus === "ok" ? "bg-emerald-500/20 text-emerald-300"
            : overallStatus === "warn" ? "bg-amber-500/20 text-amber-300"
            : "bg-red-500/20 text-red-300"
          }`}>
            {overallStatus === "ok" ? "Alles OK" : overallStatus === "warn" ? "Warnungen" : "Fehler"}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {checks && checks.length > 0 && (
            <button
              onClick={() => exportSystemCheckAsPdf(checks, checkedAt ?? new Date().toLocaleString("de-DE"))}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:border-purple-400/50 hover:text-purple-300 transition-colors"
              title="Systemprüfung als PDF exportieren"
            >
              <FileText className="h-3.5 w-3.5" />
              PDF
            </button>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:border-purple-400/50 hover:text-purple-300 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {checks ? "Neu prüfen" : "Jetzt prüfen"}
          </button>
        </div>
      </div>

      {!checks && !loading && (
        <p className="px-4 py-6 text-center text-xs text-zinc-500">Auf „Jetzt prüfen" klicken um den System-Status zu laden.</p>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Prüfe alle Systeme…
        </div>
      )}

      {checks && !loading && (
        <div className="divide-y divide-white/5">
          {categories.map((cat) => {
            const catChecks = checks.filter((c) => c.category === cat);
            return (
              <div key={cat} className="px-4 py-3">
                <h4 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">{cat}</h4>
                <div className="flex flex-col gap-1">
                  {catChecks.map((c) => (
                    <div key={c.id} className="flex items-start gap-2.5">
                      {c.status === "ok" && <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />}
                      {c.status === "warn" && <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />}
                      {c.status === "error" && <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />}
                      <div className="min-w-0 flex-1">
                        <span className={`text-xs font-semibold ${c.status === "ok" ? "text-zinc-300" : c.status === "warn" ? "text-amber-200" : "text-red-200"}`}>
                          {c.name}
                        </span>
                        {c.detail && <p className="text-[11px] text-zinc-500">{c.detail}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type LevelFilter = DebugLogEntry["level"] | "all";

export function DebugLogTab() {
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [uuidMap, setUuidMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LevelFilter>("all");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [rangeDeleting, setRangeDeleting] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sound = useSoundManager();

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getDebugLogs();
    setLogs(result);
    setLoading(false);
    const allText = result.map((e) =>
      `${e.message} ${e.detail ?? ""} ${e.context ? JSON.stringify(e.context) : ""}`
    ).join(" ");
    const uuids = Array.from(new Set(Array.from(allText.matchAll(UUID_RE), (m) => m[0].toLowerCase())));
    if (uuids.length) {
      resolveUserIdsToNames(uuids).then(setUuidMap);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(() => { load(); }, 10_000);
    } else {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [autoRefresh, load]);

  // Unique scopes for the scope dropdown
  const allScopes = Array.from(new Set(logs.map((l) => l.scope))).sort();

  const displayed = logs.filter((l) => {
    if (filter !== "all" && l.level !== filter) return false;
    if (scopeFilter !== "all" && l.scope !== scopeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const hay = `${l.message} ${l.detail ?? ""} ${l.scope}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const countFor = (l: LevelFilter) => (l === "all" ? logs.length : logs.filter((x) => x.level === l).length);

  async function handleDeleteAll() {
    sound.click();
    if (!deleteAllConfirm) {
      setDeleteAllConfirm(true);
      setTimeout(() => setDeleteAllConfirm(false), 4000);
      return;
    }
    setDeletingAll(true);
    await deleteAllDebugLogs();
    setLogs([]);
    setDeletingAll(false);
    setDeleteAllConfirm(false);
  }

  async function handleDeleteRange(e: React.FormEvent) {
    e.preventDefault();
    setRangeError(null);
    if (!fromDate || !toDate) {
      setRangeError("Bitte beide Daten angeben.");
      return;
    }
    const fromIso = new Date(`${fromDate}T00:00:00.000Z`).toISOString();
    const toIso = new Date(`${toDate}T23:59:59.999Z`).toISOString();
    setRangeDeleting(true);
    const res = await deleteDebugLogsInRange(fromIso, toIso);
    setRangeDeleting(false);
    if (!res.success) {
      setRangeError(res.error ?? "Fehler.");
      return;
    }
    setRangeOpen(false);
    setFromDate("");
    setToDate("");
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <VersionPanel />
      <SystemHealthPanel />

      <p className="rounded-xl border border-purple-500/20 bg-purple-500/[0.04] px-4 py-3 text-xs text-zinc-400">
        Erfasst automatisch: Server-Fehler (instrumentation.ts), Client-Fehler (error.tsx), Admin-Saves
        (admin:site-config, admin:streak-config, admin:shop, admin:monsters, admin:patchnotes,
        admin:fine-config, admin:sound-config, admin:preview-config), Badge-Aktionen, Mod-Aktionen,
        Auth-Events (auth:login) und alle Battle-Pass-/Auktions-Operationen. Auto-Refresh: alle 10 Sek.
      </p>

      {/* Search bar */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          placeholder="Suche in Nachricht / Detail / Scope…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-black/30 py-1.5 pl-8 pr-8 text-xs text-zinc-100 outline-none focus:border-purple-400/60 placeholder:text-zinc-600"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Level filter */}
        {(["all", "error", "warn", "info"] as LevelFilter[]).map((l) => (
          <button
            key={l}
            onMouseEnter={sound.hover}
            onClick={() => { sound.click(); setFilter(l); }}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              filter === l
                ? "border-purple-400 bg-purple-500/15 text-purple-200 shadow-[0_0_8px_rgba(168,85,247,0.35)]"
                : "border-white/10 text-zinc-400 hover:border-white/30"
            }`}
          >
            {l === "all" ? "Alle" : l.toUpperCase()}
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">{countFor(l)}</span>
          </button>
        ))}
        {/* Scope filter */}
        {allScopes.length > 0 && (
          <select
            value={scopeFilter}
            onChange={(e) => { sound.click(); setScopeFilter(e.target.value); }}
            className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 outline-none focus:border-purple-400/60"
          >
            <option value="all">Alle Scopes ({allScopes.length})</option>
            {allScopes.map((s) => (
              <option key={s} value={s}>{s} ({logs.filter((l) => l.scope === s).length})</option>
            ))}
          </select>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {displayed.length > 0 && (
            <button
              onMouseEnter={sound.hover}
              onClick={() => { sound.click(); exportAllLogAsPdf(displayed); }}
              className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-400 hover:border-purple-400/50 hover:text-purple-300 transition-colors"
              title="Sichtbare Logs als PDF exportieren"
            >
              <FileDown className="h-3 w-3" />
              Als PDF
            </button>
          )}
          <button
            onMouseEnter={sound.hover}
            onClick={() => { sound.click(); setAutoRefresh((a) => !a); }}
            title={autoRefresh ? "Auto-Refresh deaktivieren" : "Auto-Refresh alle 10 Sek. aktivieren"}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
              autoRefresh
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                : "border-white/10 text-zinc-400 hover:border-emerald-500/40 hover:text-emerald-400"
            }`}
          >
            <Activity className="h-3 w-3" />
            {autoRefresh ? "Live" : "Auto"}
          </button>
          <button
            onMouseEnter={sound.hover}
            onClick={() => { sound.click(); load(); }}
            className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-400 hover:border-white/30"
          >
            <RefreshCw className="h-3 w-3" />
            Aktualisieren
          </button>
        </div>
        <button
          onMouseEnter={sound.hover}
          onClick={() => { sound.click(); setRangeOpen((o) => !o); }}
          className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-400 hover:border-white/30"
        >
          <Calendar className="h-3 w-3" />
          Zeitraum löschen
        </button>
        {logs.length > 0 && (
          <button
            onMouseEnter={sound.hover}
            onClick={handleDeleteAll}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
              deleteAllConfirm
                ? "border-red-500/50 bg-red-500/20 text-red-300"
                : "border-white/10 text-zinc-400 hover:border-red-500/40 hover:text-red-400"
            }`}
          >
            {deletingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            {deleteAllConfirm ? "Wirklich alle löschen?" : "Alle löschen"}
          </button>
        )}
      </div>

      {rangeOpen && (
        <form onSubmit={handleDeleteRange} className="flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-zinc-400">Von</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-zinc-400">Bis</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
            />
          </label>
          <button
            type="submit"
            disabled={rangeDeleting}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {rangeDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Im Zeitraum löschen
          </button>
          {rangeError && <span className="text-xs text-red-400">{rangeError}</span>}
        </form>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      )}

      {!loading && displayed.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] py-12 text-center">
          <Bug className="h-8 w-8 text-zinc-700" />
          <p className="text-sm text-zinc-500">Keine Einträge — alles läuft sauber.</p>
        </div>
      )}

      {!loading && displayed.length > 0 && (
        <div className="flex flex-col gap-2">
          {displayed.map((entry) => (
            <LogRow key={entry.id} entry={entry} uuidMap={uuidMap} onDeleted={load} />
          ))}
        </div>
      )}
    </div>
  );
}
