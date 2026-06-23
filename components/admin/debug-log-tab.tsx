"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bug,
  AlertTriangle,
  Info,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Calendar,
  FileDown,
} from "lucide-react";
import {
  getDebugLogs,
  deleteAllDebugLogs,
  deleteDebugLogsInRange,
  deleteDebugLog,
  type DebugLogEntry,
} from "@/lib/actions/debug-log";
import { useSoundManager } from "@/lib/sound-manager";

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

function LogRow({ entry, onDeleted }: { entry: DebugLogEntry; onDeleted: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const Icon = LEVEL_ICON[entry.level];
  const sound = useSoundManager();

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
          <p className="truncate text-sm font-semibold text-zinc-200">{entry.message}</p>
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
              {entry.detail}
            </pre>
          )}
          {entry.context && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
              {JSON.stringify(entry.context, null, 2)}
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

type LevelFilter = DebugLogEntry["level"] | "all";

export function DebugLogTab() {
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LevelFilter>("all");
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [rangeDeleting, setRangeDeleting] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const sound = useSoundManager();

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getDebugLogs();
    setLogs(result);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayed = filter === "all" ? logs : logs.filter((l) => l.level === filter);
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
      <p className="rounded-xl border border-purple-500/20 bg-purple-500/[0.04] px-4 py-3 text-xs text-zinc-400">
        Erfasst automatisch jeden Server-Fehler (Server Components, Route Handler, Server Actions —
        über instrumentation.ts) sowie Client-Fehler (app/error.tsx, app/global-error.tsx) und
        gezielt geloggte Probleme aus den Trading-/Auktions-/Shop-Aktionen. Nichts davon muss manuell
        instrumentiert werden, damit es hier ankommt.
      </p>

      <div className="flex flex-wrap items-center gap-2">
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

        <button
          onMouseEnter={sound.hover}
          onClick={() => { sound.click(); load(); }}
          className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-400 hover:border-white/30"
        >
          <RefreshCw className="h-3 w-3" />
          Aktualisieren
        </button>
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
            <LogRow key={entry.id} entry={entry} onDeleted={load} />
          ))}
        </div>
      )}
    </div>
  );
}
