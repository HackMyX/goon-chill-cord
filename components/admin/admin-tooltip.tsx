"use client";

import { Info } from "lucide-react";

/**
 * Compact info-icon with a German hover-tooltip.
 * Usage: <AdminTooltip text="Erklärt was dieser Schalter macht." />
 * Optional `side="right"` to anchor tooltip to the right instead of left.
 */
export function AdminTooltip({
  text,
  side = "left",
}: {
  text: string;
  side?: "left" | "right";
}) {
  return (
    <span className="group/tip relative inline-flex flex-shrink-0 items-center">
      <Info className="h-3.5 w-3.5 cursor-help text-zinc-600 transition-colors group-hover/tip:text-zinc-300" />
      <span
        className={`pointer-events-none absolute bottom-full z-[200] mb-2 hidden w-64 rounded-xl border border-white/10 bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-300 shadow-xl group-hover/tip:block ${
          side === "right" ? "right-0" : "left-0"
        }`}
      >
        {text}
      </span>
    </span>
  );
}

/**
 * Inline field label row: label text + optional tooltip on the same line.
 */
export function TipLabel({
  label,
  tip,
  className,
}: {
  label: string;
  tip: string;
  className?: string;
}) {
  return (
    <span className={`flex items-center gap-1.5 ${className ?? ""}`}>
      <span>{label}</span>
      <AdminTooltip text={tip} />
    </span>
  );
}
