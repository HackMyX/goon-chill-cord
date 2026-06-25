"use client";

import { useState, useTransition, useCallback, useMemo } from "react";
import {
  TrendingUp, Coins, Zap, Gamepad2, Globe, Package, ChevronDown,
  ChevronUp, Save, AlertTriangle, CheckCircle2, RefreshCw, Swords,
  Flame, Gem, Shield, Target, Timer, BarChart2, SlidersHorizontal,
} from "lucide-react";
import type { BalanceStudioData, BalanceCaseTierRow, BalanceMonsterRow } from "@/lib/actions/balance-studio";
import {
  saveEconomySettings, saveGamesSettings, saveItemSettings,
  applyItemPriceMultipliers, saveWorldSettings, saveXpSources,
} from "@/lib/actions/balance-studio";
import type { MineLevel } from "@/lib/mine-config";
import type { Rarity } from "@/lib/cases";

// ─── Utility components ────────────────────────────────────────────────────────

function SectionCard({ title, icon: Icon, children, className = "" }: {
  title: string; icon: typeof Coins; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/8 bg-white/[0.02] p-5 ${className}`}>
      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-zinc-100">
        <Icon className="h-4 w-4 text-purple-400" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function NumInput({ label, value, onChange, min, max, step = 1, unit = "" }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; unit?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {unit && <span className="shrink-0 text-xs text-zinc-500">{unit}</span>}
      </div>
    </label>
  );
}

function SaveRow({ onSave, saving, error, ok }: {
  onSave: () => void; saving: boolean; error: string; ok: boolean;
}) {
  return (
    <div className="mt-4 flex items-center gap-3 border-t border-white/5 pt-4">
      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-xl bg-purple-600/80 px-5 py-2 text-sm font-bold text-white transition hover:bg-purple-500 disabled:opacity-50"
      >
        {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Speichern
      </button>
      {error && (
        <span className="flex items-center gap-1 text-xs text-red-400">
          <AlertTriangle className="h-3.5 w-3.5" /> {error}
        </span>
      )}
      {ok && !error && (
        <span className="flex items-center gap-1 text-xs text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> Gespeichert!
        </span>
      )}
    </div>
  );
}

// ─── Health Panel ─────────────────────────────────────────────────────────────

function HealthPanel({ data }: { data: BalanceStudioData }) {
  const mineL1 = data.mineLevels[0];
  const mineL10 = data.mineLevels[data.mineLevels.length - 1];
  const normalStats = data.itemStats.find((s) => s.rarity === "normal");
  const ultraStats = data.itemStats.find((s) => s.rarity === "ultra");
  const ultraNametag = data.nameStyles.find((n) => n.rarity === "ultra");

  const l1Daily = (mineL1?.crPerHour ?? 0) * 24;
  const l10Daily = (mineL10?.crPerHour ?? 0) * 24;

  const metrics = [
    { label: "Normal-Item", value: normalStats?.avgPrice ?? 0, income: l1Daily, base: "Mine L1/Tag", color: "text-zinc-300" },
    { label: "Ultra-Item", value: ultraStats?.avgPrice ?? 0, income: l10Daily, base: "Mine L10/Tag", color: "text-fuchsia-300" },
    { label: "Ultra-Nametag", value: ultraNametag?.base_shop_price_cr ?? 0, income: l10Daily, base: "Mine L10/Tag", color: "text-purple-300" },
  ];

  const formatCR = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}k` : String(n);

  return (
    <div className="mb-6 rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-transparent p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-purple-200">
        <BarChart2 className="h-4 w-4" /> Economy Health Monitor
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Mine income */}
        <div className="rounded-xl border border-white/6 bg-black/20 p-3">
          <div className="text-xs text-zinc-500">Mine L1/Tag</div>
          <div className="mt-1 text-lg font-bold text-emerald-400">{formatCR(l1Daily)}</div>
          <div className="text-xs text-zinc-600">CR</div>
        </div>
        <div className="rounded-xl border border-white/6 bg-black/20 p-3">
          <div className="text-xs text-zinc-500">Mine L10/Tag</div>
          <div className="mt-1 text-lg font-bold text-emerald-400">{formatCR(l10Daily)}</div>
          <div className="text-xs text-zinc-600">CR</div>
        </div>
        {/* Item grind times */}
        {metrics.map((m) => {
          const days = m.income > 0 ? (m.value / m.income).toFixed(1) : "∞";
          const daysNum = parseFloat(days);
          const color = daysNum <= 3 ? "text-emerald-400" : daysNum <= 14 ? "text-amber-400" : "text-red-400";
          return (
            <div key={m.label} className="rounded-xl border border-white/6 bg-black/20 p-3">
              <div className="text-xs text-zinc-500">{m.label}</div>
              <div className={`mt-1 text-lg font-bold ${color}`}>{days}d</div>
              <div className="text-xs text-zinc-600">{formatCR(m.value)} CR via {m.base}</div>
            </div>
          );
        })}
        {/* Streak max */}
        <div className="rounded-xl border border-white/6 bg-black/20 p-3">
          <div className="text-xs text-zinc-500">Streak max/Tag</div>
          <div className="mt-1 text-lg font-bold text-orange-400">{formatCR(data.streakMax)}</div>
          <div className="text-xs text-zinc-600">CR (Woche: +{formatCR(data.streakMilestoneBonus)})</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500">
        <span>Items total: {data.itemStats.reduce((a, b) => a + b.count, 0)}</span>
        <span>•</span>
        <span>Start: {formatCR(data.startingCredits)} CR</span>
        <span>•</span>
        <span>Plinko: {formatCR(data.plinkoBallCost)}/Ball</span>
        <span>•</span>
        <span>DON min: {formatCR(data.donMinBet)} CR</span>
        <span>•</span>
        <span>Snake x2: {data.snakeModes["x2"]?.creditsPerApple ?? 0} CR/Apfel (max {formatCR(data.snakeModes["x2"]?.dailyCrLimit ?? 0)}/Tag)</span>
      </div>
    </div>
  );
}

// ─── Economy Section ──────────────────────────────────────────────────────────

function EconomySection({ data, onChange }: {
  data: BalanceStudioData;
  onChange: (d: Partial<BalanceStudioData>) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  const save = () => {
    setError(""); setOk(false);
    start(async () => {
      const res = await saveEconomySettings({
        startingCredits: data.startingCredits,
        mineLevels: data.mineLevels,
        streakBase: data.streakBase,
        streakIncrement: data.streakIncrement,
        streakMax: data.streakMax,
        streakMilestoneBonus: data.streakMilestoneBonus,
        streakMilestoneInterval: data.streakMilestoneInterval,
        streakWeekendMultiplier: data.streakWeekendMultiplier,
      });
      if (res.success) setOk(true); else setError(res.error ?? "Fehler");
    });
  };

  const setMineLevel = useCallback((idx: number, field: keyof MineLevel, val: number | null) => {
    const levels = data.mineLevels.map((l, i) => i === idx ? { ...l, [field]: val } : l);
    onChange({ mineLevels: levels });
  }, [data.mineLevels, onChange]);

  return (
    <div className="space-y-5">
      <SectionCard title="Startguthaben & Währung" icon={Coins}>
        <div className="grid grid-cols-2 gap-4">
          <NumInput label="Startguthaben (neue Spieler)" value={data.startingCredits} onChange={(v) => onChange({ startingCredits: v })} min={0} unit="CR" />
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Währungsname</span>
            <input
              value={data.currencyName}
              onChange={(e) => onChange({ currencyName: e.target.value })}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Goldmine — alle 10 Level" icon={TrendingUp}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500">
                <th className="pb-2 pr-3">Lvl</th>
                <th className="pb-2 pr-3">CR/Stunde</th>
                <th className="pb-2 pr-3">CR/Tag (×24)</th>
                <th className="pb-2">Upgrade-Kosten (CR)</th>
              </tr>
            </thead>
            <tbody>
              {data.mineLevels.map((lvl, i) => (
                <tr key={lvl.level} className="border-t border-white/5">
                  <td className="py-1.5 pr-3 font-bold text-purple-300">L{lvl.level}</td>
                  <td className="py-1.5 pr-3">
                    <input
                      type="number"
                      value={lvl.crPerHour}
                      onChange={(e) => setMineLevel(i, "crPerHour", Number(e.target.value))}
                      className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
                    />
                  </td>
                  <td className="py-1.5 pr-3 text-zinc-400">{(lvl.crPerHour * 24).toLocaleString("de-DE")}</td>
                  <td className="py-1.5">
                    {lvl.upgradeCost !== null ? (
                      <input
                        type="number"
                        value={lvl.upgradeCost ?? ""}
                        onChange={(e) => setMineLevel(i, "upgradeCost", e.target.value ? Number(e.target.value) : null)}
                        className="w-28 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
                      />
                    ) : (
                      <span className="text-zinc-600">MAX</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Daily-Streak Belohnungen" icon={Flame}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <NumInput label="Basis-Belohnung" value={data.streakBase} onChange={(v) => onChange({ streakBase: v })} min={0} unit="CR" />
          <NumInput label="Bonus pro Tag" value={data.streakIncrement} onChange={(v) => onChange({ streakIncrement: v })} min={0} unit="CR" />
          <NumInput label="Maximale Belohnung/Tag" value={data.streakMax} onChange={(v) => onChange({ streakMax: v })} min={0} unit="CR" />
          <NumInput label="Meilenstein-Bonus" value={data.streakMilestoneBonus} onChange={(v) => onChange({ streakMilestoneBonus: v })} min={0} unit="CR" />
          <NumInput label="Meilenstein-Intervall" value={data.streakMilestoneInterval} onChange={(v) => onChange({ streakMilestoneInterval: v })} min={1} unit="Tage" />
          <NumInput label="Wochenend-Multiplikator" value={data.streakWeekendMultiplier} onChange={(v) => onChange({ streakWeekendMultiplier: v })} min={1} max={10} step={0.1} unit="×" />
        </div>
      </SectionCard>

      <SaveRow onSave={save} saving={pending} error={error} ok={ok} />
    </div>
  );
}

// ─── Games Section ────────────────────────────────────────────────────────────

function GamesSection({ data, onChange }: {
  data: BalanceStudioData;
  onChange: (d: Partial<BalanceStudioData>) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  const save = () => {
    setError(""); setOk(false);
    start(async () => {
      const res = await saveGamesSettings({
        donDailyFlipLimit: data.donDailyFlipLimit,
        donMinBet: data.donMinBet,
        donQuickAmounts: data.donQuickAmounts,
        donUpgradeEnabled: data.donUpgradeEnabled,
        snakeModes: data.snakeModes,
        plinkoBallCost: data.plinkoBallCost,
        plinkoHourlyLimit: data.plinkoHourlyLimit,
        plinkoQuickBets: data.plinkoQuickBets,
      });
      if (res.success) setOk(true); else setError(res.error ?? "Fehler");
    });
  };

  const setSnakeMode = useCallback((mode: string, field: string, val: number) => {
    onChange({
      snakeModes: {
        ...data.snakeModes,
        [mode]: { ...data.snakeModes[mode], [field]: val },
      },
    });
  }, [data.snakeModes, onChange]);

  const SNAKE_MODES = ["x1", "x2", "farm", "grind"];
  const SNAKE_MODE_LABELS: Record<string, string> = { x1: "Normal (×1)", x2: "Krass (×2)", farm: "Farm", grind: "Grind" };

  return (
    <div className="space-y-5">
      {/* Snake */}
      <SectionCard title="Snake — alle Modi" icon={Gamepad2}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500">
                <th className="pb-2 pr-3">Modus</th>
                <th className="pb-2 pr-3">CR/Apfel</th>
                <th className="pb-2 pr-3">Tages-Limit (CR)</th>
                <th className="pb-2 pr-3">Bonus-CR (flat)</th>
                <th className="pb-2">Golden Apple ×</th>
              </tr>
            </thead>
            <tbody>
              {SNAKE_MODES.filter((k) => data.snakeModes[k]).map((key) => {
                const m = data.snakeModes[key];
                return (
                  <tr key={key} className="border-t border-white/5">
                    <td className="py-1.5 pr-3 font-semibold text-purple-300">{SNAKE_MODE_LABELS[key]}</td>
                    <td className="py-1.5 pr-3">
                      <input type="number" value={m.creditsPerApple} onChange={(e) => setSnakeMode(key, "creditsPerApple", Number(e.target.value))}
                        className="w-20 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-purple-400/60" />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input type="number" value={m.dailyCrLimit} onChange={(e) => setSnakeMode(key, "dailyCrLimit", Number(e.target.value))}
                        className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-purple-400/60" />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input type="number" value={m.bonusCrFlat} onChange={(e) => setSnakeMode(key, "bonusCrFlat", Number(e.target.value))}
                        className="w-20 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-purple-400/60" />
                    </td>
                    <td className="py-1.5">
                      <input type="number" value={m.goldenAppleCrMultiplier} step={0.5} onChange={(e) => setSnakeMode(key, "goldenAppleCrMultiplier", Number(e.target.value))}
                        className="w-16 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-purple-400/60" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Plinko */}
      <SectionCard title="Plinko" icon={Target}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <NumInput label="Ball-Kosten" value={data.plinkoBallCost} onChange={(v) => onChange({ plinkoBallCost: v })} min={0} unit="CR" />
          <NumInput label="Stündliches Ball-Limit" value={data.plinkoHourlyLimit} onChange={(v) => onChange({ plinkoHourlyLimit: v })} min={1} unit="Bälle" />
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Quick-Bets (kommagetrennt)</span>
            <input
              value={data.plinkoQuickBets.join(",")}
              onChange={(e) => {
                const vals = e.target.value.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 0);
                onChange({ plinkoQuickBets: vals });
              }}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            />
          </div>
        </div>
      </SectionCard>

      {/* DON */}
      <SectionCard title="Double or Nothing" icon={Zap}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <NumInput label="Tägliche Flips" value={data.donDailyFlipLimit} onChange={(v) => onChange({ donDailyFlipLimit: v })} min={1} unit="Flips/Tag" />
          <NumInput label="Mindesteinsatz" value={data.donMinBet} onChange={(v) => onChange({ donMinBet: v })} min={0} unit="CR" />
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Quick-Beträge (kommagetrennt)</span>
            <input
              value={data.donQuickAmounts.join(",")}
              onChange={(e) => {
                const vals = e.target.value.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 0);
                onChange({ donQuickAmounts: vals });
              }}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            />
          </div>
          <label className="flex items-center gap-2 pt-4 text-sm text-zinc-300">
            <input type="checkbox" checked={data.donUpgradeEnabled} onChange={(e) => onChange({ donUpgradeEnabled: e.target.checked })}
              className="h-4 w-4 rounded accent-purple-500" />
            Upgrades aktiviert
          </label>
        </div>
        {/* DON Upgrade Tiers */}
        {data.donUpgradeTiers.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <div className="text-xs text-zinc-500 mb-2">Upgrade-Tiers</div>
            <table className="w-full text-xs">
              <thead><tr className="text-left text-zinc-500">
                <th className="pb-1 pr-3">Name</th>
                <th className="pb-1 pr-3">Bonus Flips/Tag</th>
                <th className="pb-1">Kosten (CR)</th>
              </tr></thead>
              <tbody>
                {data.donUpgradeTiers.map((t, i) => (
                  <tr key={t.tier} className="border-t border-white/5">
                    <td className="py-1.5 pr-3 text-zinc-300">{t.name}</td>
                    <td className="py-1.5 pr-3">
                      <input type="number" value={t.bonusHourlyFlips}
                        onChange={(e) => {
                          const tiers = data.donUpgradeTiers.map((x, j) => j === i ? { ...x, bonusHourlyFlips: Number(e.target.value) } : x);
                          onChange({ donUpgradeTiers: tiers });
                        }}
                        className="w-16 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-purple-400/60" />
                    </td>
                    <td className="py-1.5">
                      <input type="number" value={t.costCr}
                        onChange={(e) => {
                          const tiers = data.donUpgradeTiers.map((x, j) => j === i ? { ...x, costCr: Number(e.target.value) } : x);
                          onChange({ donUpgradeTiers: tiers });
                        }}
                        className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-purple-400/60" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SaveRow onSave={save} saving={pending} error={error} ok={ok} />
    </div>
  );
}

// ─── Items Section ─────────────────────────────────────────────────────────────

const RARITY_COLORS: Record<string, string> = {
  normal: "text-zinc-300", selten: "text-blue-400", mythisch: "text-purple-400", ultra: "text-fuchsia-400",
};
const RARITY_BADGE: Record<string, string> = {
  normal: "bg-zinc-700/50 text-zinc-300", selten: "bg-blue-500/20 text-blue-300",
  mythisch: "bg-purple-500/20 text-purple-300", ultra: "bg-fuchsia-500/20 text-fuchsia-300",
};

function ItemsSection({ data, onChange }: {
  data: BalanceStudioData;
  onChange: (d: Partial<BalanceStudioData>) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [multPending, startMult] = useTransition();
  const [multError, setMultError] = useState("");
  const [multOk, setMultOk] = useState(false);
  const [multipliers, setMultipliers] = useState<Partial<Record<Rarity, number>>>({
    normal: 1, selten: 1, mythisch: 1, ultra: 1,
  });

  const save = () => {
    setError(""); setOk(false);
    start(async () => {
      const res = await saveItemSettings({
        caseTiers: data.caseTiers.map((t) => ({ id: t.id, price: t.price, rarity_weights: t.rarity_weights })),
        nameStyles: data.nameStyles.map((n) => ({ rarity: n.rarity, base_shop_price_cr: n.base_shop_price_cr, max_shop_price_cr: n.max_shop_price_cr })),
        shopMultiplierMin: data.shopMultiplierMin,
        shopMultiplierMax: data.shopMultiplierMax,
      });
      if (res.success) setOk(true); else setError(res.error ?? "Fehler");
    });
  };

  const applyMult = () => {
    const anyNonOne = Object.values(multipliers).some((v) => v !== 1);
    if (!anyNonOne) { setMultError("Alle Multiplikatoren sind 1× — nichts zu tun."); return; }
    setMultError(""); setMultOk(false);
    startMult(async () => {
      const res = await applyItemPriceMultipliers(multipliers);
      if (res.success) {
        setMultOk(true);
        setMultipliers({ normal: 1, selten: 1, mythisch: 1, ultra: 1 });
      } else {
        setMultError(res.error ?? "Fehler");
      }
    });
  };

  const setCaseTier = useCallback((id: string, field: string, val: number | Partial<Record<Rarity, number>>) => {
    onChange({
      caseTiers: data.caseTiers.map((t) => t.id === id ? { ...t, [field]: val } : t),
    });
  }, [data.caseTiers, onChange]);

  const setNameStyle = useCallback((rarity: string, field: string, val: number) => {
    onChange({
      nameStyles: data.nameStyles.map((n) => n.rarity === rarity ? { ...n, [field]: val } : n),
    });
  }, [data.nameStyles, onChange]);

  const formatCR = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}k` : String(n);

  return (
    <div className="space-y-5">
      {/* Item price bulk multiplier */}
      <SectionCard title="Item-Preise Bulk-Multiplikator" icon={SlidersHorizontal}>
        <p className="mb-3 text-xs text-zinc-500">
          Wendet den Multiplikator <strong>einmalig</strong> auf alle bestehenden Item-Preise an (nicht umkehrbar ohne Reset).
          Aktuelle Durchschnittspreise sind rechts angezeigt.
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(["normal", "selten", "mythisch", "ultra"] as Rarity[]).map((r) => {
            const stats = data.itemStats.find((s) => s.rarity === r);
            const preview = stats ? Math.round(stats.avgPrice * (multipliers[r] ?? 1)) : 0;
            return (
              <div key={r} className="flex flex-col gap-1.5">
                <span className={`text-xs font-semibold ${RARITY_COLORS[r]}`}>{r.charAt(0).toUpperCase() + r.slice(1)}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={multipliers[r] ?? 1}
                    step={0.1}
                    min={0.1}
                    max={20}
                    onChange={(e) => setMultipliers((p) => ({ ...p, [r]: Number(e.target.value) }))}
                    className="w-20 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
                  />
                  <span className="text-xs text-zinc-500">×</span>
                </div>
                <div className="text-xs text-zinc-500">
                  Ø {formatCR(stats?.avgPrice ?? 0)} → <span className={RARITY_COLORS[r]}>{formatCR(preview)}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={applyMult}
            disabled={multPending}
            className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-bold text-amber-300 transition hover:border-amber-500/70 hover:bg-amber-500/20 disabled:opacity-50"
          >
            {multPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Gem className="h-4 w-4" />}
            Multiplikator anwenden ({data.itemStats.reduce((a, b) => a + b.count, 0)} Items)
          </button>
          {multError && <span className="text-xs text-red-400"><AlertTriangle className="inline h-3.5 w-3.5 mr-1" />{multError}</span>}
          {multOk && <span className="text-xs text-emerald-400"><CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />Preise aktualisiert!</span>}
        </div>
      </SectionCard>

      {/* Case tier prices */}
      <SectionCard title="Case-Preise & Rarität-Gewichte" icon={Package}>
        <div className="space-y-4">
          {data.caseTiers.map((tier) => (
            <div key={tier.id} className="rounded-xl border border-white/6 bg-black/15 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-200">{tier.label}</span>
                <span className="text-xs text-zinc-500">{tier.group_id}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <NumInput label="Preis (CR)" value={tier.price} onChange={(v) => setCaseTier(tier.id, "price", v)} min={0} />
                {(["normal", "selten", "mythisch", "ultra"] as Rarity[]).map((r) => (
                  <NumInput
                    key={r}
                    label={`${r.charAt(0).toUpperCase() + r.slice(1)} %`}
                    value={tier.rarity_weights[r] ?? 0}
                    step={0.1}
                    onChange={(v) => setCaseTier(tier.id, "rarity_weights", { ...tier.rarity_weights, [r]: v })}
                  />
                ))}
              </div>
              <div className="mt-2 text-xs text-zinc-600">
                Summe: {Object.values(tier.rarity_weights).reduce((a, b) => (a ?? 0) + (b ?? 0), 0)?.toFixed(1)}%
                {Math.abs((Object.values(tier.rarity_weights).reduce((a, b) => (a ?? 0) + (b ?? 0), 0) ?? 0) - 100) > 0.5 && (
                  <span className="ml-2 text-amber-400">⚠ Summe sollte 100% ergeben</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Name style prices */}
      <SectionCard title="Name-Style Preise pro Rarität" icon={Gem}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-zinc-500">
              <th className="pb-2 pr-3">Rarität</th>
              <th className="pb-2 pr-3">Basis-Preis (CR)</th>
              <th className="pb-2">Max-Preis (CR)</th>
            </tr></thead>
            <tbody>
              {data.nameStyles.map((ns) => (
                <tr key={ns.rarity} className="border-t border-white/5">
                  <td className="py-2 pr-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${RARITY_BADGE[ns.rarity] ?? ""}`}>
                      {ns.rarity}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <input type="number" value={ns.base_shop_price_cr}
                      onChange={(e) => setNameStyle(ns.rarity, "base_shop_price_cr", Number(e.target.value))}
                      className="w-32 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-purple-400/60" />
                  </td>
                  <td className="py-2">
                    <input type="number" value={ns.max_shop_price_cr}
                      onChange={(e) => setNameStyle(ns.rarity, "max_shop_price_cr", Number(e.target.value))}
                      className="w-32 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-purple-400/60" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Shop multiplier */}
      <SectionCard title="Shop Preis-Multiplikator" icon={TrendingUp}>
        <div className="grid grid-cols-2 gap-4">
          <NumInput label="Minimum ×" value={data.shopMultiplierMin} onChange={(v) => onChange({ shopMultiplierMin: v })} min={1} max={5} step={0.1} unit="×" />
          <NumInput label="Maximum ×" value={data.shopMultiplierMax} onChange={(v) => onChange({ shopMultiplierMax: v })} min={1} max={5} step={0.1} unit="×" />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Shop-Items = Basis-Preis × zufälliger Wert zwischen Min und Max. Empfohlen: 1.3–1.8×
        </p>
      </SectionCard>

      <SaveRow onSave={save} saving={pending} error={error} ok={ok} />
    </div>
  );
}

// ─── World Section ────────────────────────────────────────────────────────────

function WorldSection({ data, onChange }: {
  data: BalanceStudioData;
  onChange: (d: Partial<BalanceStudioData>) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  const setMonster = useCallback((id: string, field: string, val: number) => {
    onChange({
      monsters: data.monsters.map((m) => m.id === id ? { ...m, [field]: val } : m),
    });
  }, [data.monsters, onChange]);

  const save = () => {
    setError(""); setOk(false);
    start(async () => {
      const res = await saveWorldSettings({
        worldMaxAliveMonsters: data.worldMaxAliveMonsters,
        worldSpawnIntervalMin: data.worldSpawnIntervalMin,
        worldSpawnIntervalMax: data.worldSpawnIntervalMax,
        worldAliveCapMax: data.worldAliveCapMax,
        worldAliveCapPerPlayer: data.worldAliveCapPerPlayer,
        characterAttackCooldown: data.characterAttackCooldown,
        characterHpRegenPerSec: data.characterHpRegenPerSec,
        characterHpRegenDelay: data.characterHpRegenDelay,
        characterPvpDamageMultiplier: data.characterPvpDamageMultiplier,
        characterPerkMultiplierCap: data.characterPerkMultiplierCap,
        characterFistDamage: data.characterFistDamage,
        characterMoveSpeed: data.characterMoveSpeed,
        characterSprintMultiplier: data.characterSprintMultiplier,
        characterSprintDamageMultiplier: data.characterSprintDamageMultiplier,
        killStreakMultiplierPerKill: data.killStreakMultiplierPerKill,
        killStreakMaxMultiplier: data.killStreakMaxMultiplier,
        monsters: data.monsters.map((m) => ({
          id: m.id, credits_reward: m.credits_reward, hp: m.hp,
          atk_dmg: m.atk_dmg, move_speed: m.move_speed,
          reward_min: m.reward_min, reward_max: m.reward_max,
          spawn_weight: m.spawn_weight,
        })),
      });
      if (res.success) setOk(true); else setError(res.error ?? "Fehler");
    });
  };

  return (
    <div className="space-y-5">
      {/* Spawn config */}
      <SectionCard title="Welt — Spawn-Konfiguration" icon={Globe}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <NumInput label="Max aktive Monster" value={data.worldMaxAliveMonsters} onChange={(v) => onChange({ worldMaxAliveMonsters: v })} min={1} />
          <NumInput label="Spawn-Interval min" value={data.worldSpawnIntervalMin} onChange={(v) => onChange({ worldSpawnIntervalMin: v })} min={0.1} step={0.1} unit="s" />
          <NumInput label="Spawn-Interval max" value={data.worldSpawnIntervalMax} onChange={(v) => onChange({ worldSpawnIntervalMax: v })} min={0.1} step={0.1} unit="s" />
          <NumInput label="Alive-Cap gesamt" value={data.worldAliveCapMax} onChange={(v) => onChange({ worldAliveCapMax: v })} min={1} />
          <NumInput label="Bonus-Cap pro Spieler" value={data.worldAliveCapPerPlayer} onChange={(v) => onChange({ worldAliveCapPerPlayer: v })} min={0} />
        </div>
      </SectionCard>

      {/* Character / Combat */}
      <SectionCard title="Charakter & Kampf" icon={Swords}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <NumInput label="Faustkampf-Schaden" value={data.characterFistDamage} onChange={(v) => onChange({ characterFistDamage: v })} min={1} unit="DMG" />
          <NumInput label="Angriffs-Cooldown" value={data.characterAttackCooldown} onChange={(v) => onChange({ characterAttackCooldown: v })} min={0.1} step={0.05} unit="s" />
          <NumInput label="HP Regen/Sekunde" value={data.characterHpRegenPerSec} onChange={(v) => onChange({ characterHpRegenPerSec: v })} min={0} step={0.5} unit="HP/s" />
          <NumInput label="HP Regen Delay" value={data.characterHpRegenDelay} onChange={(v) => onChange({ characterHpRegenDelay: v })} min={0} step={0.1} unit="s" />
          <NumInput label="PvP Schaden ×" value={data.characterPvpDamageMultiplier} onChange={(v) => onChange({ characterPvpDamageMultiplier: v })} min={0.01} max={1} step={0.05} unit="×" />
          <NumInput label="Perk-Cap max" value={data.characterPerkMultiplierCap} onChange={(v) => onChange({ characterPerkMultiplierCap: v })} min={0.1} step={0.1} unit="×" />
          <NumInput label="Laufgeschwindigkeit" value={data.characterMoveSpeed} onChange={(v) => onChange({ characterMoveSpeed: v })} min={1} step={0.1} />
          <NumInput label="Sprint-Multiplikator" value={data.characterSprintMultiplier} onChange={(v) => onChange({ characterSprintMultiplier: v })} min={1} step={0.05} unit="×" />
          <NumInput label="Sprint-Schaden ×" value={data.characterSprintDamageMultiplier} onChange={(v) => onChange({ characterSprintDamageMultiplier: v })} min={1} step={0.05} unit="×" />
        </div>
      </SectionCard>

      {/* Kill streak */}
      <SectionCard title="Kill-Streak" icon={Flame}>
        <div className="grid grid-cols-2 gap-4">
          <NumInput label="Multiplikator pro Kill" value={data.killStreakMultiplierPerKill} onChange={(v) => onChange({ killStreakMultiplierPerKill: v })} min={0.01} step={0.01} unit="×" />
          <NumInput label="Max-Multiplikator" value={data.killStreakMaxMultiplier} onChange={(v) => onChange({ killStreakMaxMultiplier: v })} min={1} step={0.5} unit="×" />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Bei {data.killStreakMultiplierPerKill}× pro Kill wird Max ({data.killStreakMaxMultiplier}×) nach{" "}
          {Math.ceil((data.killStreakMaxMultiplier - 1) / data.killStreakMultiplierPerKill)} Kills erreicht.
        </p>
      </SectionCard>

      {/* Monsters */}
      <SectionCard title="Monster-Typen" icon={Shield}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-zinc-500">
              <th className="pb-2 pr-2">Monster</th>
              <th className="pb-2 pr-2">HP</th>
              <th className="pb-2 pr-2">Schaden</th>
              <th className="pb-2 pr-2">Speed</th>
              <th className="pb-2 pr-2">Reward min</th>
              <th className="pb-2 pr-2">Reward max</th>
              <th className="pb-2 pr-2">CR Bonus</th>
              <th className="pb-2">Spawn-Gew.</th>
            </tr></thead>
            <tbody>
              {data.monsters.map((m) => (
                <tr key={m.id} className="border-t border-white/5">
                  <td className="py-1.5 pr-2 font-semibold text-purple-300">{m.name}</td>
                  {(["hp", "atk_dmg", "move_speed", "reward_min", "reward_max", "credits_reward", "spawn_weight"] as (keyof BalanceMonsterRow)[]).map((field) => (
                    <td key={field} className="py-1.5 pr-2">
                      <input
                        type="number"
                        value={m[field] as number}
                        step={field === "move_speed" ? 0.1 : 1}
                        onChange={(e) => setMonster(m.id, field, Number(e.target.value))}
                        className="w-16 rounded-lg border border-white/10 bg-black/30 px-1.5 py-1 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          CR Bonus = direkte Credits pro Kill (zusätzlich zu Reward min/max). Spawn-Gewichtung = relativ zu anderen Monster-Typen.
        </p>
      </SectionCard>

      <SaveRow onSave={save} saving={pending} error={error} ok={ok} />
    </div>
  );
}

// ─── XP Sources Section ───────────────────────────────────────────────────────

function XpSourcesSection({ data, onChange }: {
  data: BalanceStudioData;
  onChange: (d: Partial<BalanceStudioData>) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  const save = () => {
    setError(""); setOk(false);
    start(async () => {
      const res = await saveXpSources({
        xpMineCollectPer100Cr: data.xpMineCollectPer100Cr,
        xpStreakPerDay: data.xpStreakPerDay,
        xpSnakePerScorePoint: data.xpSnakePerScorePoint,
        xpPlinkoPerDrop: data.xpPlinkoPerDrop,
        xpDonWin: data.xpDonWin,
        xpCaseOpen: data.xpCaseOpen,
        xpWorldKill: data.xpWorldKill,
        xpBpTierClaim: data.xpBpTierClaim,
        xpPvpKill: data.xpPvpKill,
      });
      if (res.success) setOk(true); else setError(res.error ?? "Fehler");
    });
  };

  const XP_FIELDS: Array<{
    key: keyof BalanceStudioData;
    label: string;
    hint: string;
    step?: number;
  }> = [
    { key: "xpMineCollectPer100Cr",   label: "Mine: XP pro 100 CR",       hint: "Beim Mine-Einsammeln" },
    { key: "xpStreakPerDay",           label: "Streak: XP × Streak-Tage",  hint: "Streak-Tag-Zahl × Wert" },
    { key: "xpSnakePerScorePoint",     label: "Snake: XP pro Score-Punkt", hint: "Pro Apfel (0.5 = 1 Apfel → 0.5 XP)", step: 0.1 },
    { key: "xpPlinkoPerDrop",          label: "Plinko: XP pro Drop",       hint: "Jeder Ball-Wurf" },
    { key: "xpDonWin",                 label: "DON: XP pro Gewinn",        hint: "Nur bei Gewinn" },
    { key: "xpCaseOpen",               label: "Case: XP pro Case",         hint: "Beim Öffnen einer Case" },
    { key: "xpWorldKill",              label: "World: XP pro Monster-Kill",hint: "PvE World Kill" },
    { key: "xpBpTierClaim",            label: "Battle Pass: XP pro Tier",  hint: "Battle Pass Tier einlösen" },
    { key: "xpPvpKill",                label: "World: XP pro PvP-Kill",    hint: "PvP World Kill" },
  ];

  return (
    <SectionCard title="XP-Quellen (Balance)" icon={Zap}>
      <p className="mb-4 text-xs text-zinc-500">
        Definiert wie viel XP jede Aktivität gibt. Level-Aufbau und Belohnungen werden im Admin-Panel unter
        &ldquo;Level & XP&rdquo; konfiguriert.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {XP_FIELDS.map(({ key, label, hint, step }) => (
          <div key={key} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-300">{label}</span>
            <span className="text-[10px] text-zinc-600">{hint}</span>
            <input
              type="number"
              value={data[key] as number}
              step={step ?? 1}
              min={0}
              onChange={(e) => onChange({ [key]: Number(e.target.value) })}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            />
          </div>
        ))}
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {ok && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> XP-Quellen gespeichert!
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button
          onClick={save}
          disabled={pending}
          className="flex items-center gap-2 rounded-xl bg-purple-600/80 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500 disabled:opacity-50"
        >
          {pending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          XP-Balance speichern
        </button>
      </div>
    </SectionCard>
  );
}

// ─── Main Balance Studio ──────────────────────────────────────────────────────

type StudioTab = "economy" | "games" | "items" | "world" | "xp";

const STUDIO_TABS: { id: StudioTab; label: string; icon: typeof Coins }[] = [
  { id: "economy", label: "Economy & Mine", icon: TrendingUp },
  { id: "games",   label: "Spiele & DON",   icon: Gamepad2   },
  { id: "items",   label: "Items & Cases",  icon: Package    },
  { id: "world",   label: "Welt & Kampf",   icon: Globe      },
  { id: "xp",      label: "XP-Balance",     icon: Zap        },
];

export function BalanceStudio({ initialData }: { initialData: BalanceStudioData }) {
  const [data, setData] = useState<BalanceStudioData>(initialData);
  const [tab, setTab] = useState<StudioTab>("economy");

  const onChange = useCallback((partial: Partial<BalanceStudioData>) => {
    setData((prev) => ({ ...prev, ...partial }));
  }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-r from-purple-500/8 to-transparent p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20">
            <SlidersHorizontal className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-zinc-50">Balance Studio</h2>
            <p className="text-xs text-zinc-400">Alle Spielwerte zentral anpassen — von Items über Games bis Kampf. Änderungen wirken sofort für alle Spieler.</p>
          </div>
        </div>
      </div>

      {/* Health panel (always visible) */}
      <HealthPanel data={data} />

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2">
        {STUDIO_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t.id
                ? "border-purple-400 bg-purple-500/15 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.35)]"
                : "border-white/10 text-zinc-400 hover:border-white/25 hover:text-zinc-200"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Section content */}
      {tab === "economy" && <EconomySection data={data} onChange={onChange} />}
      {tab === "games"   && <GamesSection data={data} onChange={onChange} />}
      {tab === "items"   && <ItemsSection data={data} onChange={onChange} />}
      {tab === "world"   && <WorldSection data={data} onChange={onChange} />}
      {tab === "xp"      && <XpSourcesSection data={data} onChange={onChange} />}
    </div>
  );
}
