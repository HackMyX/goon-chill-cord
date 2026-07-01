import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ParkourShell, type ParkourFriend } from "@/components/parkour/parkour-shell";
import { getParkourConfig, getMyParkourBests, getParkourLobby } from "@/lib/actions/parkour";
import { getFriendData } from "@/lib/actions/friends";
import { isAdmin, isModerator } from "@/lib/admin";
import type { EquippedItem } from "@/lib/rarity-colors";

export const dynamic = "force-dynamic";

export default async function ParkourPage({
  searchParams,
}: {
  searchParams: Promise<{ lobby?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits, streak_days, username, gender, role, verified")
    .eq("id", user.id)
    .single();

  const config = await getParkourConfig();
  if (!config.enabled && !isAdmin(profile)) redirect("/");

  // Equipped cosmetics → category map (same fallback pattern as the farm world,
  // where the damage/armor/perk columns may not exist in every environment).
  const withStats = await supabase
    .from("inventory")
    .select("item:items(name, rarity, type, damage, armor, perk_type, perk_magnitude, shield_hp, shield_regen_cooldown_sec)")
    .eq("user_id", user.id)
    .eq("equipped", true)
    .order("obtained_at", { ascending: true });
  let equipped: { item: unknown }[] | null = withStats.data;
  if (withStats.error) {
    const retry = await supabase
      .from("inventory")
      .select("item:items(name, rarity, type)")
      .eq("user_id", user.id)
      .eq("equipped", true)
      .order("obtained_at", { ascending: true });
    equipped = (retry.data ?? []).map((row) => ({
      item: row.item ? { ...row.item, damage: null, armor: 0, perk_type: "none", perk_magnitude: 0, shield_hp: 0, shield_regen_cooldown_sec: 0 } : null,
    }));
  }

  const { count: inventoryCount } = await supabase
    .from("inventory")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  const [bests, friendData] = await Promise.all([
    getMyParkourBests(user.id),
    getFriendData(),
  ]);

  const initialLobby = sp?.lobby ? await getParkourLobby(sp.lobby) : null;

  const equippedByCategory: Record<string, EquippedItem> = {};
  let ringCount = 0;
  for (const row of (equipped ?? []) as unknown as { item: EquippedItem & { type: string } }[]) {
    if (!row.item) continue;
    if (row.item.type === "ring") {
      equippedByCategory[ringCount === 0 ? "ring" : "ring2"] = row.item;
      ringCount++;
    } else {
      equippedByCategory[row.item.type] = row.item;
    }
  }

  const friends: ParkourFriend[] = (friendData.friends ?? []).map((f) => ({
    userId: f.userId,
    username: f.username,
    nameStyleKey: f.nameStyleKey,
  }));

  return (
    <ParkourShell
      userId={user.id}
      username={profile?.username ?? "Spieler"}
      gender={(profile?.gender as "m" | "w") ?? "m"}
      equippedByCategory={equippedByCategory}
      credits={profile?.credits ?? 0}
      streakDays={profile?.streak_days ?? 0}
      inventoryCount={inventoryCount ?? 0}
      config={config}
      myBests={bests}
      friends={friends}
      initialLobby={initialLobby}
      isAdmin={isAdmin(profile)}
      isModerator={isModerator(profile)}
    />
  );
}
