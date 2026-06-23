import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TradingShell, type TradeListEntry, type TradablePlayer, type OwnedItem } from "@/components/trading/trading-shell";
import type { Rarity } from "@/lib/cases";
import { isAdmin, isModerator } from "@/lib/admin";

export default async function TradingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits, streak_days, role, username")
    .eq("id", user.id)
    .single();

  const admin = createAdminClient();

  const [{ data: players }, { data: myInventory }, { data: tradeRows }] = await Promise.all([
    admin.from("profiles").select("id, username, accepts_trades").neq("id", user.id).order("username"),
    admin
      .from("inventory")
      .select("id, item:items(id, name, rarity, type)")
      .eq("user_id", user.id),
    admin
      .from("trades")
      .select(
        "id, sender_id, receiver_id, offered_item_ids, requested_item_ids, offered_credits, requested_credits, status, created_at, sender:profiles!trades_sender_id_fkey(username), receiver:profiles!trades_receiver_id_fkey(username)"
      )
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const allItemIds = new Set<string>();
  for (const t of tradeRows ?? []) {
    for (const id of t.offered_item_ids ?? []) allItemIds.add(id);
    for (const id of t.requested_item_ids ?? []) allItemIds.add(id);
  }

  const { data: referencedInventory } =
    allItemIds.size > 0
      ? await admin
          .from("inventory")
          .select("id, item:items(id, name, rarity, type)")
          .in("id", Array.from(allItemIds))
      : { data: [] as never[] };

  const itemById = new Map(
    (referencedInventory ?? []).map((row) => {
      const item = row.item as unknown as { id: string; name: string; rarity: Rarity; type: string } | null;
      return [row.id, item];
    })
  );

  function resolveItems(ids: string[]) {
    return ids
      .map((id) => itemById.get(id))
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .map((item) => ({ id: item.id, name: item.name, rarity: item.rarity, type: item.type }));
  }

  const trades: TradeListEntry[] = (tradeRows ?? []).map((t) => ({
    id: t.id,
    senderId: t.sender_id,
    senderName: (t.sender as unknown as { username: string } | null)?.username ?? "?",
    receiverId: t.receiver_id,
    receiverName: (t.receiver as unknown as { username: string } | null)?.username ?? "?",
    offeredItems: resolveItems(t.offered_item_ids ?? []),
    requestedItems: resolveItems(t.requested_item_ids ?? []),
    offeredCredits: t.offered_credits,
    requestedCredits: t.requested_credits,
    status: t.status,
    createdAt: t.created_at,
  }));

  const myItems: OwnedItem[] = (myInventory ?? [])
    .filter((row) => row.item)
    .map((row) => {
      const item = row.item as unknown as { id: string; name: string; rarity: Rarity; type: string };
      return { inventoryId: row.id, name: item.name, rarity: item.rarity, type: item.type };
    });

  const tradablePlayers: TradablePlayer[] = (players ?? []).map((p) => ({
    id: p.id,
    username: p.username,
    acceptsTrades: p.accepts_trades ?? true,
  }));

  return (
    <TradingShell
      credits={profile?.credits ?? 0}
      streakDays={profile?.streak_days ?? 0}
      viewerId={user.id}
      myItems={myItems}
      players={tradablePlayers}
      trades={trades}
      isAdmin={isAdmin(profile)}
      isModerator={isModerator(profile)}
    />
  );
}
