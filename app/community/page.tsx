import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlayerListShell, type PlayerCard } from "@/components/community/player-list-shell";
import type { Rarity } from "@/lib/cases";

export default async function CommunityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("credits, streak_days")
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
      .select("id, username, credits, role, last_claim_date, created_at")
      .order("credits", { ascending: false }),
    admin.from("inventory").select("user_id, item:items(rarity)"),
  ]);

  const rarityCountsByUser = new Map<string, Record<Rarity, number>>();
  for (const row of (inventory ?? []) as unknown as {
    user_id: string;
    item: { rarity: Rarity } | null;
  }[]) {
    if (!row.item) continue;
    const counts =
      rarityCountsByUser.get(row.user_id) ??
      ({ normal: 0, selten: 0, mythisch: 0, ultra: 0 } as Record<Rarity, number>);
    counts[row.item.rarity] += 1;
    rarityCountsByUser.set(row.user_id, counts);
  }

  const players: PlayerCard[] = (profiles ?? []).map((p) => ({
    id: p.id,
    username: p.username,
    credits: p.credits,
    role: p.role,
    lastClaimDate: p.last_claim_date,
    memberSince: p.created_at,
    rarityCounts:
      rarityCountsByUser.get(p.id) ?? { normal: 0, selten: 0, mythisch: 0, ultra: 0 },
  }));

  return (
    <PlayerListShell
      players={players}
      credits={viewerProfile?.credits ?? 0}
      streakDays={viewerProfile?.streak_days ?? 0}
      viewerId={user.id}
    />
  );
}
