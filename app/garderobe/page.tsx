import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WardrobeShell, type InventoryRow } from "@/components/wardrobe/wardrobe-shell";

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
    .select("credits, streak_days, gender")
    .eq("id", user.id)
    .single();

  const { data: inventory } = await supabase
    .from("inventory")
    .select("id, equipped, item:items(id, name, rarity, type)")
    .eq("user_id", user.id);

  const inventoryRows = (inventory ?? []) as unknown as InventoryRow[];

  return (
    <WardrobeShell
      credits={profile?.credits ?? 0}
      inventoryCount={inventoryRows.length}
      streakDays={profile?.streak_days ?? 0}
      initialInventory={inventoryRows}
      initialGender={(profile?.gender as "m" | "w") ?? "m"}
    />
  );
}
