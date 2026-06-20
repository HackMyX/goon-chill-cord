export type ProfileRole = "user" | "moderator" | "admin";

/**
 * Hardcoded fallback allowlist — kept as a belt-and-suspenders safety net in
 * case the `role` column read fails for any reason. The actual security
 * boundary for every admin server action is the DB-backed `profiles.role`
 * check below; RLS on the admin tables denies writes to everyone, so a
 * write only ever happens after this check passes and the action switches
 * to the service-role client.
 */
const ADMIN_USERNAME_FALLBACK = ["hackmyx"];

export function isAdmin(profile: { role?: string | null; username?: string | null } | null | undefined): boolean {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  return ADMIN_USERNAME_FALLBACK.includes((profile.username ?? "").toLowerCase());
}

export function isModerator(profile: { role?: string | null } | null | undefined): boolean {
  return profile?.role === "moderator" || isAdmin(profile);
}
