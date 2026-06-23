import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sweepExpiredAuctions } from "@/lib/actions/auctions";
import { isAdmin, isModerator } from "@/lib/admin";
import {
  AuctionsShell,
  type AuctionListEntry,
  type OwnedItem,
} from "@/components/auctions/auctions-shell";
import type { Rarity } from "@/lib/cases";

export default async function AuctionsPage() {
  await sweepExpiredAuctions();

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

  const auctionColumnsBase =
    "id, seller_id, inventory_id, current_bid, current_bidder_id, listing_fee, status, ends_at, created_at, item:items(id, name, rarity, type), seller:profiles!auctions_seller_id_fkey(username), bidder:profiles!auctions_current_bidder_id_fkey(username)";

  const [auctionsResult, { data: myInventory }] = await Promise.all([
    // `buyout_price` may not exist yet if that migration hasn't run — try
    // with it first and fall back to the base columns rather than
    // breaking the whole auction house over one missing column.
    admin
      .from("auctions")
      .select(`${auctionColumnsBase}, buyout_price`)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("inventory")
      .select("id, equipped, item:items(id, name, rarity, type)")
      .eq("user_id", user.id),
  ]);
  let auctionRows = auctionsResult.data;
  if (auctionsResult.error) {
    const retry = await admin
      .from("auctions")
      .select(auctionColumnsBase)
      .order("created_at", { ascending: false })
      .limit(50);
    auctionRows = (retry.data ?? []).map((a) => ({ ...a, buyout_price: null }));
  }

  // Items already in an active auction can't be listed again — filter
  // them out of the "Item inserieren" picker rather than letting the
  // server action reject it after the fact.
  const activelyListedInventoryIds = new Set(
    (auctionRows ?? []).filter((a) => a.status === "active").map((a) => a.inventory_id)
  );

  const auctions: AuctionListEntry[] = (auctionRows ?? [])
    .filter((a) => a.item)
    .map((a) => {
      const item = a.item as unknown as { id: string; name: string; rarity: Rarity; type: string };
      const seller = a.seller as unknown as { username: string } | null;
      const bidder = a.bidder as unknown as { username: string } | null;
      return {
        id: a.id,
        sellerId: a.seller_id,
        sellerName: seller?.username ?? "?",
        itemId: item.id,
        itemName: item.name,
        itemRarity: item.rarity,
        itemType: item.type,
        currentBid: a.current_bid,
        currentBidderName: bidder?.username ?? null,
        listingFee: a.listing_fee,
        buyoutPrice: a.buyout_price ?? null,
        status: a.status,
        endsAt: a.ends_at,
        createdAt: a.created_at,
      };
    });

  const myItems: OwnedItem[] = (myInventory ?? [])
    .filter((row) => row.item && !activelyListedInventoryIds.has(row.id))
    .map((row) => {
      const item = row.item as unknown as { id: string; name: string; rarity: Rarity; type: string };
      return { inventoryId: row.id, name: item.name, rarity: item.rarity, type: item.type };
    });

  return (
    <AuctionsShell
      credits={profile?.credits ?? 0}
      streakDays={profile?.streak_days ?? 0}
      isAdmin={isAdmin(profile)}
      isModerator={isModerator(profile)}
      viewerId={user.id}
      myItems={myItems}
      auctions={auctions}
    />
  );
}
