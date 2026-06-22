import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WardrobeShell, type InventoryRow } from "@/components/wardrobe/wardrobe-shell";
import { isAdmin } from "@/lib/admin";

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
    .select("credits, streak_days, gender, gender_locked, role, username")
    .eq("id", user.id)
    .single();

  // `damage` may not exist yet if that migration hasn't run — try with it
  // first (needed so weapon items show their power in the wardrobe, see
  // lib/combat.ts) and fall back to the columns that were always there.
  const withDamage = await supabase
    .from("inventory")
    .select("id, equipped, obtained_at, item:items(id, name, rarity, type, price_cr, damage)")
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
      item: row.item ? { ...row.item, damage: null } : null,
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
      isAdmin={isAdmin(profile)}
    />
  );
}
