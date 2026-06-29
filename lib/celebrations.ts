// Server-side helper to push a live "celebration" to a single user's browser.
// Used by quest/battle-pass/reward server actions so the global FeedbackHost can
// render a configurable popup/toast immediately (AGENTS §3 — realtime, no reload).
//
// NOT a server action and NOT client-safe: it uses the admin Supabase client.
// Import only from server code. The client subscribes to `celebrations:<userId>`.

import { createAdminClient } from "@/lib/supabase/admin";
import type { CelebrationPayload } from "@/lib/feedback-config";

/** Fire-and-forget: broadcast a celebration to one user. Never throws. */
export async function emitCelebration(userId: string, payload: CelebrationPayload): Promise<void> {
  if (!userId || !payload?.type) return;
  try {
    const admin = createAdminClient();
    const ch = admin.channel(`celebrations:${userId}`);
    await ch.send({ type: "broadcast", event: "celebrate", payload });
    await admin.removeChannel(ch);
  } catch {
    /* best-effort — feedback is non-critical */
  }
}
