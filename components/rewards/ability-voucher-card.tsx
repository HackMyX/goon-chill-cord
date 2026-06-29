"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import {
  getBonusCardRarity, resolveCardTheme,
  BONUS_CARD_RARITIES, type BonusCardRarity,
} from "@/lib/bonus-card-themes";
import { BpRewardView3D } from "@/components/battlepass/bp-reward-3d";

/**
 * Schick gethemte Gutschein-Karte für EINE Fähigkeit / einen Fähigkeits-Gutschein.
 * Optik konsistent zur <BonusCard> (Theme-Verläufe als Inline-Styles, Seltenheits-
 * Ribbon-Rahmen, animationClass am Hintergrund), aber mit FÄHIGKEITS-Inhalt:
 * Glyph/Icon + Name + Effekt-Kurzbeschreibung + Kategorie-Badge + „Aktiv"-Marker.
 *
 * Verwendung: echte Karten (Garderobe) UND Admin-Live-Vorschau (animateEntry={false}).
 */

export interface AbilityVoucherCardProps {
  name: string;
  description?: string | null;
  /** Emoji/Glyph; wenn leer wird das Theme-Glyph genutzt. */
  icon?: string | null;
  /** Kategorie-Label (z.B. „Mine"). */
  category?: string | null;
  /** Karten-Theme (BonusCardThemeId oder „auto"/leer). */
  cardTheme?: string | null;
  /** Karten-Seltenheit (BonusCardRarity oder „auto"/leer). */
  cardRarity?: string | null;
  /** Fähigkeits-Seltenheit (selten/mythisch/ultra) — Fallback wenn cardRarity=auto. */
  abilityRarity?: string | null;
  /** Aktiv/ausgerüstet → Akzent-Marker mit Haken. */
  equipped?: boolean;
  /** ISO-String; gesetzt → Live-Restlaufzeit (30s-Tick), sonst nichts. */
  expiresAt?: string | null;
  className?: string;
  /** Eintritts-Animation (scale/opacity). Default an; für Vorschau false. */
  animateEntry?: boolean;
  /** Roher Wirkungsbereich (mine/snake/plinko/don/world/global) → effekt-abhängiges 3D-Modell. */
  effectCategory?: string | null;
  /** Wenn gesetzt: echtes 3D-Modell im Glyph-Feld (geteilte Canvas vom Container). */
  view3d?: { index: number };
}

/** Fähigkeits-Seltenheit → Bonus-Card-Seltenheit (Fallback bei cardRarity=auto). */
function abilityRarityToCardRarity(r?: string | null): BonusCardRarity {
  if (r === "ultra") return "ultra";
  if (r === "mythisch") return "mythisch";
  if (r === "selten") return "selten";
  return "selten";
}

/** „läuft in 2h 14m ab" / „läuft in 8m ab". */
function formatRemainingTime(expiresAt: string | null, now: number): string {
  const ms = new Date(expiresAt!).getTime() - now;
  if (ms <= 0) return "abgelaufen";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `läuft in ${days}d ${hours}h ab`;
  if (hours > 0) return `läuft in ${hours}h ${mins}m ab`;
  return `läuft in ${mins}m ab`;
}

export function AbilityVoucherCard({
  name, description, icon, category,
  cardTheme, cardRarity, abilityRarity,
  equipped = false, expiresAt = null,
  className, animateEntry, effectCategory, view3d,
}: AbilityVoucherCardProps) {
  // Effektive Seltenheit: konkreter cardRarity gewinnt, sonst aus abilityRarity.
  const effectiveRarity: BonusCardRarity =
    cardRarity && cardRarity !== "auto" && cardRarity in BONUS_CARD_RARITIES
      ? (cardRarity as BonusCardRarity)
      : abilityRarityToCardRarity(abilityRarity);
  const theme = resolveCardTheme(cardTheme, effectiveRarity);
  const rarity = getBonusCardRarity(effectiveRarity);

  // Live-Tick für die Restlaufzeit (alle 30s), nur wenn ein Ablauf existiert.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const glyph = icon?.trim() ? icon.trim() : theme.glyph;
  const timeLabel = expiresAt ? formatRemainingTime(expiresAt, now) : null;
  const expiringSoon = expiresAt ? new Date(expiresAt).getTime() - now <= 3_600_000 : false;
  const noEntry = animateEntry === false;

  return (
    <motion.div
      initial={noEntry ? false : { opacity: 0, scale: 0.92, y: 10 }}
      animate={noEntry ? undefined : { opacity: 1, scale: 1, y: 0 }}
      transition={noEntry ? undefined : { type: "spring", stiffness: 320, damping: 24 }}
      className={`relative isolate w-full max-w-full overflow-hidden rounded-2xl p-[1.5px] ${className ?? ""}`}
      style={{ background: rarity.ribbon, boxShadow: theme.glow }}
    >
      {/* Innenkarte mit Theme-Hintergrund (animationClass ergänzt z.B. RGB-Animation) */}
      <div
        className={`relative overflow-hidden rounded-[15px] px-4 pb-4 pt-3 ${theme.animationClass ?? ""}`}
        style={{
          background: theme.background,
          border: `1px solid ${theme.border}`,
          color: theme.text,
        }}
      >
        {/* Muster-Overlay */}
        {theme.pattern && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{ background: theme.pattern, backgroundSize: "22px 22px" }}
          />
        )}
        {/* Animierter Glanz-Overlay */}
        {theme.animated && theme.sheen && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: theme.sheen,
              backgroundSize: "250% 100%",
              animation: "bonus-sheen 3.4s linear infinite",
            }}
          />
        )}

        <div className="relative z-10">
          {/* Kopf: Glyph + Name + Seltenheits-Ribbon */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl text-2xl"
                style={{
                  background: "rgba(0,0,0,0.28)",
                  border: `1px solid ${theme.border}`,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12)`,
                }}
              >
                <span aria-hidden>{glyph}</span>
                {view3d && (
                  <span className="absolute inset-0">
                    <BpRewardView3D
                      rewardType="ability"
                      effect={effectCategory ?? undefined}
                      rarity={effectiveRarity}
                      viewIndex={view3d.index}
                    />
                  </span>
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black leading-tight" style={{ color: theme.text }}>
                  {name}
                </p>
                {category && (
                  <span
                    className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                    style={{
                      background: "rgba(0,0,0,0.3)",
                      color: theme.sub,
                      boxShadow: `inset 0 0 0 1px ${theme.border}`,
                    }}
                  >
                    {category}
                  </span>
                )}
              </div>
            </div>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider"
              style={{ background: rarity.ribbon, color: rarity.text, boxShadow: `0 0 0 1px ${rarity.ring}` }}
            >
              {rarity.label}
            </span>
          </div>

          {/* Effekt-Kurzbeschreibung */}
          {description && (
            <p className="mt-3 text-xs font-medium leading-snug" style={{ color: theme.sub }}>
              {description}
            </p>
          )}

          {/* Fuß: Aktiv-Marker + Restlaufzeit */}
          {(equipped || timeLabel) && (
            <div className="mt-3 flex items-center justify-between gap-2">
              {equipped ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider"
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    color: theme.accent,
                    boxShadow: `0 0 0 1px ${theme.accent}`,
                  }}
                >
                  <Check className="h-3 w-3" /> Aktiv
                </span>
              ) : <span />}
              {timeLabel && (
                <span
                  className="text-[10px] font-semibold"
                  style={{ color: expiringSoon ? "#fca5a5" : theme.sub }}
                >
                  {timeLabel}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
