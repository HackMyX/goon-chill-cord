import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sends a notification to all staff (admins + moderators). Used for ticket
 * creation and other events that the whole support team should see. Failures
 * are silently swallowed — notifications are always best-effort.
 */
export async function notifyStaff(input: {
  type: string;
  title: string;
  message: string;
  link?: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: staff } = await admin
      .from("profiles")
      .select("id")
      .in("role", ["admin", "moderator"]);
    if (!staff?.length) return;
    await admin.from("notifications").insert(
      staff.map((s: { id: string }) => ({
        user_id: s.id,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link ?? null,
      }))
    );
  } catch {
    // best-effort
  }
}

/**
 * Internal-only notification writer — deliberately *not* in a "use
 * server" actions file. Every export from a "use server" module becomes a
 * client-callable endpoint; a function that lets you insert an arbitrary
 * notification into *any* user's inbox must never be reachable that way.
 * Other server actions (trading.ts, auctions.ts) import this directly and
 * call it after their own auth/ownership checks have already passed.
 */
export async function notifyUser(input: {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("notifications").insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link ?? null,
    });
  } catch {
    // Notifications are a nice-to-have side effect — never let a failure
    // here block the actual trade/bid/sale they're describing.
  }
}
