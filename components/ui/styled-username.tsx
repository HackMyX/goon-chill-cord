"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  getNameStyle,
  computeNameStyleCSS,
  ANIM_CLASS,
  RARITY_COLORS,
  type NameStyleDef,
  type NameStyleRarity,
} from "@/lib/name-styles";

const OBFUSCATED_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()+-=[]{}|;':,./<>?";

const SIZE_MAP = {
  "2xs": "text-[9px] leading-none",
  xs:    "text-[10px] leading-none",
  sm:    "text-xs",
  md:    "text-sm",
  lg:    "text-base",
  xl:    "text-lg font-bold",
  "2xl": "text-2xl font-bold",
} as const;

type Size = keyof typeof SIZE_MAP;

interface StyledUsernameProps {
  name: string;
  /** DB key of the style, or null for "default" */
  styleKey?: string | null;
  size?: Size;
  className?: string;
  /** Override with a fully-resolved NameStyleDef (avoids key lookup) */
  styleDef?: NameStyleDef;
  /** Extra inline style override */
  extraStyle?: CSSProperties;
  /** Disable JS animations (obfuscated / rgb_wave) — for static/server output */
  staticMode?: boolean;
}

export function StyledUsername({
  name,
  styleKey,
  size = "md",
  className = "",
  styleDef,
  extraStyle,
  staticMode = false,
}: StyledUsernameProps) {
  const style = styleDef ?? getNameStyle(styleKey);
  const animType = style.animation_type;

  // ── Obfuscated: JS character cycling ──────────────────────────────────────
  const [obfText, setObfText] = useState(name);
  useEffect(() => {
    if (staticMode || animType !== "obfuscated") {
      setObfText(name);
      return;
    }
    const id = setInterval(() => {
      setObfText(
        name
          .split("")
          .map(c =>
            c === " "
              ? " "
              : Math.random() > 0.55
              ? OBFUSCATED_CHARS[Math.floor(Math.random() * OBFUSCATED_CHARS.length)]
              : c,
          )
          .join(""),
      );
    }, 60);
    return () => clearInterval(id);
  }, [name, animType, staticMode]);

  // ── RGB Wave: per-character hue tick ──────────────────────────────────────
  const [rgbTick, setRgbTick] = useState(0);
  useEffect(() => {
    if (staticMode || animType !== "rgb_wave") return;
    const id = setInterval(() => setRgbTick(t => (t + 1) % 360), 80);
    return () => clearInterval(id);
  }, [animType, staticMode]);

  const sizeClass = SIZE_MAP[size];
  const css = computeNameStyleCSS(style);
  const animClass = ANIM_CLASS[animType] ?? "";
  const speedCssVar = { "--ns-dur": `${(2 / (style.animation_speed || 1)).toFixed(2)}s` } as CSSProperties;

  const prefix = style.prefix_icon ? (
    <span className="mr-[0.15em] not-italic select-none">{style.prefix_icon}</span>
  ) : null;
  const suffix = style.suffix_icon ? (
    <span className="ml-[0.15em] not-italic select-none">{style.suffix_icon}</span>
  ) : null;

  // ── RGB Wave render ────────────────────────────────────────────────────────
  if (animType === "rgb_wave") {
    return (
      <span className={`inline-flex items-center font-semibold ${sizeClass} ${className}`}>
        {prefix}
        {name.split("").map((char, i) => {
          const hue = staticMode ? (i * 40) % 360 : (i * 35 + rgbTick * 12) % 360;
          return (
            <span key={i} style={{ color: `hsl(${hue}, 100%, 62%)` }}>
              {char}
            </span>
          );
        })}
        {suffix}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center font-semibold ${sizeClass} ${animClass} ${className}`}
      style={{ ...speedCssVar, ...css, ...extraStyle }}
    >
      {prefix}
      {animType === "obfuscated" ? obfText : name}
      {suffix}
    </span>
  );
}

// ── Rarity badge chip ──────────────────────────────────────────────────────────
export function RarityChip({ rarity }: { rarity: NameStyleRarity }) {
  const c = RARITY_COLORS[rarity];
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest border ${c.border} ${c.bg}`}
      style={{ color: c.color }}
    >
      {c.label}
    </span>
  );
}

// ── Name Style Preview Card (Wardrobe / Admin) ─────────────────────────────────
export function NameStyleCard({
  style,
  owned = false,
  active = false,
  onClick,
}: {
  style: NameStyleDef;
  owned?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  const r = RARITY_COLORS[style.rarity];
  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-center gap-2 rounded-xl border p-3 transition-all duration-200
        ${active
          ? "border-purple-400 bg-purple-900/30 ring-1 ring-purple-500/40"
          : owned
          ? `${r.border} ${r.bg} hover:border-purple-400/60`
          : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600 opacity-70"
        }`}
    >
      {active && (
        <span className="absolute top-1.5 right-1.5 rounded-full bg-purple-500 px-1.5 py-0.5 text-[8px] font-bold text-white uppercase tracking-wide">
          Aktiv
        </span>
      )}
      {/* Name preview */}
      <div className="flex h-8 items-center justify-center">
        <StyledUsername name="YourName" styleDef={style} size="md" />
      </div>
      <RarityChip rarity={style.rarity} />
      <span className="text-[10px] text-zinc-400 leading-tight text-center max-w-[90px] truncate">
        {style.label}
      </span>
      {style.prefix_icon && (
        <span className="absolute top-1.5 left-1.5 text-[10px]">{style.prefix_icon}</span>
      )}
      {!owned && style.unlock_price_cr > 0 && (
        <span className="text-[9px] text-amber-400 font-bold">
          {style.unlock_price_cr.toLocaleString("de-DE")} CR
        </span>
      )}
    </button>
  );
}
