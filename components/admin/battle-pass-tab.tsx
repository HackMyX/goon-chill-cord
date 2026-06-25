"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, Zap, Eye, EyeOff, ChevronDown, ChevronUp,
  Save, X, Check, Star, AlertTriangle, Copy, ExternalLink,
  Gift, Coins, Trophy, Package, Sparkles, TrendingUp, Users,
  ShoppingBag, Crown, Palette, Search, BarChart2, Calendar, Wand2, Pencil,
} from "lucide-react";
import { CollapsibleAdminRow } from "@/components/admin/collapsible-admin-row";
import { useSoundManager } from "@/lib/sound-manager";
import {
  adminListBattlePasses, adminCreateBattlePass, adminUpdateBattlePass,
  adminDeleteBattlePass, adminSetPassActive, adminUpsertBpTier,
  getBpStats, searchBpItems, adminAutoFillBpTiers,
  type AdminPassInput, type AdminTierInput, type BpStats,
} from "@/lib/actions/battle-pass";
import { BP_THEMES, DEFAULT_AUTOFILL_CONFIG, type BpAutoFillConfig } from "@/lib/battle-pass";
import { RARITY_LABELS, RARITY_ORDER, RARITY_STYLES } from "@/lib/cases";
import type { BattlePass, BattlePassTier, BpRewardType, BpTheme, BpShopPosition, BpShopBannerSize } from "@/lib/battle-pass";
import type { Rarity } from "@/lib/cases";

const REWARD_ICONS: Record<BpRewardType, React.ReactNode> = {
  credits:    <Coins className="h-3.5 w-3.5" />,
  item:       <Package className="h-3.5 w-3.5" />,
  random_item:<Sparkles className="h-3.5 w-3.5" />,
  badge:      <Trophy className="h-3.5 w-3.5" />,
  xp_boost:   <TrendingUp className="h-3.5 w-3.5" />,
  name_style: <Palette className="h-3.5 w-3.5" />,
};

const REWARD_LABELS: Record<BpRewardType, string> = {
  credits:    "Credits",
  item:       "Spezifisches Item",
  random_item:"Zufälliges Item",
  badge:      "Badge / Titel",
  xp_boost:   "XP Boost (Tage)",
  name_style: "Name Style",
};

const TIER_EMOJIS = ["🎁","💰","⚡","🔥","🌟","💎","👑","🎯","🎲","🚀","✨","🎪","🌈","💫","🛡️","⚔️","🎭","🎨","🎵","🎮","🏆","⭐","🎀","🔮","🐉"];

// ── Stats display ─────────────────────────────────────────────────────────────

function StatsDisplay({ passId }: { passId: string }) {
  const [stats, setStats] = useState<BpStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getBpStats(passId).then((s) => {
      if (active) { setStats(s); setLoading(false); }
    });
    return () => { active = false; };
  }, [passId]);

  if (loading) return <div className="text-xs text-zinc-500">Lade Statistiken…</div>;
  if (!stats) return null;

  const convRate = stats.totalUsers > 0 ? Math.round((stats.premiumUsers / stats.totalUsers) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[
        { icon: <Users className="h-4 w-4 text-blue-400" />, label: "Gesamt-User", value: stats.totalUsers },
        { icon: <Crown className="h-4 w-4 text-amber-400" />, label: "Premium-Käufer", value: stats.premiumUsers },
        { icon: <Coins className="h-4 w-4 text-emerald-400" />, label: "CR eingenommen", value: `${stats.totalCrSpent.toLocaleString("de-DE")} CR` },
        { icon: <Gift className="h-4 w-4 text-purple-400" />, label: "Claims gesamt", value: stats.claimsCount },
      ].map((s) => (
        <div key={s.label} className="flex flex-col gap-1 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-center gap-1.5">
            {s.icon}
            <span className="text-[10px] text-zinc-500">{s.label}</span>
          </div>
          <span className="text-lg font-bold text-zinc-100">{s.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Theme selector ────────────────────────────────────────────────────────────

function ThemeSelector({ value, onChange }: { value: BpTheme; onChange: (t: BpTheme) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.entries(BP_THEMES) as [BpTheme, (typeof BP_THEMES)[BpTheme]][]).map(([key, theme]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${
            value === key
              ? "border-white/30 bg-white/10 text-zinc-100 shadow-lg scale-105"
              : "border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-300"
          }`}
          style={{ borderColor: value === key ? theme.accent : undefined, boxShadow: value === key ? `0 0 10px ${theme.glow}` : undefined }}
        >
          <span className="h-3 w-3 rounded-full shrink-0" style={{ background: theme.accent }} />
          {theme.label}
        </button>
      ))}
    </div>
  );
}

// ── Item picker ───────────────────────────────────────────────────────────────

function ItemPickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (id: string, name: string, rarity: Rarity) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [rarity, setRarity] = useState<Rarity | "">("");
  const [results, setResults] = useState<{ id: string; name: string; rarity: Rarity; type: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await searchBpItems(query, rarity as Rarity || undefined);
      setResults(r);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, rarity]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0e0b18] p-4 sm:p-5 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-zinc-100">Item auswählen</h3>
          <button onClick={onClose} className="rounded-full p-1 text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 flex gap-2 flex-wrap sm:flex-nowrap">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Item suchen…"
              className="w-full rounded-lg border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-zinc-100 outline-none focus:border-purple-400/60 min-h-[44px]"
              autoFocus
            />
          </div>
          <select
            value={rarity}
            onChange={(e) => setRarity(e.target.value as Rarity | "")}
            className="w-full sm:w-auto rounded-lg border border-white/10 bg-black/30 px-2 py-2.5 text-xs text-zinc-100 outline-none focus:border-purple-400/60 min-h-[44px]"
          >
            <option value="">Alle</option>
            {RARITY_ORDER.map((r) => (
              <option key={r} value={r}>{RARITY_LABELS[r]}</option>
            ))}
          </select>
        </div>

        <div className="max-h-72 overflow-y-auto space-y-1" style={{ scrollbarWidth: "thin" }}>
          {loading && <p className="py-4 text-center text-xs text-zinc-500">Suche…</p>}
          {!loading && results.length === 0 && (
            <p className="py-4 text-center text-xs text-zinc-500">Keine Items gefunden.</p>
          )}
          {results.map((item) => {
            const style = RARITY_STYLES[item.rarity];
            return (
              <button
                key={item.id}
                onClick={() => { onSelect(item.id, item.name, item.rarity); onClose(); }}
                className="flex w-full items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-left hover:bg-white/[0.05] hover:border-white/10 transition-colors"
              >
                <Package className={`h-4 w-4 shrink-0 ${style.text}`} />
                <span className="flex-1 text-sm text-zinc-200">{item.name}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${style.border} ${style.bg} ${style.text}`}>
                  {RARITY_LABELS[item.rarity]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Auto-fill modal ───────────────────────────────────────────────────────────

function AutoFillModal({
  passId,
  tierCount,
  onClose,
  onDone,
}: {
  passId: string;
  tierCount: number;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [config, setConfig] = useState<BpAutoFillConfig>({ ...DEFAULT_AUTOFILL_CONFIG });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const sound = useSoundManager();

  function setField<K extends keyof BpAutoFillConfig>(key: K, value: BpAutoFillConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  // Normalize reward mix so the 4 sliders sum to 100 when one changes
  function setRewardMix(key: "rewardMixCredits" | "rewardMixRandomItem" | "rewardMixXpBoost" | "rewardMixBadge", value: number) {
    setConfig((prev) => {
      const keys: (keyof BpAutoFillConfig)[] = ["rewardMixCredits", "rewardMixRandomItem", "rewardMixXpBoost", "rewardMixBadge"];
      const others = keys.filter((k) => k !== key) as ("rewardMixCredits" | "rewardMixRandomItem" | "rewardMixXpBoost" | "rewardMixBadge")[];
      const clamped = Math.max(0, Math.min(100, value));
      const remaining = 100 - clamped;
      const otherSum = others.reduce((s, k) => s + (prev[k] as number), 0);
      const next = { ...prev, [key]: clamped } as BpAutoFillConfig;
      if (otherSum > 0) {
        for (const k of others) {
          (next as unknown as Record<string, number>)[k] = Math.round(((prev[k] as number) / otherSum) * remaining);
        }
      } else {
        const share = Math.floor(remaining / others.length);
        for (const k of others) {
          (next as unknown as Record<string, number>)[k] = share;
        }
      }
      return next;
    });
  }

  // Normalize track ratio: freeRatio + eliteRatio + premiumRatio = 100
  // premiumRatio is derived: 100 - freeRatio - eliteRatio
  function setTrackRatio(key: "freeRatio" | "eliteRatio", value: number) {
    setConfig((prev) => {
      const clamped = Math.max(0, Math.min(100, value));
      if (key === "freeRatio") {
        const eliteMax = 100 - clamped;
        const newElite = Math.min(prev.eliteRatio, eliteMax);
        return { ...prev, freeRatio: clamped, eliteRatio: newElite };
      } else {
        const eliteMax = 100 - prev.freeRatio;
        const newElite = Math.min(clamped, eliteMax);
        return { ...prev, eliteRatio: newElite };
      }
    });
  }

  const premiumRatio = Math.max(0, 100 - config.freeRatio - config.eliteRatio);
  const rewardSum = config.rewardMixCredits + config.rewardMixRandomItem + config.rewardMixXpBoost + config.rewardMixBadge;

  async function handleAutoFill() {
    setRunning(true);
    setResult(null);
    try {
      const res = await adminAutoFillBpTiers(passId, config);
      if (res.success) {
        sound.save();
        setResult({ success: true, message: `${res.count} Tiers generiert — klicke unten auf jeden Tier um ihn einzeln zu bearbeiten.` });
        await onDone();
        setTimeout(() => onClose(), 1500);
      } else {
        sound.error();
        setResult({ success: false, error: res.error ?? "Unbekannter Fehler" });
      }
    } catch (e) {
      sound.error();
      setResult({ success: false, error: String(e) });
    }
    setRunning(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0e0b18] p-5 shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ scrollbarWidth: "thin" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-purple-400" />
            <h3 className="font-bold text-zinc-100">Auto-Befüllen ({tierCount} Tiers)</h3>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Credits range */}
          <div>
            <p className="mb-2 text-xs font-semibold text-zinc-400">Credits-Bereich</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs text-zinc-400">
                Min (CR)
                <input
                  type="number"
                  value={config.creditMin}
                  onChange={(e) => setField("creditMin", Math.max(0, Number(e.target.value) || 0))}
                  min={0}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-400">
                Max (CR)
                <input
                  type="number"
                  value={config.creditMax}
                  onChange={(e) => setField("creditMax", Math.max(config.creditMin, Number(e.target.value) || 0))}
                  min={config.creditMin}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
                />
              </label>
            </div>
            <p className="mt-1 text-[10px] text-zinc-600">Bereich: {config.creditMin.toLocaleString("de-DE")} – {config.creditMax.toLocaleString("de-DE")} CR</p>
          </div>

          {/* Milestone interval */}
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Milestone-Tier-Intervall (alle N Tiers)
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={config.milestoneTierInterval}
                onChange={(e) => setField("milestoneTierInterval", Math.max(1, Math.min(50, Number(e.target.value) || 5)))}
                min={1}
                max={50}
                className="w-24 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
              />
              <span className="text-xs text-zinc-500">Alle {config.milestoneTierInterval} Tiers = Milestone (hervorgehoben)</span>
            </div>
          </label>

          {/* Reward mix */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-zinc-400">Reward-Mix</p>
              <span className={`text-[10px] font-bold ${rewardSum === 100 ? "text-emerald-400" : "text-red-400"}`}>
                Summe: {rewardSum}%
              </span>
            </div>
            <div className="space-y-2">
              {([
                { key: "rewardMixCredits" as const, label: "Credits", color: "accent-emerald-400" },
                { key: "rewardMixRandomItem" as const, label: "Zuf. Item", color: "accent-purple-400" },
                { key: "rewardMixXpBoost" as const, label: "XP Boost", color: "accent-blue-400" },
                { key: "rewardMixBadge" as const, label: "Badge", color: "accent-amber-400" },
              ]).map(({ key, label, color }) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-[11px] text-zinc-400">{label}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={config[key] as number}
                    onChange={(e) => setRewardMix(key, Number(e.target.value))}
                    className={`flex-1 ${color}`}
                  />
                  <span className="w-8 shrink-0 text-right text-[11px] text-zinc-300">{config[key]}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Track ratio */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-zinc-400">Track-Verteilung</p>
              <span className="text-[10px] text-zinc-600">
                Kostenlos {config.freeRatio}% · Premium {premiumRatio}% · Elite {config.eliteRatio}%
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-[11px] text-purple-300">✦ Kostenlos</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={config.freeRatio}
                  onChange={(e) => setTrackRatio("freeRatio", Number(e.target.value))}
                  className="flex-1 accent-purple-400"
                />
                <span className="w-8 shrink-0 text-right text-[11px] text-zinc-300">{config.freeRatio}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-[11px] text-amber-300">👑 Premium</span>
                <div className="flex-1 rounded bg-white/5 py-1 px-2 text-[10px] text-zinc-500 truncate">
                  {premiumRatio}% (auto)
                </div>
                <span className="w-8 shrink-0 text-right text-[11px] text-zinc-300">{premiumRatio}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-[11px] text-violet-300">💎 Elite</span>
                <input
                  type="range"
                  min={0}
                  max={100 - config.freeRatio}
                  value={config.eliteRatio}
                  onChange={(e) => setTrackRatio("eliteRatio", Number(e.target.value))}
                  className="flex-1 accent-violet-400"
                />
                <span className="w-8 shrink-0 text-right text-[11px] text-zinc-300">{config.eliteRatio}%</span>
              </div>
            </div>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setField("rarityProgression", !config.rarityProgression)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                config.rarityProgression
                  ? "border-purple-400/60 bg-purple-500/20 text-purple-200"
                  : "border-white/10 text-zinc-400 hover:border-white/30"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Seltenheits-Progression
            </button>
            <button
              onClick={() => setField("creditProgression", !config.creditProgression)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                config.creditProgression
                  ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200"
                  : "border-white/10 text-zinc-400 hover:border-white/30"
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Credit-Progression
            </button>
          </div>

          {/* Result */}
          {result && (
            <div className={`rounded-lg border px-3 py-2 text-sm ${
              result.success
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                : "border-red-400/40 bg-red-500/10 text-red-300"
            }`}>
              {result.success ? `✓ ${result.message}` : `✗ ${result.error}`}
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-white/10 py-2 text-sm text-zinc-400 hover:border-white/30 transition-colors"
          >
            {result?.success ? "Schließen" : "Abbrechen"}
          </button>
          {!result?.success && (
            <button
              onClick={handleAutoFill}
              disabled={running || rewardSum !== 100}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-purple-600 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50 transition-colors"
            >
              <Wand2 className="h-4 w-4" />
              {running ? "Befülle…" : "Auto-befüllen"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tier preview track ────────────────────────────────────────────────────────

function TierPreview({ pass }: { pass: BattlePass }) {
  const tierMap = new Map(pass.tiers.map((t) => [t.tierNumber, t]));
  const theme = BP_THEMES[pass.theme ?? "default"];

  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: theme.gradient, borderColor: `${theme.accent}33` }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-zinc-100">{pass.name}</h3>
          <p className="text-xs" style={{ color: theme.accent }}>{pass.seasonLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold" style={{ borderColor: `${theme.accent}50`, color: theme.accent }}>
            {pass.priceCr.toLocaleString("de-DE")} CR
          </span>
          {pass.eliteEnabled && (
            <span className="rounded-full border border-violet-400/50 bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-300">
              💎 {pass.elitePriceCr.toLocaleString("de-DE")} CR
            </span>
          )}
          {pass.spinChanceBoost > 0 && (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
              +{(pass.spinChanceBoost * 100).toFixed(1)}% Spin
            </span>
          )}
          {pass.showInShop && <ShoppingBag className="h-3.5 w-3.5 text-zinc-400" />}
        </div>
      </div>
      <div
        className="flex gap-1.5 overflow-x-auto pb-2"
        style={{ scrollbarWidth: "thin" }}
      >
        {Array.from({ length: pass.tierCount }, (_, i) => i + 1).map((n) => {
          const tier = tierMap.get(n);
          const isHighlight = tier?.highlightTier;
          const isElite = tier?.isElite;
          const isPremium = !isElite && tier?.isPremium;
          return (
            <div
              key={n}
              className={`shrink-0 flex flex-col items-center gap-0.5 rounded-lg border px-2 transition-all ${
                isHighlight ? "py-3 scale-110" : "py-1.5"
              } ${
                isElite
                  ? "border-violet-400/40 bg-violet-500/10"
                  : isPremium === false && tier
                    ? "border-purple-400/40 bg-purple-500/10"
                    : tier
                      ? "border-amber-400/30 bg-amber-500/10"
                      : "border-white/10 bg-white/[0.02]"
              }`}
              style={{ minWidth: isHighlight ? "56px" : "44px" }}
            >
              <span className="text-[9px] text-zinc-500">{n}</span>
              <span className={isHighlight ? "text-xl leading-none" : "text-base leading-none"}>{tier?.icon ?? "·"}</span>
              {tier && (
                <span className={`text-[8px] font-bold ${
                  isElite ? "text-violet-400" : isPremium ? "text-amber-400" : "text-purple-300"
                }`}>
                  {isElite ? "ELITE" : isPremium ? "PRO" : "FREE"}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-4 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded border border-purple-400/40 bg-purple-500/10" />Kostenlos
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded border border-amber-400/30 bg-amber-500/10" />Premium
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded border border-violet-400/40 bg-violet-500/10" />Elite
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded border border-white/10 bg-white/[0.02]" />Leer
        </span>
      </div>
    </div>
  );
}

// ── Tier editor modal ─────────────────────────────────────────────────────────

type TierTrack = "free" | "premium" | "elite";

function TierEditorModal({
  passId,
  tierNumber,
  existing,
  onClose,
  onSaved,
}: {
  passId: string;
  tierNumber: number;
  existing: BattlePassTier | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Derive track from existing tier
  const initialTrack: TierTrack = existing?.isElite
    ? "elite"
    : existing?.isPremium
      ? "premium"
      : "free";

  const [name, setName] = useState(existing?.name ?? `Tier ${tierNumber}`);
  const [icon, setIcon] = useState(existing?.icon ?? "🎁");
  const [track, setTrack] = useState<TierTrack>(initialTrack);
  const [rewardType, setRewardType] = useState<BpRewardType>(existing?.rewardType ?? "credits");
  const [rewardCredits, setRewardCredits] = useState(existing?.rewardCredits ?? 100);
  const [rewardItemId, setRewardItemId] = useState<string | null>(existing?.rewardItemId ?? null);
  const [rewardItemName, setRewardItemName] = useState<string>("");
  const [rewardItemRarity, setRewardItemRarity] = useState<Rarity | null>(existing?.rewardItemRarity ?? null);
  const [rewardBadgeKey, setRewardBadgeKey] = useState(existing?.rewardBadgeKey ?? "");
  const [rewardBadgeText, setRewardBadgeText] = useState(existing?.rewardBadgeText ?? "");
  const [rewardXpBoost, setRewardXpBoost] = useState(existing?.rewardXpBoost ?? 1);
  const [rewardNameStyleKey, setRewardNameStyleKey] = useState(existing?.rewardNameStyleKey ?? "");
  const [rewardQuantity, setRewardQuantity] = useState(existing?.rewardQuantity ?? 1);
  const [highlightTier, setHighlightTier] = useState(existing?.highlightTier ?? false);
  const [description, setDescription] = useState(existing?.description ?? "");
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sound = useSoundManager();

  // Derive isPremium and isElite from track
  const isPremium = track === "premium";
  const isElite = track === "elite";

  async function handleSave() {
    setSaving(true);
    setError(null);
    const input: AdminTierInput = {
      tierNumber,
      name: name.trim() || `Tier ${tierNumber}`,
      isPremium,
      isElite,
      rewardType,
      rewardCredits: rewardType === "credits" ? rewardCredits : null,
      rewardItemId: rewardType === "item" ? rewardItemId : null,
      rewardBadgeKey: rewardBadgeKey || null,
      rewardBadgeText: rewardType === "badge" ? (rewardBadgeText || null) : null,
      rewardItemRarity: rewardType === "random_item" ? rewardItemRarity : null,
      rewardXpBoost: rewardType === "xp_boost" ? rewardXpBoost : null,
      rewardNameStyleKey: rewardType === "name_style" ? (rewardNameStyleKey.trim() || null) : null,
      rewardQuantity: Math.max(1, rewardQuantity),
      highlightTier,
      description: description.trim() || null,
      icon: icon.trim() || "🎁",
    };
    const res = await adminUpsertBpTier(passId, input);
    setSaving(false);
    if (res.success) {
      sound.save();
      onSaved();
      onClose();
    } else {
      sound.error();
      setError(res.error ?? "Fehler");
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
        <div
          className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0e0b18] p-5 shadow-2xl max-h-[90vh] overflow-y-auto"
          style={{ scrollbarWidth: "thin" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-zinc-100">Tier {tierNumber} bearbeiten</h3>
            <button onClick={onClose} className="rounded-full p-1 text-zinc-500 hover:text-zinc-300 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3">
            {/* Name + Icon */}
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs text-zinc-400">
                Name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-400">
                Icon (Emoji)
                <input
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xl outline-none focus:border-purple-400/60"
                  maxLength={4}
                />
              </label>
            </div>

            {/* Emoji grid */}
            <div className="flex flex-wrap gap-1">
              {TIER_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setIcon(e)}
                  className={`rounded border px-1.5 py-1 text-sm transition-colors ${icon === e ? "border-purple-400/60 bg-purple-500/20" : "border-white/10 hover:border-white/30"}`}
                >{e}</button>
              ))}
            </div>

            {/* Beschreibung */}
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Beschreibung (optional)
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Flavor-Text für den Tier…"
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
              />
            </label>

            {/* Free / Premium / Elite 3-button toggle */}
            <div className="flex gap-1.5 sm:gap-2">
              <button
                onClick={() => setTrack("free")}
                className={`flex-1 rounded-lg border px-2 py-2.5 text-[10px] sm:text-xs font-semibold transition-colors min-h-[44px] ${
                  track === "free"
                    ? "border-purple-400/60 bg-purple-500/20 text-purple-200"
                    : "border-white/10 text-zinc-400 hover:border-white/30"
                }`}
              >
                ✦ Kostenlos
              </button>
              <button
                onClick={() => setTrack("premium")}
                className={`flex-1 rounded-lg border px-2 py-2.5 text-[10px] sm:text-xs font-semibold transition-colors min-h-[44px] ${
                  track === "premium"
                    ? "border-amber-400/60 bg-amber-500/20 text-amber-200"
                    : "border-white/10 text-zinc-400 hover:border-white/30"
                }`}
              >
                👑 Premium
              </button>
              <button
                onClick={() => setTrack("elite")}
                className={`flex-1 rounded-lg border px-2 py-2.5 text-[10px] sm:text-xs font-semibold transition-colors min-h-[44px] ${
                  track === "elite"
                    ? "border-violet-400/60 bg-violet-500/20 text-violet-200"
                    : "border-white/10 text-zinc-400 hover:border-white/30"
                }`}
              >
                💎 Elite
              </button>
            </div>

            {/* Highlight toggle */}
            <button
              onClick={() => setHighlightTier((v) => !v)}
              className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${highlightTier ? "border-yellow-400/60 bg-yellow-500/15 text-yellow-200" : "border-white/10 text-zinc-400 hover:border-white/20"}`}
            >
              <Star className="h-3.5 w-3.5" />
              {highlightTier ? "⭐ Milestone-Tier (hervorgehoben)" : "Als Milestone-Tier markieren"}
            </button>

            {/* Reward type */}
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Belohnungstyp
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {(Object.entries(REWARD_LABELS) as [BpRewardType, string][]).map(([rt, label]) => (
                  <button
                    key={rt}
                    onClick={() => setRewardType(rt)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] font-semibold transition-colors ${
                      rewardType === rt ? "border-purple-400/60 bg-purple-500/20 text-purple-200" : "border-white/10 text-zinc-400 hover:border-white/25"
                    }`}
                  >
                    {REWARD_ICONS[rt]}
                    {label}
                  </button>
                ))}
              </div>
            </label>

            {/* Conditional reward fields */}
            {rewardType === "credits" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs text-zinc-400">
                  Credits-Betrag
                  <input type="number" value={rewardCredits} onChange={(e) => setRewardCredits(Number(e.target.value) || 0)} min={1}
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
                </label>
                <label className="flex flex-col gap-1 text-xs text-zinc-400">
                  Menge (Multiplikator)
                  <input type="number" value={rewardQuantity} onChange={(e) => setRewardQuantity(Math.max(1, Number(e.target.value) || 1))} min={1}
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
                </label>
              </div>
            )}

            {rewardType === "item" && (
              <div className="space-y-2">
                <label className="flex flex-col gap-1 text-xs text-zinc-400">
                  Ausgewähltes Item
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100">
                      {rewardItemId ? (
                        <span className="text-purple-300">{rewardItemName || rewardItemId}</span>
                      ) : (
                        <span className="text-zinc-500">Kein Item ausgewählt</span>
                      )}
                    </div>
                    <button
                      onClick={() => setShowItemPicker(true)}
                      className="flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-500/15 px-3 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-500/25 transition-colors"
                    >
                      <Search className="h-3.5 w-3.5" />
                      Suchen
                    </button>
                  </div>
                </label>
                <label className="flex flex-col gap-1 text-xs text-zinc-400">
                  Menge
                  <input type="number" value={rewardQuantity} onChange={(e) => setRewardQuantity(Math.max(1, Number(e.target.value) || 1))} min={1}
                    className="w-24 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
                </label>
              </div>
            )}

            {rewardType === "random_item" && (
              <div className="space-y-2">
                <label className="flex flex-col gap-1 text-xs text-zinc-400">
                  Seltenheit (leer = alle)
                  <select
                    value={rewardItemRarity ?? ""}
                    onChange={(e) => setRewardItemRarity((e.target.value as Rarity) || null)}
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
                  >
                    <option value="">Alle Seltenheiten</option>
                    {RARITY_ORDER.map((r) => (
                      <option key={r} value={r}>{RARITY_LABELS[r]}</option>
                    ))}
                  </select>
                </label>
                <p className="text-[10px] text-zinc-500">Ein zufälliges Item aus dem Shop wird vergeben, gefiltert nach Seltenheit.</p>
              </div>
            )}

            {rewardType === "badge" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs text-zinc-400">
                  Badge-Text (sichtbar)
                  <input value={rewardBadgeText} onChange={(e) => setRewardBadgeText(e.target.value)}
                    placeholder="z.B. Season 1 Veteran"
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
                </label>
                <label className="flex flex-col gap-1 text-xs text-zinc-400">
                  Badge-Key (intern)
                  <input value={rewardBadgeKey} onChange={(e) => setRewardBadgeKey(e.target.value)}
                    placeholder="z.B. bp_s1_veteran"
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
                </label>
              </div>
            )}

            {rewardType === "xp_boost" && (
              <div className="space-y-2">
                <label className="flex flex-col gap-1 text-xs text-zinc-400">
                  Bonus-Tage (Fortschritt)
                  <input type="number" value={rewardXpBoost} onChange={(e) => setRewardXpBoost(Math.max(1, Number(e.target.value) || 1))} min={1}
                    className="w-32 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
                </label>
                <p className="text-[10px] text-zinc-500">Fügt dem User zusätzliche Fortschrittstage hinzu (überspringt Tiers).</p>
              </div>
            )}

            {rewardType === "name_style" && (
              <div className="space-y-2">
                <label className="flex flex-col gap-1 text-xs text-zinc-400">
                  Name-Style Key
                  <input
                    value={rewardNameStyleKey}
                    onChange={(e) => setRewardNameStyleKey(e.target.value)}
                    placeholder="z.B. galaxy, rainbow, celestial…"
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
                  />
                </label>
                <p className="text-[10px] text-zinc-500">
                  Key des Name-Styles aus dem Katalog (z.B. galaxy, rainbow, prismatic…). Der User erhält diesen Style dauerhaft.
                </p>
              </div>
            )}
          </div>

          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

          <div className="mt-4 flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-lg border border-white/10 py-2 text-sm text-zinc-400 hover:border-white/30 transition-colors">Abbrechen</button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-purple-600 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50 transition-colors"
            >
              <Save className="h-4 w-4" />
              {saving ? "…" : "Speichern"}
            </button>
          </div>
        </div>
      </div>

      {showItemPicker && (
        <ItemPickerModal
          onSelect={(id, name, _rarity) => { setRewardItemId(id); setRewardItemName(name); }}
          onClose={() => setShowItemPicker(false)}
        />
      )}
    </>
  );
}

// ── Pass editor ───────────────────────────────────────────────────────────────

function PassEditor({
  pass,
  onSaved,
  onDelete,
}: {
  pass: BattlePass;
  onSaved: () => void | Promise<void>;
  onDelete: () => void;
}) {
  const [name, setName] = useState(pass.name);
  const [seasonLabel, setSeasonLabel] = useState(pass.seasonLabel);
  const [description, setDescription] = useState(pass.description ?? "");
  const [priceCr, setPriceCr] = useState(pass.priceCr);
  const [elitePriceCr, setElitePriceCr] = useState(pass.elitePriceCr);
  const [eliteEnabled, setEliteEnabled] = useState(pass.eliteEnabled);
  const [enabled, setEnabled] = useState(pass.enabled);
  const [startDate, setStartDate] = useState(pass.startDate ?? "");
  const [endDate, setEndDate] = useState(pass.endDate ?? "");
  const [tierCount, setTierCount] = useState(pass.tierCount);
  const [spinBoost, setSpinBoost] = useState(pass.spinChanceBoost);
  const [bannerColor, setBannerColor] = useState(pass.bannerColor);
  const [theme, setTheme] = useState<BpTheme>(pass.theme ?? "default");
  const [accentColor, setAccentColor] = useState(pass.accentColor ?? "#7c3aed");
  const [bannerImageUrl, setBannerImageUrl] = useState(pass.bannerImageUrl ?? "");
  const [showInShop, setShowInShop] = useState(pass.showInShop ?? true);
  const [showOnDashboard, setShowOnDashboard] = useState(pass.showOnDashboard ?? true);
  const [shopSortOrder, setShopSortOrder] = useState(pass.shopSortOrder ?? 0);
  const [shopPosition, setShopPosition] = useState<BpShopPosition>(pass.shopPosition ?? "below_featured");
  const [shopBannerSize, setShopBannerSize] = useState<BpShopBannerSize>(pass.shopBannerSize ?? "card");
  const [passIcon, setPassIcon] = useState(pass.passIcon ?? "🏆");
  const [customBuyText, setCustomBuyText] = useState(pass.customBuyText ?? "");
  const [customEliteBuyText, setCustomEliteBuyText] = useState(pass.customEliteBuyText ?? "");
  const [showCountdown, setShowCountdown] = useState(pass.showCountdown ?? true);
  const [showTierCountInShop, setShowTierCountInShop] = useState(pass.showTierCountInShop ?? true);
  const [highlightColor, setHighlightColor] = useState(pass.highlightColor ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saved">("idle");
  const [activating, setActivating] = useState(false);
  const [editingTier, setEditingTier] = useState<{ num: number; existing: BattlePassTier | null } | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [showStats, setShowStats] = useState(false);
  const [showAutoFill, setShowAutoFill] = useState(false);
  const sound = useSoundManager();
  const router = useRouter();

  async function handleSave() {
    setSaving(true);
    setError(null);
    const input: AdminPassInput = {
      name: name.trim(),
      seasonLabel: seasonLabel.trim(),
      description,
      priceCr,
      elitePriceCr,
      eliteEnabled,
      enabled,
      startDate: startDate || null,
      endDate: endDate || null,
      tierCount,
      spinChanceBoost: spinBoost,
      bannerColor,
      theme,
      accentColor,
      bannerImageUrl: bannerImageUrl.trim() || null,
      showInShop,
      showOnDashboard,
      shopSortOrder,
      shopPosition,
      shopBannerSize,
      passIcon: passIcon.trim() || "🏆",
      customBuyText: customBuyText.trim(),
      customEliteBuyText: customEliteBuyText.trim(),
      showCountdown,
      showTierCountInShop,
      highlightColor: highlightColor.trim(),
    };
    const res = await adminUpdateBattlePass(pass.id, input);
    setSaving(false);
    if (res.success) {
      sound.save();
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2500);
      onSaved();
      router.refresh();
    } else {
      sound.error();
      setError(res.error ?? "Fehler");
    }
  }

  async function handleToggleActive() {
    setActivating(true);
    const res = await adminSetPassActive(pass.id, !pass.isActive);
    setActivating(false);
    if (res.success) {
      sound.save();
      onSaved();
      router.refresh();
    } else {
      sound.error();
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 4000);
      return;
    }
    setDeleting(true);
    const res = await adminDeleteBattlePass(pass.id);
    setDeleting(false);
    if (res.success) {
      sound.save();
      onDelete();
      router.refresh();
    } else {
      sound.error();
    }
  }

  const tierMap = new Map(pass.tiers.map((t) => [t.tierNumber, t]));

  return (
    <div className="space-y-4">
      {/* Basic info */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Pass-Name
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Season-Label (z.B. "Season 1")
          <input value={seasonLabel} onChange={(e) => setSeasonLabel(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Preis (CR)
          <input type="number" value={priceCr} onChange={(e) => setPriceCr(Number(e.target.value) || 0)} min={0}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Anzahl Tiers (1–50)
          <input type="number" value={tierCount} onChange={(e) => setTierCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} min={1} max={50}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Startdatum
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Enddatum
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Spin-Boost Premium (0–0.5)
          <div className="flex items-center gap-2">
            <input type="number" value={spinBoost} step={0.005} min={0} max={0.5}
              onChange={(e) => setSpinBoost(Math.min(0.5, Math.max(0, Number(e.target.value))))}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
            <span className="shrink-0 text-xs text-emerald-400">+{(spinBoost * 100).toFixed(1)}%</span>
          </div>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Banner-Farbe (legacy)
          <div className="flex items-center gap-2">
            <input type="color" value={bannerColor} onChange={(e) => setBannerColor(e.target.value)}
              className="h-9 w-14 cursor-pointer rounded-lg border border-white/10 bg-black/30 p-1" />
            <span className="text-xs text-zinc-400">{bannerColor}</span>
          </div>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        Beschreibung
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60 resize-none" />
      </label>

      {/* Banner image */}
      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        Banner-Bild URL (optional)
        <input value={bannerImageUrl} onChange={(e) => setBannerImageUrl(e.target.value)}
          placeholder="https://…/banner.png"
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
      </label>

      {/* Theme selector */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
          <Palette className="h-3.5 w-3.5" />Design-Theme
        </p>
        <ThemeSelector value={theme} onChange={setTheme} />
      </div>

      {/* Accent color */}
      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        Akzentfarbe (für Theme-Override)
        <div className="flex items-center gap-2">
          <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)}
            className="h-9 w-14 cursor-pointer rounded-lg border border-white/10 bg-black/30 p-1" />
          <span className="text-sm" style={{ color: accentColor }}>{accentColor}</span>
        </div>
      </label>

      {/* Elite section */}
      <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-violet-300 flex items-center gap-1.5">
            💎 Elite-Track
          </p>
          <button
            onClick={() => setEliteEnabled((v) => !v)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              eliteEnabled
                ? "border-violet-400/60 bg-violet-500/20 text-violet-200"
                : "border-white/10 text-zinc-500 hover:border-white/30 hover:text-zinc-300"
            }`}
          >
            {eliteEnabled ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            Elite-Track {eliteEnabled ? "aktiviert" : "deaktiviert"}
          </button>
        </div>
        <div className={eliteEnabled ? "" : "pointer-events-none opacity-40"}>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Elite-Preis (CR)
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={elitePriceCr}
                onChange={(e) => setElitePriceCr(Math.max(0, Number(e.target.value) || 0))}
                min={0}
                disabled={!eliteEnabled}
                className="w-40 rounded-lg border border-violet-400/20 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-400/60 disabled:opacity-50"
              />
              <span className="text-xs text-violet-300">{elitePriceCr.toLocaleString("de-DE")} CR</span>
            </div>
          </label>
        </div>
        {!eliteEnabled && (
          <p className="text-[10px] text-zinc-600">Aktiviere den Elite-Track, um einen dritten Tier-Track mit separatem Preis anzubieten.</p>
        )}
      </div>

      {/* Visibility toggles */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-zinc-400">Sichtbarkeit</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            onClick={() => setEnabled((e) => !e)}
            className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-colors ${
              enabled ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200" : "border-white/10 text-zinc-500 hover:border-white/30"
            }`}
          >
            {enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {enabled ? "Aktiv" : "Deaktiviert"}
          </button>
          <button
            onClick={() => setShowInShop((v) => !v)}
            className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-colors ${
              showInShop ? "border-blue-400/60 bg-blue-500/20 text-blue-200" : "border-white/10 text-zinc-500 hover:border-white/30"
            }`}
          >
            <ShoppingBag className="h-4 w-4" />
            {showInShop ? "Im Shop" : "Kein Shop"}
          </button>
          <button
            onClick={() => setShowOnDashboard((v) => !v)}
            className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-colors ${
              showOnDashboard ? "border-violet-400/60 bg-violet-500/20 text-violet-200" : "border-white/10 text-zinc-500 hover:border-white/30"
            }`}
          >
            <BarChart2 className="h-4 w-4" />
            {showOnDashboard ? "Dashboard" : "Kein Dashboard"}
          </button>
        </div>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Shop-Reihenfolge (niedriger = weiter vorne)
          <input
            type="number"
            value={shopSortOrder}
            onChange={(e) => setShopSortOrder(Number(e.target.value) || 0)}
            min={0}
            className="w-28 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>
      </div>

      {/* Shop Positionierung */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-4 space-y-4">
        <p className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
          <ShoppingBag className="h-3.5 w-3.5" />Shop-Positionierung &amp; Darstellung
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Position im Shop
            <select
              value={shopPosition}
              onChange={(e) => setShopPosition(e.target.value as BpShopPosition)}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/60"
            >
              <option value="top">🔝 Ganz oben (vor MOTD)</option>
              <option value="below_motd">📢 Unter MOTD</option>
              <option value="below_featured">⭐ Unter Featured (Standard)</option>
              <option value="between_categories">📁 Zwischen Kategorien</option>
              <option value="bottom">⬇️ Ganz unten</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Banner-Größe
            <select
              value={shopBannerSize}
              onChange={(e) => setShopBannerSize(e.target.value as BpShopBannerSize)}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/60"
            >
              <option value="card">🃏 Card (klein, kompakt)</option>
              <option value="banner">📜 Banner (mittelgroß)</option>
              <option value="hero">🦸 Hero (volle Breite, groß)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Pass-Icon (Emoji)
            <input
              value={passIcon}
              onChange={(e) => setPassIcon(e.target.value)}
              placeholder="🏆"
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/60"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Highlight-Farbe (optional)
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={highlightColor || accentColor}
                onChange={(e) => setHighlightColor(e.target.value)}
                className="h-9 w-14 cursor-pointer rounded-lg border border-white/10 bg-black/30 p-1"
              />
              <button
                onClick={() => setHighlightColor("")}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Zurücksetzen
              </button>
            </div>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Benutzerdefinierter Kauf-Text (Premium)
            <input
              value={customBuyText}
              onChange={(e) => setCustomBuyText(e.target.value)}
              placeholder="👑 Premium kaufen"
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/60"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Benutzerdefinierter Kauf-Text (Elite)
            <input
              value={customEliteBuyText}
              onChange={(e) => setCustomEliteBuyText(e.target.value)}
              placeholder="💎 Elite kaufen"
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/60"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowCountdown((v) => !v)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
              showCountdown ? "border-red-400/60 bg-red-500/20 text-red-200" : "border-white/10 text-zinc-500 hover:border-white/30"
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            {showCountdown ? "⏱ Countdown sichtbar" : "Countdown versteckt"}
          </button>
          <button
            onClick={() => setShowTierCountInShop((v) => !v)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
              showTierCountInShop ? "border-blue-400/60 bg-blue-500/20 text-blue-200" : "border-white/10 text-zinc-500 hover:border-white/30"
            }`}
          >
            <Star className="h-3.5 w-3.5" />
            {showTierCountInShop ? "Tier-Anzahl anzeigen" : "Tier-Anzahl versteckt"}
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleToggleActive}
          disabled={activating}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
            pass.isActive
              ? "border-purple-400/70 bg-purple-500/20 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.3)]"
              : "border-white/10 text-zinc-400 hover:border-purple-400/40 hover:text-purple-300"
          }`}
        >
          <Zap className="h-4 w-4" />
          {activating ? "…" : pass.isActive ? "Aktiver Pass" : "Aktivieren"}
        </button>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50 transition-colors shadow-[0_0_10px_rgba(147,51,234,0.4)]"
        >
          <Save className="h-4 w-4" />
          {saving ? "…" : "Speichern"}
        </button>

        <button
          onClick={handleDelete}
          disabled={deleting}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
            deleteConfirm ? "border-red-400/70 bg-red-500/20 text-red-200" : "border-red-500/30 text-red-400 hover:border-red-400/60"
          }`}
        >
          <Trash2 className="h-4 w-4" />
          {deleting ? "…" : deleteConfirm ? "Sicher löschen?" : "Löschen"}
        </button>

        {status === "saved" && <span className="text-sm font-semibold text-emerald-400">✓ Gespeichert</span>}
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>

      {/* Stats */}
      <div>
        <button
          className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
          onClick={() => setShowStats((s) => !s)}
        >
          {showStats ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Statistiken
        </button>
        {showStats && <StatsDisplay passId={pass.id} />}
      </div>

      {/* Preview */}
      <div>
        <button
          className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
          onClick={() => setShowPreview((p) => !p)}
        >
          {showPreview ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Pass-Vorschau
        </button>
        {showPreview && (
          <TierPreview
            pass={{
              ...pass,
              name, seasonLabel, bannerColor, priceCr,
              elitePriceCr, eliteEnabled,
              tierCount, spinChanceBoost: spinBoost,
              theme, accentColor, showInShop,
            }}
          />
        )}
      </div>

      {/* Tier editor grid */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <p className="flex-1 text-xs font-semibold text-zinc-400">Tier-Belohnungen konfigurieren</p>
          <button
            onClick={() => setShowAutoFill(true)}
            className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-semibold text-purple-300 hover:bg-purple-500/20 hover:border-purple-400/60 transition-colors"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Auto-befüllen
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: tierCount }, (_, i) => i + 1).map((n) => {
            const tier = tierMap.get(n);
            const isHighlight = tier?.highlightTier;
            const isEliteTier = tier?.isElite;
            const isPremiumTier = !isEliteTier && tier?.isPremium;
            return (
              <button
                key={n}
                onClick={() => setEditingTier({ num: n, existing: tier ?? null })}
                title={tier ? `Tier ${n} bearbeiten` : `Tier ${n} erstellen`}
                className={`group relative flex flex-col items-center gap-0.5 rounded-lg border transition-all hover:scale-105 ${
                  isHighlight ? "px-3 py-3 ring-1 ring-yellow-400/40" : "px-2 py-2"
                } ${
                  isEliteTier
                    ? "border-violet-400/40 bg-violet-500/10 hover:border-violet-400/70"
                    : isPremiumTier === false && tier
                      ? "border-purple-400/40 bg-purple-500/10 hover:border-purple-400/70"
                      : tier
                        ? "border-amber-400/30 bg-amber-500/10 hover:border-amber-400/60"
                        : "border-white/10 bg-white/[0.02] hover:border-white/30"
                }`}
                style={{ minWidth: "44px" }}
              >
                <span className="text-[9px] text-zinc-500">{n}</span>
                <span className={isHighlight ? "text-xl leading-none" : "text-base leading-none"}>{tier?.icon ?? "+"}</span>
                {tier && (
                  <span className={`text-[8px] font-bold ${
                    isEliteTier ? "text-violet-400" : isPremiumTier ? "text-amber-400" : "text-purple-300"
                  }`}>
                    {isEliteTier ? "ELITE" : isPremiumTier ? "PRO" : "FREE"}
                  </span>
                )}
                {tier && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                    <Pencil className="h-3 w-3 text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {editingTier && (
        <TierEditorModal
          passId={pass.id}
          tierNumber={editingTier.num}
          existing={editingTier.existing}
          onClose={() => setEditingTier(null)}
          onSaved={() => { onSaved(); router.refresh(); }}
        />
      )}

      {showAutoFill && (
        <AutoFillModal
          passId={pass.id}
          tierCount={tierCount}
          onClose={() => setShowAutoFill(false)}
          onDone={async () => { await onSaved(); router.refresh(); }}
        />
      )}
    </div>
  );
}

// ── Create form ───────────────────────────────────────────────────────────────

function CreatePassForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("Battle Pass");
  const [seasonLabel, setSeasonLabel] = useState("Season 1");
  const [priceCr, setPriceCr] = useState(2000);
  const [tierCount, setTierCount] = useState(20);
  const [theme, setTheme] = useState<BpTheme>("default");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showThemeSelect, setShowThemeSelect] = useState(false);
  const sound = useSoundManager();
  const router = useRouter();

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    const selectedTheme = BP_THEMES[theme];
    const res = await adminCreateBattlePass({
      name,
      seasonLabel,
      description: "",
      priceCr,
      elitePriceCr: 0,
      eliteEnabled: false,
      enabled: true,
      startDate: null,
      endDate: null,
      tierCount,
      spinChanceBoost: 0.02,
      bannerColor: selectedTheme.accent,
      theme,
      accentColor: selectedTheme.accent,
      bannerImageUrl: null,
      showInShop: true,
      showOnDashboard: true,
      shopSortOrder: 0,
      shopPosition: "below_featured",
      shopBannerSize: "card",
      passIcon: "🏆",
      customBuyText: "",
      customEliteBuyText: "",
      showCountdown: true,
      showTierCountInShop: true,
      highlightColor: "",
    });
    setCreating(false);
    if (res.success) {
      sound.save();
      onCreated();
      router.refresh();
    } else {
      sound.error();
      setError(res.error ?? "Fehler");
    }
  }

  return (
    <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.04] p-4">
      <h3 className="mb-3 text-sm font-bold text-zinc-200">Neuen Battle Pass erstellen</h3>
      <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="w-full sm:w-auto rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Season-Label
          <input value={seasonLabel} onChange={(e) => setSeasonLabel(e.target.value)}
            className="w-full sm:w-auto rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Preis (CR)
          <input type="number" value={priceCr} onChange={(e) => setPriceCr(Number(e.target.value) || 0)} min={0}
            className="w-full sm:w-28 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Anzahl Tiers
          <input type="number" value={tierCount} onChange={(e) => setTierCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} min={1} max={50}
            className="w-full sm:w-24 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
        </label>
        <div className="flex flex-col gap-1 text-xs text-zinc-400">
          Theme
          <button
            onClick={() => setShowThemeSelect((s) => !s)}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 hover:border-white/20 transition-colors"
          >
            <span className="h-3 w-3 rounded-full" style={{ background: BP_THEMES[theme].accent }} />
            {BP_THEMES[theme].label}
          </button>
        </div>
        <div className="flex items-end">
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50 transition-colors shadow-[0_0_10px_rgba(147,51,234,0.4)]"
          >
            <Plus className="h-4 w-4" />
            {creating ? "Erstelle…" : "Erstellen"}
          </button>
        </div>
      </div>
      {showThemeSelect && (
        <div className="mt-3">
          <ThemeSelector value={theme} onChange={(t) => { setTheme(t); setShowThemeSelect(false); }} />
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ── Migration banner ──────────────────────────────────────────────────────────

const MIGRATION_SQL = `-- In Supabase SQL Editor ausführen:

CREATE TABLE IF NOT EXISTS battle_passes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  season_label text NOT NULL DEFAULT 'Pass',
  description text,
  price_cr integer NOT NULL DEFAULT 2000,
  elite_price_cr integer NOT NULL DEFAULT 0,
  elite_enabled boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT false,
  start_date date, end_date date,
  tier_count integer NOT NULL DEFAULT 20,
  spin_chance_boost numeric(4,3) NOT NULL DEFAULT 0.020,
  banner_color text NOT NULL DEFAULT '#7c3aed',
  theme text NOT NULL DEFAULT 'default',
  accent_color text NOT NULL DEFAULT '#7c3aed',
  banner_image_url text,
  show_in_shop boolean NOT NULL DEFAULT true,
  show_on_dashboard boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS battle_pass_tiers (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  pass_id text NOT NULL REFERENCES battle_passes(id) ON DELETE CASCADE,
  tier_number integer NOT NULL,
  name text NOT NULL DEFAULT 'Belohnung',
  is_premium boolean NOT NULL DEFAULT true,
  is_elite boolean NOT NULL DEFAULT false,
  reward_type text NOT NULL DEFAULT 'credits',
  reward_credits integer DEFAULT 100,
  reward_item_id text, reward_badge_key text,
  reward_badge_text text, reward_item_rarity text,
  reward_xp_boost integer, reward_quantity integer NOT NULL DEFAULT 1,
  highlight_tier boolean NOT NULL DEFAULT false,
  description text,
  icon text NOT NULL DEFAULT '🎁',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pass_id, tier_number)
);

CREATE TABLE IF NOT EXISTS user_battle_passes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL,
  pass_id text NOT NULL REFERENCES battle_passes(id) ON DELETE CASCADE,
  has_premium boolean NOT NULL DEFAULT false,
  has_elite boolean NOT NULL DEFAULT false,
  progress_days integer NOT NULL DEFAULT 0,
  purchased_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, pass_id)
);

CREATE TABLE IF NOT EXISTS user_bp_tier_claims (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL,
  pass_id text NOT NULL,
  tier_id text NOT NULL REFERENCES battle_pass_tiers(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, tier_id)
);

ALTER TABLE battle_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_pass_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_battle_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_bp_tier_claims ENABLE ROW LEVEL SECURITY;`;

function MigrationBanner() {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(MIGRATION_SQL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.07] p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-amber-200 mb-1">Datenbank-Migration erforderlich</p>
          <p className="text-xs text-amber-400/80 mb-3">
            Die Battle-Pass-Tabellen existieren noch nicht. Führe die SQL-Migration aus.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Kopiert!" : "SQL kopieren"}
            </button>
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:border-white/30 hover:text-zinc-200 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Supabase öffnen
            </a>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-[11px] text-amber-400/60 hover:text-amber-400 transition-colors">SQL anzeigen</summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-black/40 p-3 text-[10px] leading-relaxed text-zinc-400 whitespace-pre-wrap">{MIGRATION_SQL}</pre>
          </details>
        </div>
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function BattlePassTab({ initialPasses, migrationNeeded = false }: { initialPasses: BattlePass[]; migrationNeeded?: boolean }) {
  const [passes, setPasses] = useState(initialPasses);
  const sound = useSoundManager();
  const router = useRouter();

  const reload = useCallback(async () => {
    const fresh = await adminListBattlePasses();
    setPasses(fresh);
  }, []);

  const activePass = passes.find((p) => p.isActive);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <h2 className="mb-1 text-base font-bold text-zinc-100">Battle Pass System</h2>
        <p className="text-xs text-zinc-500">
          Erstelle saisonale Pässe mit Tier-Belohnungen. Premium-Käufer schalten alle Tiers frei und erhalten Spin-Bonus.
          Belohnungstypen: Credits, spezifische Items, zufällige Items nach Seltenheit, Badges/Titel, Fortschritts-Boosts.
          Elite-Track: optionaler dritter Track mit eigenem Preis und violetten Tiers.
        </p>
      </div>

      {migrationNeeded && <MigrationBanner />}

      {activePass && (
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/[0.06] p-4">
          <div className="mb-2 flex items-center gap-2">
            <Zap className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-bold text-purple-200">Aktiver Pass: {activePass.name}</span>
            <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300">
              {activePass.seasonLabel}
            </span>
            {activePass.eliteEnabled && (
              <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-300">
                💎 Elite
              </span>
            )}
            {activePass.showInShop && (
              <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-300 flex items-center gap-1">
                <ShoppingBag className="h-2.5 w-2.5" /> Shop
              </span>
            )}
          </div>
          <TierPreview pass={activePass} />
        </div>
      )}

      <CreatePassForm onCreated={reload} />

      {passes.length === 0 ? (
        <p className="rounded-xl border border-white/10 px-4 py-6 text-center text-sm text-zinc-500">
          Noch keine Battle Pässe erstellt.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {passes.map((pass) => (
            <CollapsibleAdminRow
              key={pass.id}
              header={
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    {pass.isActive && (
                      <span className="h-2 w-2 rounded-full bg-purple-400 shadow-[0_0_6px_rgba(168,85,247,0.8)]" />
                    )}
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ background: BP_THEMES[pass.theme ?? "default"].accent }}
                    />
                    <span className="font-semibold text-zinc-100">{pass.name}</span>
                    <span className="text-xs text-zinc-500">{pass.seasonLabel}</span>
                  </div>
                  <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-bold text-purple-300">
                    {pass.priceCr.toLocaleString("de-DE")} CR
                  </span>
                  {pass.eliteEnabled && (
                    <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-300">
                      💎 {pass.elitePriceCr.toLocaleString("de-DE")} CR
                    </span>
                  )}
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">
                    {pass.tiers.length}/{pass.tierCount} Tiers
                  </span>
                  {pass.isActive && (
                    <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300">AKTIV</span>
                  )}
                  {!pass.enabled && (
                    <span className="rounded-full bg-zinc-500/20 px-2 py-0.5 text-[10px] text-zinc-500">DEAKTIVIERT</span>
                  )}
                  {pass.showInShop && <ShoppingBag className="h-3.5 w-3.5 text-blue-400" />}
                </div>
              }
            >
              <PassEditor
                pass={pass}
                onSaved={reload}
                onDelete={reload}
              />
            </CollapsibleAdminRow>
          ))}
        </div>
      )}
    </div>
  );
}
