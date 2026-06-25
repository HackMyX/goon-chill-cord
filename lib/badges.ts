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
];

/** Badges that are auto-assigned based on role or battle pass ownership — not manually grantable */
export const SYSTEM_BADGE_KEYS: string[] = ["premium", "elite", "mod", "admin"];

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
    default:
      return {
        bg: "rgba(113,113,122,0.15)",
        text: "#71717a",
        border: "rgba(113,113,122,0.4)",
        glow: "rgba(113,113,122,0.35)",
      };
  }
}
