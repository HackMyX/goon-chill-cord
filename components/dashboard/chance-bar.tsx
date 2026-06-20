import { RARITY_ORDER, RARITY_LABELS, RARITY_STYLES, type Rarity } from "@/lib/cases";

function formatPct(n: number) {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

interface ChanceBarProps {
  weights: Partial<Record<Rarity, number>>;
}

export function ChanceBar({ weights }: ChanceBarProps) {
  const active = RARITY_ORDER.filter((r) => (weights[r] ?? 0) > 0);

  return (
    <div className="flex h-9 w-full overflow-hidden rounded-md ring-1 ring-white/10">
      {active.map((rarity, i) => {
        const pct = weights[rarity] ?? 0;
        const style = RARITY_STYLES[rarity];
        return (
          <div
            key={rarity}
            style={{ flexGrow: pct, flexBasis: 0 }}
            className={`flex min-w-10 flex-col items-center justify-center ${style.barBg} px-1 ${
              i === 0 ? "rounded-l-md" : ""
            } ${i === active.length - 1 ? "rounded-r-md" : ""}`}
          >
            <span className="truncate text-[9px] font-semibold leading-tight text-white/85">
              {RARITY_LABELS[rarity]}
            </span>
            <span className="text-xs font-bold leading-tight text-white">
              {formatPct(pct)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
