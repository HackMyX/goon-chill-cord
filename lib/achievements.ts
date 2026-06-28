// Computed achievements — derived purely from existing player stats (no new DB
// table). Each achievement is "earned" once the relevant stat passes a
// threshold; progress is the ratio toward it. Shown in the Level menu's
// "Erfolge" tab.

export type AchStat = "level" | "xp" | "cases_opened" | "streak_days" | "credits" | "inventory";

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  /** Mapped to a lucide icon in the UI. */
  iconKey: "star" | "crown" | "package" | "flame" | "coins" | "zap" | "shirt";
  stat: AchStat;
  threshold: number;
  /** Accent hex. */
  color: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Level ──
  { id: "lvl5",  title: "Aufsteiger", description: "Erreiche Level 5",  iconKey: "star",  stat: "level", threshold: 5,  color: "#60a5fa" },
  { id: "lvl10", title: "Veteran",    description: "Erreiche Level 10", iconKey: "star",  stat: "level", threshold: 10, color: "#34d399" },
  { id: "lvl25", title: "Elite",      description: "Erreiche Level 25", iconKey: "crown", stat: "level", threshold: 25, color: "#a78bfa" },
  { id: "lvl50", title: "Legende",    description: "Erreiche Level 50", iconKey: "crown", stat: "level", threshold: 50, color: "#f59e0b" },
  // ── Cases ──
  { id: "case10",   title: "Sammler",      description: "Öffne 10 Cases",     iconKey: "package", stat: "cases_opened", threshold: 10,   color: "#60a5fa" },
  { id: "case100",  title: "Case-Jäger",   description: "Öffne 100 Cases",    iconKey: "package", stat: "cases_opened", threshold: 100,  color: "#a78bfa" },
  { id: "case1000", title: "Case-Süchtig", description: "Öffne 1.000 Cases",  iconKey: "package", stat: "cases_opened", threshold: 1000, color: "#f59e0b" },
  // ── Streak ──
  { id: "streak3",  title: "Dranbleiber",    description: "3 Tage Streak",  iconKey: "flame", stat: "streak_days", threshold: 3,  color: "#fb923c" },
  { id: "streak7",  title: "Wochen-Krieger", description: "7 Tage Streak",  iconKey: "flame", stat: "streak_days", threshold: 7,  color: "#f97316" },
  { id: "streak30", title: "Unaufhaltsam",   description: "30 Tage Streak", iconKey: "flame", stat: "streak_days", threshold: 30, color: "#ef4444" },
  // ── Credits ──
  { id: "cr100k", title: "Wohlhabend", description: "Besitze 100.000 CR",   iconKey: "coins", stat: "credits", threshold: 100000,  color: "#fbbf24" },
  { id: "cr1m",   title: "Millionär",  description: "Besitze 1.000.000 CR", iconKey: "coins", stat: "credits", threshold: 1000000, color: "#f59e0b" },
  // ── XP ──
  { id: "xp10k",  title: "Erfahren",    description: "Sammle 10.000 XP",  iconKey: "zap", stat: "xp", threshold: 10000,  color: "#a78bfa" },
  { id: "xp100k", title: "XP-Maschine", description: "Sammle 100.000 XP", iconKey: "zap", stat: "xp", threshold: 100000, color: "#e879f9" },
  // ── Inventory ──
  { id: "inv10", title: "Garderobe", description: "Besitze 10 Items", iconKey: "shirt", stat: "inventory", threshold: 10, color: "#34d399" },
  { id: "inv50", title: "Modist",    description: "Besitze 50 Items", iconKey: "shirt", stat: "inventory", threshold: 50, color: "#22d3ee" },
];

export interface AchievementProgress extends AchievementDef {
  current: number;
  earned: boolean;
  /** 0..1 toward the threshold. */
  progress: number;
}

export function computeAchievements(stats: Record<AchStat, number>): AchievementProgress[] {
  return ACHIEVEMENTS.map((a) => {
    const current = stats[a.stat] ?? 0;
    return {
      ...a,
      current,
      earned: current >= a.threshold,
      progress: Math.max(0, Math.min(1, a.threshold > 0 ? current / a.threshold : 0)),
    };
  });
}
