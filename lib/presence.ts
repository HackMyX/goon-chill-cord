/**
 * Shared Supabase Realtime channel name for site-wide "who's online right
 * now" presence — joined (tracked) by components/layout/presence-
 * heartbeat.tsx for every logged-in user, and read (subscribed, no track)
 * by components/community/player-list-shell.tsx to show a live online
 * count/indicator. Presence is ephemeral by design (resets when the tab
 * closes, no DB writes) — there is no "last_seen" column anywhere on
 * purpose, this *is* the online-status mechanism.
 */
export const PRESENCE_CHANNEL = "site-presence";
