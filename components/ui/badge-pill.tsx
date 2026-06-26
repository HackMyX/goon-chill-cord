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

export function BadgePill({
  badgeKey,
  label,
  size = "xs",
}: {
  badgeKey: string;
  label?: string;
  size?: "xs" | "sm";
}) {
  const style = getBadgeStyle(badgeKey);
  return (
    <span
      className={`inline-flex items-center rounded px-1 py-px font-bold leading-none shrink-0 ${
        size === "sm" ? "text-[10px]" : "text-[8px]"
      }`}
      style={{
        background: style.bg,
        color: style.text,
        border: `1px solid ${style.border}`,
      }}
    >
      {label ?? BADGE_LABELS[badgeKey] ?? badgeKey}
    </span>
  );
}
