import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WardrobeShell, type InventoryRow } from "@/components/wardrobe/wardrobe-shell";
import { isAdmin, isModerator } from "@/lib/admin";
import { getMyAbilities } from "@/lib/actions/abilities";
import { getMyBadges } from "@/lib/actions/badges";
import { getMyPrioBadges } from "@/lib/actions/prio-badges";
import { getSiteConfig } from "@/lib/actions/site-config";

export default async function GarderobePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits, streak_days, gender, gender_locked, role, username, equipped_ability_key")
    .eq("id", user.id)
    .single();

  const [userAbilities, myBadges, myPrioBadges, siteConfig] = await Promise.all([
    getMyAbilities().catch(() => []),
    getMyBadges().catch(() => []),
    getMyPrioBadges().catch(() => []),
    getSiteConfig(),
  ]);

  const withDamage = await supabase
    .from("inventory")
    .select("id, equipped, obtained_at, item:items(id, name, rarity, type, price_cr, damage, armor, perk_type, perk_magnitude, shield_hp, shield_regen_cooldown_sec)")
    .eq("user_id", user.id);
  let inventory: { id: unknown; equipped: unknown; obtained_at: unknown; item: unknown }[] | null =
    withDamage.data;
  if (withDamage.error) {
    const retry = await supabase
      .from("inventory")
      .select("id, equipped, obtained_at, item:items(id, name, rarity, type, price_cr)")
      .eq("user_id", user.id);
    inventory = (retry.data ?? []).map((row) => ({
      ...row,
      item: row.item ? {
        ...row.item,
        damage: null, armor: null, perk_type: null,
        perk_magnitude: null, shield_hp: null, shield_regen_cooldown_sec: null,
      } : null,
    }));
  }

  const inventoryRows = (inventory ?? []) as unknown as InventoryRow[];

  return (
    <WardrobeShell
      credits={profile?.credits ?? 0}
      inventoryCount={inventoryRows.length}
      streakDays={profile?.streak_days ?? 0}
      initialInventory={inventoryRows}
      initialGender={(profile?.gender as "m" | "w") ?? "m"}
      genderLocked={(profile?.gender_locked ?? false) && !isAdmin(profile)}
      username={profile?.username ?? ""}
      isAdmin={isAdmin(profile)}
      isModerator={isModerator(profile)}
      abilities={userAbilities}
      equippedAbilityKey={(profile?.equipped_ability_key as string | null) ?? null}
      initialBadges={myBadges}
      initialPrioBadges={myPrioBadges}
      maxPrioBadges={siteConfig.maxPrioBadges}
    />
  );
}
