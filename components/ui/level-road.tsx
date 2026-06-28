"use client";

// Level Road — a vertical, winding progression path of every level with its
// rewards. Rewards render as 3D previews by default (reusing the platform's
// UniversalPreviewModal, same engine as the shop) and can be toggled to flat
// icons. The road auto-scrolls to the player's current level.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Boxes, Grid3x3, Lock, Check, Crown, ListChecks, Trophy, Palette, Gift, Coins } from "lucide-react";
import { DEFAULT_LEVEL_ROAD_CONFIG, resolveLevelRoadTier, isMilestoneLevel, type LevelDefinition, type LevelReward, type LevelRewardDisplay, type LevelRoadConfig } from "@/lib/level-system";
import { UniversalPreviewModal, type PreviewSubject } from "@/components/ui/universal-preview-modal";
import { StyledUsername } from "@/components/ui/styled-username";
import { BadgePill } from "@/components/ui/badge-pill";

const LS_3D = "gn_level_reward_3d";

function rewardIcon(type: string) {
  switch (type) {
    case "credits": return <Coins className="h-3.5 w-3.5 text-amber-300" />;
    case "ability": return <Crown className="h-3.5 w-3.5 text-fuchsia-300" />;
    case "badge": return <Trophy className="h-3.5 w-3.5 text-amber-300" />;
    case "name_style": return <Palette className="h-3.5 w-3.5 text-cyan-300" />;
    default: return <Gift className="h-3.5 w-3.5 text-purple-300" />;
  }
}

function rewardLabel(r: LevelReward): string {
  if (r.type === "credits") return `${r.amount?.toLocaleString("de-DE") ?? "?"} CR`;
  if (r.type === "ability") return r.abilityKey ?? "Fähigkeit";
  if (r.type === "badge") return r.badgeKey ?? "Badge";
  if (r.type === "name_style") return r.nameStyleKey ?? "Style";
  return r.type;
}

/** Map a level reward to a 3D-previewable subject (same engine as the shop). */
function rewardToSubject(r: LevelReward): PreviewSubject | null {
  if (r.type === "credits") return { kind: "credits", amount: r.amount ?? 0 };
  if (r.type === "ability" && r.abilityKey) return { kind: "ability", abilityKey: r.abilityKey, name: r.abilityKey };
  if (r.type === "badge" && r.badgeKey) return { kind: "badge", badgeKey: r.badgeKey };
  if (r.type === "name_style" && r.nameStyleKey) return { kind: "name_style", styleKey: r.nameStyleKey };
  return null;
}

export function LevelRoad({
  levels,
  currentLevel,
  onOpenDailyQuests,
  defaultDisplay = "3d",
  roadConfig = DEFAULT_LEVEL_ROAD_CONFIG,
}: {
  levels: LevelDefinition[];
  currentLevel: number;
  onOpenDailyQuests?: () => void;
  defaultDisplay?: LevelRewardDisplay;
  roadConfig?: LevelRoadConfig;
}) {
  const [use3D, setUse3D] = useState(defaultDisplay !== "icon");
  const [preview, setPreview] = useState<PreviewSubject | null>(null);
  const roadRef = useRef<HTMLDivElement>(null);

  // Admin sets the global default (defaultDisplay); a per-device toggle overrides it.
  useEffect(() => {
    try {
      const ov = localStorage.getItem(LS_3D);
      setUse3D(ov === "1" ? true : ov === "0" ? false : defaultDisplay !== "icon");
    } catch { setUse3D(defaultDisplay !== "icon"); }
  }, [defaultDisplay]);
  function toggle3D() {
    setUse3D((v) => {
      const next = !v;
      try { localStorage.setItem(LS_3D, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }

  const sorted = useMemo(() => [...levels].sort((a, b) => a.level - b.level), [levels]);

  // Auto-scroll to the current level node.
  useEffect(() => {
    const t = setTimeout(() => {
      roadRef.current?.querySelector(`[data-road-level="${currentLevel}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
    return () => clearTimeout(t);
  }, [currentLevel, sorted.length]);

  return (
    <div className="flex flex-col">
      {/* Toolbar: 3D/Icon toggle + Daily Quests cross-link */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="inline-flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
          <button
            type="button"
            onClick={() => { if (!use3D) toggle3D(); }}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${use3D ? "bg-violet-500/25 text-violet-200" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            <Boxes className="h-3.5 w-3.5" /> 3D
          </button>
          <button
            type="button"
            onClick={() => { if (use3D) toggle3D(); }}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${!use3D ? "bg-violet-500/25 text-violet-200" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            <Grid3x3 className="h-3.5 w-3.5" /> Icons
          </button>
        </div>
        {onOpenDailyQuests && (
          <button
            type="button"
            onClick={onOpenDailyQuests}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold text-emerald-300 transition-colors hover:bg-emerald-500/20"
          >
            <ListChecks className="h-3.5 w-3.5" /> Daily Quests
          </button>
        )}
      </div>

      {/* The road */}
      <div ref={roadRef} className="relative">
        {/* Central connecting line — a dim rail with a bright, animated progress
            fill that grows down to the player's current position. */}
        <div aria-hidden className="absolute left-[36px] top-2 bottom-2 w-0.5 rounded-full bg-white/[0.06]" />
        {(() => {
          const ci = sorted.findIndex((d) => d.level === currentLevel);
          const pct = sorted.length > 1 ? Math.max(0, Math.min(1, (ci + 0.5) / sorted.length)) : 0;
          return (
            <motion.div
              aria-hidden
              className="absolute left-[36px] top-2 w-0.5 rounded-full"
              style={{ background: "linear-gradient(to bottom, #c4b5fd, #7c3aed)", boxShadow: "0 0 10px rgba(167,139,250,0.55)" }}
              initial={{ height: 0 }}
              animate={{ height: `calc((100% - 16px) * ${pct})` }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            />
          );
        })()}

        <div className="flex flex-col gap-3">
          {sorted.map((def, idx) => {
            const reached = currentLevel >= def.level;
            const isCurrent = currentLevel === def.level;
            const tier = resolveLevelRoadTier(def.level, roadConfig);
            const accent = tier.accent;
            const glow = tier.glow;
            // Admin-configurable milestone interval — crown badge, glow, tag.
            const isMilestone = isMilestoneLevel(def.level, roadConfig);
            return (
              <motion.div
                key={def.level}
                data-road-level={def.level}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(idx * 0.015, 0.4), type: "spring", stiffness: 260, damping: 24 }}
                whileHover={{ scale: 1.012 }}
                className={`relative flex items-start gap-3 rounded-2xl border p-3 transition-colors ${
                  isCurrent
                    ? "border-white/20 bg-white/[0.05]"
                    : isMilestone && reached
                    ? "border-amber-400/20 bg-amber-500/[0.03]"
                    : reached
                    ? "border-white/[0.07] bg-white/[0.02]"
                    : "border-white/[0.04] bg-transparent opacity-70"
                }`}
                style={
                  isCurrent
                    ? { boxShadow: `0 0 24px -6px ${glow}` }
                    : isMilestone && reached
                    ? { boxShadow: `0 0 20px -8px ${glow}` }
                    : undefined
                }
              >
                {/* Node circle */}
                <div className="relative z-10 shrink-0">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full border-2 text-sm font-black tabular-nums"
                    style={{
                      borderColor: reached ? accent : "rgba(255,255,255,0.1)",
                      color: reached ? accent : "#52525b",
                      // OPAQUE disc (solid #0b0a14 base = modal bg) so the central
                      // rail/progress line is occluded BEHIND each node and only shows
                      // in the gaps between nodes — never visually crossing a circle.
                      background: reached ? `linear-gradient(${accent}26, ${accent}26), #0b0a14` : "#0b0a14",
                      boxShadow: reached ? `0 0 14px -2px ${glow}` : undefined,
                    }}
                  >
                    {!reached ? <Lock className="h-4 w-4" /> : def.level}
                  </div>
                  {isCurrent && (
                    <motion.span
                      aria-hidden
                      className="absolute -inset-1 rounded-full border-2"
                      style={{ borderColor: accent }}
                      animate={{ opacity: [0.7, 0.2, 0.7], scale: [1, 1.12, 1] }}
                      transition={{ duration: 1.8, repeat: Infinity }}
                    />
                  )}
                  {reached && !isCurrent && (
                    <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[#0b0a14]">
                      <Check className="h-2.5 w-2.5 text-white" />
                    </span>
                  )}
                  {isMilestone && (
                    <motion.span
                      aria-hidden
                      className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 ring-1 ring-amber-400/50"
                      animate={reached ? { y: [0, -1.5, 0] } : undefined}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Crown className="h-3 w-3 text-amber-300 drop-shadow-[0_0_4px_rgba(245,158,11,0.8)]" />
                    </motion.span>
                  )}
                </div>

                {/* Body */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: reached ? accent : "#71717a" }}>
                      Level {def.level}
                    </span>
                    {isCurrent && (
                      <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-black text-white">DU</span>
                    )}
                    {isMilestone && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-300">
                        <Crown className="h-2.5 w-2.5" /> Meilenstein
                      </span>
                    )}
                  </div>
                  {roadConfig.showTitles && (
                    <p className={`truncate text-sm font-bold ${reached ? "text-zinc-100" : "text-zinc-500"}`}>{def.title}</p>
                  )}
                  {roadConfig.showXp && (
                    <p className="text-[10px] text-zinc-600">{def.xpRequired.toLocaleString("de-DE")} XP</p>
                  )}

                  {/* Reward chips — in 3D mode each shows a rich inline preview of the
                      actual reward (styled name / glowing badge / coin), and clicking
                      opens the full 3D preview overlay. In icon mode: compact icon chips. */}
                  {def.rewards.length > 0 ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {def.rewards.map((r, i) => {
                        const subj = rewardToSubject(r);
                        const interactive = use3D && reached && subj !== null;
                        const rich = use3D && reached;
                        return (
                          <button
                            key={i}
                            type="button"
                            disabled={!interactive}
                            onClick={() => { if (interactive && subj) setPreview(subj); }}
                            title={interactive ? "In 3D ansehen" : undefined}
                            className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-all ${
                              reached ? "border-white/10 bg-white/[0.04] text-zinc-200" : "border-white/[0.05] bg-white/[0.02] text-zinc-600"
                            } ${interactive ? "cursor-pointer hover:scale-[1.06] hover:border-violet-400/50 hover:bg-violet-500/10 active:scale-95" : "cursor-default"}`}
                          >
                            {rich && r.type === "name_style" && r.nameStyleKey ? (
                              <StyledUsername name="DeinName" styleKey={r.nameStyleKey} size="sm" staticMode disablePopup />
                            ) : rich && r.type === "badge" && r.badgeKey ? (
                              <BadgePill badgeKey={r.badgeKey} size="sm" />
                            ) : rich && r.type === "credits" ? (
                              <span className="flex items-center gap-1 font-black text-amber-300"><Coins className="h-3.5 w-3.5" />{r.amount?.toLocaleString("de-DE") ?? "?"} CR</span>
                            ) : (
                              <>{rewardIcon(r.type)}{rewardLabel(r)}</>
                            )}
                            {interactive && <Boxes className="h-3 w-3 opacity-40" />}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-1 text-[10px] italic text-zinc-700">Keine Belohnung</p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* 3D reward preview overlay */}
      {preview && (
        <UniversalPreviewModal subject={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
