"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { Coins, Timer } from "lucide-react";
import { flipDouble } from "@/lib/actions/double-or-nothing";
import { useSoundManager } from "@/lib/sound-manager";
import { useSiteConfig } from "@/components/layout/site-config-provider";

function fireDoNConfetti() {
  confetti({
    particleCount: 70,
    spread: 75,
    startVelocity: 35,
    origin: { y: 0.65 },
    colors: ["#fbbf24", "#f59e0b", "#fff7ed", "#34d399"],
  });
}

// Must match COOLDOWN_SEC in lib/actions/double-or-nothing.ts
const COOLDOWN_MS = 8_000;
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
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldownSecs, setCooldownSecs] = useState(0);
  const sound = useSoundManager();
  const { currencyName } = useSiteConfig();

  const clampedAmount = Math.max(1, Math.min(amount, credits || 1));
  const isCoolingDown = cooldownSecs > 0;

  // Tick down the cooldown display
  useEffect(() => {
    if (!cooldownUntil) return;
    const id = setInterval(() => {
      const rem = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownSecs(rem);
      if (rem <= 0) {
        setCooldownUntil(null);
        clearInterval(id);
      }
    }, 200);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  async function handleFlip() {
    if (flipping || isCoolingDown || clampedAmount <= 0 || clampedAmount > credits) return;
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
      // If the server returned a remaining cooldown, display it in the button
      if (res.cooldownRemaining && res.cooldownRemaining > 0) {
        const until = Date.now() + res.cooldownRemaining * 1000;
        setCooldownUntil(until);
        setCooldownSecs(res.cooldownRemaining);
      }
      return;
    }

    setResult({ won: !!res.won, amount: res.amount ?? clampedAmount });
    setFlipping(false);
    onCreditsChange(res.newCredits!);

    // Start the client-side cooldown after every successful flip
    setCooldownUntil(Date.now() + COOLDOWN_MS);
    setCooldownSecs(Math.ceil(COOLDOWN_MS / 1000));

    if (res.won) {
      sound.win();
      fireDoNConfetti();
    } else {
      sound.error();
    }
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
              : result?.won
                ? { rotateY: 0, scale: [1, 1.25, 1] }
                : { rotateY: 0 }
          }
          transition={
            flipping
              ? { duration: 1.2, ease: "easeInOut" }
              : { duration: 0.5, ease: "easeOut" }
          }
          className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-b from-amber-300 to-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.6)] ${
            result?.won === false ? "from-red-400 to-red-600 shadow-[0_0_30px_rgba(239,68,68,0.6)]" : ""
          } ${result?.won ? "shadow-[0_0_45px_rgba(52,211,153,0.7)]" : ""}`}
        >
          <Coins className="h-8 w-8 text-black/70" />
        </motion.div>

        <AnimatePresence mode="wait">
          {result && (
            <motion.p
              key={result.won ? "won" : "lost"}
              initial={{ opacity: 0, y: 8, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 280, damping: 16 }}
              className={`mt-3 text-base font-extrabold ${
                result.won
                  ? "glow-text text-emerald-400"
                  : "text-red-400"
              }`}
            >
              {result.won
                ? `🎉 Gewonnen! +${result.amount.toLocaleString("de-DE")} ${currencyName}`
                : `Verloren! -${result.amount.toLocaleString("de-DE")} ${currencyName}`}
            </motion.p>
          )}
        </AnimatePresence>
        {error && <p className="mt-3 text-sm font-medium text-red-400">{error}</p>}

        <p className="mt-6 text-left text-xs font-semibold tracking-wide text-purple-300">
          SCHNELLAUSWAHL
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {QUICK_AMOUNTS.map((value) => (
            <button
              key={value}
              onMouseEnter={sound.hover}
              onClick={() => {
                sound.click();
                setAmount(Math.min(value, credits || value));
              }}
              disabled={flipping || isCoolingDown}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                amount === value
                  ? "border-amber-400 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                  : "border-white/10 text-zinc-300 hover:border-white/30"
              }`}
            >
              {value.toLocaleString("de-DE")}
            </button>
          ))}
          <button
            onMouseEnter={sound.hover}
            onClick={() => {
              sound.click();
              setAmount(credits);
            }}
            disabled={flipping || isCoolingDown}
            className="rounded-lg border border-red-500/60 px-3 py-1.5 text-sm font-semibold text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.35)] transition-colors hover:border-red-400 disabled:opacity-50"
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
              disabled={flipping || isCoolingDown}
              onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
              className="w-full bg-transparent py-2 text-sm font-bold text-zinc-100 outline-none disabled:opacity-60"
            />
          </div>
          <button
            onMouseEnter={sound.hover}
            onClick={handleFlip}
            disabled={flipping || isCoolingDown || credits <= 0}
            className={`flex min-w-[80px] items-center justify-center gap-1.5 rounded-lg px-6 py-2 text-sm font-extrabold transition-all ${
              isCoolingDown
                ? "cursor-not-allowed bg-zinc-700 text-zinc-400 shadow-none"
                : "bg-gradient-to-b from-amber-300 to-amber-500 text-black shadow-[0_0_18px_rgba(245,158,11,0.55)] hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
            }`}
          >
            {flipping ? (
              "…"
            ) : isCoolingDown ? (
              <>
                <Timer className="h-3.5 w-3.5" />
                {cooldownSecs}s
              </>
            ) : (
              "FLIP!"
            )}
          </button>
        </div>

        <p className="mt-3 text-xs text-zinc-400">
          Guthaben:{" "}
          <span className="font-semibold text-purple-300">
            {credits.toLocaleString("de-DE")} {currencyName}
          </span>{" "}
          · Gewinn:{" "}
          <span className="font-semibold text-amber-300">
            {(clampedAmount * 2).toLocaleString("de-DE")}
          </span>
        </p>
      </div>
    </section>
  );
}
