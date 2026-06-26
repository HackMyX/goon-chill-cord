"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ListChecks, X, RotateCcw, CheckCircle2, Circle, Coins, Sparkles, Package,
  Star, Trophy, ChevronRight, Lock, Zap, Calendar, Gift, Joystick, CircleDot,
  Pickaxe, Skull, Crown, Swords,
} from "lucide-react";
import { getMyDailyQuests, claimDailyQuestReward } from "@/lib/actions/daily-quests";
import { useSoundManager } from "@/lib/sound-manager";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import { DIFFICULTY_LABELS, DIFFICULTY_COLORS, DIFFICULTY_BG, REWARD_TYPE_LABELS, type UserDailyQuest } from "@/lib/daily-quests";

// ── Icon resolver ─────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, typeof Star> = {
  Calendar, Star, Trophy, Crown, Gift, Joystick, CircleDot, Pickaxe, Skull, Swords,
  Zap, Coins, Package, CheckCircle2, Sparkles,
};

function QuestIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Star;
  return <Icon className={className} />;
}

// ── Reward summary ────────────────────────────────────────────────────────────

function RewardPills({ quest, currencyName }: { quest: UserDailyQuest; currencyName: string }) {
  const pills: { label: string; color: string; icon: typeof Coins }[] = [];
  if (quest.rewardCredits > 0) pills.push({ label: `${quest.rewardCredits.toLocaleString("de-DE")} ${currencyName}`, color: "bg-amber-500/20 text-amber-300 border-amber-500/30", icon: Coins });
  if (quest.rewardXp > 0)      pills.push({ label: `+${quest.rewardXp} XP`, color: "bg-sky-500/20 text-sky-300 border-sky-500/30", icon: Zap });
  if (quest.rewardBpXp > 0)    pills.push({ label: `+${quest.rewardBpXp} BP-XP`, color: "bg-violet-500/20 text-violet-300 border-violet-500/30", icon: Sparkles });
  if (quest.rewardItemRarity)  pills.push({ label: `${quest.rewardItemRarity} Item`, color: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30", icon: Package });

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {pills.map(p => (
        <span key={p.label} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${p.color}`}>
          <p.icon className="h-2.5 w-2.5" />
          {p.label}
        </span>
      ))}
    </div>
  );
}

// ── Individual quest card ─────────────────────────────────────────────────────

function QuestCard({
  quest,
  onClaim,
  currencyName,
}: {
  quest: UserDailyQuest;
  onClaim: (id: string) => Promise<void>;
  currencyName: string;
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
      className={`relative overflow-hidden rounded-xl border p-4 transition-colors ${
        quest.rewardClaimed
          ? "bg-zinc-900/40 border-white/[0.05] opacity-60"
          : quest.completed
          ? "bg-emerald-950/30 border-emerald-500/30"
          : "bg-zinc-900/60 border-white/[0.08] hover:border-white/[0.12]"
      }`}
    >
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
        {/* Status indicator */}
        <div className="mt-0.5 shrink-0">
          {quest.rewardClaimed ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          ) : quest.completed ? (
            <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 1.5 }}>
              <CheckCircle2 className="h-5 w-5 text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
            </motion.div>
          ) : (
            <Circle className="h-5 w-5 text-zinc-700" />
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
          <RewardPills quest={quest} currencyName={currencyName} />
        </div>

        {/* Claim button */}
        {quest.completed && !quest.rewardClaimed && (
          <button
            onClick={handleClaim}
            disabled={claiming}
            className="shrink-0 flex items-center gap-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
          >
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

// ── Main panel ────────────────────────────────────────────────────────────────

export function DailyQuestsPanel({ onClose }: { onClose: () => void }) {
  const [quests, setQuests] = useState<UserDailyQuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimToast, setClaimToast] = useState<ClaimResult | null>(null);
  const sound = useSoundManager();
  const { currencyName } = useSiteConfig();
  const panelRef = useRef<HTMLDivElement>(null);

  const completed = quests.filter(q => q.completed).length;
  const total = quests.length;
  const claimed = quests.filter(q => q.rewardClaimed).length;

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

  // Outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  async function handleClaim(questId: string) {
    const result = await claimDailyQuestReward(questId);
    if (result.success && result.reward) {
      sound.win?.();
      setClaimToast(result.reward);
      setQuests(prev => prev.map(q => q.id === questId ? { ...q, rewardClaimed: true } : q));
    } else {
      sound.error?.();
    }
  }

  const allDone = total > 0 && claimed === total;

  return (
    <div
      ref={panelRef}
      className="fixed bottom-0 right-0 sm:bottom-6 sm:right-6 z-[80] flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-white/[0.08] bg-zinc-950/95 backdrop-blur-xl shadow-2xl"
      style={{ width: "min(100vw, 400px)", maxHeight: "min(100dvh - 80px, 600px)" }}
    >
      {/* Toast */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <AnimatePresence>
          {claimToast && (
            <ClaimToast result={claimToast} currencyName={currencyName} onDone={() => setClaimToast(null)} />
          )}
        </AnimatePresence>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-violet-950/40 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/20 border border-violet-500/30">
            <ListChecks className="h-4 w-4 text-violet-400" />
          </div>
          <div>
            <h2 className="text-sm font-black text-zinc-100">Tägliche Quests</h2>
            <p className="text-[10px] text-zinc-500">
              {loading ? "Lade…" : total === 0 ? "Heute keine Quests" : `${completed}/${total} abgeschlossen · ${claimed} eingelöst`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={load} className="rounded-full p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors">
            <RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={onClose} className="rounded-full p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Progress overview */}
      {!loading && total > 0 && (
        <div className="px-5 pt-3 pb-2 border-b border-white/[0.04]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Tagesfortschritt</span>
            <span className="text-[10px] font-black text-violet-400">{Math.round((claimed / total) * 100)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.05]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(claimed / total) * 100}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full bg-gradient-to-r from-violet-700 to-violet-500"
            />
          </div>
          {allDone && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-center text-xs font-bold text-emerald-400">
              🎉 Alle Quests des Tages abgeschlossen!
            </motion.p>
          )}
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
        ) : (
          <AnimatePresence mode="popLayout">
            {quests
              .slice()
              .sort((a, b) => {
                if (a.rewardClaimed && !b.rewardClaimed) return 1;
                if (!a.rewardClaimed && b.rewardClaimed) return -1;
                if (a.completed && !b.completed) return -1;
                if (!a.completed && b.completed) return 1;
                return 0;
              })
              .map(q => (
                <QuestCard key={q.id} quest={q} onClaim={handleClaim} currencyName={currencyName} />
              ))}
          </AnimatePresence>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-white/[0.04] px-5 py-3 text-center">
        <p className="text-[10px] text-zinc-700">Quests erneuern sich täglich um Mitternacht UTC</p>
      </div>
    </div>
  );
}

// ── Floating trigger button ───────────────────────────────────────────────────

export function DailyQuestsTrigger({ userId }: { userId?: string }) {
  const [open, setOpen] = useState(false);
  const [badge, setBadge] = useState(0);

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

  if (!userId) return null;

  return (
    <>
      {open && <DailyQuestsPanel onClose={() => setOpen(false)} />}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-zinc-900/80 text-zinc-400 hover:text-violet-400 hover:border-violet-500/40 hover:bg-violet-500/10 transition-all"
          title="Tägliche Quests"
        >
          <ListChecks className="h-4.5 w-4.5" />
          {badge > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-black text-white"
            >
              {badge}
            </motion.span>
          )}
        </button>
      )}
    </>
  );
}
