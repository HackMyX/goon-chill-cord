import "server-only";

/**
 * Sends a one-off Realtime broadcast message from server code (a Server
 * Action, not a browser tab) via Supabase's REST Broadcast endpoint —
 * deliberately *not* `supabase-js`'s `channel.send()`, which expects a live
 * WebSocket subscription: opening and tearing down a socket per server
 * action invocation (each one short-lived, possibly running on a different
 * serverless instance next time) would be slow and wasteful for a single
 * fire-and-forget message. The REST endpoint is a plain authenticated HTTP
 * POST, no persistent connection required — exactly what a stateless
 * server action needs.
 *
 * `topic` must match the room name lib/world-realtime.ts's browser clients
 * are subscribed to (`world-room:<room>`) for them to receive it at all.
 * Best-effort: a failed broadcast (network hiccup, etc.) is swallowed, same
 * reasoning as the audit_logs insert in lib/actions/monsters.ts — the
 * caller's actual state change (e.g. the damage roll) already happened and
 * must not be undone just because the *notification* of it didn't land.
 */
export async function broadcastToWorldRoom(
  topic: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`;
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        messages: [{ topic, event, payload, private: false }],
      }),
    });
  } catch {
    // Best-effort — see doc comment above.
  }
}
