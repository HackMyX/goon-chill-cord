/**
 * Single source of truth for "what's the base URL of this app right now" —
 * always the host actually being browsed, never a hardcoded production
 * domain. Used by the Discord OAuth `redirectTo` so a login started on
 * localhost comes back to localhost, and a login started on the deployed
 * domain comes back there, with zero hand-maintained URLs in either case.
 *
 * Client components: `window.location.origin` is already exactly correct
 * (it IS the host the user is on), so that's all this does there.
 */
export function getURL(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  // Server-side fallback (not used by the OAuth flow today, kept here so
  // any future server-side caller doesn't reach for a hardcoded URL either).
  // Vercel sets VERCEL_URL automatically per-deployment (preview *and*
  // production) — never a value we'd want to hand-write.
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
