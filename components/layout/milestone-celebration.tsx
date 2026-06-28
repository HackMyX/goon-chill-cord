"use client";

// Fullscreen milestone level-up celebration — fires when a player reaches a
// configured milestone level (e.g. every 10th). Confetti + big animated reveal
// + the level's rewards. Shown instead of the small toast for those levels.

import { useEffect } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Crown, Sparkles, Coins, Trophy, Palette, Gift, Zap } from "lucide-react";
import type { LevelReward } from "@/lib/level-system";

function rewardIcon(type: string) {
  switch (type) {
    case "credits":    return <Coins className="h-4 w-4 text-amber-300" />;
    case "ability":    return <Crown className="h-4 w-4 text-fuchsia-300" />;
    case "badge":      return <Trophy className="h-4 w-4 text-amber-300" />;
    case "name_style": return <Palette className="h-4 w-4 text-cyan-300" />;
    default:           return <Gift className="h-4 w-4 text-purple-300" />;
  }
}

function rewardLabel(r: LevelReward): string {
  if (r.type === "credits") return `${r.amount?.toLocaleString("de-DE") ?? "?"} CR`;
  if (r.type === "ability") return r.abilityKey ?? "Fähigkeits-Gutschein";
  if (r.type === "badge") return r.badgeKey ?? "Badge";
  if (r.type === "name_style") return r.nameStyleKey ?? "Style";
  return r.type;
}

// Deterministic ring/particle layout so re-renders don't reshuffle.
const RINGS = [0, 1, 2];
const SPARKS = Array.from({ length: 14 }, (_, i) => ({
  angle: (i / 14) * Math.PI * 2,
  dist: 120 + (i % 3) * 36,
  delay: (i % 7) * 0.08,
  size: 4 + (i % 3) * 2,
}));

export function MilestoneCelebration({
  level,
  title,
  accent,
  glow,
  rewards,
  onClose,
}: {
  level: number;
  title?: string;
  accent: string;
  glow: string;
  rewards: LevelReward[];
  onClose: () => void;
}) {
  useEffect(() => {
    const colors = ["#ff3b3b", "#ff8a00", "#ffe600", "#3bff5e", "#00e5ff", "#b14bff", accent];
    confetti({ particleCount: 150, spread: 100, startVelocity: 50, origin: { y: 0.45 }, colors, scalar: 1.1 });
    const t1 = setTimeout(() => confetti({ particleCount: 90, spread: 120, startVelocity: 55, origin: { x: 0.15, y: 0.5 }, angle: 60, colors }), 220);
    const t2 = setTimeout(() => confetti({ particleCount: 90, spread: 120, startVelocity: 55, origin: { x: 0.85, y: 0.5 }, angle: 120, colors }), 420);
    const t3 = setTimeout(() => confetti({ particleCount: 60, spread: 140, startVelocity: 40, origin: { y: 0.35 }, colors }), 700);
    const auto = setTimeout(onClose, 6000);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(auto);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, accent]);

  return (
    <motion.div
      key={`milestone-${level}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onClose}
      className="fixed inset-0 z-[700] flex cursor-pointer flex-col items-center justify-center overflow-hidden p-6"
      style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(10,8,20,0.86) 0%, rgba(2,2,6,0.95) 70%)", backdropFilter: "blur(10px)" }}
      role="status"
      aria-live="assertive"
    >
      {/* tier-colour aura */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]"
        style={{ background: glow }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0.3, 0.55, 0.3], scale: [0.8, 1.05, 0.9] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        initial={{ scale: 0.6, y: 24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 18 }}
        className="relative z-10 flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Crown + level disc with expanding rings */}
        <div className="relative mb-5 flex h-40 w-40 items-center justify-center">
          {RINGS.map((r) => (
            <motion.span
              key={r}
              aria-hidden
              className="absolute rounded-full border-2"
              style={{ borderColor: accent, width: 96, height: 96 }}
              initial={{ opacity: 0.5, scale: 1 }}
              animate={{ opacity: 0, scale: 2.2 }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut", delay: r * 0.8 }}
            />
          ))}
          {SPARKS.map((s, i) => (
            <motion.span
              key={i}
              aria-hidden
              className="absolute rounded-full"
              style={{ width: s.size, height: s.size, background: accent }}
              initial={{ x: 0, y: 0, opacity: 0 }}
              animate={{ x: Math.cos(s.angle) * s.dist, y: Math.sin(s.angle) * s.dist, opacity: [0, 1, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1.4, delay: s.delay, ease: "easeOut" }}
            />
          ))}
          <motion.div
            className="relative flex h-24 w-24 flex-col items-center justify-center rounded-full border-2"
            style={{ borderColor: accent, background: `${accent}1f`, boxShadow: `0 0 40px ${glow}` }}
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <Crown className="absolute -top-7 h-8 w-8 text-amber-300 drop-shadow-[0_0_10px_rgba(245,158,11,0.9)] animate-crown-bob" />
            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: accent }}>Level</span>
            <span className="text-4xl font-black leading-none text-white tabular-nums">{level}</span>
          </motion.div>
        </div>

        {/* Headline */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.3em]"
          style={{ color: accent }}
        >
          <Sparkles className="h-3.5 w-3.5" /> Meilenstein erreicht <Sparkles className="h-3.5 w-3.5" />
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.24, type: "spring", stiffness: 260, damping: 18 }}
          className="mt-2 bg-gradient-to-r from-amber-200 via-white to-amber-200 bg-clip-text text-center text-4xl font-black tracking-tight text-transparent drop-shadow-[0_0_30px_rgba(245,158,11,0.5)] sm:text-5xl"
        >
          Level {level}!
        </motion.h2>
        {title && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.32 }}
            className="mt-1 text-sm font-bold text-zinc-300"
          >
            {title}
          </motion.p>
        )}

        {/* Rewards */}
        {rewards.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-5 flex max-w-md flex-wrap items-center justify-center gap-2"
          >
            {rewards.map((r, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.45 + i * 0.07, type: "spring", stiffness: 300, damping: 20 }}
                className="flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.05] px-3 py-1.5 text-sm font-bold text-zinc-100 shadow-[0_0_16px_rgba(0,0,0,0.4)]"
              >
                {rewardIcon(r.type)} {rewardLabel(r)}
              </motion.span>
            ))}
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-7 flex items-center gap-2"
        >
          <button
            onClick={onClose}
            className="rounded-xl px-8 py-2.5 text-sm font-black text-black shadow-[0_0_24px_rgba(245,158,11,0.5)] transition-transform hover:scale-105 active:scale-95"
            style={{ background: `linear-gradient(135deg, ${accent}, #fbbf24)` }}
          >
            <Zap className="mr-1.5 inline-block h-4 w-4" /> Weiter
          </button>
        </motion.div>
        <p className="mt-3 text-[11px] text-zinc-600">Klicken zum Schließen</p>
      </motion.div>
    </motion.div>
  );
}
