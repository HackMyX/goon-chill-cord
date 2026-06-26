"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EquippedItem } from "@/lib/rarity-colors";

export interface RemoteLoadout {
  username: string;
  gender: "m" | "w";
  verified: boolean;
  role: "user" | "moderator" | "admin";
  nameStyleKey: string | null;
  equippedByCategory: Record<string, EquippedItem>;
  /** All badge keys granted to this peer. */
  badges: string[];
  /** Pinned Prio-Badge keys (max 2) — shown in the nametag. */
  prioBadges: string[];
}

export interface GetPublicLoadoutResult {
  success: boolean;
  error?: string;
  loadout?: RemoteLoadout;
}

/**
 * Cheap peer-join lookup for the World's multiplayer rendering
 * (lib/world-realtime.ts roster -> components/world/remote-players.tsx):
 * just enough to render another player's `CharacterModel` correctly
 * (gender + equipped cosmetics + display name). Deliberately lighter than
 * lib/actions/community.ts's getPublicProfile, which also resolves Discord
 * identity data and rarity counts for the profile page — none of that is
 * needed here, and this gets called once per peer-join (not per frame), so
 * keeping it cheap matters more than reusing the heavier action.
 */
export async function getPublicLoadout(targetUserId: string): Promise<GetPublicLoadoutResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const admin = createAdminClient();

  const [{ data: profile }, { data: inventory }, { data: badgeRows }] = await Promise.all([
    admin.from("profiles").select("username, gender, verified, role, active_name_style_key, prio_badges").eq("id", targetUserId).single(),
    admin
      .from("inventory")
      .select(
        "obtained_at, item:items(id, name, rarity, type, damage, armor, perk_type, perk_magnitude, shield_hp, shield_regen_cooldown_sec)"
      )
      .eq("user_id", targetUserId)
      .eq("equipped", true)
      .order("obtained_at", { ascending: true }),
    admin
      .from("user_badges")
      .select("badge_key")
      .eq("user_id", targetUserId)
      .order("granted_at", { ascending: true }),
  ]);

  if (!profile) return { success: false, error: "Profil nicht gefunden." };

  const equippedByCategory: Record<string, EquippedItem> = {};
  let ringCount = 0;
  for (const row of (inventory ?? []) as unknown as { item: (EquippedItem & { type: string }) | null }[]) {
    if (!row.item) continue;
    if (row.item.type === "ring") {
      equippedByCategory[ringCount === 0 ? "ring" : "ring2"] = row.item;
      ringCount++;
    } else {
      equippedByCategory[row.item.type] = row.item;
    }
  }

  const badges = (badgeRows ?? []).map((r) => (r as { badge_key: string }).badge_key);
  const prioBadges = (profile.prio_badges as string[] | null) ?? [];

  return {
    success: true,
    loadout: {
      username: profile.username,
      gender: (profile.gender as "m" | "w") ?? "m",
      verified: (profile.verified as boolean | null) ?? false,
      role: (profile.role as "user" | "moderator" | "admin") ?? "user",
      nameStyleKey: (profile.active_name_style_key as string | null) ?? null,
      equippedByCategory,
      badges,
      prioBadges,
    },
  };
}
