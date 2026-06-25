import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlayerListShell, type PlayerCard } from "@/components/community/player-list-shell";
import { isAdmin, isModerator } from "@/lib/admin";
import type { Rarity } from "@/lib/cases";
import type { EquippedItem } from "@/lib/rarity-colors";

export default async function CommunityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("credits, streak_days, role, username")
    .eq("id", user.id)
    .single();

  // Reading every player's profile is fine through the regular RLS-bound
  // client (the existing dashboard leaderboard already does the same
  // username+credits read for other users) — but their *inventory* rows
  // are not, same as the admin panel's getUserDetail. The admin client is
  // used here purely to aggregate public-facing rarity counts, not to
  // expose anything a player wouldn't already see about themselves.
  const admin = createAdminClient();

  const [{ data: profiles }, { data: inventory }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, username, credits, role, created_at, gender, streak_days, verified, active_name_style_key, level")
      .or(`profile_visible.eq.true,id.eq.${user.id}`)
      .order("credits", { ascending: false }),
    admin
      .from("inventory")
      .select("user_id, equipped, item:items(id, name, rarity, type)"),
  ]);

  const rarityCountsByUser = new Map<string, Record<Rarity, number>>();
  const equippedByUser = new Map<string, Record<string, EquippedItem | undefined>>();

  for (const row of (inventory ?? []) as unknown as {
    user_id: string;
    equipped: boolean;
    item: { id: string; name: string; rarity: Rarity; type: string } | null;
  }[]) {
    if (!row.item) continue;
    const counts =
      rarityCountsByUser.get(row.user_id) ??
      ({ normal: 0, selten: 0, mythisch: 0, ultra: 0 } as Record<Rarity, number>);
    counts[row.item.rarity] += 1;
    rarityCountsByUser.set(row.user_id, counts);

    if (row.equipped) {
      const equipped = equippedByUser.get(row.user_id) ?? {};
      if (row.item.type === "ring") {
        const slotKey = equipped["ring"] ? "ring2" : "ring";
        equipped[slotKey] = { id: row.item.id, name: row.item.name, rarity: row.item.rarity };
      } else {
        equipped[row.item.type] = { id: row.item.id, name: row.item.name, rarity: row.item.rarity };
      }
      equippedByUser.set(row.user_id, equipped);
    }
  }

  const players: PlayerCard[] = (profiles ?? []).map((p) => ({
    id: p.id,
    username: p.username,
    nameStyleKey: (p as Record<string, unknown>).active_name_style_key as string | undefined,
    credits: p.credits,
    role: p.role,
    memberSince: p.created_at,
    streakDays: (p.streak_days as number) ?? 0,
    gender: (p.gender as "m" | "w") ?? "m",
    verified: (p.verified as boolean | null) ?? false,
    level: Number((p as unknown as Record<string, unknown>).level ?? 1),
    equippedByCategory: equippedByUser.get(p.id) ?? {},
    rarityCounts:
      rarityCountsByUser.get(p.id) ?? { normal: 0, selten: 0, mythisch: 0, ultra: 0 },
  }));

  return (
    <PlayerListShell
      players={players}
      credits={viewerProfile?.credits ?? 0}
      streakDays={viewerProfile?.streak_days ?? 0}
      viewerId={user.id}
      isAdmin={isAdmin(viewerProfile)}
      isModerator={isModerator(viewerProfile)}
    />
  );
}
