"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ListChecks, X, RotateCcw, CheckCircle2, Coins, Sparkles, Package,
  Star, Trophy, ChevronRight, Lock, Zap, Calendar, Gift, Joystick, CircleDot,
  Pickaxe, Skull, Crown, Swords, CheckCheck, Clock, Flame, Dices, Target,
} from "lucide-react";
import { getMyDailyQuests, claimDailyQuestReward } from "@/lib/actions/daily-quests";
import { useSoundManager } from "@/lib/sound-manager";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import { DIFFICULTY_LABELS, DIFFICULTY_COLORS, DIFFICULTY_BG, REWARD_TYPE_LABELS, type UserDailyQuest } from "@/lib/daily-quests";
import { UniversalPreviewModal, type PreviewSubject } from "@/components/ui/universal-preview-modal";

/** Maps a daily-quest reward (rewardExtra spec) to a 3D-previewable subject. */
function rewardSpecToSubject(spec: UserDailyQuest["rewardExtra"][number]): PreviewSubject | null {
  switch (spec.type) {
    case "credits": return spec.amount ? { kind: "credits", amount: spec.amount } : null;
    case "item": case "random_item": return { kind: "random_item", rarity: spec.itemRarity ?? "selten" };
    case "ability": return spec.abilityKey ? { kind: "ability", abilityKey: spec.abilityKey, name: spec.abilityKey } : null;
    case "name_style": return spec.styleKey ? { kind: "name_style", styleKey: spec.styleKey } : null;
    case "badge": return spec.badgeKey ? { kind: "badge", badgeKey: spec.badgeKey } : null;
    case "case_voucher": return { kind: "case_voucher", mode: spec.voucherMode ?? "rarity", rarityFloor: spec.voucherRarityFloor };
    case "game_bonus": return { kind: "game_bonus", game: spec.bonusGame ?? "plinko", amount: spec.amount ?? 1 };
    default: return null;
  }
}

// ── Icon resolver ─────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, typeof Star> = {
  Calendar, Star, Trophy, Crown, Gift, Joystick, CircleDot, Pickaxe, Skull, Swords,
  Zap, Coins, Package, CheckCircle2, Sparkles, Flame, Dices, Target,
};

function QuestIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Star;
  return <Icon className={className} />;
}

/** Pick a thematic icon from the quest's targetAction (case_open, monster_kill, …). */
function targetActionIcon(action: string): string {
  const a = (action ?? "").toLowerCase();
  if (a.includes("case")) return "Package";
  if (a.includes("pvp")) return "Swords";
  if (a.includes("monster") || a.includes("kill")) return "Skull";
  if (a.includes("login") || a.includes("daily")) return "Calendar";
  if (a.includes("snake")) return "Joystick";
  if (a.includes("plinko")) return "Dices";
  if (a.includes("mine")) return "Pickaxe";
  if (a.includes("streak")) return "Flame";
  if (a.includes("trade") || a.includes("shop") || a.includes("buy") || a.includes("credit")) return "Coins";
  if (a.includes("quest")) return "Target";
  return "Star";
}

// Difficulty-coloured accents (left bar + icon ring) for each quest card.
const DIFFICULTY_ACCENT: Record<string, string> = {
  easy: "from-emerald-500 to-emerald-400",
  medium: "from-sky-500 to-sky-400",
  hard: "from-amber-500 to-amber-400",
  legendary: "from-fuchsia-500 to-fuchsia-400",
};
const DIFFICULTY_ICON_RING: Record<string, string> = {
  easy: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  medium: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  hard: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  legendary: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30",
};

// ── Reward summary ────────────────────────────────────────────────────────────

/** Maps a RewardSpec (rewardExtra givable) to a display pill. */
function rewardSpecPill(spec: UserDailyQuest["rewardExtra"][number]): { label: string; color: string; icon: typeof Coins } | null {
  switch (spec.type) {
    case "credits": return spec.amount ? { label: `${spec.amount.toLocaleString("de-DE")} CR`, color: "bg-amber-500/20 text-amber-300 border-amber-500/30", icon: Coins } : null;
    case "xp": return spec.amount ? { label: `+${spec.amount} XP`, color: "bg-sky-500/20 text-sky-300 border-sky-500/30", icon: Zap } : null;
    case "item": case "random_item": return { label: "Item", color: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30", icon: Package };
    case "ability": return { label: "Fähigkeits-Gutschein", color: "bg-violet-500/20 text-violet-300 border-violet-500/30", icon: Sparkles };
    case "name_style": return { label: "Name-Style", color: "bg-pink-500/20 text-pink-300 border-pink-500/30", icon: Sparkles };
    case "badge": return { label: "Badge", color: "bg-amber-500/20 text-amber-300 border-amber-500/30", icon: Crown };
    case "case_voucher": return { label: "Gratis-Case", color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30", icon: Gift };
    case "game_bonus": return { label: `+${spec.amount ?? 1} ${spec.bonusGame ?? "Spiel"}`, color: "bg-teal-500/20 text-teal-300 border-teal-500/30", icon: Joystick };
    default: return null;
  }
}

function RewardPills({ quest, currencyName, onPreview }: { quest: UserDailyQuest; currencyName: string; onPreview?: (s: PreviewSubject) => void }) {
  const pills: { label: string; color: string; icon: typeof Coins; subject: PreviewSubject | null }[] = [];
  if (quest.rewardCredits > 0) pills.push({ label: `${quest.rewardCredits.toLocaleString("de-DE")} ${currencyName}`, color: "bg-amber-500/20 text-amber-300 border-amber-500/30", icon: Coins, subject: { kind: "credits", amount: quest.rewardCredits } });
  if (quest.rewardXp > 0)      pills.push({ label: `+${quest.rewardXp} XP`, color: "bg-sky-500/20 text-sky-300 border-sky-500/30", icon: Zap, subject: null });
  if (quest.rewardBpXp > 0)    pills.push({ label: `+${quest.rewardBpXp} BP-XP`, color: "bg-violet-500/20 text-violet-300 border-violet-500/30", icon: Sparkles, subject: null });
  if (quest.rewardItemRarity)  pills.push({ label: `${quest.rewardItemRarity} Item`, color: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30", icon: Package, subject: { kind: "random_item", rarity: quest.rewardItemRarity } });
  for (const spec of quest.rewardExtra ?? []) { const p = rewardSpecPill(spec); if (p) pills.push({ ...p, subject: rewardSpecToSubject(spec) }); }

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {pills.map((p, i) =>
        p.subject && onPreview ? (
          <button
            key={i}
            onClick={(e) => { e.stopPropagation(); onPreview(p.subject!); }}
            title="3D-Vorschau"
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-[filter] hover:brightness-125 ${p.color}`}
          >
            <p.icon className="h-2.5 w-2.5" />
            {p.label}
          </button>
        ) : (
          <span key={i} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${p.color}`}>
            <p.icon className="h-2.5 w-2.5" />
            {p.label}
          </span>
        )
      )}
    </div>
  );
}

// ── Individual quest card ─────────────────────────────────────────────────────

function QuestCard({
  quest,
  onClaim,
  currencyName,
  onPreview,
}: {
  quest: UserDailyQuest;
  onClaim: (id: string) => Promise<void>;
  currencyName: string;
  onPreview?: (s: PreviewSubject) => void;
}) {
  const [claiming, setClaiming] = useState(false);
  const pct = quest.targetValue > 0
    ? Math.min(100, Math.round((quest.currentValue / quest.targetValue) * 100))
    : 0;
  const diffClass = DIFFICULTY_COLORS[quest.difficulty as keyof typeof DIFFICULTY_COLORS] ?? "text-zinc-400";
  const diffBg = DIFFICULTY_BG[quest.difficulty as keyof typeof DIFFICULTY_BG] ?? "bg-zinc-500/15 border-zinc-500/25";

  async function handleClaim() {
    setClaiming(true);
    await onClaim(quest.id);
    setClaiming(false);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-xl border p-4 pl-5 transition-colors ${
        quest.rewardClaimed
          ? "bg-zinc-900/40 border-white/[0.05] opacity-60"
          : quest.completed
          ? "bg-emerald-950/30 border-emerald-500/30 shadow-[0_0_20px_-6px_rgba(52,211,153,0.4)]"
          : "bg-zinc-900/60 border-white/[0.08] hover:border-white/[0.12]"
      }`}
    >
      {/* Difficulty-coloured left accent */}
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${DIFFICULTY_ACCENT[quest.difficulty] ?? "from-zinc-600 to-zinc-500"} ${quest.rewardClaimed ? "opacity-30" : ""}`}
      />

      {/* Completion shimmer overlay */}
      {quest.completed && !quest.rewardClaimed && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
          <motion.div
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 2, ease: "easeInOut" }}
            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-emerald-400/[0.08] to-transparent skew-x-[-20deg]"
          />
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* Themed quest icon with status badge */}
        <div className="relative mt-0.5 shrink-0">
          <motion.div
            animate={quest.completed && !quest.rewardClaimed ? { scale: [1, 1.08, 1] } : {}}
            transition={{ duration: 1.2, repeat: Infinity }}
            className={`flex h-9 w-9 items-center justify-center rounded-xl ring-1 ${DIFFICULTY_ICON_RING[quest.difficulty] ?? "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30"} ${quest.rewardClaimed ? "opacity-50" : ""}`}
          >
            <QuestIcon name={targetActionIcon(quest.targetAction)} className="h-4.5 w-4.5" />
          </motion.div>
          {(quest.completed || quest.rewardClaimed) && (
            <span className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-zinc-950 ${quest.rewardClaimed ? "bg-zinc-600" : "bg-emerald-500"}`}>
              <CheckCircle2 className="h-3 w-3 text-white" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {/* Title row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-bold ${quest.rewardClaimed ? "text-zinc-500 line-through" : "text-zinc-100"}`}>
              {quest.label}
            </span>
            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${diffBg} ${diffClass}`}>
              {DIFFICULTY_LABELS[quest.difficulty as keyof typeof DIFFICULTY_LABELS] ?? quest.difficulty}
            </span>
          </div>

          {/* Description */}
          <p className="mt-0.5 text-xs text-zinc-500">{quest.description}</p>

          {/* Progress bar */}
          {!quest.rewardClaimed && (
            <div className="mt-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-zinc-500">
                  {quest.currentValue.toLocaleString("de-DE")} / {quest.targetValue.toLocaleString("de-DE")}
                </span>
                <span className={`text-[10px] font-black ${quest.completed ? "text-emerald-400" : "text-zinc-500"}`}>
                  {pct}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className={`h-full rounded-full ${
                    quest.completed
                      ? "bg-gradient-to-r from-emerald-600 to-emerald-400"
                      : "bg-gradient-to-r from-violet-700 to-violet-500"
                  }`}
                />
              </div>
            </div>
          )}

          {/* Rewards */}
          <RewardPills quest={quest} currencyName={currencyName} onPreview={onPreview} />
        </div>

        {/* Claim button */}
        {quest.completed && !quest.rewardClaimed && (
          <button
            onClick={handleClaim}
            disabled={claiming}
            className="group/claim relative shrink-0 flex items-center gap-1.5 overflow-hidden rounded-lg bg-gradient-to-r from-emerald-500 to-teal-400 px-3.5 py-2 text-xs font-black text-emerald-950 shadow-[0_0_16px_-2px_rgba(52,211,153,0.5)] transition-all hover:scale-105 hover:shadow-[0_0_22px_0px_rgba(52,211,153,0.7)] disabled:opacity-50 disabled:hover:scale-100"
          >
            <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover/claim:translate-x-full" />
            {claiming ? (
              <RotateCcw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Gift className="h-3.5 w-3.5" />
                Abholen
              </>
            )}
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ── Claim success flash ───────────────────────────────────────────────────────

interface ClaimResult { credits: number; xp: number; bpXp: number; itemRarity: string | null }

function ClaimToast({ result, currencyName, onDone }: { result: ClaimResult; currencyName: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/80 backdrop-blur px-4 py-2.5 text-sm font-semibold text-emerald-300 shadow-xl"
    >
      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
      <span>Belohnung erhalten!</span>
      {result.credits > 0 && <span className="text-amber-300">+{result.credits.toLocaleString("de-DE")} {currencyName}</span>}
      {result.xp > 0 && <span className="text-sky-300">+{result.xp} XP</span>}
      {result.bpXp > 0 && <span className="text-violet-300">+{result.bpXp} BP-XP</span>}
    </motion.div>
  );
}

// ── Claim confetti burst ──────────────────────────────────────────────────────

const CONFETTI_COLORS = ["#fbbf24", "#34d399", "#a78bfa", "#e879f9", "#38bdf8", "#f472b6"];

function ClaimConfetti({ trigger }: { trigger: number }) {
  if (trigger === 0) return null;
  return (
    // keyed by `trigger` → remounts (replays) on every claim
    <div key={trigger} aria-hidden className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {Array.from({ length: 30 }).map((_, i) => {
        const left = (i * 37) % 100;
        const dx = ((i * 53) % 90) - 45;
        const delay = (i % 6) * 0.035;
        const size = 5 + (i % 3) * 2;
        return (
          <motion.span
            key={i}
            initial={{ opacity: 1, y: -8, x: 0, rotate: 0 }}
            animate={{ opacity: [1, 1, 0], y: 360, x: dx, rotate: (i % 2 ? 1 : -1) * 420 }}
            transition={{ duration: 1.5 + (i % 4) * 0.15, delay, ease: "easeIn" }}
            style={{ left: `${left}%`, width: size, height: size, background: CONFETTI_COLORS[i % CONFETTI_COLORS.length] }}
            className="absolute top-14 rounded-[1px]"
          />
        );
      })}
    </div>
  );
}

// ── Live countdown to the next daily reset (UTC midnight) ──────────────────────

function ResetCountdown() {
  const [label, setLabel] = useState("");
  useEffect(() => {
    function tick() {
      const now = new Date();
      const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
      const ms = Math.max(0, next.getTime() - now.getTime());
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setLabel(`${h}h ${m}m ${s}s`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <Clock className="h-3 w-3" />
      Neue Quests in {label}
    </span>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

const FILTER_DEFS: { key: "all" | "claimable" | "open" | "done"; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "claimable", label: "Abholbar" },
  { key: "open", label: "Offen" },
  { key: "done", label: "Fertig" },
];

export function DailyQuestsPanel({ onClose }: { onClose: () => void }) {
  const [quests, setQuests] = useState<UserDailyQuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimToast, setClaimToast] = useState<ClaimResult | null>(null);
  const [filter, setFilter] = useState<"all" | "claimable" | "open" | "done">("all");
  const [confettiKey, setConfettiKey] = useState(0);
  const [claimingAll, setClaimingAll] = useState(false);
  const [preview, setPreview] = useState<PreviewSubject | null>(null);
  const sound = useSoundManager();
  const { currencyName } = useSiteConfig();
  const panelRef = useRef<HTMLDivElement>(null);

  const completed = quests.filter(q => q.completed).length;
  const total = quests.length;
  const claimed = quests.filter(q => q.rewardClaimed).length;
  const openCount = quests.filter(q => !q.completed).length;
  const claimableQuests = quests.filter(q => q.completed && !q.rewardClaimed);
  const claimableCount = claimableQuests.length;
  const totalClaimable = claimableQuests.reduce(
    (acc, q) => ({
      credits: acc.credits + (q.rewardCredits || 0),
      xp: acc.xp + (q.rewardXp || 0),
      bpXp: acc.bpXp + (q.rewardBpXp || 0),
    }),
    { credits: 0, xp: 0, bpXp: 0 },
  );
  const filterCounts: Record<string, number> = { all: total, claimable: claimableCount, open: openCount, done: claimed };

  async function load() {
    setLoading(true);
    try {
      const data = await getMyDailyQuests();
      setQuests(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  // Close on Escape (backdrop click is handled by the overlay below).
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleClaim(questId: string) {
    const result = await claimDailyQuestReward(questId);
    if (result.success && result.reward) {
      sound.win?.();
      setClaimToast(result.reward);
      setConfettiKey(k => k + 1);
      setQuests(prev => prev.map(q => q.id === questId ? { ...q, rewardClaimed: true } : q));
    } else {
      sound.error?.();
    }
  }

  async function claimAll() {
    if (claimingAll) return;
    setClaimingAll(true);
    const agg: ClaimResult = { credits: 0, xp: 0, bpXp: 0, itemRarity: null };
    let any = false;
    for (const q of quests.filter(x => x.completed && !x.rewardClaimed)) {
      const result = await claimDailyQuestReward(q.id);
      if (result.success && result.reward) {
        any = true;
        agg.credits += result.reward.credits;
        agg.xp += result.reward.xp;
        agg.bpXp += result.reward.bpXp;
        if (result.reward.itemRarity) agg.itemRarity = result.reward.itemRarity;
        setQuests(prev => prev.map(x => x.id === q.id ? { ...x, rewardClaimed: true } : x));
      }
    }
    if (any) { sound.win?.(); setClaimToast(agg); setConfettiKey(k => k + 1); }
    else sound.error?.();
    setClaimingAll(false);
  }

  const allDone = total > 0 && claimed === total;

  // Sort (claimable → open → claimed) then apply the active filter.
  const sortedQuests = quests.slice().sort((a, b) => {
    if (a.rewardClaimed && !b.rewardClaimed) return 1;
    if (!a.rewardClaimed && b.rewardClaimed) return -1;
    if (a.completed && !b.completed) return -1;
    if (!a.completed && b.completed) return 1;
    return 0;
  });
  const visibleQuests = sortedQuests.filter(q => {
    if (filter === "claimable") return q.completed && !q.rewardClaimed;
    if (filter === "open") return !q.completed;
    if (filter === "done") return q.rewardClaimed;
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center p-3 sm:p-5"
      style={{ background: "rgba(4,4,10,0.66)", backdropFilter: "blur(7px)", WebkitBackdropFilter: "blur(7px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
    <div
      ref={panelRef}
      className="relative flex w-full max-w-[440px] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/95 shadow-2xl"
      style={{ maxHeight: "min(100dvh - 24px, 640px)" }}
    >
      {/* Toast */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <AnimatePresence>
          {claimToast && (
            <ClaimToast result={claimToast} currencyName={currencyName} onDone={() => setClaimToast(null)} />
          )}
        </AnimatePresence>
      </div>

      {/* Aurora glow at the top of the panel */}
      <div aria-hidden className="pointer-events-none absolute -top-16 left-1/2 h-32 w-72 -translate-x-1/2 rounded-full bg-violet-600/25 blur-3xl" />

      {/* Confetti burst on claim */}
      <ClaimConfetti trigger={confettiKey} />

      {/* Header with circular progress ring */}
      <div className="relative flex items-center gap-3 border-b border-white/[0.06] bg-gradient-to-br from-violet-950/60 via-zinc-950/30 to-fuchsia-950/30 px-5 py-4">
        <div className="relative h-12 w-12 shrink-0">
          <svg className="h-12 w-12 -rotate-90" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4" />
            <motion.circle
              cx="24" cy="24" r="20" fill="none" stroke="url(#dq-ring)" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 20}
              initial={{ strokeDashoffset: 2 * Math.PI * 20 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 20 * (1 - (total > 0 ? claimed / total : 0)) }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              style={{ filter: "drop-shadow(0 0 4px rgba(167,139,250,0.6))" }}
            />
            <defs>
              <linearGradient id="dq-ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#a78bfa" />
                <stop offset="100%" stopColor="#e879f9" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            {allDone ? (
              <Trophy className="h-5 w-5 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
            ) : (
              <span className="text-[11px] font-black tabular-nums text-violet-200">{total > 0 ? Math.round((claimed / total) * 100) : 0}%</span>
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 text-sm font-black text-zinc-100">
            <ListChecks className="h-4 w-4 text-violet-400" />
            Tägliche Quests
          </h2>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            {loading ? "Lade…" : total === 0 ? "Heute keine Quests" : `${completed}/${total} abgeschlossen · ${claimed} eingelöst`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { onClose(); window.dispatchEvent(new CustomEvent("gn:open-level")); }}
            title="Level & XP öffnen"
            className="rounded-full p-1.5 text-zinc-600 transition-colors hover:bg-white/[0.06] hover:text-violet-300"
          >
            <Zap className="h-4 w-4" />
          </button>
          <button onClick={load} className="rounded-full p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors">
            <RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={onClose} className="rounded-full p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* All-done celebration banner */}
      <AnimatePresence>
        {allDone && !loading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="relative overflow-hidden border-b border-emerald-500/20 bg-gradient-to-r from-emerald-950/50 via-emerald-900/30 to-emerald-950/50 px-5 py-2 text-center"
          >
            <motion.div
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-emerald-400/15 to-transparent"
            />
            <p className="relative text-xs font-bold text-emerald-300">🎉 Alle Quests des Tages abgeschlossen!</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Claimable summary + "claim all" */}
      <AnimatePresence>
        {!loading && claimableCount > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-between gap-2 overflow-hidden border-b border-emerald-500/15 bg-emerald-950/20 px-4 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">{claimableCount} bereit zum Abholen</p>
              <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] font-bold">
                {totalClaimable.credits > 0 && <span className="text-amber-300">+{totalClaimable.credits.toLocaleString("de-DE")} {currencyName}</span>}
                {totalClaimable.xp > 0 && <span className="text-sky-300">+{totalClaimable.xp} XP</span>}
                {totalClaimable.bpXp > 0 && <span className="text-violet-300">+{totalClaimable.bpXp} BP-XP</span>}
              </p>
            </div>
            <button
              onClick={claimAll}
              disabled={claimingAll}
              className="group/all relative shrink-0 flex items-center gap-1.5 overflow-hidden rounded-lg bg-gradient-to-r from-emerald-500 to-teal-400 px-3 py-2 text-xs font-black text-emerald-950 shadow-[0_0_16px_-2px_rgba(52,211,153,0.5)] transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
            >
              <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover/all:translate-x-full" />
              {claimingAll ? <RotateCcw className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
              Alles abholen
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter pills */}
      {!loading && total > 0 && (
        <div className="flex items-center gap-1.5 border-b border-white/[0.04] px-4 py-2">
          {FILTER_DEFS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors ${
                filter === f.key
                  ? "bg-violet-500/25 text-violet-200 ring-1 ring-violet-500/40"
                  : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
              }`}
            >
              {f.label} <span className="tabular-nums opacity-70">{filterCounts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 flex flex-col gap-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <ListChecks className="h-12 w-12 text-zinc-800" />
            <p className="text-sm font-semibold text-zinc-600">Keine Quests verfügbar</p>
            <p className="text-xs text-zinc-700">Quests werden täglich automatisch generiert.</p>
          </div>
        ) : visibleQuests.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Target className="h-8 w-8 text-zinc-800" />
            <p className="text-xs font-semibold text-zinc-600">Keine Quests in diesem Filter</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {visibleQuests.map(q => (
              <QuestCard key={q.id} quest={q} onClaim={handleClaim} currencyName={currencyName} onPreview={setPreview} />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Footer — live countdown to the next daily reset */}
      <div className="border-t border-white/[0.04] px-5 py-2.5 text-center text-[10px] text-zinc-600">
        <ResetCountdown />
      </div>
    </div>
    {preview && <UniversalPreviewModal subject={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

// ── Floating trigger button ───────────────────────────────────────────────────

export function DailyQuestsTrigger({ userId }: { userId?: string }) {
  const [open, setOpen] = useState(false);
  const [badge, setBadge] = useState(0);
  // The panel is `position: fixed`, but the TopBar (its render parent) has a
  // `backdrop-filter`, which establishes a containing block for fixed
  // descendants — so rendered inline the panel anchors to the tiny header and
  // stays invisible/clipped. Portal it to <body> so `fixed` targets the
  // viewport (same fix the Level menu modal uses).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!userId) return;
    async function check() {
      try {
        const quests = await getMyDailyQuests();
        const unclaimed = quests.filter(q => q.completed && !q.rewardClaimed).length;
        setBadge(unclaimed);
      } catch { /* silent */ }
    }
    void check();
    const interval = setInterval(check, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(interval);
  }, [userId]);

  // Cross-link: the Level menu can open this panel by dispatching the event.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("gn:open-daily-quests", onOpen);
    return () => window.removeEventListener("gn:open-daily-quests", onOpen);
  }, []);

  if (!userId) return null;

  return (
    <>
      {mounted && open && createPortal(
        <DailyQuestsPanel onClose={() => setOpen(false)} />,
        document.body,
      )}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition-all ${
            badge > 0
              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300 shadow-[0_0_14px_-2px_rgba(52,211,153,0.6)]"
              : "border-white/[0.08] bg-zinc-900/80 text-zinc-400 hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-400"
          }`}
          title="Tägliche Quests"
        >
          <ListChecks className="h-4.5 w-4.5" />
          {badge > 0 && (
            <>
              <span aria-hidden className="absolute -top-1 -right-1 inline-flex h-4 w-4 animate-ping rounded-full bg-emerald-500/60" />
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-black text-white"
              >
                {badge}
              </motion.span>
            </>
          )}
        </button>
      )}
    </>
  );
}
