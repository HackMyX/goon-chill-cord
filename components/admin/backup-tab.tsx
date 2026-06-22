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
  CheckSquare,
  Square,
  Shield,
  Package,
  ShoppingCart,
  Settings2,
  Check,
  Clock,
  HardDrive,
  Layers,
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
import {
  BACKUP_TABLE_INFO,
  BACKUP_CATEGORY_META,
  type BackupTableName,
  type BackupCategory,
} from "@/lib/backup-tables";
import { useConfirm } from "@/components/layout/confirm-dialog-provider";
import { useSoundManager } from "@/lib/sound-manager";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function totalRows(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Category icon + colour maps ────────────────────────────────────────────

const CAT_ICON: Record<BackupCategory, React.ReactNode> = {
  config:  <Settings2 className="h-3.5 w-3.5" />,
  content: <Package   className="h-3.5 w-3.5" />,
  shop:    <ShoppingCart className="h-3.5 w-3.5" />,
};

const CAT_COLOR = {
  config:  { border: "border-purple-500/30", bg: "bg-purple-500/[0.06]", text: "text-purple-300",  dot: "bg-purple-400",  badge: "border-purple-500/30 bg-purple-500/15 text-purple-300"  },
  content: { border: "border-amber-500/30",  bg: "bg-amber-500/[0.06]",  text: "text-amber-300",   dot: "bg-amber-400",   badge: "border-amber-500/30 bg-amber-500/15 text-amber-300"   },
  shop:    { border: "border-emerald-500/30", bg: "bg-emerald-500/[0.06]", text: "text-emerald-300", dot: "bg-emerald-400", badge: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300" },
} as const;

// ─── Restore Modal ────────────────────────────────────────────────────────────

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
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#0b0814] p-6 shadow-[0_8px_48px_rgba(239,68,68,0.2)]"
      >
        <div className="mb-4 flex items-center gap-2 text-red-300">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <h3 className="text-base font-bold">Backup wiederherstellen</h3>
        </div>

        <div className="mb-4 rounded-lg border border-white/8 bg-white/[0.02] px-4 py-3 text-xs text-zinc-400 leading-relaxed">
          Überschreibt <strong className="text-zinc-200">alle aktuellen Daten</strong> in{" "}
          <strong className="text-zinc-200">{Object.keys(backup.tableCounts).length} Tabellen</strong>{" "}
          ({totalRows(backup.tableCounts)} Zeilen) mit dem Stand von{" "}
          <strong className="text-zinc-200">„{backup.name}"</strong>.
          <br />
          <span className="text-zinc-500">
            Spieler-Credits, Inventar, Trades und Tickets bleiben unberührt.
            Erstelle vorher ein frisches Backup des aktuellen Stands.
          </span>
        </div>

        <label className="mb-1 block text-xs font-semibold text-zinc-400">
          Bestätige mit dem Backup-Namen:{" "}
          <span className="font-bold text-zinc-200">„{backup.name}"</span>
        </label>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoFocus
          placeholder={backup.name}
          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-red-400/50"
        />

        {error && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-red-400">
            <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
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
            {restoring ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Wiederherstellen
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Backup Row ───────────────────────────────────────────────────────────────

function BackupRow({
  backup,
  onChanged,
}: {
  backup: BackupSummary;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const sound = useSoundManager();
  const confirm = useConfirm();

  async function handleExport() {
    sound.click();
    const res = await exportBackup(backup.id);
    if (!res.success || !res.data) { sound.error(); return; }
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
      message: `„${backup.name}" endgültig löschen?`,
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

  const rowCount = totalRows(backup.tableCounts);
  const tableCount = Object.keys(backup.tableCounts).length;

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
        {/* Summary row */}
        <button
          onClick={() => { sound.click(); setExpanded((e) => !e); }}
          onMouseEnter={sound.hover}
          className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
        >
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
              backup.source === "import"
                ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
                : "border-purple-500/30 bg-purple-500/10 text-purple-300"
            }`}
          >
            {backup.source === "import" ? <Upload className="h-2.5 w-2.5" /> : <Database className="h-2.5 w-2.5" />}
            {backup.source === "import" ? "Import" : "Manuell"}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-zinc-100">{backup.name}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {fmtDate(backup.createdAt)}
              </span>
              <span className="flex items-center gap-1">
                <Layers className="h-3 w-3" />
                {rowCount.toLocaleString("de-DE")} Zeilen · {tableCount} Tabellen
              </span>
              <span className="flex items-center gap-1">
                <HardDrive className="h-3 w-3" />
                {formatBytes(backup.sizeBytes)}
              </span>
              {backup.createdByUsername && (
                <span>von {backup.createdByUsername}</span>
              )}
            </div>
          </div>

          {expanded ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-zinc-600" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-600" />
          )}
        </button>

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t border-white/[0.06] px-4 py-3.5">
            {/* Table breakdown by category */}
            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(["config", "content", "shop"] as BackupCategory[]).map((cat) => {
                const meta = BACKUP_CATEGORY_META[cat];
                const c = CAT_COLOR[cat];
                const entries = BACKUP_TABLE_INFO.filter(
                  (t) => t.category === cat && backup.tableCounts[t.name] !== undefined
                );
                if (!entries.length) return null;
                return (
                  <div key={cat} className={`rounded-lg border ${c.border} ${c.bg} px-3 py-2`}>
                    <div className={`mb-1.5 flex items-center gap-1.5 text-[10px] font-bold ${c.text}`}>
                      {CAT_ICON[cat]}
                      {meta.label}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {entries.map((t) => (
                        <div key={t.name} className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-zinc-400">{t.label}</span>
                          <span className="tabular-nums text-[11px] font-semibold text-zinc-300">
                            {(backup.tableCounts[t.name] ?? 0).toLocaleString("de-DE")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <button
                onMouseEnter={sound.hover}
                onClick={handleExport}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06]"
              >
                <Download className="h-3.5 w-3.5" />
                Exportieren
              </button>
              <button
                onMouseEnter={sound.hover}
                onClick={() => { sound.click(); setRestoreOpen(true); }}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 transition-colors hover:bg-red-500/20"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Wiederherstellen
              </button>
              <button
                onMouseEnter={sound.hover}
                onClick={handleDelete}
                disabled={deleting}
                className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-500 transition-colors hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Löschen
              </button>
            </div>
          </div>
        )}
      </div>

      {restoreOpen && (
        <RestoreModal
          backup={backup}
          onClose={() => setRestoreOpen(false)}
          onRestored={onChanged}
        />
      )}
    </>
  );
}

// ─── Table Selector ───────────────────────────────────────────────────────────

const CATEGORIES: BackupCategory[] = ["config", "content", "shop"];

function TableSelector({
  selected,
  onChange,
}: {
  selected: Set<BackupTableName>;
  onChange: (next: Set<BackupTableName>) => void;
}) {
  const sound = useSoundManager();

  function toggle(name: BackupTableName) {
    sound.click();
    const next = new Set(selected);
    if (next.has(name)) next.delete(name); else next.add(name);
    onChange(next);
  }

  function setCategory(cat: BackupCategory, on: boolean) {
    sound.click();
    const next = new Set(selected);
    BACKUP_TABLE_INFO.filter((t) => t.category === cat).forEach((t) => {
      if (on) next.add(t.name); else next.delete(t.name);
    });
    onChange(next);
  }

  const total = BACKUP_TABLE_INFO.length;
  const selCount = selected.size;
  const pct = Math.round((selCount / total) * 100);

  return (
    <div className="flex flex-col gap-2">
      {CATEGORIES.map((cat) => {
        const meta = BACKUP_CATEGORY_META[cat];
        const c = CAT_COLOR[cat];
        const tables = BACKUP_TABLE_INFO.filter((t) => t.category === cat);
        const catSelected = tables.filter((t) => selected.has(t.name));
        const allOn = catSelected.length === tables.length;
        const allOff = catSelected.length === 0;

        return (
          <div key={cat} className={`overflow-hidden rounded-xl border ${c.border} ${c.bg}`}>
            {/* Category header */}
            <div className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${c.dot}`} />
                <span className={`flex items-center gap-1.5 text-xs font-bold ${c.text}`}>
                  {CAT_ICON[cat]}
                  {meta.label}
                </span>
                <span className="text-[10px] tabular-nums text-zinc-600">
                  {catSelected.length}/{tables.length}
                </span>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setCategory(cat, true)}
                  disabled={allOn}
                  className="rounded px-2 py-0.5 text-[10px] font-semibold text-zinc-500 transition-colors hover:text-zinc-200 disabled:opacity-25"
                >
                  Alle
                </button>
                <span className="text-[10px] text-zinc-700">/</span>
                <button
                  type="button"
                  onClick={() => setCategory(cat, false)}
                  disabled={allOff}
                  className="rounded px-2 py-0.5 text-[10px] font-semibold text-zinc-500 transition-colors hover:text-zinc-200 disabled:opacity-25"
                >
                  Keine
                </button>
              </div>
            </div>

            {/* Table rows */}
            <div className="divide-y divide-white/[0.04] border-t border-white/[0.05]">
              {tables.map((t) => {
                const on = selected.has(t.name);
                return (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => toggle(t.name)}
                    className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.02] ${
                      on ? "" : "opacity-50"
                    }`}
                  >
                    {on ? (
                      <CheckSquare className={`mt-0.5 h-4 w-4 shrink-0 ${c.text}`} />
                    ) : (
                      <Square className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200">{t.label}</p>
                      <p className="text-[11px] leading-snug text-zinc-600">{t.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Coverage bar */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-400">Backup-Umfang</span>
          <span className="tabular-nums text-xs font-bold text-zinc-300">{selCount}/{total} Tabellen</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-purple-500 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        {selCount === 0 && (
          <p className="mt-1.5 text-[11px] text-red-400">Mindestens eine Tabelle auswählen.</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

const ALL_TABLES = new Set(BACKUP_TABLE_INFO.map((t) => t.name as BackupTableName));

export function BackupTab() {
  const [backups, setBackups] = useState<BackupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createOk, setCreateOk] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<BackupTableName>>(new Set(ALL_TABLES));
  const [selectorOpen, setSelectorOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sound = useSoundManager();

  const load = useCallback(async () => {
    setLoading(true);
    setBackups(await listBackups());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (selected.size === 0) return;
    sound.click();
    setCreating(true);
    const res = await createBackup(
      newName.trim() || undefined,
      Array.from(selected) as BackupTableName[]
    );
    setCreating(false);
    if (res.success) {
      sound.win();
      setNewName("");
      setCreateOk(true);
      setTimeout(() => setCreateOk(false), 2500);
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
      const name =
        typeof parsed.name === "string"
          ? parsed.name
          : file.name.replace(/\.json$/i, "");
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
      setImportError("Datei konnte nicht gelesen werden — ist es eine gültige Backup-JSON?");
    }
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const selCount = selected.size;
  const total = BACKUP_TABLE_INFO.length;

  return (
    <div className="flex flex-col gap-5">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-purple-500/20 bg-purple-500/[0.04] px-4 py-3">
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
        <p className="text-xs leading-relaxed text-zinc-400">
          Sichert Item-Katalog, Cases, Shop, Monster, Pets und alle Konfigurationen.{" "}
          <strong className="text-zinc-300">Nie</strong> Spieler-Credits, Inventar, Trades oder Tickets —
          ein Restore verändert nie den Spieler-Fortschritt.
        </p>
      </div>

      {/* Create panel */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-200">
          <Plus className="h-4 w-4 text-purple-400" />
          Neues Backup erstellen
        </h4>

        {/* Name + buttons row */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Backup-Name (optional)…"
            className="min-w-[200px] flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-400/60"
          />
          <button
            onMouseEnter={sound.hover}
            onClick={handleCreate}
            disabled={creating || selCount === 0}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : createOk ? (
              <Check className="h-4 w-4" />
            ) : (
              <Database className="h-4 w-4" />
            )}
            {creating ? "Erstelle…" : createOk ? "Erstellt!" : "Backup erstellen"}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onMouseEnter={sound.hover}
            onClick={() => { sound.click(); fileInputRef.current?.click(); }}
            disabled={importing}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/5 disabled:opacity-50"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Importieren
          </button>
        </div>

        {importError && (
          <p className="mt-2 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <X className="h-3.5 w-3.5 shrink-0" />
            {importError}
          </p>
        )}

        {/* Table selector toggle */}
        <button
          type="button"
          onMouseEnter={sound.hover}
          onClick={() => { sound.click(); setSelectorOpen((o) => !o); }}
          className="mt-3 flex items-center gap-2 text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-300"
        >
          {selectorOpen ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          Inhalt auswählen
          <span className={`tabular-nums font-bold ${selCount === 0 ? "text-red-400" : "text-zinc-400"}`}>
            ({selCount}/{total} Tabellen)
          </span>
        </button>

        {selectorOpen && (
          <div className="mt-3">
            <TableSelector selected={selected} onChange={setSelected} />
          </div>
        )}
      </div>

      {/* Backup list */}
      <div>
        <h4 className="mb-2.5 flex items-center gap-2 text-sm font-bold text-zinc-400">
          <Database className="h-4 w-4" />
          Gespeicherte Backups
          {!loading && backups.length > 0 && (
            <span className="ml-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-zinc-500">
              {backups.length}
            </span>
          )}
        </h4>

        {loading && (
          <div className="flex items-center justify-center py-14">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
          </div>
        )}

        {!loading && backups.length === 0 && (
          <div className="flex flex-col items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] py-14 text-center">
            <Database className="h-8 w-8 text-zinc-700" />
            <p className="text-sm font-medium text-zinc-500">Noch keine Backups vorhanden.</p>
            <p className="text-xs text-zinc-700">Erstelle oben dein erstes Backup.</p>
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
    </div>
  );
}
