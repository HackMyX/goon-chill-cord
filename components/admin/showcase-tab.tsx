"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, ChevronLeft, ChevronRight, Box, Gift, Sparkles, Type, Loader2, Swords } from "lucide-react";
import { BpRewardView3D } from "@/components/battlepass/bp-reward-3d";
import { RewardCardCanvas } from "@/components/rewards/reward-card-canvas";
import { CaseDropView } from "@/components/cases/case-item-3d";
import { BonusCard } from "@/components/rewards/bonus-card";
import { AbilityVoucherCard } from "@/components/rewards/ability-voucher-card";
import { StyledUsername } from "@/components/ui/styled-username";
import { BONUS_CARD_THEMES, type BonusCardRarity } from "@/lib/bonus-card-themes";
import { NAME_STYLES } from "@/lib/name-styles";
import { ABILITY_EFFECT_META, ABILITY_CATEGORY_LABELS, type AbilityDefinition, type AbilityEffectUnit } from "@/lib/abilities";
import { getAllAbilityDefinitions } from "@/lib/actions/abilities";
import { getAllGalleryItems, type GalleryItem } from "@/lib/actions/admin";
import { WORN_TYPES } from "@/lib/case-display-config";
import type { BonusGame } from "@/lib/bonus-games";

// Effektwert nach Einheit lesbar machen (nur wenn ein Wert existiert).
function formatEffectValue(value: number, unit: AbilityEffectUnit): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  switch (unit) {
    case "percent": return `+${Math.round(value * 100)}%`;
    case "chance":  return `${Math.round(value * 100)}%`;
    case "hours":   return `${value} h`;
    case "flat":    return `+${value}`;
    case "flag":    return value ? "an" : null;
    case "value":   return `${value}`;
    default:        return `${value}`;
  }
}

// Kleines Info-Badge — wird NUR gerendert, wenn ein Wert vorhanden ist.
function InfoBadge({ label, value, tone = "zinc" }: { label?: string; value: string | number | null | undefined; tone?: "zinc" | "amber" | "fuchsia" | "emerald" | "sky" }) {
  if (value === null || value === undefined || value === "" || (typeof value === "number" && Number.isNaN(value))) return null;
  const tones: Record<string, string> = {
    zinc: "border-white/10 bg-white/[0.04] text-zinc-300",
    amber: "border-amber-400/30 bg-amber-500/10 text-amber-300",
    fuchsia: "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-300",
    emerald: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
    sky: "border-sky-400/30 bg-sky-500/10 text-sky-300",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${tones[tone]}`}>
      {label && <span className="opacity-60">{label}</span>}{value}
    </span>
  );
}

const RARITY_TONE: Record<string, "zinc" | "sky" | "fuchsia" | "amber" | "emerald"> = {
  normal: "zinc", selten: "sky", episch: "fuchsia", mythisch: "fuchsia", ultra: "amber",
};

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

type Category = "rewards3d" | "items" | "bonus" | "abilities" | "namestyles";

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
  const [itemGender, setItemGender] = useState<"m" | "w">("m");
  const galleryRef = useRef<HTMLDivElement>(null);

  const rewardVariants = useMemo(buildRewardVariants, []);
  const bonusVariants = useMemo(() => {
    const themes = Object.values(BONUS_CARD_THEMES);
    const out: { key: string; theme: string; rarity: BonusCardRarity; game: BonusGame }[] = [];
    themes.forEach((t) => RARITIES.forEach((r) => out.push({ key: `${t.id}-${r}`, theme: t.id, rarity: r, game: "plinko" })));
    return out;
  }, []);
  const nameStyleVariants = useMemo(() => Object.values(NAME_STYLES), []);

  // ECHTE Fähigkeiten (lazy laden) → echte Effekt-Werte als Info-Badges.
  const [abilityDefs, setAbilityDefs] = useState<AbilityDefinition[] | null>(null);
  const [loadingAbilities, setLoadingAbilities] = useState(false);
  useEffect(() => {
    if (cat !== "abilities" || abilityDefs || loadingAbilities) return;
    setLoadingAbilities(true);
    getAllAbilityDefinitions().then((d) => setAbilityDefs(d)).catch(() => setAbilityDefs([])).finally(() => setLoadingAbilities(false));
  }, [cat, abilityDefs, loadingAbilities]);

  // ECHTE Items (lazy laden) → AP/DMG/Perk/Schild als Info-Badges (nur was existiert).
  const [itemDefs, setItemDefs] = useState<GalleryItem[] | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);
  useEffect(() => {
    if (cat !== "items" || itemDefs || loadingItems) return;
    setLoadingItems(true);
    getAllGalleryItems().then((d) => setItemDefs(d)).catch(() => setItemDefs([])).finally(() => setLoadingItems(false));
  }, [cat, itemDefs, loadingItems]);

  const total =
    cat === "rewards3d" ? rewardVariants.length :
    cat === "items" ? (itemDefs?.length ?? 0) :
    cat === "bonus" ? bonusVariants.length :
    cat === "abilities" ? (abilityDefs?.length ?? 0) :
    nameStyleVariants.length;

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const start = safePage * PAGE_SIZE;
  const uses3D = cat !== "namestyles";

  function switchCat(c: Category) { setCat(c); setPage(0); }

  const CATS: { key: Category; label: string; icon: React.ReactNode }[] = [
    { key: "rewards3d", label: "Belohnungen (3D)", icon: <Box className="h-4 w-4" /> },
    { key: "items", label: "Items (AP/DMG)", icon: <Swords className="h-4 w-4" /> },
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
        Hier siehst du <strong>alles in allen Varianten</strong> auf einen Blick — 3D-Belohnungsmodelle, echte
        Items (mit AP/DMG/Perk), Bonus- und Fähigkeits-Karten (je Theme/Seltenheit) und alle Name-Styles. So prüfst du schnell, ob wirklich
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
                <span className="text-center text-[10px] font-semibold leading-tight text-zinc-400">{REWARD_TYPE_LABEL[v.rewardType] ?? (v.rewardType === "game_bonus" ? "Spiel-Bonus" : v.rewardType === "ability" ? "Fähigkeit" : v.rewardType)}</span>
                {/* Info-Badges — nur was existiert */}
                <div className="flex flex-wrap justify-center gap-1">
                  <InfoBadge value={v.rarity} tone={RARITY_TONE[v.rarity]} />
                  {v.creditsAmount ? <InfoBadge label="" value={`${v.creditsAmount.toLocaleString("de-DE")} CR`} tone="amber" /> : null}
                  {v.game ? <InfoBadge value={v.game} tone="sky" /> : null}
                  {v.effect ? <InfoBadge value={v.effect} tone="emerald" /> : null}
                </div>
              </div>
            ))}
          </div>
        )}

        {cat === "items" && (
          loadingItems ? (
            <div className="flex items-center gap-2 py-10 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Lade Items…</div>
          ) : (itemDefs?.length ?? 0) === 0 ? (
            <p className="py-10 text-sm text-zinc-500">Keine Items gefunden.</p>
          ) : (
            <>
            {/* Geschlecht der Vorschau — so prüfst du, dass z.B. Haare für Frauen feminin aussehen */}
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[11px] font-semibold text-zinc-500">Vorschau-Geschlecht:</span>
              {(["m", "w"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setItemGender(g)}
                  className={`rounded-lg border px-3 py-1 text-xs font-bold transition-colors ${
                    itemGender === g ? "border-fuchsia-400/60 bg-fuchsia-500/20 text-fuchsia-200" : "border-white/10 bg-white/[0.02] text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {g === "m" ? "♂ Männlich" : "♀ Weiblich"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {(itemDefs ?? []).slice(start, start + PAGE_SIZE).map((it, i) => (
                <div key={it.id} className="flex flex-col items-center gap-1.5 rounded-xl border border-white/8 bg-black/20 p-2">
                  <div className="relative h-36 w-full">
                    <CaseDropView
                      subject={{ kind: "item", item: { id: it.id, name: it.name, rarity: it.rarity, type: it.type, damage: it.damage } }}
                      viewIndex={i}
                      character={WORN_TYPES.has(it.type)}
                      gender={itemGender}
                      lazy
                      rootRef={galleryRef}
                    />
                  </div>
                  <span className="line-clamp-1 text-center text-[10px] font-semibold leading-tight text-zinc-300">{it.name}</span>
                  {/* Info-Badges — nur Stats, die wirklich existieren */}
                  <div className="flex flex-wrap justify-center gap-1">
                    <InfoBadge value={it.rarity} tone={RARITY_TONE[it.rarity] ?? "zinc"} />
                    <InfoBadge value={it.type} />
                    {it.damage && it.damage > 0 ? <InfoBadge label="DMG:" value={it.damage} tone="amber" /> : null}
                    {it.armor > 0 ? <InfoBadge label="AP:" value={it.armor} tone="sky" /> : null}
                    {it.perkType && it.perkType !== "none" ? <InfoBadge label="Perk:" value={it.perkMagnitude > 0 ? `${it.perkType} +${it.perkMagnitude}` : it.perkType} tone="emerald" /> : null}
                    {it.shieldHp > 0 ? <InfoBadge label="Schild:" value={it.shieldHp} tone="fuchsia" /> : null}
                  </div>
                </div>
              ))}
            </div>
            </>
          )
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
                <div className="flex flex-wrap justify-center gap-1">
                  <InfoBadge label="Theme:" value={v.theme} />
                  <InfoBadge value={v.rarity} tone={RARITY_TONE[v.rarity]} />
                  <InfoBadge value={v.game} tone="sky" />
                </div>
              </div>
            ))}
          </div>
        )}

        {cat === "abilities" && (
          loadingAbilities ? (
            <div className="flex items-center gap-2 py-10 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Lade Fähigkeiten…</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {(abilityDefs ?? []).slice(start, start + PAGE_SIZE).map((def, i) => {
                const meta = ABILITY_EFFECT_META[def.effectType];
                const effVal = meta ? formatEffectValue(def.effectValue, meta.unit) : null;
                return (
                  <div key={def.key} className="flex flex-col gap-1.5">
                    <AbilityVoucherCard
                      name={def.name}
                      description={def.description}
                      icon={def.icon}
                      category={ABILITY_CATEGORY_LABELS[def.category]}
                      cardTheme={def.cardTheme}
                      cardRarity={def.cardRarity}
                      abilityRarity={def.rarity}
                      effectCategory={def.category}
                      view3d={{ index: i }}
                      animateEntry={false}
                    />
                    {/* Echte Info-Badges — nur was wirklich gesetzt ist */}
                    <div className="flex flex-wrap gap-1 px-1">
                      {meta ? <InfoBadge label="Effekt:" value={meta.label} tone="fuchsia" /> : null}
                      {effVal ? <InfoBadge label="Wert:" value={effVal} tone="emerald" /> : null}
                      <InfoBadge value={def.rarity} tone={RARITY_TONE[def.rarity] ?? "zinc"} />
                      <InfoBadge value={ABILITY_CATEGORY_LABELS[def.category]} tone="sky" />
                      {def.availableInShop && def.shopPriceCr > 0 ? <InfoBadge label="Shop:" value={`${def.shopPriceCr.toLocaleString("de-DE")} CR`} tone="amber" /> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {cat === "namestyles" && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {nameStyleVariants.slice(start, start + PAGE_SIZE).map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
                <StyledUsername name="SpielerName" styleDef={s} size="md" />
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  <InfoBadge value={s.rarity} tone={RARITY_TONE[s.rarity] ?? "zinc"} />
                  <InfoBadge value={s.category} tone={s.category === "animated" ? "fuchsia" : "zinc"} />
                </div>
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
