"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EquippedItem } from "@/lib/rarity-colors";

export interface RemoteLoadout {
  username: string;
  gender: "m" | "w";
  equippedByCategory: Record<string, EquippedItem>;
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

  const [{ data: profile }, { data: inventory }] = await Promise.all([
    admin.from("profiles").select("username, gender").eq("id", targetUserId).single(),
    admin
      .from("inventory")
      .select(
        "item:items(id, name, rarity, type, damage, armor, perk_type, perk_magnitude, shield_hp, shield_regen_cooldown_sec)"
      )
      .eq("user_id", targetUserId)
      .eq("equipped", true),
  ]);

  if (!profile) return { success: false, error: "Profil nicht gefunden." };

  const equippedByCategory: Record<string, EquippedItem> = {};
  for (const row of (inventory ?? []) as unknown as { item: (EquippedItem & { type: string }) | null }[]) {
    if (row.item) equippedByCategory[row.item.type] = row.item;
  }

  return {
    success: true,
    loadout: {
      username: profile.username,
      gender: (profile.gender as "m" | "w") ?? "m",
      equippedByCategory,
    },
  };
}
