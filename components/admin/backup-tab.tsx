"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Database,
  Plus,
  Download,
  Upload,
  Trash2,
  RotateCcw,
  Loader2,
  AlertTriangle,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  createBackup,
  listBackups,
  exportBackup,
  importBackup,
  deleteBackup,
  restoreBackup,
  type BackupSummary,
} from "@/lib/actions/backup";
import { useConfirm } from "@/components/layout/confirm-dialog-provider";
import { useSoundManager } from "@/lib/sound-manager";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function totalRows(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

function RestoreModal({
  backup,
  onClose,
  onRestored,
}: {
  backup: BackupSummary;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sound = useSoundManager();
  const matches = confirmText.trim() === backup.name;

  async function handleRestore() {
    if (!matches) return;
    setRestoring(true);
    setError(null);
    const res = await restoreBackup(backup.id);
    setRestoring(false);
    if (res.success) {
      sound.win();
      onRestored();
      onClose();
    } else {
      sound.error();
      setError([res.error, ...(res.tableErrors ?? [])].filter(Boolean).join(" — "));
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#0b0814] p-6 shadow-[0_8px_40px_rgba(239,68,68,0.25)]"
      >
        <div className="mb-3 flex items-center gap-2 text-red-300">
          <AlertTriangle className="h-5 w-5" />
          <h3 className="text-base font-bold">Backup wiederherstellen</h3>
        </div>
        <p className="mb-3 text-sm leading-relaxed text-zinc-400">
          Das löscht <strong className="text-zinc-200">alle aktuellen Daten</strong> in {totalRows(backup.tableCounts)} Zeilen
          über {Object.keys(backup.tableCounts).length} Tabellen (Items, Cases, Shop, Monster, Pets, Konfiguration —
          <strong className="text-zinc-200"> keine</strong> Spieler-Credits/Inventare/Trades) und ersetzt sie exakt durch den
          Stand von „{backup.name}". Das kann nicht direkt rückgängig gemacht werden — erstelle vorher ggf. ein frisches
          Backup vom aktuellen Stand.
        </p>
        <label className="mb-1 block text-xs font-semibold text-zinc-400">
          Tippe zur Bestätigung den Namen <span className="text-zinc-200">„{backup.name}"</span> ein:
        </label>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoFocus
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-red-400/60"
        />
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-white/5"
          >
            Abbrechen
          </button>
          <button
            onClick={handleRestore}
            disabled={!matches || restoring}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-500 disabled:opacity-40"
          >
            {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Jetzt wiederherstellen
          </button>
        </div>
      </div>
    </div>
  );
}

function BackupRow({ backup, onChanged }: { backup: BackupSummary; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const sound = useSoundManager();
  const confirm = useConfirm();

  async function handleExport() {
    sound.click();
    const res = await exportBackup(backup.id);
    if (!res.success || !res.data) {
      sound.error();
      return;
    }
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${backup.name.replace(/[^a-z0-9_-]+/gi, "_")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Backup löschen",
      message: `„${backup.name}" endgültig löschen? Das Backup selbst kann danach nicht mehr exportiert oder wiederhergestellt werden.`,
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    sound.click();
    setDeleting(true);
    await deleteBackup(backup.id);
    setDeleting(false);
    onChanged();
  }

  return (
    <>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
        >
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
              backup.source === "import"
                ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
                : "border-purple-500/30 bg-purple-500/10 text-purple-300"
            }`}
          >
            {backup.source === "import" ? "Import" : "Manuell"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-zinc-200">{backup.name}</p>
            <p className="text-[11px] text-zinc-500">
              {new Date(backup.createdAt).toLocaleString("de-DE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {" · "}
              {totalRows(backup.tableCounts)} Zeilen · {formatBytes(backup.sizeBytes)}
              {backup.createdByUsername && ` · von ${backup.createdByUsername}`}
            </p>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" /> : <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />}
        </button>

        {expanded && (
          <div className="border-t border-white/[0.06] px-4 py-3">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {Object.entries(backup.tableCounts).map(([table, count]) => (
                <span key={table} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">
                  {table}: {count}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onMouseEnter={sound.hover}
                onClick={handleExport}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/5"
              >
                <Download className="h-3.5 w-3.5" />
                Exportieren
              </button>
              <button
                onMouseEnter={sound.hover}
                onClick={() => { sound.click(); setRestoreOpen(true); }}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/20"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Wiederherstellen
              </button>
              <button
                onMouseEnter={sound.hover}
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Löschen
              </button>
            </div>
          </div>
        )}
      </div>

      {restoreOpen && (
        <RestoreModal backup={backup} onClose={() => setRestoreOpen(false)} onRestored={onChanged} />
      )}
    </>
  );
}

export function BackupTab() {
  const [backups, setBackups] = useState<BackupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sound = useSoundManager();

  const load = useCallback(async () => {
    setLoading(true);
    setBackups(await listBackups());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    sound.click();
    setCreating(true);
    const res = await createBackup(newName.trim() || undefined);
    setCreating(false);
    if (res.success) {
      sound.win();
      setNewName("");
      load();
    } else {
      sound.error();
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const tables = parsed.tables ?? parsed;
      const name = typeof parsed.name === "string" ? parsed.name : file.name.replace(/\.json$/i, "");
      const res = await importBackup({ name, tables });
      if (res.success) {
        sound.win();
        load();
      } else {
        sound.error();
        setImportError(res.error ?? "Import fehlgeschlagen.");
      }
    } catch {
      sound.error();
      setImportError("Datei konnte nicht gelesen werden — ist es eine gültige Backup-JSON-Datei?");
    }
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-xl border border-purple-500/20 bg-purple-500/[0.04] px-4 py-3 text-xs text-zinc-400">
        Sichert Item-Katalog, Cases, Shop (inkl. Kategorien &amp; Tagesplan), Monster, Pets und alle
        Konfigurationen — bewusst <strong className="text-zinc-300">ohne</strong> Spieler-Credits, Inventare,
        Trades oder Tickets, damit ein Restore nie versehentlich Spielerfortschritt verändert.
      </p>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
        <Database className="h-4 w-4 shrink-0 text-purple-400" />
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Backup-Name (optional)…"
          className="min-w-[180px] flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-400/60"
        />
        <button
          onMouseEnter={sound.hover}
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Backup erstellen
        </button>

        <input ref={fileInputRef} type="file" accept="application/json" onChange={handleImportFile} className="hidden" />
        <button
          onMouseEnter={sound.hover}
          onClick={() => { sound.click(); fileInputRef.current?.click(); }}
          disabled={importing}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/5 disabled:opacity-50"
        >
          {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Backup importieren
        </button>
      </div>

      {importError && (
        <p className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-300">
          <X className="h-3.5 w-3.5 shrink-0" />
          {importError}
        </p>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      )}

      {!loading && backups.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] py-12 text-center">
          <Database className="h-8 w-8 text-zinc-700" />
          <p className="text-sm text-zinc-500">Noch keine Backups vorhanden.</p>
        </div>
      )}

      {!loading && backups.length > 0 && (
        <div className="flex flex-col gap-2">
          {backups.map((b) => (
            <BackupRow key={b.id} backup={b} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}
