"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Users,
  UserPlus,
  Ban,
  Clock,
  Check,
  X,
  Undo2,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import {
  getFriendsAdminData,
  type FriendsAdminData,
  type FriendRequestStatus,
} from "@/lib/actions/friends";

const STATUS_META: Record<
  FriendRequestStatus,
  { label: string; color: string; bg: string; border: string; icon: LucideIcon }
> = {
  pending: {
    label: "offen",
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    icon: Clock,
  },
  accepted: {
    label: "angenommen",
    color: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    icon: Check,
  },
  declined: {
    label: "abgelehnt",
    color: "text-zinc-400",
    bg: "bg-white/5",
    border: "border-white/10",
    icon: X,
  },
  cancelled: {
    label: "zurückgezogen",
    color: "text-zinc-400",
    bg: "bg-white/5",
    border: "border-white/10",
    icon: Undo2,
  },
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("de-DE");
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#0f0e18] p-5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/5 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-extrabold text-zinc-50">{value.toLocaleString("de-DE")}</p>
        <p className="text-xs text-zinc-400">{label}</p>
      </div>
    </div>
  );
}

export function FriendsLogsTab() {
  const [data, setData] = useState<FriendsAdminData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getFriendsAdminData()
      .then((d) => { if (active) setData(d); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        Lade Freunde-Daten…
      </div>
    );
  }

  if (!data) {
    return (
      <p className="rounded-xl border border-white/10 bg-[#0f0e18] p-5 text-sm text-zinc-400">
        Keine Daten verfügbar.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Statistik ─────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={Users} label="Freundschaften" value={data.stats.friendships} color="text-purple-300" />
        <StatCard icon={UserPlus} label="Offene Anfragen" value={data.stats.pending} color="text-amber-300" />
        <StatCard icon={Ban} label="Blockierungen" value={data.stats.blocks} color="text-red-300" />
      </div>

      {/* ── Anfragen-Verlauf ──────────────────────────── */}
      <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-200">
          <UserPlus className="h-4 w-4 text-zinc-400" />
          Anfragen-Verlauf
          <span className="text-xs font-normal text-zinc-500">({data.requests.length})</span>
        </h3>
        {data.requests.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">Noch keine Anfragen.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.requests.map((r) => {
              const meta = STATUS_META[r.status];
              const Icon = meta.icon;
              return (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-1.5 text-sm text-zinc-200">
                    <span className="truncate font-semibold">{r.fromUsername}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                    <span className="truncate font-semibold">{r.toUsername}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.color} ${meta.bg} ${meta.border}`}
                    >
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </span>
                    <span className="text-[10px] text-zinc-500">{fmt(r.respondedAt ?? r.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Blockierungen ─────────────────────────────── */}
      <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-200">
          <Ban className="h-4 w-4 text-red-300" />
          Blockierungen
          <span className="text-xs font-normal text-zinc-500">({data.blocks.length})</span>
        </h3>
        {data.blocks.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">Keine Blockierungen.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.blocks.map((b, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-1.5 text-sm text-zinc-200">
                  <span className="truncate font-semibold">{b.blockerUsername}</span>
                  <Ban className="h-3.5 w-3.5 shrink-0 text-red-400" />
                  <span className="truncate font-semibold text-zinc-400">{b.blockedUsername}</span>
                </div>
                <span className="text-[10px] text-zinc-500">{fmt(b.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
