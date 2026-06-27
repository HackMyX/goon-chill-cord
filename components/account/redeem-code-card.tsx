"use client";

import { useState } from "react";
import { Gift, Loader2, Check } from "lucide-react";
import { claimRedemptionCode } from "@/lib/actions/vouchers";
import { useSoundManager } from "@/lib/sound-manager";

/** Compact "redeem a gift code" card for the profile page. */
export function RedeemCodeCard() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const sound = useSoundManager();

  async function redeem() {
    if (!code.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    sound.click();
    const res = await claimRedemptionCode(code);
    setBusy(false);
    if (res.success) {
      sound.win?.();
      setMsg({ text: `🎁 Eingelöst: ${res.reward}`, ok: true });
      setCode("");
    } else {
      sound.error();
      setMsg({ text: res.error ?? "Fehler.", ok: false });
    }
  }

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-500">Gutschein einlösen</h2>
      <div className="rounded-2xl border border-purple-500/15 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Gift className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-purple-300" />
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void redeem(); }}
              placeholder="CODE EINGEBEN"
              maxLength={32}
              className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-9 pr-3 text-sm font-bold uppercase tracking-wider text-zinc-100 placeholder-zinc-600 outline-none focus:border-purple-400/50"
            />
          </div>
          <button
            onClick={() => void redeem()}
            disabled={busy || !code.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-purple-500 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Einlösen
          </button>
        </div>
        {msg && (
          <p className={`mt-2 text-xs font-semibold ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
        )}
        <p className="mt-2 text-[11px] text-zinc-600">
          Lös einen Gutschein-Code ein und erhalte Credits, Fähigkeiten, Badges oder Name-Styles. Jeder Code nur einmal pro Account.
        </p>
      </div>
    </div>
  );
}
