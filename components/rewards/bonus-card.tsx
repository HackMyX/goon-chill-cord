"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  getBonusCardRarity,
  resolveCardRarity, resolveCardTheme,
  type RarityTier,
} from "@/lib/bonus-card-themes";
import { BONUS_GAME_LABELS, type BonusGame } from "@/lib/bonus-games";
import type { ActiveBonusCard } from "@/lib/actions/bonus-cards";

/**
 * Eine richtig schick gethemte Container-Karte für EINEN aktiven Spiel-Bonus.
 * Visualisiert „was gerade wie ist" — Theme-Verläufe, Seltenheits-Ribbon, große
 * Restzahl, Fortschritt und Live-Restlaufzeit. Theme-Farben/Verläufe IMMER als
 * Inline-Styles (keine dynamischen Tailwind-Klassen, die der Purge entfernt).
 *
 * Zwei Verwendungen aus EINER Komponente:
 *  - <BonusCard card={activeBonusCard} />          (echte Daten)
 *  - <BonusCard preview={{ theme, rarity, … }} />  (Admin-Live-Vorschau)
 */

export interface BonusCardPreview {
  theme?: string | null;
  rarity?: string | null;
  title?: string | null;
  subtitle?: string | null;
  game: BonusGame;
  gameLabel?: string | null;
  amount: number;
  durationHours?: number;
}

interface NormalizedCard {
  theme: string | null;
  rarity: string | null;
  title: string | null;
  subtitle: string | null;
  gameLabel: string;
  source: string | null;
  remaining: number;
  total: number;
  used: number;
  expiresAt: string | null;
}

function fromActive(c: ActiveBonusCard): NormalizedCard {
  return {
    theme: c.theme, rarity: c.rarity, title: c.title, subtitle: c.subtitle,
    gameLabel: c.gameLabel, source: c.source,
    remaining: c.remaining, total: c.total, used: c.used, expiresAt: c.expiresAt,
  };
}

function fromPreview(p: BonusCardPreview): NormalizedCard {
  const total = Math.max(1, Math.floor(p.amount || 1));
  const hours = Math.max(0, Math.floor(p.durationHours ?? 0));
  return {
    theme: p.theme ?? null,
    rarity: p.rarity ?? null,
    title: p.title?.trim() ? p.title.trim() : null,
    subtitle: p.subtitle?.trim() ? p.subtitle.trim() : null,
    gameLabel: p.gameLabel ?? BONUS_GAME_LABELS[p.game] ?? p.game,
    source: "voucher",
    remaining: total, total, used: 0,
    expiresAt: hours > 0 ? new Date(Date.now() + hours * 3_600_000).toISOString() : null,
  };
}

/** „läuft in 2h 14m ab" / „läuft in 8m ab" / „unbegrenzt gültig". */
function formatRemainingTime(expiresAt: string | null, now: number): string {
  if (!expiresAt) return "unbegrenzt gültig";
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return "abgelaufen";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `läuft in ${days}d ${hours}h ab`;
  if (hours > 0) return `läuft in ${hours}h ${mins}m ab`;
  return `läuft in ${mins}m ab`;
}

function defaultSubtitle(source: string | null): string {
  return source === "voucher" ? "Aus Gutschein" : "Bonus";
}

export function BonusCard(
  props: ({ card: ActiveBonusCard } | { preview: BonusCardPreview }) & {
    className?: string;
    /** Eintritts-Animation (scale/opacity). Default an. */
    animateEntry?: boolean;
    /** Konfigurierte Stärke→Seltenheit-Stufen (sonst Default). */
    tiers?: RarityTier[];
  },
) {
  const card = "card" in props ? fromActive(props.card) : fromPreview(props.preview);
  // AUTO-Auflösung: Seltenheit aus der Bonus-Menge (Stufen), Theme aus der Seltenheit.
  // „auto"/leer wird hier real aufgelöst; konkrete Werte bleiben unverändert.
  const effectiveRarity = resolveCardRarity(card.rarity, card.total, props.tiers);
  const theme = resolveCardTheme(card.theme, effectiveRarity);
  const rarity = getBonusCardRarity(effectiveRarity);

  // Live-Tick für die Restlaufzeit (alle 30s), nur wenn ein Ablauf existiert.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!card.expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [card.expiresAt]);

  const title = card.title ?? card.gameLabel;
  const subtitle = card.subtitle ?? defaultSubtitle(card.source);
  const pct = card.total > 0 ? Math.min(100, Math.max(0, (card.used / card.total) * 100)) : 0;
  const timeLabel = formatRemainingTime(card.expiresAt, now);
  const expiringSoon = card.expiresAt
    ? new Date(card.expiresAt).getTime() - now <= 3_600_000
    : false;

  const noEntry = props.animateEntry === false;

  return (
    <motion.div
      initial={noEntry ? false : { opacity: 0, scale: 0.92, y: 10 }}
      animate={noEntry ? undefined : { opacity: 1, scale: 1, y: 0 }}
      transition={noEntry ? undefined : { type: "spring", stiffness: 320, damping: 24 }}
      className={`relative isolate w-[300px] max-w-full overflow-hidden rounded-2xl p-[1.5px] ${props.className ?? ""}`}
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
          {/* Kopf: Glyph + Titel/Untertitel + Seltenheits-Ribbon */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-2xl"
                style={{
                  background: "rgba(0,0,0,0.28)",
                  border: `1px solid ${theme.border}`,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12)`,
                }}
              >
                {theme.glyph}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black leading-tight" style={{ color: theme.text }}>
                  {title}
                </p>
                <p className="truncate text-[11px] font-medium leading-tight" style={{ color: theme.sub }}>
                  {subtitle}
                </p>
              </div>
            </div>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider"
              style={{ background: rarity.ribbon, color: rarity.text, boxShadow: `0 0 0 1px ${rarity.ring}` }}
            >
              {rarity.label}
            </span>
          </div>

          {/* Große Restzahl */}
          <div className="mt-3 flex items-end gap-1.5">
            <span className="text-4xl font-black leading-none tracking-tight" style={{ color: theme.accent }}>
              +{card.remaining}
            </span>
            <span className="pb-0.5 text-sm font-bold" style={{ color: theme.sub }}>
              / {card.total}
            </span>
            <span className="ml-auto pb-1 text-[11px] font-semibold" style={{ color: theme.sub }}>
              {card.gameLabel}
            </span>
          </div>

          {/* Fortschrittsbalken (used/total) */}
          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full"
            style={{ background: "rgba(0,0,0,0.35)", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.4)" }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${pct}%`, background: theme.accent, boxShadow: `0 0 10px -1px ${theme.accent}` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] font-medium" style={{ color: theme.sub }}>
            <span>{card.used} genutzt</span>
            <span style={{ color: expiringSoon ? "#fca5a5" : theme.sub }}>
              {timeLabel}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
