import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorldShell } from "@/components/world/world-shell";
import { getMonsterTypes } from "@/lib/actions/monsters";
import { getPetConfigs } from "@/lib/actions/pets";
import { getKillStreakConfig } from "@/lib/actions/kill-streak";
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

  // `damage`/armor/perk/shield columns may not exist yet if those
  // migrations haven't run — try with everything first (needed so the
  // equipped weapon's actual power, armor, perks, and shield reach the
  // World's attack/defense logic, see lib/combat.ts) and fall back to the
  // columns that were always there rather than breaking the whole World
  // page over one missing column.
  const withStats = await supabase
    .from("inventory")
    .select("item:items(name, rarity, type, damage, armor, perk_type, perk_magnitude, shield_hp, shield_regen_cooldown_sec)")
    .eq("user_id", user.id)
    .eq("equipped", true);
  let equipped: { item: unknown }[] | null = withStats.data;
  if (withStats.error) {
    const retry = await supabase
      .from("inventory")
      .select("item:items(name, rarity, type)")
      .eq("user_id", user.id)
      .eq("equipped", true);
    equipped = (retry.data ?? []).map((row) => ({
      item: row.item ? { ...row.item, damage: null, armor: 0, perk_type: "none", perk_magnitude: 0, shield_hp: 0, shield_regen_cooldown_sec: 0 } : null,
    }));
  }

  const { count: inventoryCount } = await supabase
    .from("inventory")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  const monsterTypes = await getMonsterTypes();
  const petTypes = await getPetConfigs();
  const killStreakConfig = await getKillStreakConfig();

  const equippedByCategory: Record<string, EquippedItem> = {};
  for (const row of (equipped ?? []) as unknown as { item: EquippedItem & { type: string } }[]) {
    if (row.item) equippedByCategory[row.item.type] = row.item;
  }

  return (
    <WorldShell
      userId={user.id}
      credits={profile?.credits ?? 0}
      streakDays={profile?.streak_days ?? 0}
      inventoryCount={inventoryCount ?? 0}
      equippedByCategory={equippedByCategory}
      gender={(profile?.gender as "m" | "w") ?? "m"}
      username={profile?.username ?? "Spieler"}
      monsterTypes={monsterTypes}
      petTypes={petTypes}
      killStreakConfig={killStreakConfig}
    />
  );
}
