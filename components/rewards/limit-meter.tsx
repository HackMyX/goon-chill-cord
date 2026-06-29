"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFeedbackSettings } from "@/lib/use-feedback";
import { hexToRgba, limitMeterTone, type LimitMeterConfig } from "@/lib/feedback-config";

/**
 * Reusable "remaining limit" meter — a polished, admin-configurable readout that
 * colour-grades high → mid → low as the remaining count depletes. One shared
 * component so every game limit (Snake, DON, Plinko, …) looks consistently great.
 *
 * Fully driven by the central feedback config (`limitMeter`): style (Balken /
 * Segmente / Ring), the three zone colours + thresholds, animated sheen and a
 * low-zone attention pulse. Users can switch the rich meter off in /account
 * (`fb_limit_meter`) — then a compact text-only readout is shown instead.
 *
 * API is backwards-compatible (remaining/total/label/icon/unit/size/className).
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
  const { limitMeter: cfg, limitMeterAllowed } = useFeedbackSettings();

  const safeTotal = Math.max(1, total);
  const ratio = Math.max(0, Math.min(1, remaining / safeTotal));
  const pct = Math.round(ratio * 100);
  const { color, zone } = limitMeterTone(ratio, remaining, cfg);

  // Bump a key whenever the remaining value changes → re-trigger the number pop.
  const [tick, setTick] = useState(0);
  const prevRef = useRef(remaining);
  useEffect(() => {
    if (prevRef.current !== remaining) {
      prevRef.current = remaining;
      setTick((t) => t + 1);
    }
  }, [remaining]);

  const pad = size === "sm" ? "px-2.5 py-1.5" : "px-3 py-2";
  const numCls = size === "sm" ? "text-sm" : "text-base";
  const low = zone === "low";
  const pulse = low && cfg.pulseWhenLow && limitMeterAllowed;

  // ── Minimal fallback (user opted out / admin disabled the rich meter) ──────
  if (!limitMeterAllowed) {
    return (
      <span className={`inline-flex items-center gap-1.5 font-mono text-xs font-bold tabular-nums ${className}`}>
        {icon && <span style={{ color }}>{icon}</span>}
        {label && <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</span>}
        <span style={{ color: remaining <= 0 ? "#f87171" : color }}>
          {remaining.toLocaleString("de-DE")}
          <span className="text-zinc-600">/{total.toLocaleString("de-DE")}</span>
        </span>
        {unit && <span className="text-[10px] text-zinc-500">{unit}</span>}
      </span>
    );
  }

  const header = (
    <div className="flex items-center gap-2">
      {icon && <span className="shrink-0" style={{ color }}>{icon}</span>}
      {label && <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</span>}
      <span
        key={tick}
        className={`ml-auto inline-flex items-baseline font-mono font-black tabular-nums ${numCls}`}
        style={{ color: remaining <= 0 ? "#f87171" : color, animation: tick > 0 ? "limit-num-pop 0.32s cubic-bezier(0.22,1,0.36,1)" : undefined }}
      >
        {remaining.toLocaleString("de-DE")}
        <span className="text-zinc-600">/{total.toLocaleString("de-DE")}</span>
        {unit && <span className="ml-1 text-[10px] font-bold text-zinc-500">{unit}</span>}
      </span>
    </div>
  );

  const containerStyle = {
    borderColor: hexToRgba(color, 0.35),
    background: hexToRgba(color, 0.06),
    boxShadow: low ? `0 0 16px -2px ${hexToRgba(color, 0.5)}` : `0 0 10px -4px ${hexToRgba(color, 0.4)}`,
    animation: pulse ? "limit-low-pulse 1.15s ease-in-out infinite" : undefined,
  };

  // ── Ring style (radial) — compact, premium look ───────────────────────────
  if (cfg.style === "ring") {
    return (
      <div className={`flex items-center gap-2.5 rounded-xl border ${pad} ${className}`} style={containerStyle}>
        <RingGauge ratio={ratio} color={color} animate={cfg.animate} size={size} />
        <div className="flex min-w-0 flex-col">
          {label && <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</span>}
          <span
            key={tick}
            className="font-mono text-base font-black tabular-nums"
            style={{ color: remaining <= 0 ? "#f87171" : color, animation: tick > 0 ? "limit-num-pop 0.32s cubic-bezier(0.22,1,0.36,1)" : undefined }}
          >
            {remaining.toLocaleString("de-DE")}
            <span className="text-zinc-600">/{total.toLocaleString("de-DE")}</span>
          </span>
          {unit && <span className="text-[10px] font-bold text-zinc-500">{unit}</span>}
        </div>
      </div>
    );
  }

  // ── Segments style (pips) — best for small totals; falls back to bar ──────
  const useSegments = cfg.style === "segments" && total > 0 && total <= 16;
  if (useSegments) {
    const filled = Math.max(0, Math.min(total, remaining));
    return (
      <div className={`flex flex-col gap-1.5 rounded-xl border ${pad} ${className}`} style={containerStyle}>
        {header}
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: total }, (_, i) => {
            const on = i < filled;
            return (
              <span
                key={i}
                className="h-2 flex-1 rounded-full"
                style={{
                  minWidth: 6,
                  background: on ? color : hexToRgba(color, 0.12),
                  boxShadow: on ? `0 0 8px -2px ${hexToRgba(color, 0.7)}` : "none",
                  animation: on && cfg.animate ? `limit-pip-pop 0.3s ${Math.min(i, 8) * 0.03}s both` : undefined,
                }}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // ── Bar style (default) — gradient fill + sheen sweep ──────────────────────
  return (
    <div className={`flex flex-col gap-1 rounded-xl border ${pad} ${className}`} style={containerStyle}>
      {header}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-black/40">
        <div
          className="relative h-full overflow-hidden rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${hexToRgba(color, 0.7)}, ${color})`,
            boxShadow: `0 0 10px -1px ${hexToRgba(color, 0.6)}`,
          }}
        >
          {cfg.animate && pct > 0 && (
            <span
              className="absolute inset-y-0 left-0 w-1/3"
              style={{
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
                animation: "limit-sheen 2.4s ease-in-out infinite",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Small radial progress gauge used by the "ring" style. */
function RingGauge({ ratio, color, animate, size }: {
  ratio: number; color: string; animate: boolean; size: "sm" | "md";
}) {
  const dim = size === "sm" ? 34 : 42;
  const stroke = size === "sm" ? 4 : 5;
  const r = (dim - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={dim} height={dim} className="shrink-0 -rotate-90" style={{ filter: `drop-shadow(0 0 6px ${hexToRgba(color, 0.55)})` }}>
      <circle cx={dim / 2} cy={dim / 2} r={r} fill="none" stroke={hexToRgba(color, 0.14)} strokeWidth={stroke} />
      <circle
        cx={dim / 2} cy={dim / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - ratio)}
        style={{ transition: animate ? "stroke-dashoffset 0.6s cubic-bezier(0.22,1,0.36,1)" : undefined }}
      />
    </svg>
  );
}

/** Convenience preview used by the admin editor — renders a meter with explicit
 *  config (bypasses the live hook) at a given fill so the admin sees changes
 *  instantly while editing. */
export function LimitMeterPreview({ cfg, remaining, total, label, unit }: {
  cfg: LimitMeterConfig; remaining: number; total: number; label?: string; unit?: string;
}) {
  const safeTotal = Math.max(1, total);
  const ratio = Math.max(0, Math.min(1, remaining / safeTotal));
  const pct = Math.round(ratio * 100);
  const { color, zone } = limitMeterTone(ratio, remaining, cfg);
  const low = zone === "low";
  const pulse = low && cfg.pulseWhenLow;

  const containerStyle = {
    borderColor: hexToRgba(color, 0.35),
    background: hexToRgba(color, 0.06),
    boxShadow: low ? `0 0 16px -2px ${hexToRgba(color, 0.5)}` : `0 0 10px -4px ${hexToRgba(color, 0.4)}`,
    animation: pulse ? "limit-low-pulse 1.15s ease-in-out infinite" : undefined,
  };
  const num = (
    <span className="ml-auto font-mono text-sm font-black tabular-nums" style={{ color: remaining <= 0 ? "#f87171" : color }}>
      {remaining}<span className="text-zinc-600">/{total}</span>{unit && <span className="ml-1 text-[10px] text-zinc-500">{unit}</span>}
    </span>
  );

  if (cfg.style === "ring") {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border px-3 py-2" style={containerStyle}>
        <RingGauge ratio={ratio} color={color} animate={cfg.animate} size="md" />
        <div className="flex flex-col">
          {label && <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</span>}
          <span className="font-mono text-base font-black tabular-nums" style={{ color: remaining <= 0 ? "#f87171" : color }}>
            {remaining}<span className="text-zinc-600">/{total}</span>
          </span>
        </div>
      </div>
    );
  }
  if (cfg.style === "segments" && total <= 16) {
    const filled = Math.max(0, Math.min(total, remaining));
    return (
      <div className="flex flex-col gap-1.5 rounded-xl border px-3 py-2" style={containerStyle}>
        <div className="flex items-center gap-2">
          {label && <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</span>}
          {num}
        </div>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className="h-2 flex-1 rounded-full" style={{ minWidth: 6, background: i < filled ? color : hexToRgba(color, 0.12), boxShadow: i < filled ? `0 0 8px -2px ${hexToRgba(color, 0.7)}` : "none" }} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 rounded-xl border px-3 py-2" style={containerStyle}>
      <div className="flex items-center gap-2">
        {label && <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</span>}
        {num}
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-black/40">
        <div className="relative h-full overflow-hidden rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${hexToRgba(color, 0.7)}, ${color})`, boxShadow: `0 0 10px -1px ${hexToRgba(color, 0.6)}` }}>
          {cfg.animate && pct > 0 && <span className="absolute inset-y-0 left-0 w-1/3" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)", animation: "limit-sheen 2.4s ease-in-out infinite" }} />}
        </div>
      </div>
    </div>
  );
}
