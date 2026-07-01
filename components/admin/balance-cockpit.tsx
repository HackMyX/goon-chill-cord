"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Pickaxe, Apple, Loader2, TrendingUp, Coins } from "lucide-react";
import { getBalanceSnapshot, type BalancePriceRow } from "@/lib/actions/balance-studio";
import type { ItemRow, CaseTierRow } from "@/components/admin/admin-shell";
import type { MineConfig } from "@/lib/mine-config";
import type { SnakeConfig } from "@/lib/snake-config";
import type { DonConfig } from "@/lib/don-config";
import type { PlinkoConfig } from "@/lib/actions/plinko";
import type { StreakConfig } from "@/lib/streak";
import type { ShopSettings } from "@/lib/shop";
import type { XpConfig } from "@/lib/level-system";
import type { BattlePass } from "@/lib/battle-pass";
import type { MonsterTypeConfig } from "@/lib/monsters";
import { PARKOUR_MAPS, resolveMap, type ParkourConfig } from "@/lib/parkour-config";
import { useSoundManager } from "@/lib/sound-manager";

type Tab = string;

const RARITY_COL: Record<string, string> = {
  normal: "#9ca3af", selten: "#3b82f6", mythisch: "#f59e0b", ultra: "#a855f7",
};

interface PriceEntry {
  id: string;
  name: string;
  rarity: string;
  price: number;
  jumpTab: Tab;
  jumpAnchor?: string;
}

interface IncomeEntry {
  id: string;
  name: string;
  value: string;
  detail?: string;
  jumpTab: Tab;
  jumpAnchor?: string;
}

function fmtCr(n: number): string {
  return Math.round(n).toLocaleString("de-DE");
}
function fmtMine(minutes: number): string {
  if (!isFinite(minutes) || minutes <= 0) return "—";
  if (minutes < 90) return `${Math.round(minutes)} Min`;
  return `${(minutes / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Std`;
}
const pct = (f: number) => `${(f * 100).toFixed(0)}%`;

/** Erwarteter Auszahlungs-Faktor (RTP) eines Plinko-Boards als Anteil vom Einsatz:
 *  Σ binom(n,k)/2^n × mult[k] (n = Reihen = multipliers.length − 1). <1 = Hausvorteil. */
function plinkoRtp(multipliers: number[]): number {
  const n = multipliers.length - 1;
  if (n < 1) return 0;
  const denom = Math.pow(2, n);
  let coeff = 1; // C(n,0)
  let ev = 0;
  for (let k = 0; k <= n; k++) {
    ev += (coeff / denom) * (multipliers[k] ?? 0);
    coeff = (coeff * (n - k)) / (k + 1);
  }
  return ev;
}
const SNAKE_MODE_KEYS = ["x1", "x2", "grind", "farm"] as const;
type SnakeModeKey = (typeof SNAKE_MODE_KEYS)[number];

/**
 * Balance-Cockpit: zentrale Übersicht ALLER Werte, Preise, Auszahlungen und
 * Belohnungen der Seite + Verdienst-vs-Preis-Analyse ("wie lange spielen für
 * X"). Editiert NICHT selbst — jeder Eintrag springt per onJump zur exakten
 * Stelle im jeweiligen Editor.
 */
export function BalanceCockpit({
  onJump,
  items,
  caseTiers,
  mineConfig,
  snakeConfig,
  donConfig,
  plinkoConfig,
  streakConfig,
  shopSettings,
  xpConfig,
  battlePasses,
  monsterTypes,
  parkourConfig,
}: {
  onJump: (tab: Tab, anchor?: string) => void;
  items: ItemRow[];
  caseTiers: CaseTierRow[];
  mineConfig: MineConfig;
  snakeConfig: SnakeConfig;
  donConfig: DonConfig;
  plinkoConfig: PlinkoConfig;
  streakConfig: StreakConfig;
  shopSettings: ShopSettings;
  xpConfig: XpConfig;
  battlePasses: BattlePass[];
  monsterTypes: MonsterTypeConfig[];
  parkourConfig: ParkourConfig;
}) {
  const sound = useSoundManager();
  const [snap, setSnap] = useState<{ abilities: BalancePriceRow[]; nameStyles: BalancePriceRow[]; badges: BalancePriceRow[]; vouchers: BalancePriceRow[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getBalanceSnapshot()
      .then((r) => { if (alive) setSnap(r); })
      .catch(() => { if (alive) setSnap({ abilities: [], nameStyles: [], badges: [], vouchers: [] }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // ── Verdienst-Baselines ───────────────────────────────────────────────────
  const mineRates = mineConfig.levels.map((l) => l.crPerHour).filter((n) => n > 0);
  const mineMax = mineRates.length ? Math.max(...mineRates) : 1;
  const mineMin = mineRates.length ? Math.min(...mineRates) : 1;

  const [ref, setRef] = useState<"mineMax" | "mineMin">("mineMax");
  const refRate = ref === "mineMax" ? mineMax : mineMin;
  const refLabel = ref === "mineMax" ? "Mine (Max-Lvl)" : "Mine (Lvl 1)";

  const [snakeRef, setSnakeRef] = useState<SnakeModeKey>("x1");
  const snakeCrApple = snakeConfig[snakeRef].creditsPerApple || 1;

  const minutesFor = (price: number) => (price / refRate) * 60;
  const applesFor = (price: number) => Math.ceil(price / snakeCrApple);

  const plinkoMaxMult = useMemo(
    () => Math.max(0, ...plinkoConfig.riskLevels.flatMap((r) => r.multipliers ?? [])),
    [plinkoConfig]
  );

  // ── Preis-Listen (Kosten — Grind-Spalten sinnvoll) ─────────────────────────
  const priceLists = useMemo(() => {
    const itemRows: PriceEntry[] = items
      .map((i) => ({ id: i.id, name: i.name, rarity: i.rarity, price: i.price_cr, jumpTab: "items", jumpAnchor: `item-row-${i.id}` }))
      .sort((a, b) => b.price - a.price);
    const abilityRows: PriceEntry[] = (snap?.abilities ?? [])
      .map((a) => ({ id: a.key, name: a.name, rarity: a.rarity, price: a.price, jumpTab: "givables", jumpAnchor: `ability-row-${a.key}` }))
      .sort((a, b) => b.price - a.price);
    const styleRows: PriceEntry[] = (snap?.nameStyles ?? [])
      .map((s) => ({ id: s.key, name: s.name, rarity: s.rarity, price: s.price, jumpTab: "namestyles" }))
      .sort((a, b) => b.price - a.price);
    const caseRows: PriceEntry[] = caseTiers
      .map((c) => ({ id: c.id, name: `${c.group_label ? c.group_label + " · " : ""}${c.label}`, rarity: "selten", price: c.price, jumpTab: "economy" }))
      .sort((a, b) => b.price - a.price);
    const badgeRows: PriceEntry[] = (snap?.badges ?? [])
      .map((b) => ({ id: b.key, name: b.name, rarity: b.rarity, price: b.price, jumpTab: "badges" }))
      .sort((a, b) => b.price - a.price);
    const voucherRows: PriceEntry[] = (snap?.vouchers ?? [])
      .map((v) => ({ id: v.key, name: v.name, rarity: v.rarity, price: v.price, jumpTab: "givables" }))
      .sort((a, b) => b.price - a.price);
    const bpRows: PriceEntry[] = battlePasses
      .map((p) => ({ id: p.id, name: `${p.name}${p.seasonLabel ? ` · ${p.seasonLabel}` : ""}`, rarity: "mythisch", price: Number(p.priceCr ?? 0), jumpTab: "battlepass" }))
      .sort((a, b) => b.price - a.price);
    // Upgrade-Kosten: Mine-Level-Upgrades + DON-Upgrade-Stufen
    const upgradeRows: PriceEntry[] = [
      ...mineConfig.levels
        .filter((l) => l.upgradeCost != null && l.upgradeCost > 0)
        .map((l) => ({ id: `mine-up-${l.level}`, name: `Mine → Lvl ${l.level + 1}`, rarity: "normal", price: Number(l.upgradeCost ?? 0), jumpTab: "games", jumpAnchor: undefined })),
      ...(donConfig.upgradeTiers ?? []).map((t) => ({ id: `don-up-${t.tier}`, name: `DON · ${t.name}`, rarity: "selten", price: Number(t.costCr ?? 0), jumpTab: "games", jumpAnchor: undefined })),
    ].sort((a, b) => b.price - a.price);
    return { itemRows, abilityRows, styleRows, caseRows, badgeRows, voucherRows, bpRows, upgradeRows };
  }, [items, caseTiers, snap, battlePasses, mineConfig, donConfig]);

  // ── Einnahmen / Auszahlungen / Belohnungen (kein Grind — sind Einnahmen) ───
  const incomeLists = useMemo(() => {
    // Spiel-Auszahlungen
    const gameRows: IncomeEntry[] = [];
    for (const k of SNAKE_MODE_KEYS) {
      const m = snakeConfig[k];
      gameRows.push({
        id: `snake-${k}`,
        name: `Snake · ${m.label}`,
        value: `${fmtCr(m.creditsPerApple)} CR/Apfel`,
        detail: `Tageslimit ${m.dailyCrLimit != null ? `${fmtCr(m.dailyCrLimit)} CR` : "∞"} · Bonus +${fmtCr(m.bonusCrFlat)} · golden ${m.goldenAppleCrMultiplier}×`,
        jumpTab: "games",
      });
    }
    const plinkoLevels = plinkoConfig.riskLevels.map((r) => ({ label: r.label, rtp: plinkoRtp(r.multipliers ?? []) }));
    const pRtps = plinkoLevels.map((l) => l.rtp).filter((n) => n > 0);
    const pMin = pRtps.length ? Math.min(...pRtps) : 0;
    const pMax = pRtps.length ? Math.max(...pRtps) : 0;
    gameRows.push({
      id: "plinko",
      name: "Plinko",
      value: pRtps.length ? `RTP ${pct(pMin)}–${pct(pMax)}` : `Einsatz ab ${fmtCr(plinkoConfig.minBetCr)} CR`,
      detail: `${plinkoLevels.map((l) => `${l.label} ${pct(l.rtp)}`).join(" · ")} · Einsatz ab ${fmtCr(plinkoConfig.minBetCr)} CR · max ${plinkoMaxMult}×`,
      jumpTab: "games",
    });
    const donRtp = 2 * (donConfig.winChance ?? 0.5);
    gameRows.push({
      id: "don",
      name: "Double or Nothing",
      value: `RTP ${pct(donRtp)}`,
      detail: `Gewinnchance ${Math.round((donConfig.winChance ?? 0.5) * 100)}% · EV ${donRtp >= 1 ? "+" : ""}${pct(donRtp - 1)} · Einsatz ${fmtCr(donConfig.minBet)}–${donConfig.maxBet != null ? fmtCr(donConfig.maxBet) : "∞"} CR`,
      jumpTab: "games",
    });
    for (const l of mineConfig.levels) {
      gameRows.push({
        id: `mine-${l.level}`,
        name: `Mine · Lvl ${l.level}`,
        value: `${fmtCr(l.crPerHour)} CR/Std`,
        detail: `Speicher ${l.maxStorageHours}h · Upgrade ${l.upgradeCost != null ? `${fmtCr(l.upgradeCost)} CR` : "—"}`,
        jumpTab: "games",
      });
    }

    // XP-/Level-Belohnungen
    const xpRows: IncomeEntry[] = [];
    const s = xpConfig.sources;
    const xpSrc: Array<[string, number]> = [
      ["Mine /100 CR", s.mine_collect_per_100cr],
      ["Streak /Tag", s.streak_per_day],
      ["Snake /Punkt", s.snake_per_score_point],
      ["Plinko /Wurf", s.plinko_per_drop],
      ["DON-Sieg", s.don_win],
      ["Case öffnen", s.case_open],
      ["World-Kill", s.world_kill],
      ["BP-Stufe", s.bp_tier_claim],
      ["PvP-Kill", s.pvp_kill],
    ];
    for (const [label, val] of xpSrc) {
      xpRows.push({ id: `xp-${label}`, name: `XP: ${label}`, value: `${fmtCr(val)} XP`, jumpTab: "level_xp" });
    }
    for (const lvl of xpConfig.levels ?? []) {
      const cr = (lvl.rewards ?? []).filter((r) => r.type === "credits").reduce((acc, r) => acc + Number(r.amount ?? 0), 0);
      if (cr > 0) {
        xpRows.push({ id: `lvl-${lvl.level}`, name: `Level ${lvl.level}${lvl.title ? ` · ${lvl.title}` : ""}`, value: `${fmtCr(cr)} CR`, detail: `ab ${fmtCr(lvl.xpRequired)} XP`, jumpTab: "level_xp" });
      }
    }

    // Monster-Belohnungen
    const monsterRows: IncomeEntry[] = monsterTypes.map((m) => ({
      id: m.id,
      name: m.name,
      value: `${fmtCr(m.rewardMin)}–${fmtCr(m.rewardMax)} CR`,
      detail: `HP ${fmtCr(m.health)} · Schaden ${fmtCr(m.attackDamage)} · Spawn-Gewicht ${m.spawnWeight}`,
      jumpTab: "monsters" as Tab,
    }));

    // Streak / tägliche Belohnungen
    const streakRows: IncomeEntry[] = [
      { id: "streak-base", name: "Streak · Tag 1", value: `${fmtCr(streakConfig.baseReward)} CR`, detail: `+${fmtCr(streakConfig.dailyIncrement)} CR / weiterer Tag`, jumpTab: "streak" },
      { id: "streak-max", name: "Streak · Maximum/Tag", value: `${fmtCr(streakConfig.maxReward)} CR`, detail: `Wochenende ×${streakConfig.weekendMultiplier}`, jumpTab: "streak" },
      { id: "streak-milestone", name: "Streak · Meilenstein-Bonus", value: `${fmtCr(streakConfig.milestoneBonus)} CR`, detail: streakConfig.milestoneInterval > 0 ? `alle ${streakConfig.milestoneInterval} Tage` : "deaktiviert", jumpTab: "streak" },
    ];

    // Parkour · pro Map: Credits/XP am Ziel + Bestzeit-Bonus (Einnahme-Quelle).
    for (const baseMap of PARKOUR_MAPS) {
      const m = resolveMap(baseMap, parkourConfig);
      gameRows.push({
        id: `parkour-${m.id}`,
        name: `Parkour · ${m.name}`,
        value: `${fmtCr(m.rewardCredits)} CR / Ziel`,
        detail: `+${fmtCr(m.rewardXp)} XP · Bestzeit-Bonus +${fmtCr(m.bestBonusCredits)} CR · ${m.difficulty}`,
        jumpTab: "parkour",
        jumpAnchor: `parkour-map-${m.id}`,
      });
    }

    return { gameRows, xpRows, monsterRows, streakRows };
  }, [snakeConfig, plinkoConfig, plinkoMaxMult, donConfig, mineConfig, xpConfig, monsterTypes, streakConfig, parkourConfig]);

  const PriceSection = ({ title, rows, emptyHint }: { title: string; rows: PriceEntry[]; emptyHint?: string }) => (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.015]">
      <p className="border-b border-white/[0.06] px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-purple-300/80">
        {title} <span className="text-zinc-600">({rows.length})</span>
      </p>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-xs text-zinc-500">{emptyHint ?? "Keine Einträge."}</p>
      ) : (
        <div className="max-h-[360px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0f0e18]/95 text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-1.5 text-left font-semibold">Name</th>
                <th className="px-2 py-1.5 text-right font-semibold">Preis</th>
                <th className="px-2 py-1.5 text-right font-semibold"><span className="inline-flex items-center gap-1"><Pickaxe className="h-3 w-3" />{refLabel}</span></th>
                <th className="px-2 py-1.5 text-right font-semibold"><span className="inline-flex items-center gap-1"><Apple className="h-3 w-3" />Snake</span></th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/[0.04] hover:bg-white/[0.025]">
                  <td className="px-4 py-1.5">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: RARITY_COL[r.rarity] ?? "#9ca3af" }} />
                      <span className="text-zinc-200">{r.name}</span>
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-zinc-100">{r.price > 0 ? fmtCr(r.price) : "—"}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-400">{r.price > 0 ? fmtMine(minutesFor(r.price)) : "—"}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-400">{r.price > 0 ? `${fmtCr(applesFor(r.price))} 🍎` : "—"}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      onMouseEnter={sound.hover}
                      onClick={() => { sound.click(); onJump(r.jumpTab, r.jumpAnchor); }}
                      title="Zum Editor springen"
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-zinc-400 hover:border-purple-400/60 hover:text-purple-200"
                    >
                      Bearbeiten <ArrowUpRight className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const IncomeSection = ({ title, rows, emptyHint }: { title: string; rows: IncomeEntry[]; emptyHint?: string }) => (
    <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.015]">
      <p className="border-b border-white/[0.06] px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-emerald-300/80">
        <span className="inline-flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" />{title}</span> <span className="text-zinc-600">({rows.length})</span>
      </p>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-xs text-zinc-500">{emptyHint ?? "Keine Einträge."}</p>
      ) : (
        <div className="max-h-[360px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0f0e18]/95 text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-1.5 text-left font-semibold">Quelle</th>
                <th className="px-2 py-1.5 text-right font-semibold"><span className="inline-flex items-center gap-1"><Coins className="h-3 w-3" />Einnahme</span></th>
                <th className="px-2 py-1.5 text-left font-semibold">Details</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/[0.04] hover:bg-white/[0.025]">
                  <td className="px-4 py-1.5 text-zinc-200">{r.name}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-emerald-200">{r.value}</td>
                  <td className="px-2 py-1.5 text-left text-[11px] text-zinc-500">{r.detail ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      onMouseEnter={sound.hover}
                      onClick={() => { sound.click(); onJump(r.jumpTab, r.jumpAnchor); }}
                      title="Zum Editor springen"
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-zinc-400 hover:border-emerald-400/60 hover:text-emerald-200"
                    >
                      Bearbeiten <ArrowUpRight className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div className="mb-6 flex flex-col gap-4">
      {/* Verdienst-Baseline */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-300/80">Verdienst-Baseline</p>
            <p className="mt-1 text-sm text-zinc-300">
              Mine <span className="font-mono text-zinc-100">{fmtCr(mineMin)}</span> → <span className="font-mono text-zinc-100">{fmtCr(mineMax)}</span> CR/Std ·
              {" "}Snake {snakeConfig[snakeRef].label} <span className="font-mono text-zinc-100">{fmtCr(snakeCrApple)}</span> CR/Apfel ·
              {" "}Plinko ab <span className="font-mono text-zinc-100">{fmtCr(plinkoConfig.minBetCr)}</span> CR ·
              {" "}DON <span className="font-mono text-zinc-100">{fmtCr(donConfig.minBet)}</span>–{donConfig.maxBet != null ? <span className="font-mono text-zinc-100">{fmtCr(donConfig.maxBet)}</span> : "∞"} CR ·
              {" "}Streak <span className="font-mono text-zinc-100">{fmtCr(streakConfig.baseReward)}</span> → <span className="font-mono text-zinc-100">{fmtCr(streakConfig.maxReward)}</span> CR/Tag
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              Mine-Referenz:
              <select
                value={ref}
                onChange={(e) => setRef(e.target.value as "mineMax" | "mineMin")}
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-zinc-100 outline-none focus:border-emerald-400/60"
              >
                <option value="mineMax">Mine Max-Level</option>
                <option value="mineMin">Mine Level 1</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              Snake-Modus:
              <select
                value={snakeRef}
                onChange={(e) => setSnakeRef(e.target.value as SnakeModeKey)}
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-zinc-100 outline-none focus:border-emerald-400/60"
              >
                {SNAKE_MODE_KEYS.map((k) => (
                  <option key={k} value={k}>{snakeConfig[k].label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-500">
          Die Grind-Spalten (Preis-Sektionen) zeigen, wie lange man für einen Preis grinden muss (passive Mine bzw. Snake-Äpfel des gewählten Modus). Einnahme-Sektionen zeigen Auszahlungen/Belohnungen — dort ist die Grind-Spalte sinnlos und entfällt.
          {" "}<span className="text-amber-300/80">Plinko &amp; DON zeigen den echten RTP</span> (erwartete Auszahlung pro Einsatz, binomial bzw. aus der Gewinnchance gerechnet) — <span className="font-mono">100 %</span> = fair, darunter = Hausvorteil, darüber = Spieler im Vorteil.
        </p>
      </div>

      {/* Shop-Multiplikatoren */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-amber-300/80">Shop-Auto-Preis-Multiplikatoren</p>
          <p className="mt-1 text-sm text-zinc-300">
            Auto-Generierung {shopSettings.autoGenerateEnabled ? "aktiv" : "aus"} ·
            {" "}Aufschlag <span className="font-mono text-zinc-100">×{shopSettings.autoGeneratePriceMultiplierMin ?? 0}</span> → <span className="font-mono text-zinc-100">×{shopSettings.autoGeneratePriceMultiplierMax ?? 0}</span> ·
            {" "}<span className="font-mono text-zinc-100">{fmtCr(shopSettings.autoGenerateItemCount ?? 0)}</span> Items/Rotation
          </p>
        </div>
        <button
          onMouseEnter={sound.hover}
          onClick={() => { sound.click(); onJump("shop"); }}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-zinc-400 hover:border-amber-400/60 hover:text-amber-200"
        >
          Bearbeiten <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 px-1 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Daten werden geladen…</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {/* Preise / Kosten */}
          <PriceSection title="Items" rows={priceLists.itemRows} />
          <PriceSection title="Fähigkeits-Gutscheine (Shop-Preis)" rows={priceLists.abilityRows} emptyHint="Kein Fähigkeits-Gutschein mit Shop-Preis." />
          <PriceSection title="Name-Styles (Shop-Preis)" rows={priceLists.styleRows} emptyHint="Keine Name-Styles mit Shop-Preis." />
          <PriceSection title="Case-Tiers (Preis)" rows={priceLists.caseRows} />
          <PriceSection title="Battle-Pass (Premium-Preis)" rows={priceLists.bpRows} emptyHint="Keine Battle-Pässe." />
          <PriceSection title="Upgrade-Kosten (Mine + DON)" rows={priceLists.upgradeRows} emptyHint="Keine Upgrade-Kosten." />
          <PriceSection title="Badges" rows={priceLists.badgeRows} emptyHint="Keine Badges." />
          <PriceSection title="Gutschein-Werte (enthaltene Credits)" rows={priceLists.voucherRows} emptyHint="Keine Gutscheine." />

          {/* Einnahmen / Auszahlungen / Belohnungen */}
          <IncomeSection title="Spiel-Auszahlungen" rows={incomeLists.gameRows} />
          <IncomeSection title="XP- & Level-Belohnungen" rows={incomeLists.xpRows} />
          <IncomeSection title="Monster-Belohnungen" rows={incomeLists.monsterRows} emptyHint="Keine Monster." />
          <IncomeSection title="Streak / tägliche Belohnungen" rows={incomeLists.streakRows} />
        </div>
      )}
    </div>
  );
}
