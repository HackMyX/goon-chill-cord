"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Pickaxe, Apple, Loader2 } from "lucide-react";
import { getBalancePrices, type BalancePriceRow } from "@/lib/actions/balance-studio";
import type { ItemRow, CaseTierRow } from "@/components/admin/admin-shell";
import type { MineConfig } from "@/lib/mine-config";
import type { SnakeConfig } from "@/lib/snake-config";
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

function fmtCr(n: number): string {
  return Math.round(n).toLocaleString("de-DE");
}
function fmtMine(minutes: number): string {
  if (!isFinite(minutes) || minutes <= 0) return "—";
  if (minutes < 90) return `${Math.round(minutes)} Min`;
  return `${(minutes / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Std`;
}

/**
 * Balance-Cockpit: zentrale Übersicht ALLER Werte/Preise der Seite + Verdienst-
 * vs-Preis-Analyse ("wie lange spielen für X"). Editiert NICHT selbst — jeder
 * Eintrag springt per onJump zur exakten Stelle im jeweiligen Editor.
 */
export function BalanceCockpit({
  onJump,
  items,
  caseTiers,
  mineConfig,
  snakeConfig,
}: {
  onJump: (tab: Tab, anchor?: string) => void;
  items: ItemRow[];
  caseTiers: CaseTierRow[];
  mineConfig: MineConfig;
  snakeConfig: SnakeConfig;
}) {
  const sound = useSoundManager();
  const [extras, setExtras] = useState<{ abilities: BalancePriceRow[]; nameStyles: BalancePriceRow[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getBalancePrices()
      .then((r) => { if (alive) setExtras(r); })
      .catch(() => { if (alive) setExtras({ abilities: [], nameStyles: [] }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // ── Verdienst-Baselines ───────────────────────────────────────────────────
  const mineRates = mineConfig.levels.map((l) => l.crPerHour).filter((n) => n > 0);
  const mineMax = mineRates.length ? Math.max(...mineRates) : 1;
  const mineMin = mineRates.length ? Math.min(...mineRates) : 1;
  const snakeCrApple = snakeConfig.x1.creditsPerApple || 1;

  const [ref, setRef] = useState<"mineMax" | "mineMin">("mineMax");
  const refRate = ref === "mineMax" ? mineMax : mineMin;
  const refLabel = ref === "mineMax" ? "Mine (Max-Lvl)" : "Mine (Lvl 1)";

  const minutesFor = (price: number) => (price / refRate) * 60;
  const applesFor = (price: number) => Math.ceil(price / snakeCrApple);

  // ── Preis-Listen ──────────────────────────────────────────────────────────
  const lists = useMemo(() => {
    const itemRows: PriceEntry[] = items
      .map((i) => ({ id: i.id, name: i.name, rarity: i.rarity, price: i.price_cr, jumpTab: "items", jumpAnchor: `item-row-${i.id}` }))
      .sort((a, b) => b.price - a.price);
    const abilityRows: PriceEntry[] = (extras?.abilities ?? [])
      .map((a) => ({ id: a.key, name: a.name, rarity: a.rarity, price: a.price, jumpTab: "givables", jumpAnchor: `ability-row-${a.key}` }))
      .sort((a, b) => b.price - a.price);
    const styleRows: PriceEntry[] = (extras?.nameStyles ?? [])
      .map((s) => ({ id: s.key, name: s.name, rarity: s.rarity, price: s.price, jumpTab: "namestyles" }))
      .sort((a, b) => b.price - a.price);
    const caseRows: PriceEntry[] = caseTiers
      .map((c) => ({ id: c.id, name: `${c.group_label ? c.group_label + " · " : ""}${c.label}`, rarity: "selten", price: c.price, jumpTab: "economy" }))
      .sort((a, b) => b.price - a.price);
    return { itemRows, abilityRows, styleRows, caseRows };
  }, [items, caseTiers, extras]);

  const Section = ({ title, rows, emptyHint }: { title: string; rows: PriceEntry[]; emptyHint?: string }) => (
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
                  <td className="px-2 py-1.5 text-right font-mono text-zinc-100">{fmtCr(r.price)}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-400">{fmtMine(minutesFor(r.price))}</td>
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

  return (
    <div className="mb-6 flex flex-col gap-4">
      {/* Verdienst-Baseline */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-300/80">Verdienst-Baseline</p>
            <p className="mt-1 text-sm text-zinc-300">
              Mine <span className="font-mono text-zinc-100">{fmtCr(mineMin)}</span> → <span className="font-mono text-zinc-100">{fmtCr(mineMax)}</span> CR/Std ·
              {" "}Snake Classic <span className="font-mono text-zinc-100">{fmtCr(snakeCrApple)}</span> CR/Apfel
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            Referenz:
            <select
              value={ref}
              onChange={(e) => setRef(e.target.value as "mineMax" | "mineMin")}
              className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-zinc-100 outline-none focus:border-emerald-400/60"
            >
              <option value="mineMax">Mine Max-Level</option>
              <option value="mineMin">Mine Level 1</option>
            </select>
          </label>
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-500">
          Die Spalten zeigen, wie lange man für einen Preis grinden muss (passive Mine bzw. Snake-Äpfel). So siehst du sofort, ob ein Preis fair zum Verdienst steht.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 px-1 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Preise werden geladen…</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Section title="Items" rows={lists.itemRows} />
          <Section title="Fähigkeiten (Shop-Preis)" rows={lists.abilityRows} emptyHint="Keine Fähigkeit mit Shop-Preis." />
          <Section title="Name-Styles (Shop-Preis)" rows={lists.styleRows} emptyHint="Keine Name-Styles mit Shop-Preis." />
          <Section title="Case-Tiers (Preis)" rows={lists.caseRows} />
        </div>
      )}
    </div>
  );
}
