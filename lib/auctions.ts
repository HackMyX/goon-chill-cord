/**
 * Pure auction math, shared by the server action (lib/actions/auctions.ts)
 * and the client-side listing-fee preview (components/auctions/auctions-
 * shell.tsx). Deliberately *not* in the "use server" actions file — every
 * export from a "use server" module must be an async Server Action, and
 * this is a plain synchronous helper.
 */
export const LISTING_FEE_RATE = 0.05;
export const LISTING_FEE_MIN = 50;
export const MIN_DURATION_HOURS = 1;
export const MAX_DURATION_HOURS = 72;
export const MIN_BID_INCREMENT = 1;
/** A player can have at most this many *active* listings at once — trading
 * has no such cap, the auction house does. */
export const MAX_ACTIVE_AUCTIONS_PER_USER = 2;

export function computeListingFee(startingBid: number): number {
  return Math.max(LISTING_FEE_MIN, Math.round(startingBid * LISTING_FEE_RATE));
}

/**
 * A "Sofortkauf" buyout price must actually be worth skipping the auction
 * for — a buyout equal to (or below) the starting bid would mean the
 * first bidder gets it for free with no auction ever happening. Required
 * to be strictly greater than the starting bid whenever it's set; `null`
 * means "no buyout, bid it out the normal way".
 */
export function isValidBuyoutPrice(buyoutPrice: number | null, startingBid: number): boolean {
  if (buyoutPrice === null) return true;
  return Number.isFinite(buyoutPrice) && buyoutPrice > startingBid;
}
