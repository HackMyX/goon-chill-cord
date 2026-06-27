export interface BadgeDefinition {
  key: string;
  label: string;
  color: string;
  icon: string;
  description: string | null;
}

export interface UserBadge {
  id: string;
  userId: string;
  badgeKey: string;
  badge: BadgeDefinition;
  grantedAt: string;
}

export const ALL_BADGE_KEYS: string[] = [
  "verified",
  "premium",
  "elite",
  "mod",
  "admin",
  "og",
  "streaker",
  "vip",
  "helper",
  // Name Style achievement badges (auto-awarded)
  "ns_collector",
  "ns_mythisch",
  "ns_ultra",
  // Admin-grantable special badges
  "grinder",
  "season_vet",
];

/** Badges that are auto-assigned based on role or battle pass ownership — not manually grantable */
export const SYSTEM_BADGE_KEYS: string[] = ["premium", "elite", "mod", "admin"];

/** Badges auto-awarded by the system based on achievements */
export const AUTO_BADGE_KEYS: string[] = ["ns_collector", "ns_mythisch", "ns_ultra"];

/**
 * Canonical prestige order, most important first. Drives the auto-equip
 * fallback (which of a user's owned badges to pin when they haven't chosen
 * any themselves) and the single-badge pick in chat — one shared ranking so
 * every surface agrees on which badge "wins". Anything not listed ranks last
 * (in its definition order) but is still eligible.
 */
export const BADGE_DISPLAY_PRIORITY: string[] = [
  "admin",
  "mod",
  "elite",
  "premium",
  "vip",
  "og",
  "ns_ultra",
  "ns_mythisch",
  "ns_collector",
  "season_vet",
  "grinder",
  "verified",
  "streaker",
  "helper",
];

/** Rank of a badge key in BADGE_DISPLAY_PRIORITY (lower = more important). */
export function badgeRank(key: string): number {
  const i = BADGE_DISPLAY_PRIORITY.indexOf(key);
  return i === -1 ? BADGE_DISPLAY_PRIORITY.length : i;
}

/**
 * THE single source of truth for which badges appear next to a username
 * everywhere except the main profile (which shows every owned badge).
 *
 *  - `custom === true`  → show exactly the user's pinned `chosen` keys
 *    (filtered to ones they still own, capped at `max`). Strict: nothing
 *    else is ever shown, matching "set Prio-Badges → überall strikt nur diese".
 *    If their entire pinned set has been revoked, falls back to auto so the
 *    nametag is never blank.
 *  - `custom === false` → auto-equip their `max` most prestigious owned
 *    badges (BADGE_DISPLAY_PRIORITY), matching "stellt der User nichts ein,
 *    rüsten sich die ersten 2 Badges automatisch aus".
 *
 * Pure + deterministic so it can run on both the server (persisting the
 * result into profiles.prio_badges) and the client.
 */
export function resolveDisplayBadges(
  chosen: string[] | null | undefined,
  owned: string[] | null | undefined,
  custom: boolean,
  max = 2,
): string[] {
  const ownedSet = new Set(owned ?? []);
  const auto = () =>
    [...ownedSet].sort((a, b) => badgeRank(a) - badgeRank(b)).slice(0, Math.max(0, max));

  if (custom) {
    const pinned = (chosen ?? []).filter((k) => ownedSet.has(k)).slice(0, Math.max(0, max));
    return pinned.length > 0 ? pinned : auto();
  }
  return auto();
}

export function getBadgeStyle(key: string): {
  bg: string;
  text: string;
  border: string;
  glow: string;
} {
  switch (key) {
    case "verified":
      return {
        bg: "rgba(59,130,246,0.15)",
        text: "#3b82f6",
        border: "rgba(59,130,246,0.4)",
        glow: "rgba(59,130,246,0.35)",
      };
    case "premium":
      return {
        bg: "rgba(245,158,11,0.15)",
        text: "#f59e0b",
        border: "rgba(245,158,11,0.4)",
        glow: "rgba(245,158,11,0.35)",
      };
    case "elite":
      return {
        bg: "rgba(168,85,247,0.15)",
        text: "#a855f7",
        border: "rgba(168,85,247,0.4)",
        glow: "rgba(168,85,247,0.35)",
      };
    case "mod":
      return {
        bg: "rgba(34,197,94,0.15)",
        text: "#22c55e",
        border: "rgba(34,197,94,0.4)",
        glow: "rgba(34,197,94,0.35)",
      };
    case "admin":
      return {
        bg: "rgba(239,68,68,0.15)",
        text: "#ef4444",
        border: "rgba(239,68,68,0.4)",
        glow: "rgba(239,68,68,0.35)",
      };
    case "og":
      return {
        bg: "rgba(249,115,22,0.15)",
        text: "#f97316",
        border: "rgba(249,115,22,0.4)",
        glow: "rgba(249,115,22,0.35)",
      };
    case "streaker":
      return {
        bg: "rgba(234,179,8,0.15)",
        text: "#eab308",
        border: "rgba(234,179,8,0.4)",
        glow: "rgba(234,179,8,0.35)",
      };
    case "vip":
      return {
        bg: "rgba(217,70,239,0.15)",
        text: "#d946ef",
        border: "rgba(217,70,239,0.4)",
        glow: "rgba(217,70,239,0.35)",
      };
    case "helper":
      return {
        bg: "rgba(6,182,212,0.15)",
        text: "#06b6d4",
        border: "rgba(6,182,212,0.4)",
        glow: "rgba(6,182,212,0.35)",
      };
    case "ns_collector":
      return {
        bg: "rgba(192,132,252,0.15)",
        text: "#c084fc",
        border: "rgba(192,132,252,0.4)",
        glow: "rgba(192,132,252,0.35)",
      };
    case "ns_mythisch":
      return {
        bg: "rgba(168,85,247,0.15)",
        text: "#a855f7",
        border: "rgba(168,85,247,0.4)",
        glow: "rgba(168,85,247,0.35)",
      };
    case "ns_ultra":
      return {
        bg: "rgba(245,158,11,0.18)",
        text: "#f59e0b",
        border: "rgba(245,158,11,0.5)",
        glow: "rgba(245,158,11,0.45)",
      };
    case "grinder":
      return {
        bg: "rgba(249,115,22,0.15)",
        text: "#f97316",
        border: "rgba(249,115,22,0.4)",
        glow: "rgba(249,115,22,0.35)",
      };
    case "season_vet":
      return {
        bg: "rgba(96,165,250,0.15)",
        text: "#60a5fa",
        border: "rgba(96,165,250,0.4)",
        glow: "rgba(96,165,250,0.35)",
      };
    default:
      return {
        bg: "rgba(113,113,122,0.15)",
        text: "#71717a",
        border: "rgba(113,113,122,0.4)",
        glow: "rgba(113,113,122,0.35)",
      };
  }
}
