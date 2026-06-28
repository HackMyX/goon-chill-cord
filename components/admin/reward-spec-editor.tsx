"use client";

import { Trash2, Plus } from "lucide-react";
import type { RewardSpec, BonusGame } from "@/lib/rewards-grant";
import { KeySelect } from "@/components/admin/key-select";
import {
  BONUS_CARD_THEME_LIST, BONUS_CARD_RARITY_LIST,
  DEFAULT_BONUS_CARD_THEME, DEFAULT_BONUS_CARD_RARITY,
} from "@/lib/bonus-card-themes";
import { BonusCard } from "@/components/rewards/bonus-card";

/**
 * Wiederverwendbarer Editor für eine Liste kanonischer Belohnungen (RewardSpec[]).
 * Wird überall genutzt, wo ein User etwas bekommen kann (Daily Quests, Streak,
 * Battle Pass, …), damit ALLE Reward-Typen einheitlich konfigurierbar sind.
 * Vergeben werden die Specs über grantReward() (lib/rewards-grant.ts).
 */

const INP = "rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-purple-400/60";

export function RewardSpecEditor({
  value,
  onChange,
  label,
}: {
  value: RewardSpec[];
  onChange: (next: RewardSpec[]) => void;
  label?: string;
}) {
  const rows = value ?? [];
  const set = (i: number, patch: Partial<RewardSpec>) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, { type: "credits", amount: 100 }]);
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</span>}
      {rows.length === 0 && <span className="text-xs text-zinc-600">Keine zusätzlichen Belohnungen.</span>}
      {rows.map((r, idx) => (
        <div key={idx} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/5 bg-black/20 p-2">
          <select value={r.type} onChange={(e) => set(idx, { type: e.target.value as RewardSpec["type"] })} className={INP}>
            <option value="credits">Credits</option>
            <option value="xp">XP</option>
            <option value="item">Item (fest)</option>
            <option value="random_item">Item (zufällig)</option>
            <option value="ability">Fähigkeit</option>
            <option value="badge">Badge</option>
            <option value="name_style">Name-Style</option>
            <option value="case_voucher">Gutschein (Case)</option>
            <option value="game_bonus">Spiel-Bonus</option>
          </select>

          {(r.type === "credits" || r.type === "xp") && (
            <input type="number" value={r.amount ?? 0} onChange={(e) => set(idx, { amount: Number(e.target.value) })} placeholder={r.type === "xp" ? "XP" : "1000"} className={`w-28 ${INP}`} />
          )}

          {r.type === "item" && (
            <>
              <KeySelect kind="item" value={r.itemId} onChange={(v) => set(idx, { itemId: v })} className={`flex-1 ${INP}`} placeholder="Item wählen…" />
              <input type="number" min={1} value={r.amount ?? 1} onChange={(e) => set(idx, { amount: Number(e.target.value) })} placeholder="Anzahl" className={`w-20 ${INP}`} />
            </>
          )}

          {r.type === "random_item" && (
            <>
              <select value={r.itemRarity ?? "selten"} onChange={(e) => set(idx, { itemRarity: e.target.value })} className={INP}>
                <option value="normal">Normal</option><option value="selten">Selten</option><option value="mythisch">Mythisch</option><option value="ultra">Ultra</option>
              </select>
              <input type="number" min={1} value={r.amount ?? 1} onChange={(e) => set(idx, { amount: Number(e.target.value) })} placeholder="Anzahl" className={`w-20 ${INP}`} />
            </>
          )}

          {(r.type === "ability" || r.type === "badge" || r.type === "name_style") && (
            <KeySelect
              kind={r.type}
              value={r.type === "ability" ? r.abilityKey : r.type === "badge" ? r.badgeKey : r.styleKey}
              onChange={(v) => {
                if (r.type === "ability") set(idx, { abilityKey: v });
                else if (r.type === "badge") set(idx, { badgeKey: v });
                else set(idx, { styleKey: v });
              }}
              className={`flex-1 ${INP}`}
              placeholder={r.type === "ability" ? "Fähigkeit wählen…" : r.type === "badge" ? "Badge wählen…" : "Name-Style wählen…"}
            />
          )}

          {r.type === "case_voucher" && (
            <>
              <select value={r.voucherMode ?? "rarity"} onChange={(e) => set(idx, { voucherMode: e.target.value as "tier" | "rarity" })} className={INP}>
                <option value="rarity">nach Seltenheit</option><option value="tier">fester Case</option>
              </select>
              {(r.voucherMode ?? "rarity") === "rarity" ? (
                <select value={r.voucherRarityFloor ?? "selten"} onChange={(e) => set(idx, { voucherRarityFloor: e.target.value as RewardSpec["voucherRarityFloor"] })} className={INP}>
                  <option value="normal">Normal</option><option value="selten">Selten</option><option value="mythisch">Mythisch</option><option value="ultra">Ultra</option>
                </select>
              ) : (
                <KeySelect kind="case_tier" value={r.voucherTierId} onChange={(v) => set(idx, { voucherTierId: v })} className={`flex-1 ${INP}`} placeholder="Case wählen…" />
              )}
              <input type="number" min={0} value={r.durationHours ?? 0} onChange={(e) => set(idx, { durationHours: Number(e.target.value) })} placeholder="Std" title="Gültig (Std, 0=unbegrenzt)" className={`w-16 ${INP}`} />
            </>
          )}

          {r.type === "game_bonus" && (
            <>
              <select value={r.bonusGame ?? "plinko"} onChange={(e) => set(idx, { bonusGame: e.target.value as RewardSpec["bonusGame"] })} className={INP}>
                <option value="plinko">Plinko</option><option value="snake">Snake</option><option value="don">DON</option>
              </select>
              <input type="number" min={1} value={r.amount ?? 1} onChange={(e) => set(idx, { amount: Number(e.target.value) })} placeholder="Züge" className={`w-16 ${INP}`} />
              <input type="number" min={0} value={r.durationHours ?? 0} onChange={(e) => set(idx, { durationHours: Number(e.target.value) })} placeholder="Std" title="Gültig (Std, 0=unbegrenzt)" className={`w-16 ${INP}`} />

              {/* ── Präsentation: wie die aktive Bonus-Karte später im Spiel aussieht ── */}
              <div className="mt-1 flex w-full flex-col gap-3 rounded-lg border border-white/5 bg-black/20 p-2.5 sm:flex-row sm:items-start">
                <div className="flex flex-1 flex-col gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Karten-Darstellung</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={r.cardTheme ?? DEFAULT_BONUS_CARD_THEME}
                      onChange={(e) => set(idx, { cardTheme: e.target.value })}
                      title="Theme der Karte"
                      className={INP}
                    >
                      {BONUS_CARD_THEME_LIST.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                    <select
                      value={r.cardRarity ?? DEFAULT_BONUS_CARD_RARITY}
                      onChange={(e) => set(idx, { cardRarity: e.target.value })}
                      title="Seltenheit (Ribbon)"
                      className={INP}
                    >
                      {BONUS_CARD_RARITY_LIST.map((rr) => (
                        <option key={rr.id} value={rr.id}>{rr.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={r.cardTitle ?? ""}
                      onChange={(e) => set(idx, { cardTitle: e.target.value })}
                      placeholder="Titel (Standard)"
                      className={`flex-1 ${INP}`}
                    />
                    <input
                      value={r.cardSubtitle ?? ""}
                      onChange={(e) => set(idx, { cardSubtitle: e.target.value })}
                      placeholder="Untertitel (Standard)"
                      className={`flex-1 ${INP}`}
                    />
                  </div>
                </div>
                {/* LIVE-VORSCHAU */}
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Live-Vorschau</span>
                  <BonusCard
                    animateEntry={false}
                    preview={{
                      theme: r.cardTheme,
                      rarity: r.cardRarity,
                      title: r.cardTitle,
                      subtitle: r.cardSubtitle,
                      game: (r.bonusGame ?? "plinko") as BonusGame,
                      amount: Math.max(1, r.amount ?? 1),
                      durationHours: r.durationHours,
                    }}
                  />
                </div>
              </div>
            </>
          )}

          <button onClick={() => remove(idx)} className="rounded-lg p-1 text-red-400 hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      <button onClick={add} className="flex w-fit items-center gap-1 rounded-lg bg-purple-600/60 px-2 py-1 text-xs text-white hover:bg-purple-500/80">
        <Plus className="h-3.5 w-3.5" /> Belohnung
      </button>
    </div>
  );
}
