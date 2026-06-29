"use client";

import { useMemo, useRef, useState } from "react";
import { LayoutGrid, ChevronLeft, ChevronRight, Box, Gift, Sparkles, Type } from "lucide-react";
import { BpRewardView3D } from "@/components/battlepass/bp-reward-3d";
import { RewardCardCanvas } from "@/components/rewards/reward-card-canvas";
import { BonusCard } from "@/components/rewards/bonus-card";
import { AbilityVoucherCard } from "@/components/rewards/ability-voucher-card";
import { StyledUsername } from "@/components/ui/styled-username";
import { BONUS_CARD_THEMES, type BonusCardRarity } from "@/lib/bonus-card-themes";
import { NAME_STYLES } from "@/lib/name-styles";
import type { BonusGame } from "@/lib/bonus-games";

// ─────────────────────────────────────────────────────────────────────────────
// Vorschau-Galerie — Admin sieht ALLES in allen Varianten auf einen Blick, um
// schnell zu prüfen, ob alles korrekt aussieht. Max. PAGE_SIZE gleichzeitig
// sichtbar (Paginierung), damit nicht zu viele 3D-Modelle den PC überlasten.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const RARITIES: BonusCardRarity[] = ["normal", "selten", "episch", "mythisch", "ultra"];
const ABILITY_CATS = ["mine", "snake", "plinko", "don", "world", "global"] as const;
const BONUS_GAMES: BonusGame[] = ["plinko", "snake", "don"];

const REWARD_TYPE_LABEL: Record<string, string> = {
  credits: "Credits", random_item: "Zufalls-Item", badge: "Badge", xp_boost: "XP-Boost",
  name_style: "Name-Style", case_voucher: "Case-Gutschein", default: "Sonstiges (Gem)",
};

type Category = "rewards3d" | "bonus" | "abilities" | "namestyles";

interface RewardVariant {
  key: string; label: string; rewardType: string; rarity: string;
  game?: BonusGame; effect?: string; creditsAmount?: number;
}

function buildRewardVariants(): RewardVariant[] {
  const out: RewardVariant[] = [];
  for (const type of ["credits", "random_item", "badge", "xp_boost", "name_style", "case_voucher", "default"]) {
    for (const r of RARITIES) {
      out.push({
        key: `${type}-${r}`, label: `${REWARD_TYPE_LABEL[type]} · ${r}`,
        rewardType: type, rarity: r,
        creditsAmount: type === "credits" ? (RARITIES.indexOf(r) + 1) * 1500 : undefined,
      });
    }
  }
  for (const game of BONUS_GAMES) {
    for (const r of RARITIES) {
      out.push({ key: `gb-${game}-${r}`, label: `Spiel-Bonus ${game} · ${r}`, rewardType: "game_bonus", game, rarity: r });
    }
  }
  for (const cat of ABILITY_CATS) {
    for (const r of RARITIES) {
      out.push({ key: `ab-${cat}-${r}`, label: `Fähigkeit ${cat} · ${r}`, rewardType: "ability", effect: cat, rarity: r });
    }
  }
  return out;
}

export function ShowcaseTab() {
  const [cat, setCat] = useState<Category>("rewards3d");
  const [page, setPage] = useState(0);
  const galleryRef = useRef<HTMLDivElement>(null);

  const rewardVariants = useMemo(buildRewardVariants, []);
  const bonusVariants = useMemo(() => {
    const themes = Object.values(BONUS_CARD_THEMES);
    const out: { key: string; theme: string; rarity: BonusCardRarity; game: BonusGame }[] = [];
    themes.forEach((t) => RARITIES.forEach((r) => out.push({ key: `${t.id}-${r}`, theme: t.id, rarity: r, game: "plinko" })));
    return out;
  }, []);
  const abilityVariants = useMemo(() => {
    const out: { key: string; cat: string; rarity: BonusCardRarity }[] = [];
    ABILITY_CATS.forEach((c) => RARITIES.forEach((r) => out.push({ key: `${c}-${r}`, cat: c, rarity: r })));
    return out;
  }, []);
  const nameStyleVariants = useMemo(() => Object.values(NAME_STYLES), []);

  const total =
    cat === "rewards3d" ? rewardVariants.length :
    cat === "bonus" ? bonusVariants.length :
    cat === "abilities" ? abilityVariants.length :
    nameStyleVariants.length;

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const start = safePage * PAGE_SIZE;
  const uses3D = cat !== "namestyles";

  function switchCat(c: Category) { setCat(c); setPage(0); }

  const CATS: { key: Category; label: string; icon: React.ReactNode }[] = [
    { key: "rewards3d", label: "Belohnungen (3D)", icon: <Box className="h-4 w-4" /> },
    { key: "bonus", label: "Bonus-Karten", icon: <Gift className="h-4 w-4" /> },
    { key: "abilities", label: "Fähigkeits-Karten", icon: <Sparkles className="h-4 w-4" /> },
    { key: "namestyles", label: "Name-Styles", icon: <Type className="h-4 w-4" /> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <LayoutGrid className="h-5 w-5 text-fuchsia-400" />
        <span className="text-base font-extrabold text-zinc-100">Vorschau-Galerie</span>
      </div>
      <p className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/[0.04] px-4 py-3 text-[12px] leading-relaxed text-fuchsia-100/90">
        Hier siehst du <strong>alles in allen Varianten</strong> auf einen Blick — 3D-Belohnungsmodelle, Bonus-
        und Fähigkeits-Karten (je Theme/Seltenheit) und alle Name-Styles. So prüfst du schnell, ob wirklich
        alles korrekt &amp; geil aussieht, ohne irgendwo etwas umbauen zu müssen. Es werden <strong>max. {PAGE_SIZE}
        gleichzeitig</strong> gezeigt, damit dein PC nicht überlastet wird — blättere mit den Seiten-Pfeilen.
      </p>

      {/* Kategorie-Auswahl */}
      <div className="flex flex-wrap gap-2">
        {CATS.map((c) => (
          <button
            key={c.key}
            onClick={() => switchCat(c.key)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
              cat === c.key
                ? "border-fuchsia-400/60 bg-fuchsia-500/20 text-fuchsia-200"
                : "border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/25 hover:text-zinc-200"
            }`}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {/* Seiten-Navigation */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/20 px-4 py-2.5">
        <span className="text-xs text-zinc-400">
          {total} Varianten · Seite <span className="font-bold text-zinc-200">{safePage + 1}</span> / {pages}
          <span className="ml-2 text-zinc-600">(zeigt {Math.min(PAGE_SIZE, total - start)} Stück)</span>
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-300 transition-colors hover:border-white/25 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={safePage >= pages - 1}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-300 transition-colors hover:border-white/25 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Galerie */}
      <div ref={galleryRef} className="relative">
        {cat === "rewards3d" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {rewardVariants.slice(start, start + PAGE_SIZE).map((v, i) => (
              <div key={v.key} className="flex flex-col items-center gap-1.5 rounded-xl border border-white/8 bg-black/20 p-2">
                <div className="relative h-28 w-full">
                  <BpRewardView3D
                    rewardType={v.rewardType}
                    rarity={v.rarity}
                    creditsAmount={v.creditsAmount}
                    game={v.game}
                    effect={v.effect}
                    viewIndex={i}
                  />
                </div>
                <span className="text-center text-[10px] font-semibold leading-tight text-zinc-400">{v.label}</span>
              </div>
            ))}
          </div>
        )}

        {cat === "bonus" && (
          <div className="flex flex-wrap justify-center gap-4">
            {bonusVariants.slice(start, start + PAGE_SIZE).map((v, i) => (
              <div key={v.key} className="flex flex-col items-center gap-1">
                <BonusCard
                  preview={{ theme: v.theme, rarity: v.rarity, game: v.game, amount: (RARITIES.indexOf(v.rarity) + 1) * 3, durationHours: 24 }}
                  animateEntry={false}
                  view3d={{ index: i }}
                />
                <span className="text-[10px] text-zinc-500">{v.theme} · {v.rarity}</span>
              </div>
            ))}
          </div>
        )}

        {cat === "abilities" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {abilityVariants.slice(start, start + PAGE_SIZE).map((v, i) => (
              <AbilityVoucherCard
                key={v.key}
                name={`${v.cat} · ${v.rarity}`}
                description={`Vorschau einer Fähigkeit im Bereich „${v.cat}" mit Seltenheit „${v.rarity}".`}
                category={v.cat}
                cardRarity={v.rarity}
                effectCategory={v.cat}
                view3d={{ index: i }}
                animateEntry={false}
              />
            ))}
          </div>
        )}

        {cat === "namestyles" && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {nameStyleVariants.slice(start, start + PAGE_SIZE).map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
                <StyledUsername name="SpielerName" styleDef={s} size="md" />
                <span className="shrink-0 text-[10px] text-zinc-600">{s.rarity}</span>
              </div>
            ))}
          </div>
        )}

        {/* EINE geteilte 3D-Canvas für die ≤20 sichtbaren Modelle dieser Seite. */}
        {uses3D && <RewardCardCanvas eventSourceRef={galleryRef} zIndex={5} />}
      </div>
    </div>
  );
}
