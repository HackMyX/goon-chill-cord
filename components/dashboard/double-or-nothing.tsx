"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Coins } from "lucide-react";
import { flipDouble } from "@/lib/actions/double-or-nothing";
import { useSoundManager } from "@/lib/sound-manager";

const QUICK_AMOUNTS = [100, 500, 1000, 5000, 10000];

interface DoubleOrNothingProps {
  credits: number;
  onCreditsChange: (newCredits: number) => void;
}

export function DoubleOrNothing({ credits, onCreditsChange }: DoubleOrNothingProps) {
  const [amount, setAmount] = useState(100);
  const [flipping, setFlipping] = useState(false);
  const [result, setResult] = useState<{ won: boolean; amount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sound = useSoundManager();

  const clampedAmount = Math.max(1, Math.min(amount, credits || 1));

  async function handleFlip() {
    if (flipping || clampedAmount <= 0 || clampedAmount > credits) return;
    setFlipping(true);
    setResult(null);
    setError(null);
    sound.flip();

    const res = await flipDouble(clampedAmount);

    await new Promise((r) => setTimeout(r, 1200));

    if (!res.success) {
      setError(res.error ?? "Unbekannter Fehler.");
      setFlipping(false);
      sound.error();
      return;
    }

    setResult({ won: !!res.won, amount: res.amount ?? clampedAmount });
    setFlipping(false);
    onCreditsChange(res.newCredits!);
    if (res.won) sound.win();
    else sound.error();
  }

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-10 text-center">
      <h2 className="text-2xl font-extrabold text-zinc-50 drop-shadow-[0_0_10px_rgba(245,158,11,0.4)]">
        Double or Nothing
      </h2>
      <p className="mt-1 text-sm text-zinc-400">
        Riskiere deine Credits — 50/50 Chance auf das Doppelte
      </p>

      <div className="mt-6 rounded-2xl border border-amber-500/20 bg-black/30 p-6">
        <motion.div
          animate={
            flipping
              ? { rotateY: 1440 }
              : { rotateY: 0 }
          }
          transition={{ duration: 1.2, ease: "easeInOut" }}
          className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-b from-amber-300 to-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.6)] ${
            result?.won === false ? "from-red-400 to-red-600 shadow-[0_0_30px_rgba(239,68,68,0.6)]" : ""
          }`}
        >
          <Coins className="h-8 w-8 text-black/70" />
        </motion.div>

        {result && (
          <p
            className={`mt-3 text-sm font-bold ${
              result.won ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {result.won
              ? `Gewonnen! +${result.amount.toLocaleString("de-DE")} CR`
              : `Verloren! -${result.amount.toLocaleString("de-DE")} CR`}
          </p>
        )}
        {error && <p className="mt-3 text-sm font-medium text-red-400">{error}</p>}

        <p className="mt-6 text-left text-xs font-semibold tracking-wide text-purple-300">
          SCHNELLAUSWAHL
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {QUICK_AMOUNTS.map((value) => (
            <button
              key={value}
              onClick={() => {
                sound.click();
                setAmount(Math.min(value, credits || value));
              }}
              disabled={flipping}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                amount === value
                  ? "border-amber-400 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                  : "border-white/10 text-zinc-300 hover:border-white/30"
              }`}
            >
              {value.toLocaleString("de-DE")}
            </button>
          ))}
          <button
            onClick={() => setAmount(credits)}
            disabled={flipping}
            className="rounded-lg border border-red-500/60 px-3 py-1.5 text-sm font-semibold text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.35)] transition-colors hover:border-red-400"
          >
            Alles ({credits.toLocaleString("de-DE")})
          </button>
        </div>

        <div className="mt-4 flex items-stretch gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3">
            <Coins className="h-4 w-4 text-purple-300" />
            <input
              type="number"
              min={1}
              max={credits || 1}
              value={amount}
              disabled={flipping}
              onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
              className="w-full bg-transparent py-2 text-sm font-bold text-zinc-100 outline-none"
            />
          </div>
          <button
            onClick={handleFlip}
            disabled={flipping || credits <= 0}
            className="rounded-lg bg-gradient-to-b from-amber-300 to-amber-500 px-6 py-2 text-sm font-extrabold text-black shadow-[0_0_18px_rgba(245,158,11,0.55)] transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
          >
            FLIP!
          </button>
        </div>

        <p className="mt-3 text-xs text-zinc-400">
          Guthaben: <span className="font-semibold text-purple-300">{credits.toLocaleString("de-DE")} Credits</span>{" "}
          · Gewinn:{" "}
          <span className="font-semibold text-amber-300">
            {(clampedAmount * 2).toLocaleString("de-DE")}
          </span>
        </p>
      </div>
    </section>
  );
}
