"use client";

import { useEffect, useState } from "react";
import { Crown, Trophy, CircleDot, Trash2, Loader2, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { adminGetPlinkoLeaderboard, adminDeletePlinkoHistory, type AdminPlinkoRow } from "@/lib/actions/admin-leaderboard";

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

export function PlinkoLeaderboardEditor() {
  const [rows, setRows] = useState<AdminPlinkoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ msg: string; ok: boolean } | null>(null);

  function showFlash(msg: string, ok: boolean) {
    setFlash({ msg, ok });
    setTimeout(() => setFlash(null), 3500);
  }

  async function load() {
    setLoading(true);
    const data = await adminGetPlinkoLeaderboard();
    setRows(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete(row: AdminPlinkoRow) {
    if (!confirm(`Alle Plinko-Plays von ${row.username} löschen? (${row.gamesPlayed} Einträge)`)) return;
    setDeleting(row.userId);
    const res = await adminDeletePlinkoHistory(row.userId);
    setDeleting(null);
    if (res.success) {
      showFlash(`${row.username} gelöscht.`, true);
      load();
    } else {
      showFlash(res.error ?? "Fehler", false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-bold text-zinc-300">
          <CircleDot className="h-4 w-4 text-cyan-400" />
          Plinko Bestenliste (bestes Gewinn-CR pro Spieler)
        </h4>
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs font-semibold text-zinc-400 hover:text-zinc-200">
          <RefreshCw className="h-3 w-3" /> Neu laden
        </button>
      </div>

      <p className="text-[11px] text-zinc-600">
        Aggregiert aus allen Plinko-Plays — sortiert nach bestem einzelnem Gewinn in CR.
        "History löschen" entfernt alle Play-Einträge dieses Spielers.
      </p>

      {flash && <Flash msg={flash.msg} ok={flash.ok} />}

      <div className="overflow-hidden rounded-xl border border-white/8">
        <div className="flex items-center gap-2 border-b border-white/8 bg-white/[0.02] px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
          <span className="w-6" />
          <span className="flex-1">Spieler</span>
          <span className="w-24 text-right">Bester Gewinn</span>
          <span className="w-20 text-right">×Mult</span>
          <span className="w-20 text-right">Plays</span>
          <span className="w-10" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Lädt…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-zinc-600">Keine Plinko-Spiele vorhanden</div>
        ) : (
          <div className="flex flex-col divide-y divide-white/[0.04]">
            {rows.map((row, i) => (
              <div key={row.userId} className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.015]">
                <div className="flex w-6 justify-center">
                  <RankBadge rank={i + 1} />
                </div>
                <span className="flex-1 truncate text-sm font-semibold text-zinc-200">{row.username}</span>
                <span className="w-24 text-right font-mono text-sm font-bold text-emerald-300">
                  {row.bestWinCr.toLocaleString("de-DE")} CR
                </span>
                <span className="w-20 text-right font-mono text-xs text-cyan-400">
                  ×{row.bestMultiplier.toFixed(1)}
                </span>
                <span className="w-20 text-right text-xs text-zinc-500">{row.gamesPlayed}</span>
                <div className="flex w-10 justify-end">
                  <button
                    onClick={() => handleDelete(row)}
                    disabled={deleting === row.userId}
                    title="Plinko-History dieses Spielers löschen"
                    className="rounded p-1 text-zinc-600 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                  >
                    {deleting === row.userId
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
