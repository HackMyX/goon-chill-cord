"use client";

import { Skull, RotateCcw, Coins, Flame, ArrowLeft } from "lucide-react";

interface DeathScreenProps {
  forfeitedCr: number;
  forfeitedKillCount: number;
  onRespawn: () => void;
  /** Leaves straight from here instead of forcing a respawn first just to
   * reach the regular "Zurück" link — no countdown needed (unlike the
   * Disconnect button elsewhere), since dying already forfeited whatever
   * streak was pending, so there's nothing left to lose by leaving now. */
  onLeave: () => void;
}

/**
 * Full-screen overlay shown the instant the player's hp hits 0 (player.tsx
 * no longer auto-respawns — see its onDeath/respawnSignal doc comments) —
 * stops here until the player explicitly clicks Respawn, which is also the
 * only thing that actually performs the position/hp reset. Shows exactly
 * what dying just cost (the *uncommitted* kill-streak CR/kill count that
 * lib/actions/kill-streak.ts' forfeitStreakOnDeath() already zeroed
 * server-side by the time this renders) — equipped items and already-
 * committed `profiles.credits` are never touched by death, so this overlay
 * deliberately never implies otherwise.
 */
export function DeathScreen({ forfeitedCr, forfeitedKillCount, onRespawn, onLeave }: DeathScreenProps) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-black/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3">
        <span className="flex h-16 w-16 items-center justify-center rounded-full border border-red-500/50 bg-red-500/10 shadow-[0_0_40px_rgba(239,68,68,0.4)]">
          <Skull className="h-8 w-8 text-red-400" />
        </span>
        <h2 className="glow-text text-3xl font-extrabold text-red-300">Du bist gestorben</h2>
      </div>

      {forfeitedKillCount > 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/[0.06] px-6 py-4">
          <p className="text-sm text-zinc-400">Verlorene Kill-Streak</p>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-lg font-bold text-amber-300">
              <Coins className="h-4 w-4" />-{forfeitedCr.toLocaleString("de-DE")} CR
            </span>
            <span className="flex items-center gap-1.5 text-lg font-bold text-orange-300">
              <Flame className="h-4 w-4" />
              {forfeitedKillCount} Kills
            </span>
          </div>
          <p className="text-xs text-zinc-500">Ausgerüstete Items und dein Konto-Guthaben bleiben unberührt.</p>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Keine offene Kill-Streak verloren.</p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={onRespawn}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-6 py-3 text-base font-bold text-white shadow-[0_0_20px_rgba(147,51,234,0.5)] transition-colors hover:bg-purple-500"
        >
          <RotateCcw className="h-5 w-5" />
          Respawn
        </button>
        <button
          onClick={onLeave}
          className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-6 py-3 text-base font-semibold text-zinc-300 transition-colors hover:border-white/30 hover:bg-white/10"
        >
          <ArrowLeft className="h-5 w-5" />
          Verlassen
        </button>
      </div>
    </div>
  );
}
