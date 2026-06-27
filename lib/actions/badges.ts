"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { logDebugEvent } from "@/lib/debug-log-server";
import { recomputeAutoPrioBadges } from "@/lib/actions/prio-badges";
import type { BadgeDefinition, UserBadge } from "@/lib/badges";

// ─────────────────────────────────────────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, role")
    .eq("id", user.id)
    .single();

  if (!isAdmin(profile)) return null;
  return user;
}

async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row mappers
// ─────────────────────────────────────────────────────────────────────────────

function rowToDefinition(r: Record<string, unknown>): BadgeDefinition {
  return {
    key: r.key as string,
    label: r.label as string,
    color: r.color as string,
    icon: r.icon as string,
    description: (r.description as string | null) ?? null,
  };
}

function rowToUserBadge(r: Record<string, unknown>): UserBadge {
  const def = r.badge_definitions as Record<string, unknown>;
  return {
    id: r.id as string,
    userId: r.user_id as string,
    badgeKey: r.badge_key as string,
    badge: rowToDefinition(def),
    grantedAt: r.granted_at as string,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public read actions
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch all badge definitions ordered by key. */
export async function getBadgeDefinitions(): Promise<BadgeDefinition[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("badge_definitions")
    .select("key, label, color, icon, description")
    .order("key", { ascending: true });

  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(rowToDefinition);
}

/** Fetch all badges for a specific user, joined with badge_definitions. */
export async function getUserBadges(userId: string): Promise<UserBadge[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_badges")
    .select("id, user_id, badge_key, granted_at, badge_definitions(key, label, color, icon, description)")
    .eq("user_id", userId)
    .order("granted_at", { ascending: true });

  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(rowToUserBadge);
}

/** Fetch badges for the currently authenticated user. */
export async function getMyBadges(): Promise<UserBadge[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return getUserBadges(user.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin mutations — badge grants / revokes
// ─────────────────────────────────────────────────────────────────────────────

/** Grant a badge to a user (upsert — safe to call if already granted). */
export async function adminGrantBadge(
  userId: string,
  badgeKey: string
): Promise<{ success: boolean; error?: string }> {
  const adminUser = await requireAdmin();
  if (!adminUser) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin.from("user_badges").upsert(
    {
      user_id: userId,
      badge_key: badgeKey,
      granted_by: adminUser.id,
      granted_at: new Date().toISOString(),
    },
    { onConflict: "user_id,badge_key", ignoreDuplicates: false }
  );

  if (error) {
    await logDebugEvent({
      level: "error",
      scope: "badges.adminGrantBadge",
      message: `Failed to grant badge "${badgeKey}" to user ${userId}`,
      detail: error.message,
      context: { userId, badgeKey, adminId: adminUser.id },
    });
    return { success: false, error: error.message };
  }

  await logDebugEvent({
    level: "info",
    scope: "badges.adminGrantBadge",
    message: `Badge "${badgeKey}" granted to user ${userId}`,
    context: { userId, badgeKey, adminId: adminUser.id },
  });

  // Keep the user's displayed prio-badges in sync (auto-equip picks up the
  // new badge; a custom user is left untouched unless this fills an empty set).
  await recomputeAutoPrioBadges(userId);

  revalidatePath("/");
  return { success: true };
}

/** Revoke a badge from a user. */
export async function adminRevokeBadge(
  userId: string,
  badgeKey: string
): Promise<{ success: boolean; error?: string }> {
  const adminUser = await requireAdmin();
  if (!adminUser) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("user_badges")
    .delete()
    .eq("user_id", userId)
    .eq("badge_key", badgeKey);

  if (error) {
    await logDebugEvent({
      level: "error",
      scope: "badges.adminRevokeBadge",
      message: `Failed to revoke badge "${badgeKey}" from user ${userId}`,
      detail: error.message,
      context: { userId, badgeKey, adminId: adminUser.id },
    });
    return { success: false, error: error.message };
  }

  await logDebugEvent({
    level: "info",
    scope: "badges.adminRevokeBadge",
    message: `Badge "${badgeKey}" revoked from user ${userId}`,
    context: { userId, badgeKey, adminId: adminUser.id },
  });

  // Drop the revoked badge from the user's displayed set (and re-fill from
  // auto if that emptied an auto-equip nametag).
  await recomputeAutoPrioBadges(userId);

  revalidatePath("/");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin mutations — badge definition management
// ─────────────────────────────────────────────────────────────────────────────

/** Create a new badge definition. */
export async function adminCreateBadgeDefinition(input: {
  key: string;
  label: string;
  color: string;
  icon: string;
  description: string;
}): Promise<{ success: boolean; error?: string }> {
  const adminUser = await requireAdmin();
  if (!adminUser) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin.from("badge_definitions").insert({
    key: input.key,
    label: input.label,
    color: input.color,
    icon: input.icon,
    description: input.description,
    created_by: adminUser.id,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  return { success: true };
}

/** Update an existing badge definition (partial patch). */
export async function adminUpdateBadgeDefinition(
  key: string,
  patch: {
    label?: string;
    color?: string;
    icon?: string;
    description?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const adminUser = await requireAdmin();
  if (!adminUser) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("badge_definitions")
    .update(patch)
    .eq("key", key);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  return { success: true };
}

/** Delete a badge definition (cascades to user_badges via FK). */
export async function adminDeleteBadgeDefinition(
  key: string
): Promise<{ success: boolean; error?: string }> {
  const adminUser = await requireAdmin();
  if (!adminUser) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("badge_definitions")
    .delete()
    .eq("key", key);

  if (error) {
    return { success: false, error: error.message };
  }

  // The delete cascades to user_badges (FK), but profiles.prio_badges is a plain
  // jsonb array (no FK) and would keep the now-dead key — rendering as a raw grey
  // key at the player's name everywhere. Recompute every affected user's display
  // list so the dead key is dropped (works for both auto and custom-pinned users).
  const { data: affected } = await admin
    .from("profiles")
    .select("id")
    .contains("prio_badges", [key]);
  for (const row of affected ?? []) {
    await recomputeAutoPrioBadges((row as { id: string }).id);
  }

  revalidatePath("/");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-award logic — triggered by system events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check and automatically award Name Style achievement badges.
 * Safe to call from anywhere after a user receives a new name style — never throws.
 */
export async function checkAndAwardNameStyleBadges(userId: string): Promise<void> {
  try {
    const admin = createAdminClient();

    // Count all owned styles
    const { count: styleCount } = await admin
      .from("user_name_styles")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    // Grant ns_collector when user owns 5+
    if ((styleCount ?? 0) >= 5) {
      await admin
        .from("user_badges")
        .upsert({ user_id: userId, badge_key: "ns_collector" }, { onConflict: "user_id,badge_key" });
    }

    // Fetch all owned style keys to check rarities
    const { data: ownedRows } = await admin
      .from("user_name_styles")
      .select("style_key")
      .eq("user_id", userId);

    if (ownedRows && ownedRows.length > 0) {
      const styleKeys = ownedRows.map((r) => r.style_key as string);

      // Check for any mythisch-rarity styles
      const { data: mythischOwned } = await admin
        .from("name_styles")
        .select("key")
        .in("key", styleKeys)
        .eq("rarity", "mythisch")
        .limit(1);

      if (mythischOwned && mythischOwned.length > 0) {
        await admin
          .from("user_badges")
          .upsert({ user_id: userId, badge_key: "ns_mythisch" }, { onConflict: "user_id,badge_key" });
      }

      // Check for any ultra-rarity styles
      const { data: ultraOwned } = await admin
        .from("name_styles")
        .select("key")
        .in("key", styleKeys)
        .eq("rarity", "ultra")
        .limit(1);

      if (ultraOwned && ultraOwned.length > 0) {
        await admin
          .from("user_badges")
          .upsert({ user_id: userId, badge_key: "ns_ultra" }, { onConflict: "user_id,badge_key" });
      }
    }

    // Reflect any newly-awarded achievement badges in the displayed set.
    await recomputeAutoPrioBadges(userId);
  } catch {
    // Never block the calling action
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin read — all user badges for admin panel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a map of { userId: badgeKey[] } covering every user_badges row.
 * Intended for the admin panel overview — fetches in batches to avoid
 * hitting Supabase's default 1 000-row limit.
 */
export async function adminGetAllUserBadges(): Promise<Record<string, string[]>> {
  const adminUser = await requireAdmin();
  if (!adminUser) return {};

  const admin = createAdminClient();
  const PAGE = 1000;
  const result: Record<string, string[]> = {};
  let from = 0;

  while (true) {
    const { data, error } = await admin
      .from("user_badges")
      .select("user_id, badge_key")
      .range(from, from + PAGE - 1)
      .order("user_id", { ascending: true });

    if (error || !data || data.length === 0) break;

    for (const row of data as { user_id: string; badge_key: string }[]) {
      if (!result[row.user_id]) result[row.user_id] = [];
      result[row.user_id].push(row.badge_key);
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  return result;
}
