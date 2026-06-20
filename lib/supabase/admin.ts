import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS entirely. Server-only (the `server-only`
 * import throws if this ever gets pulled into a client bundle). Use this
 * exclusively inside server actions that have already verified `isAdmin()`,
 * or for system-level writes (audit log inserts) that must not be spoofable
 * by a regular user's own RLS-permitted client.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
