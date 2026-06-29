"use client";

import type { ReactNode } from "react";

/**
 * Reusable "remaining limit" meter — a polished pill with a colour-graded fill
 * that goes emerald → amber → red as the remaining count depletes, plus a glow
 * and clear `remaining / total` readout. Used across the games (Snake, DON,
 * Plinko, …) so every limit display looks consistently great.
 */
export function LimitMeter({
  remaining,
  total,
  label,
  icon,
  unit,
  size = "md",
  className = "",
}: {
  remaining: number;
  total: number;
  label?: string;
  icon?: ReactNode;
  /** Suffix after the numbers, e.g. "Spiele". */
  unit?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const safeTotal = Math.max(1, total);
  const ratio = Math.max(0, Math.min(1, remaining / safeTotal));
  const pct = Math.round(ratio * 100);

  // Colour by how much is LEFT: lots = emerald, getting low = amber, almost out = red.
  const tone =
    remaining <= 0 ? "red"
    : ratio <= 0.25 ? "red"
    : ratio <= 0.5 ? "amber"
    : "emerald";

  const C = {
    emerald: { fill: "#34d399", text: "text-emerald-300", border: "border-emerald-500/30", bg: "bg-emerald-500/[0.06]", glow: "rgba(52,211,153,0.45)" },
    amber:   { fill: "#fbbf24", text: "text-amber-300",   border: "border-amber-400/30",   bg: "bg-amber-500/[0.06]",   glow: "rgba(251,191,36,0.45)" },
    red:     { fill: "#f87171", text: "text-red-300",     border: "border-red-500/30",     bg: "bg-red-500/[0.06]",     glow: "rgba(248,113,113,0.45)" },
  }[tone];

  const pad = size === "sm" ? "px-2.5 py-1.5" : "px-3 py-2";
  const numCls = size === "sm" ? "text-sm" : "text-base";

  return (
    <div className={`flex flex-col gap-1 rounded-xl border ${C.border} ${C.bg} ${pad} ${className}`}>
      <div className="flex items-center gap-2">
        {icon && <span className={`shrink-0 ${C.text}`}>{icon}</span>}
        {label && <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</span>}
        <span className={`ml-auto font-mono font-black tabular-nums ${numCls} ${remaining <= 0 ? "text-red-400" : C.text}`}>
          {remaining.toLocaleString("de-DE")}
          <span className="text-zinc-600">/{total.toLocaleString("de-DE")}</span>
          {unit && <span className="ml-1 text-[10px] font-bold text-zinc-500">{unit}</span>}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${pct}%`,
            background: C.fill,
            boxShadow: `0 0 10px -1px ${C.glow}`,
          }}
        />
      </div>
    </div>
  );
}
