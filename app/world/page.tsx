import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorldShell } from "@/components/world/world-shell";
import type { EquippedItem } from "@/lib/rarity-colors";

export default async function WorldPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits, streak_days, username, gender")
    .eq("id", user.id)
    .single();

  const { data: equipped } = await supabase
    .from("inventory")
    .select("item:items(name, rarity, type)")
    .eq("user_id", user.id)
    .eq("equipped", true);

  const { count: inventoryCount } = await supabase
    .from("inventory")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  const equippedByCategory: Record<string, EquippedItem> = {};
  for (const row of (equipped ?? []) as unknown as { item: EquippedItem & { type: string } }[]) {
    if (row.item) equippedByCategory[row.item.type] = row.item;
  }

  return (
    <WorldShell
      credits={profile?.credits ?? 0}
      streakDays={profile?.streak_days ?? 0}
      inventoryCount={inventoryCount ?? 0}
      equippedByCategory={equippedByCategory}
      gender={(profile?.gender as "m" | "w") ?? "m"}
      username={profile?.username ?? "Spieler"}
    />
  );
}
