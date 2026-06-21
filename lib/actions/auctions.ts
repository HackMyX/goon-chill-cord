"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeListingFee, MIN_DURATION_HOURS, MAX_DURATION_HOURS, MIN_BID_INCREMENT } from "@/lib/auctions";
import { notifyUser } from "@/lib/notifications-internal";
import type { Rarity } from "@/lib/cases";

export interface AuctionEntry {
  id: string;
  sellerId: string;
  sellerName: string;
  itemId: string;
  itemName: string;
  itemRarity: Rarity;
  itemType: string;
  startingBid: number;
  currentBid: number;
  currentBidderName: string | null;
  listingFee: number;
  status: "active" | "sold" | "expired" | "cancelled";
  endsAt: string;
  createdAt: string;
}

export interface AuctionActionResult {
  success: boolean;
  error?: string;
}


/**
 * Finalizes every auction whose `ends_at` has passed — there's no cron
 * job in this app, so this is called at the top of every /auctions page
 * load instead (cheap no-op when nothing's expired, and at worst an
 * auction sits "expired but not yet swept" for as long as nobody visits
 * the page, which is harmless since nothing about it is time-sensitive
 * for other systems).
 */
export async function sweepExpiredAuctions(): Promise<void> {
  const admin = createAdminClient();
  const { data: expired } = await admin
    .from("auctions")
    .select("id, seller_id, inventory_id, current_bid, current_bidder_id, item:items(name)")
    .eq("status", "active")
    .lt("ends_at", new Date().toISOString());

  if (!expired || expired.length === 0) return;

  for (const auction of expired) {
    const itemName = (auction.item as unknown as { name: string } | null)?.name ?? "ein Item";

    if (!auction.current_bidder_id) {
      // No bids — nothing to transfer, item was never moved out of the
      // seller's inventory in the first place.
      await admin.from("auctions").update({ status: "expired", resolved_at: new Date().toISOString() }).eq("id", auction.id);
      continue;
    }

    const { data: bidderProfile } = await admin
      .from("profiles")
      .select("credits")
      .eq("id", auction.current_bidder_id)
      .single();
    const { data: sellerProfile } = await admin
      .from("profiles")
      .select("credits")
      .eq("id", auction.seller_id)
      .single();

    if (!bidderProfile || !sellerProfile || bidderProfile.credits < auction.current_bid) {
      // Winning bidder can no longer afford it (spent credits elsewhere
      // since bidding) — auction expires unsold rather than failing the
      // sweep entirely. Bid amounts are only ever validated, never
      // escrowed, which is exactly the tradeoff that makes this possible;
      // documented in placeBid() below.
      await admin.from("auctions").update({ status: "expired", resolved_at: new Date().toISOString() }).eq("id", auction.id);
      continue;
    }

    await admin
      .from("inventory")
      .update({ user_id: auction.current_bidder_id, equipped: false })
      .eq("id", auction.inventory_id);
    await admin
      .from("profiles")
      .update({ credits: bidderProfile.credits - auction.current_bid })
      .eq("id", auction.current_bidder_id);
    await admin
      .from("profiles")
      .update({ credits: sellerProfile.credits + auction.current_bid })
      .eq("id", auction.seller_id);
    await admin
      .from("auctions")
      .update({ status: "sold", resolved_at: new Date().toISOString() })
      .eq("id", auction.id);

    try {
      await admin.from("audit_logs").insert({
        user_id: auction.seller_id,
        action: "auction_sold",
        payload: {
          auctionId: auction.id,
          buyerId: auction.current_bidder_id,
          price: auction.current_bid,
        },
      });
    } catch {
      // best-effort
    }

    await notifyUser({
      userId: auction.seller_id,
      type: "auction_sold",
      title: "Auktion verkauft!",
      message: `${itemName} wurde für ${auction.current_bid.toLocaleString("de-DE")} CR verkauft.`,
      link: "/auctions",
    });
    await notifyUser({
      userId: auction.current_bidder_id,
      type: "auction_won",
      title: "Auktion gewonnen!",
      message: `Du hast ${itemName} für ${auction.current_bid.toLocaleString("de-DE")} CR gewonnen.`,
      link: "/auctions",
    });
  }
}

export async function createAuction(input: {
  inventoryId: string;
  startingBid: number;
  durationHours: number;
}): Promise<AuctionActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  if (!Number.isFinite(input.startingBid) || input.startingBid < 1) {
    return { success: false, error: "Ungültiges Startgebot." };
  }
  const durationHours = Math.min(
    MAX_DURATION_HOURS,
    Math.max(MIN_DURATION_HOURS, Math.floor(input.durationHours))
  );

  const { data: invRow } = await supabase
    .from("inventory")
    .select("id, equipped")
    .eq("id", input.inventoryId)
    .eq("user_id", user.id)
    .single();
  if (!invRow) return { success: false, error: "Dieses Item gehört dir nicht." };

  const { count: alreadyListed } = await supabase
    .from("auctions")
    .select("*", { count: "exact", head: true })
    .eq("inventory_id", input.inventoryId)
    .eq("status", "active");
  if ((alreadyListed ?? 0) > 0) {
    return { success: false, error: "Dieses Item ist bereits in einer aktiven Auktion." };
  }

  const fee = computeListingFee(input.startingBid);
  const { data: profile } = await supabase.from("profiles").select("credits").eq("id", user.id).single();
  if (!profile || profile.credits < fee) {
    return { success: false, error: `Du brauchst ${fee} CR Einstellgebühr, um diese Auktion zu starten.` };
  }

  const { data: itemRow } = await supabase
    .from("inventory")
    .select("item:items(id)")
    .eq("id", input.inventoryId)
    .single();
  const itemId = (itemRow?.item as unknown as { id: string } | null)?.id;
  if (!itemId) return { success: false, error: "Item konnte nicht aufgelöst werden." };

  const admin = createAdminClient();
  await admin.from("profiles").update({ credits: profile.credits - fee }).eq("id", user.id);
  // Unequip it — can't keep wearing something that's up for auction.
  await admin.from("inventory").update({ equipped: false }).eq("id", input.inventoryId);

  const { error } = await admin.from("auctions").insert({
    seller_id: user.id,
    inventory_id: input.inventoryId,
    item_id: itemId,
    starting_bid: Math.floor(input.startingBid),
    current_bid: Math.floor(input.startingBid),
    listing_fee: fee,
    status: "active",
    ends_at: new Date(Date.now() + durationHours * 3_600_000).toISOString(),
  });

  if (error) {
    // Roll back the fee charge since the listing itself never happened.
    await admin.from("profiles").update({ credits: profile.credits }).eq("id", user.id);
    return { success: false, error: "Auktion konnte nicht erstellt werden." };
  }

  revalidatePath("/auctions");
  revalidatePath("/garderobe");
  return { success: true };
}

/**
 * Bids are validated (the bidder must afford it *right now*) but not
 * escrowed — no credits move until the auction actually resolves
 * (sweepExpiredAuctions). This is what keeps outbidding simple (no refund
 * bookkeeping for the previous high bidder), at the cost of a winning
 * bidder theoretically being able to spend their credits elsewhere before
 * the auction ends; that edge case is handled at resolution time by
 * letting the auction expire unsold instead of failing.
 */
export async function placeBid(auctionId: string, amount: number): Promise<AuctionActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const { data: auction } = await supabase
    .from("auctions")
    .select("seller_id, current_bid, current_bidder_id, status, ends_at, item:items(name)")
    .eq("id", auctionId)
    .single();

  if (!auction || auction.status !== "active") {
    return { success: false, error: "Diese Auktion ist nicht mehr aktiv." };
  }
  if (new Date(auction.ends_at).getTime() <= Date.now()) {
    return { success: false, error: "Diese Auktion ist bereits abgelaufen." };
  }
  if (auction.seller_id === user.id) {
    return { success: false, error: "Du kannst nicht auf deine eigene Auktion bieten." };
  }
  if (!Number.isFinite(amount) || amount < auction.current_bid + MIN_BID_INCREMENT) {
    return { success: false, error: `Gebot muss mindestens ${auction.current_bid + MIN_BID_INCREMENT} CR sein.` };
  }

  const { data: profile } = await supabase.from("profiles").select("credits").eq("id", user.id).single();
  if (!profile || profile.credits < amount) {
    return { success: false, error: "Nicht genug Credits für dieses Gebot." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("auctions")
    .update({ current_bid: Math.floor(amount), current_bidder_id: user.id })
    .eq("id", auctionId)
    .eq("status", "active")
    .lt("current_bid", amount);

  if (error) return { success: false, error: "Gebot konnte nicht platziert werden." };

  const itemName = (auction.item as unknown as { name: string } | null)?.name ?? "ein Item";
  const { data: bidderProfile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  await notifyUser({
    userId: auction.seller_id,
    type: "auction_bid",
    title: "Neues Gebot",
    message: `${bidderProfile?.username ?? "Ein Spieler"} hat ${Math.floor(amount).toLocaleString("de-DE")} CR auf ${itemName} geboten.`,
    link: "/auctions",
  });
  // Whoever held the high bid before this one just got outbid.
  if (auction.current_bidder_id && auction.current_bidder_id !== user.id) {
    await notifyUser({
      userId: auction.current_bidder_id,
      type: "auction_outbid",
      title: "Überboten!",
      message: `Du wurdest bei ${itemName} überboten — aktuelles Gebot: ${Math.floor(amount).toLocaleString("de-DE")} CR.`,
      link: "/auctions",
    });
  }

  revalidatePath("/auctions");
  return { success: true };
}

export async function cancelAuction(auctionId: string): Promise<AuctionActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const { data: auction } = await supabase
    .from("auctions")
    .select("seller_id, current_bidder_id, status")
    .eq("id", auctionId)
    .single();

  if (!auction || auction.seller_id !== user.id || auction.status !== "active") {
    return { success: false, error: "Auktion kann nicht abgebrochen werden." };
  }
  if (auction.current_bidder_id) {
    return { success: false, error: "Eine Auktion mit aktivem Gebot kann nicht mehr abgebrochen werden." };
  }

  const { error } = await supabase
    .from("auctions")
    .update({ status: "cancelled", resolved_at: new Date().toISOString() })
    .eq("id", auctionId)
    .eq("seller_id", user.id);

  if (error) return { success: false, error: "Abbruch fehlgeschlagen." };

  revalidatePath("/auctions");
  return { success: true };
}
