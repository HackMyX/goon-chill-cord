"use client";

import { useEffect, useState } from "react";
import { Crown, Trophy, Disc3, Loader2, RefreshCw } from "lucide-react";
import { adminGetDonLeaderboard, type AdminDonRow } from "@/lib/actions/admin-leaderboard";

const ROLE_COLORS: Record<string, string> = {
  admin:     "text-amber-400",
  moderator: "text-cyan-400",
  user:      "text-zinc-400",
};

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="h-4 w-4 text-amber-400" />;
  if (rank === 2) return <Trophy className="h-4 w-4 text-zinc-300" />;
  if (rank === 3) return <Trophy className="h-4 w-4 text-amber-600" />;
  return <span className="text-xs font-bold text-zinc-600">#{rank}</span>;
}

export function DonLeaderboardEditor() {
  const [rows, setRows] = useState<AdminDonRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const data = await adminGetDonLeaderboard();
    setRows(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-bold text-zinc-300">
          <Disc3 className="h-4 w-4 text-rose-400" />
          DON Bestenliste (nach Credits)
        </h4>
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs font-semibold text-zinc-400 hover:text-zinc-200">
          <RefreshCw className="h-3 w-3" /> Neu laden
        </button>
      </div>

      <p className="text-[11px] text-zinc-600">
        DON ist ein Credits-Transfer-Spiel ohne eigene Score-Tabelle.
        Diese Rangliste zeigt die reichsten Spieler sortiert nach ihren Credits-Kontostand —
        ein indirekter Indikator für DON-Erfolg.
      </p>

      <div className="overflow-hidden rounded-xl border border-white/8">
        <div className="flex items-center gap-2 border-b border-white/8 bg-white/[0.02] px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
          <span className="w-6" />
          <span className="flex-1">Spieler</span>
          <span className="w-12 text-right">Rolle</span>
          <span className="w-32 text-right">Credits</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Lädt…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-zinc-600">Keine Spieler gefunden</div>
        ) : (
          <div className="flex flex-col divide-y divide-white/[0.04]">
            {rows.map((row, i) => (
              <div key={row.userId} className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.015]">
                <div className="flex w-6 justify-center">
                  <RankBadge rank={i + 1} />
                </div>
                <span className="flex-1 truncate text-sm font-semibold text-zinc-200">{row.username}</span>
                <span className={`w-12 text-right text-[10px] font-bold capitalize ${ROLE_COLORS[row.role] ?? "text-zinc-400"}`}>
                  {row.role}
                </span>
                <span className="w-32 text-right font-mono text-sm font-bold text-purple-300">
                  {row.credits.toLocaleString("de-DE")} CR
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
