"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, isModerator } from "@/lib/admin";
import type { Rarity } from "@/lib/cases";
import type { UserBadge, BadgeDefinition } from "@/lib/badges";

export interface PublicProfile {
  id: string;
  username: string;
  nameStyleKey: string | null;
  role: string;
  credits: number;
  streakDays: number;
  casesOpened: number;
  memberSince: string;
  gender: "m" | "w";
  discordName: string | null;
  discordAvatarUrl: string | null;
  verified: boolean;
  warningStrikes: number;
  level: number;
  xp: number;
  viewerIsElevated: boolean;
  tempBannedUntil: string | null;
  equippedByCategory: Record<string, { id: string; name: string; rarity: Rarity }>;
  rarityCounts: Record<Rarity, number>;
  badges: UserBadge[];
  prioBadges: string[];
}

export interface GetPublicProfileResult {
  success: boolean;
  error?: string;
  profile?: PublicProfile;
}

/**
 * Public profile lookup for the Community player list — any logged-in
 * player can view any other player's profile (it's a public roster, same
 * idea as the old site's player list), so this is intentionally *not*
 * gated behind isAdmin(). It still has to go through the admin/service-role
 * client to reach the Discord identity data (auth.users metadata) and
 * other players' inventory rows, neither of which regular RLS exposes
 * cross-user — but what it *returns* is exactly what's already shown
 * publicly elsewhere (username, credits, equipped cosmetics), nothing a
 * player wouldn't already be fine with strangers seeing.
 */
export async function getPublicProfile(targetUserId: string): Promise<GetPublicProfileResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const admin = createAdminClient();

  const [{ data: viewerProfile }, { data: profile }, { data: inventory }, { data: authUser }, { data: badgeRows }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", user.id).single(),
    admin
      .from("profiles")
      .select("id, username, role, credits, streak_days, cases_opened, created_at, gender, verified, active_name_style_key, warning_strikes, level, xp, prio_badges, temp_banned_until")
      .eq("id", targetUserId)
      .single(),
    admin
      .from("inventory")
      .select("id, equipped, obtained_at, item:items(id, name, rarity, type)")
      .eq("user_id", targetUserId)
      .order("obtained_at", { ascending: true }),
    admin.auth.admin.getUserById(targetUserId),
    admin
      .from("user_badges")
      .select("id, user_id, badge_key, granted_at, badge_definitions(key, label, color, icon, description)")
      .eq("user_id", targetUserId)
      .order("granted_at", { ascending: true }),
  ]);

  if (!profile) return { success: false, error: "Profil nicht gefunden." };

  const viewerIsElevated = isAdmin(viewerProfile) || isModerator(viewerProfile);

  const metadata = authUser?.user?.user_metadata as Record<string, unknown> | undefined;
  const discordName =
    (metadata?.global_name as string | undefined) ??
    (metadata?.full_name as string | undefined) ??
    (metadata?.name as string | undefined) ??
    null;
  const discordAvatarUrl =
    (metadata?.avatar_url as string | undefined) ?? (metadata?.picture as string | undefined) ?? null;

  const rows = (inventory ?? []) as unknown as {
    id: string;
    equipped: boolean;
    obtained_at: string | null;
    item: { id: string; name: string; rarity: Rarity; type: string } | null;
  }[];

  // Map badge rows to UserBadge type
  const badges: UserBadge[] = (badgeRows ?? []).map((row: Record<string, unknown>) => {
    const def = row.badge_definitions as Record<string, unknown> | null;
    return {
      id: row.id as string,
      userId: row.user_id as string,
      badgeKey: row.badge_key as string,
      grantedAt: row.granted_at as string,
      badge: {
        key: (def?.key as string) ?? (row.badge_key as string),
        label: (def?.label as string) ?? (row.badge_key as string),
        color: (def?.color as string) ?? "#888888",
        icon: (def?.icon as string) ?? "tag",
        description: (def?.description as string | null) ?? null,
      } as BadgeDefinition,
    };
  });

  const equippedByCategory: PublicProfile["equippedByCategory"] = {};
  const rarityCounts: Record<Rarity, number> = { normal: 0, selten: 0, mythisch: 0, ultra: 0 };
  let ringCount = 0;

  for (const row of rows) {
    if (!row.item) continue;
    rarityCounts[row.item.rarity] += 1;
    if (row.equipped) {
      if (row.item.type === "ring") {
        const slotKey = ringCount === 0 ? "ring" : "ring2";
        equippedByCategory[slotKey] = { id: row.item.id, name: row.item.name, rarity: row.item.rarity };
        ringCount++;
      } else {
        equippedByCategory[row.item.type] = { id: row.item.id, name: row.item.name, rarity: row.item.rarity };
      }
    }
  }

  return {
    success: true,
    profile: {
      id: profile.id,
      username: profile.username,
      nameStyleKey: (profile.active_name_style_key as string | null) ?? null,
      role: profile.role,
      credits: Number(profile.credits ?? 0),
      streakDays: Number(profile.streak_days ?? 0),
      casesOpened: Number(profile.cases_opened ?? 0),
      memberSince: profile.created_at,
      gender: (profile.gender as "m" | "w") ?? "m",
      discordName,
      discordAvatarUrl,
      verified: (profile.verified as boolean | null) ?? false,
      warningStrikes: Number(profile.warning_strikes ?? 0),
      level: Number((profile as unknown as Record<string, unknown>).level ?? 1),
      xp: Number((profile as unknown as Record<string, unknown>).xp ?? 0),
      viewerIsElevated,
      // Ban status is moderation-only — never expose it to non-elevated viewers
      // (a non-mod could otherwise read it from the network response).
      tempBannedUntil: viewerIsElevated
        ? (((profile as unknown as Record<string, unknown>).temp_banned_until as string | null) ?? null)
        : null,
      equippedByCategory,
      rarityCounts,
      badges,
      prioBadges: (profile.prio_badges as string[] | null) ?? [],
    },
  };
}

// ── Lightweight profile for popup ─────────────────────────────────────────────

export interface MinimalProfile {
  id: string;
  username: string;
  nameStyleKey: string | null;
  role: string;
  credits: number;
  streakDays: number;
  casesOpened: number;
  memberSince: string;
  discordAvatarUrl: string | null;
  verified: boolean;
  warningStrikes: number;
  tempBannedUntil: string | null;
  prioBadges: string[];
}

export interface GetMinimalProfileResult {
  ok: boolean;
  profile?: MinimalProfile;
  /** True when the viewer is admin or moderator — controls whether internal ID is shown */
  viewerIsElevated: boolean;
  error?: string;
}

/**
 * Lightweight profile fetch used by the universal ProfilePopup.
 * Skips inventory data and 3D character equips for fast loading.
 * Returns viewerIsElevated so the popup can conditionally show the user UUID.
 */
export async function getMinimalProfile(targetUserId: string): Promise<GetMinimalProfileResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { ok: false, viewerIsElevated: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();

  const [{ data: viewerProfile }, { data: targetProfile }, { data: authUser }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", user.id).single(),
    admin.from("profiles")
      .select("id, username, role, credits, streak_days, cases_opened, created_at, verified, active_name_style_key, warning_strikes, temp_banned_until, prio_badges")
      .eq("id", targetUserId)
      .single(),
    admin.auth.admin.getUserById(targetUserId),
  ]);

  if (!targetProfile) return { ok: false, viewerIsElevated: false, error: "Profil nicht gefunden." };

  const viewerIsElevated = isAdmin(viewerProfile) || isModerator(viewerProfile);

  const metadata = authUser?.user?.user_metadata as Record<string, unknown> | undefined;
  const discordAvatarUrl =
    (metadata?.avatar_url as string | undefined) ?? (metadata?.picture as string | undefined) ?? null;

  return {
    ok: true,
    viewerIsElevated,
    profile: {
      id: targetProfile.id as string,
      username: targetProfile.username as string,
      nameStyleKey: (targetProfile.active_name_style_key as string | null) ?? null,
      role: (targetProfile.role as string) ?? "user",
      credits: Number(targetProfile.credits ?? 0),
      streakDays: Number(targetProfile.streak_days ?? 0),
      casesOpened: Number(targetProfile.cases_opened ?? 0),
      memberSince: targetProfile.created_at as string,
      discordAvatarUrl,
      verified: Boolean(targetProfile.verified),
      warningStrikes: Number(targetProfile.warning_strikes ?? 0),
      tempBannedUntil: ((targetProfile as unknown as Record<string, unknown>).temp_banned_until as string | null) ?? null,
      prioBadges: (targetProfile.prio_badges as string[] | null) ?? [],
    },
  };
}
