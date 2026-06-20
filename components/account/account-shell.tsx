"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Coins, Package, Sparkles, ShieldCheck, Pencil, Check, X } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { updateUsername } from "@/lib/actions/account";

interface AccountShellProps {
  username: string;
  avatarUrl: string | null;
  credits: number;
  streakDays: number;
  casesOpened: number;
  role: string;
  memberSince: string;
  inventoryCount: number;
}

export function AccountShell({
  username,
  avatarUrl,
  credits,
  streakDays,
  casesOpened,
  role,
  memberSince,
  inventoryCount,
}: AccountShellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(username);
  const [displayName, setDisplayName] = useState(username);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await updateUsername(draft);
    setSaving(false);
    if (!res.success) {
      setError(res.error ?? "Fehler.");
      return;
    }
    setDisplayName(draft);
    setEditing(false);
  }

  const joinedLabel = new Date(memberSince).toLocaleDateString("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-1 flex-col">
      <TopBar credits={credits} streakDays={streakDays} inventoryCount={inventoryCount} />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Link>

        <div className="glow-box flex items-center gap-4 rounded-2xl border border-purple-500/20 bg-black/30 p-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-purple-400/40 bg-purple-600/30 text-2xl font-bold text-purple-200 shadow-[0_0_18px_rgba(168,85,247,0.4)]">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              displayName.charAt(0).toUpperCase()
            )}
          </div>

          <div className="flex-1">
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  autoFocus
                  className="w-40 rounded-lg border border-purple-400/50 bg-black/40 px-2 py-1 text-lg font-bold text-zinc-100 outline-none"
                />
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-full bg-emerald-600/80 p-1.5 text-white hover:bg-emerald-500"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setDraft(displayName);
                    setError(null);
                  }}
                  className="rounded-full bg-white/10 p-1.5 text-zinc-300 hover:bg-white/20"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <h1 className="glow-text flex items-center gap-2 text-2xl font-extrabold text-zinc-50">
                {displayName}
                <button
                  onClick={() => setEditing(true)}
                  className="text-zinc-500 transition-colors hover:text-purple-300"
                  title="Namen bearbeiten"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                {role === "admin" && (
                  <span className="flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                    <ShieldCheck className="h-3 w-3" />
                    Admin
                  </span>
                )}
              </h1>
            )}
            {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
            <p className="mt-1 text-sm text-zinc-500">Mitglied seit {joinedLabel}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-purple-500/20 bg-white/[0.02] px-4 py-4 text-center">
            <Coins className="mx-auto h-5 w-5 text-purple-300" />
            <p className="glow-text mt-2 text-xl font-extrabold text-purple-300">
              {credits.toLocaleString("de-DE")}
            </p>
            <p className="text-xs text-zinc-500">Credits</p>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-white/[0.02] px-4 py-4 text-center">
            <Sparkles className="mx-auto h-5 w-5 text-amber-300" />
            <p className="mt-2 text-xl font-extrabold text-amber-300">{casesOpened}</p>
            <p className="text-xs text-zinc-500">Cases geöffnet</p>
          </div>
          <div className="rounded-xl border border-blue-500/20 bg-white/[0.02] px-4 py-4 text-center">
            <Package className="mx-auto h-5 w-5 text-blue-300" />
            <p className="mt-2 text-xl font-extrabold text-blue-300">{inventoryCount}</p>
            <p className="text-xs text-zinc-500">Items im Inventar</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/garderobe"
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(147,51,234,0.5)] transition-transform hover:scale-105"
          >
            Garderobe
          </Link>
          <Link
            href="/#case-opening"
            className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-5 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:border-white/30"
          >
            Case Opening
          </Link>
        </div>
      </main>
    </div>
  );
}
