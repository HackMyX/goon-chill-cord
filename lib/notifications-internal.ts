import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * These types are always delivered regardless of the user's notification
 * preferences — they represent admin or support actions the user genuinely
 * needs to know about and cannot opt out of.
 */
const NON_TOGGLEABLE_USER_TYPES = new Set([
  "ticket_reply",    // staff replied to your own ticket
  "ticket_status",   // your own ticket status changed
  "admin_credits",   // admin changed your credits
  "admin_grant_item", // admin gave you an item
  "admin_action",    // admin acted on your account (role, gender, inventory…)
  "admin_ban",       // your account was banned / unbanned
]);

/**
 * Sends a notification to all staff (admins + moderators). Respects each
 * staff member's individual notification_prefs — a moderator who turned off
 * ticket_new won't receive that type. Failures are silently swallowed.
 */
export async function notifyStaff(input: {
  type: string;
  title: string;
  message: string;
  /** Default link for all staff (used if no role-specific link is provided). */
  link?: string;
  /** Link sent exclusively to admins — overrides `link` for admins. */
  adminLink?: string;
  /** Link sent exclusively to moderators — overrides `link` for mods. */
  modLink?: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();

    let staff: { id: string; role: string }[] = [];
    const { data: staffWithPrefs, error: prefsError } = await admin
      .from("profiles")
      .select("id, role, notification_prefs")
      .in("role", ["admin", "moderator"]);

    if (!prefsError && staffWithPrefs?.length) {
      staff = staffWithPrefs
        .filter((s: { id: string; role: string; notification_prefs: unknown }) => {
          const prefs = (s.notification_prefs as Record<string, boolean>) ?? {};
          return prefs[input.type] !== false;
        })
        .map((s: { id: string; role: string }) => ({ id: s.id, role: s.role }));
    } else {
      const { data: fallback } = await admin
        .from("profiles")
        .select("id, role")
        .in("role", ["admin", "moderator"]);
      staff = (fallback ?? []).map((s: { id: string; role: string }) => ({ id: s.id, role: s.role }));
    }

    if (!staff.length) return;

    await admin.from("notifications").insert(
      staff.map(({ id, role }) => {
        const link = role === "admin" && input.adminLink ? input.adminLink
          : role === "moderator" && input.modLink ? input.modLink
          : (input.link ?? null);
        return { user_id: id, type: input.type, title: input.title, message: input.message, link };
      })
    );
  } catch {
    // best-effort
  }
}

/**
 * Internal-only notification writer — deliberately *not* in a "use server"
 * actions file. Every export from a "use server" module becomes a
 * client-callable endpoint; a function that lets you insert an arbitrary
 * notification into *any* user's inbox must never be reachable that way.
 *
 * Respects the user's notification_prefs JSONB for toggleable types.
 * Non-toggleable types (ticket replies, admin actions) bypass the check.
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

    if (!NON_TOGGLEABLE_USER_TYPES.has(input.type)) {
      try {
        const { data: profile } = await admin
          .from("profiles")
          .select("notification_prefs")
          .eq("id", input.userId)
          .single();
        const prefs = (profile?.notification_prefs as Record<string, boolean>) ?? {};
        if (prefs[input.type] === false) return;
      } catch {
        // Best-effort — if we can't read prefs, deliver the notification.
      }
    }

    await admin.from("notifications").insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link ?? null,
    });
  } catch {
    // Notifications are a nice-to-have side effect — never block the
    // actual trade/bid/sale/etc. that triggered this.
  }
}
