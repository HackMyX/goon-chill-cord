"use client";

import { useState } from "react";
import { getBadgeStyle } from "@/lib/badges";

const BADGE_LABELS: Record<string, string> = {
  verified: "Verified",
  premium: "Premium",
  elite: "Elite",
  mod: "Mod",
  admin: "Admin",
  og: "OG",
  streaker: "Streaker",
  vip: "VIP",
  helper: "Helper",
  ns_collector: "Collector",
  ns_mythisch: "Mythisch",
  ns_ultra: "Ultra",
  grinder: "Grinder",
  season_vet: "Season Vet",
};

function PrioBadge({ badgeKey, size }: { badgeKey: string; size: "xs" | "sm" }) {
  const [hovered, setHovered] = useState(false);
  const style = getBadgeStyle(badgeKey);
  const label = BADGE_LABELS[badgeKey] ?? badgeKey;

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        className={`inline-flex items-center rounded px-1.5 py-px font-bold leading-none shrink-0 transition-all duration-150 ${
          size === "sm" ? "text-[10px]" : "text-[8px]"
        }`}
        style={{
          background: style.bg,
          color: style.text,
          border: `1px solid ${style.border}`,
          boxShadow: hovered ? `0 0 8px ${style.glow}, 0 0 16px ${style.glow}44` : `0 0 4px ${style.glow}66`,
        }}
      >
        {label}
      </span>
      {hovered && (
        <span
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-zinc-950/95 px-2 py-1 text-[10px] font-semibold text-zinc-200 shadow-xl backdrop-blur-sm"
          style={{ boxShadow: `0 0 12px ${style.glow}44` }}
        >
          {label}
        </span>
      )}
    </span>
  );
}

/** Horizontal row of up to `max` prio-badges with glow + tooltips. */
export function PrioBadgeRow({
  badgeKeys,
  size = "xs",
  max = 2,
  className = "",
}: {
  badgeKeys: string[];
  size?: "xs" | "sm";
  max?: number;
  className?: string;
}) {
  const keys = badgeKeys.slice(0, max);
  if (keys.length === 0) return null;

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {keys.map((k) => (
        <PrioBadge key={k} badgeKey={k} size={size} />
      ))}
    </span>
  );
}

/**
 * Inline-style-only variant for use inside 3D world nametags (HTML elements
 * inside @react-three/drei's `<Html>` — no Tailwind class resolution at runtime).
 */
export function WorldPrioBadgeRow({
  badgeKeys,
  max = 2,
}: {
  badgeKeys: string[];
  max?: number;
}) {
  const keys = badgeKeys.slice(0, max);
  if (keys.length === 0) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "3px", justifyContent: "center" }}>
      {keys.map((k) => {
        const style = getBadgeStyle(k);
        const label = BADGE_LABELS[k] ?? k;
        return (
          <span
            key={k}
            title={label}
            style={{
              display: "inline-flex",
              alignItems: "center",
              borderRadius: "4px",
              padding: "1px 5px",
              fontSize: "8px",
              fontWeight: 700,
              lineHeight: 1.4,
              background: style.bg,
              color: style.text,
              border: `1px solid ${style.border}`,
              boxShadow: `0 0 5px ${style.glow}88`,
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
