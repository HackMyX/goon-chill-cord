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

export function computeListingFee(startingBid: number): number {
  return Math.max(LISTING_FEE_MIN, Math.round(startingBid * LISTING_FEE_RATE));
}
