"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import { usePetConfigs } from "@/lib/pet-config-context";
import { getPetStatsForDisplay } from "@/lib/pets";

const PERK_ICONS: Record<string, string> = {
  speed_boost: "⚡",
  jump_boost: "↑",
  hp_regen_boost: "♥",
};

function getPerkLabel(
  perkType: string,
  labels: { speed: string; jump: string; regen: string }
): string {
  if (perkType === "speed_boost") return labels.speed;
  if (perkType === "jump_boost") return labels.jump;
  if (perkType === "hp_regen_boost") return labels.regen;
  return perkType;
}

const PERK_TOOLTIPS: Record<string, (pct: number) => string> = {
  speed_boost: (pct) =>
    `Tempo-Boost: Erhöht deine Laufgeschwindigkeit dauerhaft um +${pct}%. Amulett und Ring stapeln sich multiplikativ, gemeinsam auf maximal +40% begrenzt.`,
  jump_boost: (pct) =>
    `Sprung-Boost: Erhöht Sprunghöhe und -weite um +${pct}%. Amulett und Ring stapeln sich multiplikativ, gemeinsam auf maximal +40% begrenzt.`,
  hp_regen_boost: (pct) =>
    `HP-Regen-Boost: Erhöht die passive Lebensregeneration um +${pct}%. Die Regen setzt 4 Sekunden nach dem letzten Treffer ein. Amulett und Ring stapeln sich multiplikativ, gemeinsam auf maximal +40% begrenzt.`,
};

// StatBadge renders the tooltip via a portal at document.body level so it
// escapes any parent overflow-hidden boundary (shop cards, wardrobe rows, etc.)
// and is never clipped. Hover state is tracked with React state instead of
// CSS named groups to guarantee exactly one tooltip shows at a time.
function StatBadge({
  badgeClass,
  children,
  tooltip,
}: {
  badgeClass: string;
  children: React.ReactNode;
  tooltip: string;
}) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const spanRef = useRef<HTMLSpanElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  function computePos() {
    if (!spanRef.current) return;
    const rect = spanRef.current.getBoundingClientRect();
    // Clamp tooltip so it never overflows the viewport horizontally
    const panelW = 224; // w-56
    const left = Math.min(
      Math.max(panelW / 2 + 8, rect.left + rect.width / 2),
      window.innerWidth - panelW / 2 - 8
    );
    setPos({ top: rect.top - 8, left });
  }

  function handleMouseEnter() {
    computePos();
    setVisible(true);
  }

  function handleTap(e: React.TouchEvent) {
    e.stopPropagation();
    if (!visible) {
      computePos();
      setVisible(true);
    } else {
      setVisible(false);
    }
  }

  // Dismiss on outside tap
  useEffect(() => {
    if (!visible) return;
    const dismiss = () => setVisible(false);
    document.addEventListener("touchstart", dismiss, { once: true, passive: true });
    return () => document.removeEventListener("touchstart", dismiss);
  }, [visible]);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setVisible(false)}
    >
      <span
        ref={spanRef}
        onTouchStart={handleTap}
        className={`cursor-help rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${badgeClass}`}
      >
        {children}
      </span>
      {mounted &&
        visible &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999] w-56 -translate-x-1/2 -translate-y-full rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-2 text-[11px] leading-relaxed text-zinc-300 shadow-xl"
            style={{ top: pos.top, left: pos.left }}
          >
            {tooltip}
          </div>,
          document.body
        )}
    </div>
  );
}

export interface ItemStats {
  damage?: number | null;
  armor?: number | null;
  perk_type?: string | null;
  perk_magnitude?: number | null;
  shield_hp?: number | null;
  shield_regen_cooldown_sec?: number | null;
  /** Pass item name + type to auto-resolve and show pet combat stats. */
  itemName?: string | null;
  itemType?: string | null;
  /** Item rarity — used to resolve per-rarity pet stats when itemType is "pet". */
  itemRarity?: string | null;
}

/**
 * Renders colored stat badges with rich hover tooltips for every non-zero
 * stat an item has. Returns null for cosmetic-only items so callers never
 * get a blank gap. Sits inside any flex/gap container the caller owns.
 */
export function ItemStatBadges({
  damage,
  armor,
  perk_type,
  perk_magnitude,
  shield_hp,
  shield_regen_cooldown_sec,
  itemName,
  itemType,
  itemRarity,
}: ItemStats) {
  const hasDmg = damage !== null && damage !== undefined && damage > 0;
  const hasArmor = armor !== null && armor !== undefined && armor > 0;
  const hasPerk =
    !!perk_type &&
    perk_type !== "none" &&
    perk_type in PERK_ICONS &&
    perk_magnitude !== null &&
    perk_magnitude !== undefined &&
    perk_magnitude > 0;
  const hasShield = shield_hp !== null && shield_hp !== undefined && shield_hp > 0;
  const hasCooldown =
    hasShield &&
    shield_regen_cooldown_sec !== null &&
    shield_regen_cooldown_sec !== undefined &&
    shield_regen_cooldown_sec > 0;
  const { damageLabel, armorLabel, perkLabels } = useSiteConfig();
  const petConfigs = usePetConfigs();
  const petStats = itemType === "pet" && itemName ? getPetStatsForDisplay(itemName, petConfigs, itemRarity ?? undefined) : null;

  if (!hasDmg && !hasArmor && !hasPerk && !hasShield && !petStats) return null;

  const pct = hasPerk ? Math.round((perk_magnitude as number) * 100) : 0;

  return (
    <>
      {hasDmg && (
        <StatBadge
          badgeClass="border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
          tooltip={`Waffenschaden: Diese Waffe verursacht ${damage} Punkte pro Treffer. Ohne ausgerüstete Waffe greifst du mit Fäusten an (8 ${damageLabel}).`}
        >
          ⚔ {damage} {damageLabel}
        </StatBadge>
      )}
      {hasArmor && (
        <StatBadge
          badgeClass="border-blue-400/30 bg-blue-500/10 text-blue-300"
          tooltip={`Rüstungspunkte: Reduzieren jeden eingehenden Schaden um ${armor} Punkte (mindestens 1 Schaden geht immer durch). Stapelt sich über Jacke, Hose, Hut und Schuhe.`}
        >
          🛡 {armor} {armorLabel}
        </StatBadge>
      )}
      {hasPerk && (
        <StatBadge
          badgeClass="border-amber-400/30 bg-amber-500/10 text-amber-300"
          tooltip={PERK_TOOLTIPS[perk_type!]?.(pct) ?? `+${pct}% ${getPerkLabel(perk_type!, perkLabels)}`}
        >
          {PERK_ICONS[perk_type!]} +{pct}% {getPerkLabel(perk_type!, perkLabels)}
        </StatBadge>
      )}
      {hasShield && (
        <StatBadge
          badgeClass="border-cyan-400/30 bg-cyan-500/10 text-cyan-300"
          tooltip={`Schild-HP: Absorbiert bis zu ${shield_hp} Schadenspunkte, bevor deine HP sinken. Das Schild leert sich komplett und lädt sich nach dem Cooldown vollständig wieder auf.`}
        >
          🔵 {shield_hp} HP
        </StatBadge>
      )}
      {hasCooldown && (
        <StatBadge
          badgeClass="border-cyan-400/20 bg-cyan-500/5 text-cyan-400/70"
          tooltip={`Schild-Cooldown: Nach dem vollständigen Leeren des Schildes dauert es ${shield_regen_cooldown_sec} Sekunden, bis es sich wieder vollständig auflädt.`}
        >
          ⏱ {shield_regen_cooldown_sec}s CD
        </StatBadge>
      )}
      {petStats && (
        <>
          <StatBadge
            badgeClass="border-orange-400/30 bg-orange-500/10 text-orange-300"
            tooltip={`Begleiter-Schaden: Greift Gegner in Reichweite mit ${petStats.damage} Schadenspunkten pro Treffer an. Der Begleiter kämpft automatisch für dich.`}
          >
            🐾 {petStats.damage} DMG
          </StatBadge>
          <StatBadge
            badgeClass="border-yellow-400/30 bg-yellow-500/10 text-yellow-300"
            tooltip={`Angriffsgeschwindigkeit: Greift alle ${petStats.attackSpeed}s an, sobald ein Gegner in Reichweite ist.`}
          >
            ⚡ {petStats.attackSpeed}s
          </StatBadge>
          <StatBadge
            badgeClass="border-purple-400/30 bg-purple-500/10 text-purple-300"
            tooltip={`Aggroreichweite: Erkennt und verfolgt Gegner innerhalb von ${petStats.aggroRadius} Einheiten um den Begleiter herum.`}
          >
            📡 {petStats.aggroRadius}u
          </StatBadge>
        </>
      )}
    </>
  );
}
