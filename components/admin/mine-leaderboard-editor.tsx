"use client";

import { useEffect, useState } from "react";
import {
  Crown, Trophy, Pickaxe, Pencil, Trash2, Save, X, Camera, RotateCcw,
  ChevronDown, ChevronUp, CheckCircle, XCircle, Loader2, RefreshCw,
} from "lucide-react";
import {
  adminGetMineLeaderboard, adminUpdateMineProgress, adminDeleteMineProgress,
  adminCreateMineSnapshot, adminGetMineSnapshots, adminRestoreMineSnapshot,
  type AdminMineProgressRow, type AdminMineSnapshot,
} from "@/lib/actions/admin-leaderboard";

function getLevelLabel(level: number) {
  if (level <= 2) return "Kupfer";
  if (level <= 4) return "Silber";
  if (level <= 6) return "Gold";
  if (level <= 8) return "Diamant";
  if (level === 9) return "Amethyst";
  return "Rubin";
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="h-4 w-4 text-amber-400" />;
  if (rank === 2) return <Trophy className="h-4 w-4 text-zinc-300" />;
  if (rank === 3) return <Trophy className="h-4 w-4 text-amber-600" />;
  return <span className="text-xs font-bold text-zinc-600">#{rank}</span>;
}

function Flash({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
      ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
         : "border-red-500/30 bg-red-500/10 text-red-300"
    }`}>
      {ok ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {msg}
    </div>
  );
}

export function MineLeaderboardEditor() {
  const [rows, setRows] = useState<AdminMineProgressRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editLevel, setEditLevel] = useState("");
  const [editTotalMined, setEditTotalMined] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ msg: string; ok: boolean } | null>(null);
  const [snapshotName, setSnapshotName] = useState("");
  const [snapshoting, setSnapshoting] = useState(false);
  const [snapshots, setSnapshots] = useState<AdminMineSnapshot[]>([]);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  function showFlash(msg: string, ok: boolean) {
    setFlash({ msg, ok });
    setTimeout(() => setFlash(null), 3500);
  }

  async function load() {
    setLoading(true);
    const data = await adminGetMineLeaderboard();
    setRows(data);
    setLoading(false);
    setEditId(null);
  }

  async function loadSnapshots() {
    const data = await adminGetMineSnapshots();
    setSnapshots(data);
  }

  useEffect(() => { load(); loadSnapshots(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function startEdit(row: AdminMineProgressRow) {
    setEditId(row.userId);
    setEditLevel(String(row.level));
    setEditTotalMined(String(row.totalMined));
  }

  async function saveEdit(row: AdminMineProgressRow) {
    setSaving(true);
    const res = await adminUpdateMineProgress(
      row.userId,
      parseInt(editLevel) || 1,
      parseInt(editTotalMined) || 0,
    );
    setSaving(false);
    if (res.success) {
      showFlash(`${row.username} gespeichert.`, true);
      setEditId(null);
      load();
    } else {
      showFlash(res.error ?? "Fehler", false);
    }
  }

  async function handleDelete(row: AdminMineProgressRow) {
    if (!confirm(`Mine-Fortschritt von ${row.username} löschen?`)) return;
    setDeleting(row.userId);
    const res = await adminDeleteMineProgress(row.userId);
    setDeleting(null);
    if (res.success) {
      showFlash(`${row.username} gelöscht.`, true);
      load();
    } else {
      showFlash(res.error ?? "Fehler", false);
    }
  }

  async function handleSnapshot() {
    setSnapshoting(true);
    const res = await adminCreateMineSnapshot(snapshotName);
    setSnapshoting(false);
    if (res.success) {
      showFlash("Snapshot erstellt!", true);
      setSnapshotName("");
      loadSnapshots();
    } else {
      showFlash(res.error ?? "Fehler", false);
    }
  }

  async function handleRestore(snap: AdminMineSnapshot) {
    if (!confirm(`Mine-Bestenliste auf "${snap.name}" zurücksetzen? Die aktuellen Level/CR-Stände werden überschrieben!`)) return;
    setRestoring(snap.id);
    const res = await adminRestoreMineSnapshot(snap.id);
    setRestoring(null);
    if (res.success) {
      showFlash(`${res.restored} Einträge wiederhergestellt!`, true);
      load();
    } else {
      showFlash(res.error ?? "Fehler", false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-bold text-zinc-300">
          <Pickaxe className="h-4 w-4 text-amber-400" /> Mine Bestenliste bearbeiten
        </h4>
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs font-semibold text-zinc-400 hover:text-zinc-200">
          <RefreshCw className="h-3 w-3" /> Neu laden
        </button>
      </div>

      {flash && <Flash msg={flash.msg} ok={flash.ok} />}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-white/8">
        <div className="flex items-center gap-2 border-b border-white/8 bg-white/[0.02] px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
          <span className="w-6" />
          <span className="flex-1">Spieler</span>
          <span className="w-20 text-center">Level</span>
          <span className="w-28 text-right">CR gesamt</span>
          <span className="w-16" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Lädt…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-zinc-600">Keine Einträge</div>
        ) : (
          <div className="flex flex-col divide-y divide-white/[0.04]">
            {rows.map((row, i) => {
              const isEditing = editId === row.userId;
              return (
                <div key={row.userId} className={`flex items-center gap-2 px-3 py-2.5 ${isEditing ? "bg-amber-500/5" : "hover:bg-white/[0.015]"}`}>
                  <div className="flex w-6 justify-center">
                    <RankBadge rank={i + 1} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="truncate text-sm font-semibold text-zinc-200">{row.username}</span>
                    {!isEditing && (
                      <p className="text-[10px] text-zinc-600">{getLevelLabel(row.level)} Lvl {row.level}</p>
                    )}
                  </div>

                  {isEditing ? (
                    <>
                      <div className="flex w-20 flex-col items-center">
                        <span className="text-[9px] text-zinc-600 mb-0.5">Level (1–10)</span>
                        <input
                          type="number" min={1} max={10} value={editLevel}
                          onChange={(e) => setEditLevel(e.target.value)}
                          className="w-full rounded border border-amber-500/40 bg-black/40 px-2 py-1 text-center text-xs text-zinc-100 outline-none"
                        />
                      </div>
                      <div className="flex w-28 flex-col items-end">
                        <span className="text-[9px] text-zinc-600 mb-0.5">CR gesamt</span>
                        <input
                          type="number" min={0} value={editTotalMined}
                          onChange={(e) => setEditTotalMined(e.target.value)}
                          className="w-full rounded border border-amber-500/40 bg-black/40 px-2 py-1 text-right text-xs text-zinc-100 outline-none"
                        />
                      </div>
                      <div className="flex w-16 items-center justify-end gap-1">
                        <button onClick={() => saveEdit(row)} disabled={saving}
                          className="rounded p-1 text-emerald-400 hover:bg-emerald-500/10">
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => setEditId(null)}
                          className="rounded p-1 text-zinc-500 hover:bg-white/5">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex w-20 justify-center">
                        <span className="rounded-full border border-amber-700/40 bg-amber-900/10 px-2 py-0.5 text-[10px] font-extrabold text-amber-600">
                          Lvl {row.level}
                        </span>
                      </div>
                      <span className="w-28 text-right font-mono text-sm font-bold text-zinc-200">
                        {row.totalMined.toLocaleString("de-DE")}
                      </span>
                      <div className="flex w-16 items-center justify-end gap-1">
                        <button onClick={() => startEdit(row)}
                          className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-amber-300">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDelete(row)} disabled={deleting === row.userId}
                          className="rounded p-1 text-zinc-500 hover:bg-red-500/10 hover:text-red-400">
                          {deleting === row.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Snapshot creation */}
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-4">
        <h5 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-cyan-400">
          <Camera className="h-3.5 w-3.5" /> Snapshot erstellen
        </h5>
        <p className="mb-3 text-[11px] text-zinc-600">
          Speichert Level und CR aller Spieler als Sicherung. Kann später wiederhergestellt werden.
        </p>
        <div className="flex gap-2">
          <input
            type="text" maxLength={50} placeholder='z. B. "vor Season 2"'
            value={snapshotName}
            onChange={(e) => setSnapshotName(e.target.value)}
            className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-zinc-100 outline-none focus:border-cyan-400/60"
          />
          <button onClick={handleSnapshot} disabled={snapshoting}
            className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50">
            {snapshoting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            Snapshot
          </button>
        </div>
      </div>

      {/* Snapshot history */}
      <div className="overflow-hidden rounded-xl border border-white/8">
        <button
          onClick={() => { setSnapshotsOpen((v) => !v); if (!snapshotsOpen) loadSnapshots(); }}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
            <RotateCcw className="h-3.5 w-3.5" /> Snapshots / Wiederherstellen
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">{snapshots.length}</span>
          </span>
          {snapshotsOpen ? <ChevronUp className="h-4 w-4 text-zinc-600" /> : <ChevronDown className="h-4 w-4 text-zinc-600" />}
        </button>

        {snapshotsOpen && (
          <div className="border-t border-white/8">
            {snapshots.length === 0 ? (
              <p className="px-4 py-4 text-xs text-zinc-600">Noch keine Mine-Snapshots</p>
            ) : (
              <div className="flex flex-col divide-y divide-white/[0.04]">
                {snapshots.map((snap) => (
                  <div key={snap.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-zinc-200">{snap.name}</p>
                      <p className="text-[10px] text-zinc-600">
                        {snap.entryCount} Einträge · {new Date(snap.createdAt).toLocaleString("de-DE")}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRestore(snap)}
                      disabled={restoring === snap.id}
                      className="flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                    >
                      {restoring === snap.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                      Wiederherstellen
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
