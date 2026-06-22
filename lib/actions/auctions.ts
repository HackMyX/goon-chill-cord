"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeListingFee,
  isValidBuyoutPrice,
  MIN_DURATION_HOURS,
  MAX_DURATION_HOURS,
  MIN_BID_INCREMENT,
  MAX_ACTIVE_AUCTIONS_PER_USER,
} from "@/lib/auctions";
import { notifyUser } from "@/lib/notifications-internal";
import { logDebugEvent } from "@/lib/debug-log-server";
import { getSiteConfig } from "@/lib/actions/site-config";
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
  /** `null` = no buyout, this auction can only be won by outlasting the
   * bidding. See buyAuctionNow() and placeBid()'s auto-buyout path. */
  buyoutPrice: number | null;
  status: "active" | "sold" | "expired" | "cancelled";
  endsAt: string;
  createdAt: string;
}

export interface AuctionActionResult {
  success: boolean;
  error?: string;
}

/** Plain `console.error`, not lib/debug.ts's `debugError` — that helper is
 * a deliberate no-op on the server (`if (typeof window === "undefined")
 * return`). This is what actually shows up in the `next dev` terminal,
 * which matters here specifically because `auctions`/`trades` are brand
 * new tables with no RLS policies — using the regular per-user client
 * against them used to fail silently with no visible cause at all. Also
 * persists to debug_logs (lib/debug-log-server.ts) — these errors are
 * caught and handled gracefully (a friendly message goes back to the
 * user), so instrumentation.ts's onRequestError never sees them; this is
 * the only way they reach the admin Debug Log tab. */
function logServerError(scope: string, message: string, detail?: string) {
  console.error(`[${scope}] ${message}`, detail ?? "");
  void logDebugEvent({ scope, message, detail });
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
  const { data: expired, error: expiredError } = await admin
    .from("auctions")
    .select("id, seller_id, inventory_id, current_bid, current_bidder_id, item:items(name)")
    .eq("status", "active")
    .lt("ends_at", new Date().toISOString());

  if (expiredError) logServerError("Auctions", "sweep query failed", expiredError.message);
  if (!expired || expired.length === 0) return;

  const { currencyName } = await getSiteConfig();

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
      message: `${itemName} wurde für ${auction.current_bid.toLocaleString("de-DE")} ${currencyName} verkauft.`,
      link: "/auctions",
    });
    await notifyUser({
      userId: auction.current_bidder_id,
      type: "auction_won",
      title: "Auktion gewonnen!",
      message: `Du hast ${itemName} für ${auction.current_bid.toLocaleString("de-DE")} ${currencyName} gewonnen.`,
      link: "/auctions",
    });
  }
}

/**
 * All `auctions`-table reads/writes here go through the service-role
 * client, not the regular RLS-bound one — same reasoning as
 * lib/actions/trading.ts: `auctions` is a brand-new table with no RLS
 * policies, so the regular per-user client has no defined access to it.
 * Ownership/affordability is still fully checked against the caller's own
 * verified session before anything is written.
 */
export async function createAuction(input: {
  inventoryId: string;
  startingBid: number;
  durationHours: number;
  /** Optional fixed "Sofortkauf" price — any other player can instantly
   * buy the item for exactly this amount instead of waiting out the
   * auction. `undefined`/`null` disables it for this listing. */
  buyoutPrice?: number | null;
}): Promise<AuctionActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  if (!Number.isFinite(input.startingBid) || input.startingBid < 1) {
    return { success: false, error: "Ungültiges Startgebot." };
  }
  const buyoutPrice = input.buyoutPrice ?? null;
  if (!isValidBuyoutPrice(buyoutPrice, input.startingBid)) {
    return { success: false, error: "Der Sofortkauf-Preis muss höher als das Startgebot sein." };
  }
  const durationHours = Math.min(
    MAX_DURATION_HOURS,
    Math.max(MIN_DURATION_HOURS, Math.floor(input.durationHours))
  );

  const admin = createAdminClient();

  const { count: activeCount, error: activeCountError } = await admin
    .from("auctions")
    .select("*", { count: "exact", head: true })
    .eq("seller_id", user.id)
    .eq("status", "active");
  if (activeCountError) logServerError("Auctions", "active-count query failed", activeCountError.message);
  if ((activeCount ?? 0) >= MAX_ACTIVE_AUCTIONS_PER_USER) {
    return {
      success: false,
      error: `Du kannst maximal ${MAX_ACTIVE_AUCTIONS_PER_USER} Items gleichzeitig im Auktionshaus haben.`,
    };
  }

  const { data: invRow } = await admin
    .from("inventory")
    .select("id, item:items(id)")
    .eq("id", input.inventoryId)
    .eq("user_id", user.id)
    .single();
  if (!invRow) return { success: false, error: "Dieses Item gehört dir nicht." };

  const { count: alreadyListed } = await admin
    .from("auctions")
    .select("*", { count: "exact", head: true })
    .eq("inventory_id", input.inventoryId)
    .eq("status", "active");
  if ((alreadyListed ?? 0) > 0) {
    return { success: false, error: "Dieses Item ist bereits in einer aktiven Auktion." };
  }

  const fee = computeListingFee(input.startingBid);
  const { data: profile } = await admin.from("profiles").select("credits").eq("id", user.id).single();
  if (!profile || profile.credits < fee) {
    const { currencyName } = await getSiteConfig();
    return { success: false, error: `Du brauchst ${fee} ${currencyName} Einstellgebühr, um diese Auktion zu starten.` };
  }

  const itemId = (invRow.item as unknown as { id: string } | null)?.id;
  if (!itemId) return { success: false, error: "Item konnte nicht aufgelöst werden." };

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
    // Only included when actually set — if `buyout_price` doesn't exist
    // yet (migration not run) and nobody asked for a buyout, omitting the
    // key entirely means every *other* listing keeps working. Only a
    // listing that explicitly requests a buyout would surface the
    // column-missing error, which is the correct behavior: silently
    // dropping a price the seller explicitly set would be worse than
    // telling them it didn't apply.
    ...(buyoutPrice !== null ? { buyout_price: Math.floor(buyoutPrice) } : {}),
  });

  if (error) {
    logServerError("Auctions", "createAuction insert failed", error.message);
    // Roll back the fee charge since the listing itself never happened.
    await admin.from("profiles").update({ credits: profile.credits }).eq("id", user.id);
    return {
      success: false,
      error:
        buyoutPrice !== null
          ? "Auktion konnte nicht erstellt werden — ist die Sofortkauf-Migration eingespielt?"
          : "Auktion konnte nicht erstellt werden.",
    };
  }

  revalidatePath("/auctions");
  revalidatePath("/garderobe");
  return { success: true };
}

/**
 * Immediately resolves an auction at a fixed `price` — shared by
 * buyAuctionNow() (explicit "Sofort kaufen" click) and placeBid()'s
 * auto-buyout path (a bid that reaches the buyout price). Unlike a normal
 * bid, this is a real, *immediate* transfer (item + credits move right
 * now), not a deferred one settled at sweep time — that's the whole point
 * of paying the buyout instead of waiting the auction out.
 *
 * The status flip to "sold" is the atomic claim: it only succeeds while
 * the row is still `status = 'active'`, so two players hitting buyout at
 * the same instant can't both win it — the loser's update affects zero
 * rows and gets a clean "not available anymore" instead of double-selling
 * the item or double-charging two buyers.
 */
async function finalizeBuyout(
  admin: ReturnType<typeof createAdminClient>,
  auction: {
    id: string;
    seller_id: string;
    inventory_id: string;
    current_bid: number;
    current_bidder_id: string | null;
    item: unknown;
  },
  buyerId: string,
  price: number
): Promise<AuctionActionResult> {
  // Remember the pre-claim state so a failed transfer below can put the
  // auction back exactly how it was, instead of leaving it stuck "sold"
  // with nothing actually transferred.
  const previousBid = auction.current_bid;
  const previousBidderId = auction.current_bidder_id;

  const { data: claimedRows, error: claimError } = await admin
    .from("auctions")
    .update({ status: "sold", current_bid: price, current_bidder_id: buyerId, resolved_at: new Date().toISOString() })
    .eq("id", auction.id)
    .eq("status", "active")
    .select("id");

  if (claimError || !claimedRows || claimedRows.length === 0) {
    if (claimError) logServerError("Auctions", "finalizeBuyout claim failed", claimError.message);
    return { success: false, error: "Diese Auktion ist nicht mehr verfügbar." };
  }

  async function unclaim() {
    await admin
      .from("auctions")
      .update({ status: "active", current_bid: previousBid, current_bidder_id: previousBidderId, resolved_at: null })
      .eq("id", auction.id);
  }

  const [{ data: buyerProfile }, { data: sellerProfile }] = await Promise.all([
    admin.from("profiles").select("credits, username").eq("id", buyerId).single(),
    admin.from("profiles").select("credits").eq("id", auction.seller_id).single(),
  ]);
  if (!buyerProfile || !sellerProfile) {
    // Extremely unlikely (profiles always exist for a logged-in/seeded
    // user), but if it happens, unclaim rather than leave the auction
    // stuck "sold" with nothing actually transferred.
    await unclaim();
    return { success: false, error: "Profile konnten nicht geladen werden." };
  }

  const { error: transferError } = await admin
    .from("inventory")
    .update({ user_id: buyerId, equipped: false })
    .eq("id", auction.inventory_id);
  if (transferError) {
    logServerError("Auctions", "finalizeBuyout item transfer failed", transferError.message);
    await unclaim();
    return { success: false, error: "Item-Transfer fehlgeschlagen — bitte erneut versuchen." };
  }

  await admin.from("profiles").update({ credits: buyerProfile.credits - price }).eq("id", buyerId);
  await admin.from("profiles").update({ credits: sellerProfile.credits + price }).eq("id", auction.seller_id);

  const itemName = (auction.item as unknown as { name: string } | null)?.name ?? "ein Item";

  try {
    await admin.from("audit_logs").insert({
      user_id: buyerId,
      action: "auction_buyout",
      payload: { auctionId: auction.id, sellerId: auction.seller_id, buyerId, price },
    });
  } catch {
    // best-effort
  }

  const { currencyName } = await getSiteConfig();
  await notifyUser({
    userId: auction.seller_id,
    type: "auction_sold",
    title: "Auktion sofort verkauft!",
    message: `${buyerProfile.username ?? "Ein Spieler"} hat ${itemName} für ${price.toLocaleString("de-DE")} ${currencyName} sofort gekauft.`,
    link: "/auctions",
  });
  await notifyUser({
    userId: buyerId,
    type: "auction_won",
    title: "Sofortkauf erfolgreich!",
    message: `Du hast ${itemName} für ${price.toLocaleString("de-DE")} ${currencyName} sofort gekauft.`,
    link: "/auctions",
  });
  // Anyone who had a standing bid just lost the item to the buyout instead
  // of the auction running its course — they should know why it's gone.
  if (auction.current_bidder_id && auction.current_bidder_id !== buyerId) {
    await notifyUser({
      userId: auction.current_bidder_id,
      type: "auction_outbid",
      title: "Auktion per Sofortkauf beendet",
      message: `${itemName} wurde für ${price.toLocaleString("de-DE")} ${currencyName} sofort gekauft, bevor deine Auktion endete.`,
      link: "/auctions",
    });
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
 *
 * Exception: if the auction has a `buyout_price` and this bid reaches it,
 * the auction resolves immediately at the buyout price (via
 * finalizeBuyout()) instead of just becoming the new high bid — same as
 * clicking "Sofort kaufen" directly, just reached by typing a big number
 * into the bid field instead.
 */
export async function placeBid(auctionId: string, amount: number): Promise<AuctionActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const admin = createAdminClient();
  const { currencyName } = await getSiteConfig();

  let auction = await admin
    .from("auctions")
    .select("seller_id, inventory_id, current_bid, current_bidder_id, buyout_price, status, ends_at, item:items(name)")
    .eq("id", auctionId)
    .single()
    .then((r) => r.data);
  if (!auction) {
    // `buyout_price` may not exist yet — degrade to "no buyout" rather
    // than letting every single bid fail over one missing column.
    auction = await admin
      .from("auctions")
      .select("seller_id, inventory_id, current_bid, current_bidder_id, status, ends_at, item:items(name)")
      .eq("id", auctionId)
      .single()
      .then((r) => (r.data ? { ...r.data, buyout_price: null } : null));
  }

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
    return { success: false, error: `Gebot muss mindestens ${auction.current_bid + MIN_BID_INCREMENT} ${currencyName} sein.` };
  }

  const { data: profile } = await admin.from("profiles").select("credits").eq("id", user.id).single();
  if (!profile || profile.credits < amount) {
    return { success: false, error: `Nicht genug ${currencyName} für dieses Gebot.` };
  }

  if (auction.buyout_price !== null && amount >= auction.buyout_price) {
    if (profile.credits < auction.buyout_price) {
      return { success: false, error: `Nicht genug ${currencyName} für den Sofortkauf-Preis.` };
    }
    return finalizeBuyout(admin, { id: auctionId, ...auction }, user.id, auction.buyout_price);
  }

  const { error } = await admin
    .from("auctions")
    .update({ current_bid: Math.floor(amount), current_bidder_id: user.id })
    .eq("id", auctionId)
    .eq("status", "active")
    .lt("current_bid", amount);

  if (error) {
    logServerError("Auctions", "placeBid update failed", error.message);
    return { success: false, error: "Gebot konnte nicht platziert werden." };
  }

  const itemName = (auction.item as unknown as { name: string } | null)?.name ?? "ein Item";
  const { data: bidderProfile } = await admin
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  await notifyUser({
    userId: auction.seller_id,
    type: "auction_bid",
    title: "Neues Gebot",
    message: `${bidderProfile?.username ?? "Ein Spieler"} hat ${Math.floor(amount).toLocaleString("de-DE")} ${currencyName} auf ${itemName} geboten.`,
    link: "/auctions",
  });
  // Whoever held the high bid before this one just got outbid.
  if (auction.current_bidder_id && auction.current_bidder_id !== user.id) {
    await notifyUser({
      userId: auction.current_bidder_id,
      type: "auction_outbid",
      title: "Überboten!",
      message: `Du wurdest bei ${itemName} überboten — aktuelles Gebot: ${Math.floor(amount).toLocaleString("de-DE")} ${currencyName}.`,
      link: "/auctions",
    });
  }

  revalidatePath("/auctions");
  return { success: true };
}

/**
 * Explicit "Sofort kaufen" action — buys the auction outright at its
 * `buyout_price` without placing an incremental bid first.
 */
export async function buyAuctionNow(auctionId: string): Promise<AuctionActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const admin = createAdminClient();

  const { data: auction, error: auctionError } = await admin
    .from("auctions")
    .select("seller_id, inventory_id, buyout_price, current_bid, current_bidder_id, status, ends_at, item:items(name)")
    .eq("id", auctionId)
    .single();

  if (auctionError || !auction) {
    if (auctionError) logServerError("Auctions", "buyAuctionNow lookup failed", auctionError.message);
    return { success: false, error: "Diese Auktion ist nicht verfügbar." };
  }
  if (auction.status !== "active") {
    return { success: false, error: "Diese Auktion ist nicht mehr aktiv." };
  }
  if (new Date(auction.ends_at).getTime() <= Date.now()) {
    return { success: false, error: "Diese Auktion ist bereits abgelaufen." };
  }
  if (auction.seller_id === user.id) {
    return { success: false, error: "Du kannst deine eigene Auktion nicht kaufen." };
  }
  if (auction.buyout_price === null) {
    return { success: false, error: "Für diese Auktion gibt es keinen Sofortkauf-Preis." };
  }

  const { data: profile } = await admin.from("profiles").select("credits").eq("id", user.id).single();
  if (!profile || profile.credits < auction.buyout_price) {
    const { currencyName } = await getSiteConfig();
    return { success: false, error: `Nicht genug ${currencyName} für diesen Sofortkauf.` };
  }

  return finalizeBuyout(admin, { id: auctionId, ...auction }, user.id, auction.buyout_price);
}

export async function cancelAuction(auctionId: string): Promise<AuctionActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const admin = createAdminClient();
  const { data: auction } = await admin
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

  const { error } = await admin
    .from("auctions")
    .update({ status: "cancelled", resolved_at: new Date().toISOString() })
    .eq("id", auctionId)
    .eq("seller_id", user.id);

  if (error) {
    logServerError("Auctions", "cancelAuction failed", error.message);
    return { success: false, error: "Abbruch fehlgeschlagen." };
  }

  revalidatePath("/auctions");
  return { success: true };
}
