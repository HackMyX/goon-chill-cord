"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, TrendingUp, TrendingDown, Coins, RotateCcw } from "lucide-react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { TopBar } from "@/components/layout/top-bar";
import { flipDouble } from "@/lib/actions/double-or-nothing";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import { useRealtimeProfile } from "@/lib/use-realtime-profile";
import type { DonConfig } from "@/lib/don-config";

function fmt(n: number) {
  return new Intl.NumberFormat("de-DE").format(n);
}

interface FlipEntry {
  id: number;
  won: boolean;
  amount: number;
}

export function DonShell({
  initialCredits,
  inventoryCount,
  streakDays,
  isAdmin = false,
  isModerator = false,
  donConfig,
  initialFlipsToday,
  initialHourlyFlipsUsed = 0,
}: {
  initialCredits: number;
  inventoryCount: number;
  streakDays: number;
  isAdmin?: boolean;
  isModerator?: boolean;
  donConfig: DonConfig;
  initialFlipsToday: number;
  initialHourlyFlipsUsed?: number;
}) {
  const [credits, setCredits] = useState(initialCredits);
  const [phase, setPhase] = useState<"idle" | "loading" | "flipping" | "won" | "lost">("idle");
  const [selectedQuick, setSelectedQuick] = useState<number>(donConfig.quickAmounts[0] ?? 100);
  const [customBet, setCustomBet] = useState("");
  const [lastResult, setLastResult] = useState<{ won: boolean; amount: number } | null>(null);
  const [history, setHistory] = useState<FlipEntry[]>([]);
  const [flipsUsed, setFlipsUsed] = useState(initialFlipsToday);
  const [hourlyFlipsUsed, setHourlyFlipsUsed] = useState(initialHourlyFlipsUsed);
  const [error, setError] = useState<string | null>(null);

  const coinControls = useAnimation();
  const coinYRef = useRef(0);
  const nextIdRef = useRef(0);
  const { currencyName } = useSiteConfig();
  const router = useRouter();

  useRealtimeProfile((row) => {
    if (typeof row.credits === "number") setCredits(row.credits);
  });

  function handleCreditsChange(newCredits: number) {
    setCredits(newCredits);
    router.refresh();
  }

  const stake = customBet ? Math.floor(Number(customBet)) || 0 : selectedQuick;
  const flipsRemaining = Math.max(0, donConfig.dailyFlipLimit - flipsUsed);
  const hourlyRemaining = donConfig.hourlyFlipLimit !== null
    ? Math.max(0, donConfig.hourlyFlipLimit - hourlyFlipsUsed)
    : null;
  const sessionWins = history.filter((h) => h.won).length;
  const sessionLosses = history.filter((h) => !h.won).length;
  const sessionNet = history.reduce((acc, h) => acc + (h.won ? h.amount : -h.amount), 0);
  const flipsProgress = donConfig.dailyFlipLimit > 0 ? (flipsUsed / donConfig.dailyFlipLimit) * 100 : 0;
  const hourlyProgress = donConfig.hourlyFlipLimit !== null && donConfig.hourlyFlipLimit > 0
    ? (hourlyFlipsUsed / donConfig.hourlyFlipLimit) * 100
    : 0;

  const canFlip =
    phase === "idle" &&
    donConfig.enabled &&
    flipsRemaining > 0 &&
    (hourlyRemaining === null || hourlyRemaining > 0) &&
    stake >= donConfig.minBet &&
    stake > 0 &&
    credits >= stake &&
    (!donConfig.maxBet || stake <= donConfig.maxBet);

  async function handleFlip() {
    if (!canFlip) return;

    setPhase("loading");
    setError(null);
    setLastResult(null);

    const res = await flipDouble(stake);

    if (!res.success) {
      setPhase("idle");
      setError(res.error ?? "Unbekannter Fehler.");
      return;
    }

    setPhase("flipping");

    // Accumulate rotations so we never reset and the animation always
    // continues from the previous landing position.
    const prev = coinYRef.current;
    const next = prev + 1440 + (res.won ? 0 : 180);
    coinYRef.current = next;

    await coinControls.start({
      rotateY: next,
      transition: { duration: 1.25, ease: [0.15, 0.0, 0.05, 1.0] },
    });

    const entry: FlipEntry = { id: ++nextIdRef.current, won: res.won!, amount: res.amount! };
    setLastResult({ won: res.won!, amount: res.amount! });
    setCredits(res.newCredits!);
    setFlipsUsed((f) => f + 1);
    setHourlyFlipsUsed((f) => f + 1);
    setHistory((h) => [entry, ...h].slice(0, 20));
    setPhase(res.won ? "won" : "lost");

    if (res.won) {
      import("canvas-confetti").then(({ default: confetti }) => {
        confetti({
          particleCount: 140,
          spread: 75,
          origin: { y: 0.45 },
          colors: ["#f59e0b", "#fbbf24", "#d97706", "#ffffff", "#a78bfa"],
        });
      });
    }

    setTimeout(() => setPhase("idle"), 2600);
  }

  const limitBarColor =
    flipsProgress >= 90
      ? "linear-gradient(90deg,#ef4444,#dc2626)"
      : flipsProgress >= 60
      ? "linear-gradient(90deg,#f59e0b,#d97706)"
      : "linear-gradient(90deg,#a78bfa,#7c3aed)";

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "#060409" }}>
      <TopBar
        credits={credits}
        inventoryCount={inventoryCount}
        streakDays={streakDays}
        onCreditsChange={handleCreditsChange}
        isAdmin={isAdmin}
        isModerator={isModerator}
      />

      {/* Atmospheric background blobs */}
      <div className="pointer-events-none fixed inset-0">
        <div
          className="absolute bottom-0 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full blur-[120px]"
          style={{ background: "rgba(245,158,11,0.06)" }}
        />
        <div
          className="absolute right-1/4 top-1/4 h-80 w-80 rounded-full blur-[90px]"
          style={{ background: "rgba(147,51,234,0.05)" }}
        />
        <div
          className="absolute left-1/5 top-1/2 h-64 w-64 rounded-full blur-[80px]"
          style={{ background: "rgba(245,158,11,0.04)" }}
        />
      </div>

      <main className="relative z-10 flex flex-1 flex-col items-center px-4 pb-16 pt-10">
        {/* Back link */}
        <div className="mb-8 w-full max-w-lg">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-zinc-600 transition-colors hover:text-zinc-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zur Startseite
          </Link>
        </div>

        {/* Page title */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mb-10 text-center"
        >
          <h1
            className="text-4xl font-black tracking-widest text-zinc-100 sm:text-5xl"
            style={{ textShadow: "0 0 48px rgba(245,158,11,0.35)" }}
          >
            DOUBLE{" "}
            <span
              className="text-amber-400"
              style={{ textShadow: "0 0 32px rgba(245,158,11,0.7)" }}
            >
              OR
            </span>{" "}
            NOTHING
          </h1>
          <p className="mt-3 text-sm text-zinc-500">{donConfig.sectionSubtitle}</p>
        </motion.div>

        {/* Game card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="w-full max-w-lg rounded-3xl border border-amber-500/10 p-8"
          style={{
            background: "linear-gradient(160deg,#0e0a18 0%,#0a0810 100%)",
            boxShadow: "0 0 80px rgba(245,158,11,0.04), 0 1px 0 rgba(255,255,255,0.04) inset",
          }}
        >
          {/* Daily limit progress */}
          {donConfig.showRemainingSpins && (
            <div className="mb-8 space-y-2.5">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-zinc-600">Tägliche Flips</span>
                  <span
                    className={`font-mono font-bold ${
                      flipsRemaining === 0
                        ? "text-red-400"
                        : flipsRemaining < 5
                        ? "text-amber-400"
                        : "text-emerald-400"
                    }`}
                  >
                    {flipsRemaining} / {donConfig.dailyFlipLimit} übrig
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800/80">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: limitBarColor }}
                    animate={{ width: `${flipsProgress}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </div>
              </div>

              {donConfig.hourlyFlipLimit !== null && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-zinc-600">Stündliche Flips</span>
                    <span
                      className={`font-mono font-bold ${
                        hourlyRemaining === 0
                          ? "text-red-400"
                          : (hourlyRemaining ?? 1) < 3
                          ? "text-amber-400"
                          : "text-cyan-400"
                      }`}
                    >
                      {hourlyRemaining} / {donConfig.hourlyFlipLimit} übrig
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-zinc-800/80">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: hourlyProgress >= 90
                          ? "linear-gradient(90deg,#ef4444,#dc2626)"
                          : hourlyProgress >= 60
                          ? "linear-gradient(90deg,#f59e0b,#d97706)"
                          : "linear-gradient(90deg,#22d3ee,#0891b2)",
                      }}
                      animate={{ width: `${hourlyProgress}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Coin */}
          <div className="flex flex-col items-center pb-8 pt-2">
            <div style={{ perspective: "900px" }}>
              <div className="relative" style={{ width: 148, height: 148 }}>
                {/* Phase glow ring */}
                <AnimatePresence>
                  {phase === "won" && (
                    <motion.div
                      key="glow-win"
                      initial={{ opacity: 0, scale: 0.75 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.75 }}
                      className="absolute inset-0 rounded-full"
                      style={{
                        boxShadow: "0 0 0 4px rgba(52,211,153,0.4), 0 0 60px 16px rgba(52,211,153,0.35)",
                      }}
                    />
                  )}
                  {phase === "lost" && (
                    <motion.div
                      key="glow-loss"
                      initial={{ opacity: 0, scale: 0.75 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.75 }}
                      className="absolute inset-0 rounded-full"
                      style={{
                        boxShadow: "0 0 0 4px rgba(239,68,68,0.4), 0 0 60px 16px rgba(239,68,68,0.35)",
                      }}
                    />
                  )}
                  {(phase === "loading" || phase === "flipping") && (
                    <motion.div
                      key="glow-spin"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 1, 0.6, 1] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="absolute inset-0 rounded-full"
                      style={{
                        boxShadow: "0 0 0 2px rgba(168,85,247,0.3), 0 0 40px 10px rgba(168,85,247,0.2)",
                      }}
                    />
                  )}
                </AnimatePresence>

                {/* The coin itself */}
                <motion.div
                  animate={coinControls}
                  initial={{ rotateY: 0 }}
                  style={{
                    transformStyle: "preserve-3d",
                    width: 148,
                    height: 148,
                    position: "relative",
                  }}
                >
                  {/* Front face — WIN (gold) */}
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center rounded-full select-none"
                    style={{
                      backfaceVisibility: "hidden",
                      WebkitBackfaceVisibility: "hidden",
                      background:
                        "radial-gradient(circle at 38% 34%, #fde68a, #f59e0b 48%, #b45309 100%)",
                      boxShadow:
                        "inset 0 3px 10px rgba(255,255,255,0.35), inset 0 -5px 14px rgba(0,0,0,0.35), 0 6px 24px rgba(245,158,11,0.25)",
                    }}
                  >
                    <span
                      className="text-5xl font-black leading-none"
                      style={{ color: "#451a03", textShadow: "0 1px 2px rgba(255,255,255,0.2)" }}
                    >
                      2×
                    </span>
                    <span
                      className="mt-0.5 text-[10px] font-black tracking-[0.2em]"
                      style={{ color: "rgba(69,26,3,0.7)" }}
                    >
                      DOUBLE
                    </span>
                  </div>

                  {/* Back face — LOSE (dark silver) */}
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center rounded-full select-none"
                    style={{
                      backfaceVisibility: "hidden",
                      WebkitBackfaceVisibility: "hidden",
                      transform: "rotateY(180deg)",
                      background:
                        "radial-gradient(circle at 38% 34%, #71717a, #3f3f46 48%, #18181b 100%)",
                      boxShadow:
                        "inset 0 3px 10px rgba(255,255,255,0.08), inset 0 -5px 14px rgba(0,0,0,0.5), 0 6px 24px rgba(0,0,0,0.4)",
                    }}
                  >
                    <span
                      className="text-5xl font-black leading-none text-zinc-400"
                      style={{ textShadow: "0 0 0" }}
                    >
                      ✕
                    </span>
                    <span className="mt-0.5 text-[10px] font-black tracking-[0.2em] text-zinc-600">
                      NOTHING
                    </span>
                  </div>
                </motion.div>
              </div>
            </div>

            {/* Result text below the coin */}
            <div className="mt-7 flex h-12 items-center justify-center">
              <AnimatePresence mode="wait">
                {phase === "won" && lastResult && (
                  <motion.div
                    key="res-won"
                    initial={{ opacity: 0, y: 8, scale: 0.85 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="text-center"
                  >
                    <p
                      className="text-2xl font-black text-emerald-400"
                      style={{ textShadow: "0 0 24px rgba(52,211,153,0.8)" }}
                    >
                      +{fmt(lastResult.amount)}{" "}
                      <span className="text-lg font-bold opacity-70">{currencyName}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] font-bold uppercase tracking-widest text-emerald-600">
                      Gewonnen!
                    </p>
                  </motion.div>
                )}
                {phase === "lost" && lastResult && (
                  <motion.div
                    key="res-lost"
                    initial={{ opacity: 0, y: 8, scale: 0.85 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="text-center"
                  >
                    <p
                      className="text-2xl font-black text-red-400"
                      style={{ textShadow: "0 0 24px rgba(239,68,68,0.7)" }}
                    >
                      -{fmt(lastResult.amount)}{" "}
                      <span className="text-lg font-bold opacity-70">{currencyName}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] font-bold uppercase tracking-widest text-red-700">
                      Verloren
                    </p>
                  </motion.div>
                )}
                {(phase === "loading" || phase === "flipping") && (
                  <motion.p
                    key="res-spin"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 1, 0.5, 1] }}
                    transition={{ duration: 0.9, repeat: Infinity }}
                    exit={{ opacity: 0 }}
                    className="text-sm font-medium text-zinc-500"
                  >
                    Flippt…
                  </motion.p>
                )}
                {phase === "idle" && (
                  <motion.p
                    key="res-idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-sm text-zinc-700"
                  >
                    Wähle deinen Einsatz und flippe!
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* ── Bet controls ── */}
          <div className="space-y-3">
            {/* Balance */}
            <div className="flex items-center justify-between rounded-xl border border-white/6 bg-black/20 px-4 py-3">
              <span className="text-xs text-zinc-600">Guthaben</span>
              <span className="font-mono text-lg font-bold text-purple-300">
                {fmt(credits)}{" "}
                <span className="text-sm font-semibold opacity-50">{currencyName}</span>
              </span>
            </div>

            {/* Quick bet grid */}
            <div className={`grid gap-2 ${donConfig.quickAmounts.length <= 4 ? "grid-cols-4" : "grid-cols-5"}`}>
              {donConfig.quickAmounts.map((amount) => {
                const active = !customBet && selectedQuick === amount;
                return (
                  <button
                    key={amount}
                    onClick={() => { setSelectedQuick(amount); setCustomBet(""); }}
                    className={`rounded-xl border py-2.5 text-xs font-bold transition-all duration-200 ${
                      active
                        ? "border-amber-400/60 bg-amber-500/15 text-amber-300 shadow-[0_0_14px_rgba(245,158,11,0.3)]"
                        : "border-white/8 bg-white/[0.02] text-zinc-500 hover:border-white/16 hover:text-zinc-300"
                    }`}
                  >
                    {amount >= 1000 ? `${amount / 1000}K` : amount}
                  </button>
                );
              })}
            </div>

            {/* Custom amount */}
            <div className="relative">
              <input
                type="number"
                inputMode="numeric"
                placeholder={`Eigener Betrag (min. ${donConfig.minBet})`}
                value={customBet}
                onChange={(e) => setCustomBet(e.target.value)}
                className="w-full rounded-xl border border-white/8 bg-black/20 px-4 py-3 pr-16 text-sm text-zinc-200 placeholder-zinc-700 outline-none transition-all focus:border-amber-400/35 focus:ring-1 focus:ring-amber-400/15"
              />
              {customBet && (
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-zinc-600">
                  {currencyName}
                </span>
              )}
            </div>

            {/* FLIP button */}
            <motion.button
              onClick={handleFlip}
              disabled={!canFlip}
              whileTap={canFlip ? { scale: 0.97 } : {}}
              className={`relative w-full overflow-hidden rounded-2xl py-4 text-sm font-black uppercase tracking-widest transition-all duration-300 ${
                !canFlip
                  ? "cursor-not-allowed bg-zinc-800/80 text-zinc-600"
                  : "text-amber-950"
              }`}
              style={
                canFlip
                  ? {
                      background:
                        "linear-gradient(135deg, #fde68a 0%, #f59e0b 38%, #d97706 100%)",
                      boxShadow:
                        phase === "idle"
                          ? "0 0 40px rgba(245,158,11,0.4), 0 4px 16px rgba(0,0,0,0.3)"
                          : "none",
                    }
                  : {}
              }
            >
              {/* Shimmer sweep */}
              {canFlip && phase === "idle" && (
                <motion.div
                  className="pointer-events-none absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                  animate={{ x: ["-120%", "220%"] }}
                  transition={{
                    duration: 2.2,
                    repeat: Infinity,
                    ease: "easeInOut",
                    repeatDelay: 1.8,
                  }}
                />
              )}
              <span className="relative z-10">
                {phase === "loading"
                  ? "Flippt…"
                  : phase === "flipping"
                  ? "…"
                  : phase === "won"
                  ? "Nochmal flippen! 🎉"
                  : phase === "lost"
                  ? "Nochmal versuchen?"
                  : !donConfig.enabled
                  ? "Deaktiviert"
                  : flipsRemaining === 0
                  ? "Tageslimit erreicht"
                  : hourlyRemaining === 0
                  ? "Stundenlimit erreicht"
                  : credits < donConfig.minBet
                  ? "Zu wenig Credits"
                  : stake < donConfig.minBet
                  ? `Min. ${fmt(donConfig.minBet)} ${currencyName}`
                  : `FLIP — ${fmt(stake)} ${currencyName}`}
              </span>
            </motion.button>

            {/* Win-chance hint */}
            <p className="text-center text-[11px] text-zinc-700">
              {(donConfig.winChance * 100).toFixed(0)}% Gewinnchance · Bei Gewinn wird dein Einsatz verdoppelt
            </p>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-center text-sm font-medium text-red-400"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Session stats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mt-5 grid w-full max-w-lg grid-cols-3 gap-3"
        >
          <div className="rounded-2xl border border-white/6 bg-[#0d0a15]/70 p-4 text-center">
            <div className="mb-1 flex items-center justify-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs text-zinc-600">Gewonnen</span>
            </div>
            <p className="text-2xl font-black text-emerald-400">{sessionWins}</p>
          </div>
          <div className="rounded-2xl border border-white/6 bg-[#0d0a15]/70 p-4 text-center">
            <div className="mb-1 flex items-center justify-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-red-500" />
              <span className="text-xs text-zinc-600">Verloren</span>
            </div>
            <p className="text-2xl font-black text-red-400">{sessionLosses}</p>
          </div>
          <div className="rounded-2xl border border-white/6 bg-[#0d0a15]/70 p-4 text-center">
            <div className="mb-1 flex items-center justify-center gap-1.5">
              <Coins className="h-3.5 w-3.5 text-zinc-500" />
              <span className="text-xs text-zinc-600">Netto</span>
            </div>
            <p
              className={`text-2xl font-black ${
                sessionNet > 0
                  ? "text-emerald-400"
                  : sessionNet < 0
                  ? "text-red-400"
                  : "text-zinc-500"
              }`}
            >
              {sessionNet > 0 ? "+" : ""}
              {fmt(sessionNet)}
            </p>
          </div>
        </motion.div>

        {/* Flip history */}
        <AnimatePresence>
          {history.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.1 }}
              className="mt-5 w-full max-w-lg"
            >
              <p className="mb-2.5 flex items-center gap-1.5 text-xs text-zinc-700">
                <RotateCcw className="h-3 w-3" />
                Session-Verlauf
              </p>
              <div className="flex flex-wrap gap-1.5">
                {history.map((entry) => (
                  <motion.span
                    key={entry.id}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                      entry.won
                        ? "border-emerald-500/25 bg-emerald-500/12 text-emerald-400"
                        : "border-red-500/25 bg-red-500/12 text-red-400"
                    }`}
                  >
                    {entry.won ? "+" : "-"}
                    {fmt(entry.amount)}
                  </motion.span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
