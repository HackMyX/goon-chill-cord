"use client";

import { useEffect, useState } from "react";
import {
  Crown, Trophy, Zap, Pencil, Trash2, Save, X, Camera, RotateCcw,
  ChevronDown, ChevronUp, CheckCircle, XCircle, Loader2, RefreshCw,
} from "lucide-react";
import {
  adminGetSnakeLeaderboard, adminUpdateSnakeScore, adminDeleteSnakeScore,
  adminCreateSnakeSnapshot, adminGetSnakeSnapshots, adminRestoreSnakeSnapshot,
  type AdminSnakeScoreRow, type AdminSnakeSnapshot,
} from "@/lib/actions/admin-leaderboard";

type SpeedMode = "x1" | "x2";

interface EditState { bestScore: string; totalCrEarned: string; gamesPlayed: string }

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

export function SnakeLeaderboardEditor() {
  const [tab, setTab] = useState<SpeedMode>("x1");
  const [rows, setRows] = useState<AdminSnakeScoreRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditState>({ bestScore: "", totalCrEarned: "", gamesPlayed: "" });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ msg: string; ok: boolean } | null>(null);
  const [snapshotName, setSnapshotName] = useState("");
  const [snapshoting, setSnapshoting] = useState(false);
  const [snapshots, setSnapshots] = useState<AdminSnakeSnapshot[]>([]);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  function showFlash(msg: string, ok: boolean) {
    setFlash({ msg, ok });
    setTimeout(() => setFlash(null), 3500);
  }

  async function load() {
    setLoading(true);
    const data = await adminGetSnakeLeaderboard(tab);
    setRows(data);
    setLoading(false);
    setEditId(null);
  }

  async function loadSnapshots() {
    const data = await adminGetSnakeSnapshots(tab);
    setSnapshots(data);
  }

  useEffect(() => { load(); loadSnapshots(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  function startEdit(row: AdminSnakeScoreRow) {
    setEditId(row.userId);
    setEditDraft({
      bestScore: String(row.bestScore),
      totalCrEarned: String(row.totalCrEarned),
      gamesPlayed: String(row.gamesPlayed),
    });
  }

  async function saveEdit(row: AdminSnakeScoreRow) {
    setSaving(true);
    const res = await adminUpdateSnakeScore(
      row.userId, tab,
      parseInt(editDraft.bestScore) || 0,
      parseInt(editDraft.totalCrEarned) || 0,
      parseInt(editDraft.gamesPlayed) || 0,
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

  async function handleDelete(row: AdminSnakeScoreRow) {
    if (!confirm(`Score von ${row.username} (${tab}) löschen?`)) return;
    setDeleting(row.userId);
    const res = await adminDeleteSnakeScore(row.userId, tab);
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
    const res = await adminCreateSnakeSnapshot(tab, snapshotName);
    setSnapshoting(false);
    if (res.success) {
      showFlash("Snapshot erstellt!", true);
      setSnapshotName("");
      loadSnapshots();
    } else {
      showFlash(res.error ?? "Fehler", false);
    }
  }

  async function handleRestore(snap: AdminSnakeSnapshot) {
    if (!confirm(`Bestenliste (${tab}) auf "${snap.name}" zurücksetzen? Alle aktuellen Scores werden überschrieben!`)) return;
    setRestoring(snap.id);
    const res = await adminRestoreSnakeSnapshot(snap.id, tab);
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
          <Crown className="h-4 w-4 text-amber-400" /> Snake Bestenliste bearbeiten
        </h4>
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs font-semibold text-zinc-400 hover:text-zinc-200">
          <RefreshCw className="h-3 w-3" /> Neu laden
        </button>
      </div>

      {flash && <Flash msg={flash.msg} ok={flash.ok} />}

      {/* Speed mode tabs */}
      <div className="flex gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
        {(["x1", "x2"] as const).map((m) => (
          <button key={m} onClick={() => setTab(m)}
            className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs font-bold transition-colors ${
              tab === m
                ? m === "x2" ? "bg-amber-500/20 text-amber-300" : "bg-purple-500/20 text-purple-200"
                : "text-zinc-500 hover:text-zinc-300"
            }`}>
            {m === "x2" && <Zap className="h-3 w-3" />}{m}
          </button>
        ))}
      </div>

      {/* Leaderboard table */}
      <div className="overflow-hidden rounded-xl border border-white/8">
        <div className="flex items-center gap-2 border-b border-white/8 bg-white/[0.02] px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
          <span className="w-6" />
          <span className="flex-1">Spieler</span>
          <span className="w-20 text-right">Score</span>
          <span className="w-24 text-right">CR gesamt</span>
          <span className="w-16 text-right">Spiele</span>
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
                <div key={row.userId} className={`flex items-center gap-2 px-3 py-2 ${isEditing ? "bg-purple-500/5" : "hover:bg-white/[0.015]"}`}>
                  <div className="flex w-6 justify-center">
                    <RankBadge rank={i + 1} />
                  </div>
                  <span className="flex-1 truncate text-sm font-semibold text-zinc-200">{row.username}</span>

                  {isEditing ? (
                    <>
                      <input
                        type="number" min={0} value={editDraft.bestScore}
                        onChange={(e) => setEditDraft((d) => ({ ...d, bestScore: e.target.value }))}
                        className="w-20 rounded border border-purple-500/40 bg-black/40 px-2 py-1 text-right text-xs text-zinc-100 outline-none"
                        title="Score"
                      />
                      <input
                        type="number" min={0} value={editDraft.totalCrEarned}
                        onChange={(e) => setEditDraft((d) => ({ ...d, totalCrEarned: e.target.value }))}
                        className="w-24 rounded border border-purple-500/40 bg-black/40 px-2 py-1 text-right text-xs text-zinc-100 outline-none"
                        title="CR gesamt"
                      />
                      <input
                        type="number" min={0} value={editDraft.gamesPlayed}
                        onChange={(e) => setEditDraft((d) => ({ ...d, gamesPlayed: e.target.value }))}
                        className="w-16 rounded border border-purple-500/40 bg-black/40 px-2 py-1 text-right text-xs text-zinc-100 outline-none"
                        title="Spiele"
                      />
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
                      <span className="w-20 text-right font-mono text-sm font-bold text-zinc-200">{row.bestScore}</span>
                      <span className="w-24 text-right font-mono text-xs text-zinc-400">{row.totalCrEarned.toLocaleString("de-DE")}</span>
                      <span className="w-16 text-right text-xs text-zinc-500">{row.gamesPlayed}</span>
                      <div className="flex w-16 items-center justify-end gap-1">
                        <button onClick={() => startEdit(row)}
                          className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-purple-300">
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
          Speichert den aktuellen Stand als Sicherung. Kann später wiederhergestellt werden.
        </p>
        <div className="flex gap-2">
          <input
            type="text" maxLength={50} placeholder={`z. B. "vor Season 2" (${tab})`}
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
      <div className="rounded-xl border border-white/8 overflow-hidden">
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
              <p className="px-4 py-4 text-xs text-zinc-600">Noch keine Snapshots für {tab}</p>
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
