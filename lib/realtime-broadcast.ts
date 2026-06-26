import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Fire a generic "changed" broadcast on a live-config channel after an admin
 * saves a config. Best-effort — a failed broadcast never breaks the save.
 * Clients subscribe with useLiveConfig(channel, getter, setter) (lib/use-live-config.ts).
 *
 * This is the shared primitive behind site-wide live updates (AGENTS §3): one
 * line per mutating server action instead of repeating the channel boilerplate.
 */
export async function broadcastLive(channel: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const ch = admin.channel(channel);
    await ch.send({ type: "broadcast", event: "changed", payload: { ts: Date.now() } });
    await admin.removeChannel(ch);
  } catch {
    /* best-effort — never let a broadcast failure affect the save */
  }
}
