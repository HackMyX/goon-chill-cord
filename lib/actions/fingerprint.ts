"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Called client-side after FingerprintJS resolves. Updates the most recent
 * login_events row for the current user with the computed fingerprint so it's
 * available when an admin bans the user (the ban action copies fingerprints
 * from login_events into device_bans).
 *
 * Silently does nothing when there's no logged-in user — the fingerprint
 * cookie is still set client-side and will be checked on next login.
 */
export async function registerFingerprint(fingerprint: string): Promise<void> {
  if (!fingerprint || fingerprint.length > 200) return;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const admin = createAdminClient();
  // Update the most recent login_events row that doesn't have a fingerprint yet.
  const { data: latest } = await admin
    .from("login_events")
    .select("id")
    .eq("user_id", user.id)
    .is("fingerprint", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest?.id) {
    await admin
      .from("login_events")
      .update({ fingerprint })
      .eq("id", latest.id);
  }
}

/**
 * Checks whether a fingerprint is in the device_bans table.
 * Called from the auth callback to block banned devices before completing login.
 */
export async function isDeviceBanned(fingerprint: string): Promise<boolean> {
  if (!fingerprint) return false;
  const admin = createAdminClient();
  const { data } = await admin
    .from("device_bans")
    .select("fingerprint")
    .eq("fingerprint", fingerprint)
    .maybeSingle();
  return !!data;
}

/**
 * Adds all fingerprints seen for a given user into device_bans.
 * Called when an admin bans a user — ensures every device they've logged in
 * from is blocked, even if they create a fresh Discord account.
 */
export async function banDevicesForUser(
  targetUserId: string,
  bannedBy: string
): Promise<void> {
  const admin = createAdminClient();

  const { data: events } = await admin
    .from("login_events")
    .select("fingerprint")
    .eq("user_id", targetUserId)
    .not("fingerprint", "is", null);

  const fingerprints = [
    ...new Set((events ?? []).map((e) => e.fingerprint).filter(Boolean) as string[]),
  ];
  if (fingerprints.length === 0) return;

  await admin.from("device_bans").upsert(
    fingerprints.map((fp) => ({ fingerprint: fp, banned_by: bannedBy })),
    { onConflict: "fingerprint", ignoreDuplicates: true }
  );
}

/**
 * Removes all device_bans entries associated with a user's fingerprints.
 * Called when an admin un-bans a user — lifts the device block too.
 */
export async function unbanDevicesForUser(targetUserId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: events } = await admin
    .from("login_events")
    .select("fingerprint")
    .eq("user_id", targetUserId)
    .not("fingerprint", "is", null);

  const fingerprints = [
    ...new Set((events ?? []).map((e) => e.fingerprint).filter(Boolean) as string[]),
  ];
  if (fingerprints.length === 0) return;

  await admin.from("device_bans").delete().in("fingerprint", fingerprints);
}
