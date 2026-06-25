"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Rarity } from "@/lib/cases";

export interface PublicProfile {
  id: string;
  username: string;
  role: string;
  credits: number;
  casesOpened: number;
  memberSince: string;
  gender: "m" | "w";
  discordName: string | null;
  discordAvatarUrl: string | null;
  verified: boolean;
  equippedByCategory: Record<string, { id: string; name: string; rarity: Rarity }>;
  rarityCounts: Record<Rarity, number>;
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

  const [{ data: profile }, { data: inventory }, { data: authUser }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, username, role, credits, cases_opened, created_at, gender, verified")
      .eq("id", targetUserId)
      .single(),
    admin
      .from("inventory")
      .select("id, equipped, obtained_at, item:items(id, name, rarity, type)")
      .eq("user_id", targetUserId)
      .order("obtained_at", { ascending: true }),
    admin.auth.admin.getUserById(targetUserId),
  ]);

  if (!profile) return { success: false, error: "Profil nicht gefunden." };

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
      role: profile.role,
      credits: profile.credits,
      casesOpened: profile.cases_opened,
      memberSince: profile.created_at,
      gender: (profile.gender as "m" | "w") ?? "m",
      discordName,
      discordAvatarUrl,
      verified: (profile.verified as boolean | null) ?? false,
      equippedByCategory,
      rarityCounts,
    },
  };
}
