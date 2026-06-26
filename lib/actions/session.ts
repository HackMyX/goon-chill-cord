"use server";

import { createAdminClient } from "@/lib/supabase/admin";

const ACTIVE_WINDOW_MS = 3 * 60 * 1000; // 3 minutes — sessions pinged within this window are "active"

export interface SessionPingResult {
  valid: boolean;
  superseded: boolean; // a newer session exists (show "take over" UI)
}

/**
 * Creates a new session for the user.
 * Any ACTIVE session (last_ping within 3 min) is immediately invalidated so they
 * get kicked on their next heartbeat. INACTIVE sessions are left alone.
 */
export async function createSession(
  userId: string,
  deviceHint?: string
): Promise<{ token: string }> {
  const admin = createAdminClient();

  // Invalidate active sessions immediately
  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString();
  await admin
    .from("user_sessions")
    .update({ invalidated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("invalidated_at", null)
    .gte("last_ping", cutoff);

  // Create the new session
  const { data, error } = await admin
    .from("user_sessions")
    .insert({
      user_id: userId,
      device_hint: (deviceHint ?? "").slice(0, 120),
    })
    .select("session_token")
    .single();

  if (error || !data) throw new Error(`createSession failed: ${error?.message}`);
  return { token: data.session_token };
}

/**
 * Heartbeat ping. Updates last_ping if valid.
 * Returns valid=false if the session was explicitly invalidated or superseded by a newer one.
 */
export async function pingSession(token: string): Promise<SessionPingResult> {
  if (!token || token.length < 10) return { valid: false, superseded: false };

  const admin = createAdminClient();

  const { data: session } = await admin
    .from("user_sessions")
    .select("id, user_id, created_at, invalidated_at")
    .eq("session_token", token)
    .maybeSingle();

  if (!session) return { valid: false, superseded: false };

  // Explicitly invalidated (by another device creating a session while this was active)
  if (session.invalidated_at) return { valid: false, superseded: true };

  // Check if a newer session exists for this user (inactive PC scenario: was not kicked
  // immediately but now someone else is active)
  const { data: newer } = await admin
    .from("user_sessions")
    .select("id")
    .eq("user_id", session.user_id)
    .is("invalidated_at", null)
    .gt("created_at", session.created_at)
    .limit(1)
    .maybeSingle();

  if (newer) {
    // Mark this session as invalidated now that it's being used again
    await admin
      .from("user_sessions")
      .update({ invalidated_at: new Date().toISOString() })
      .eq("id", session.id);
    return { valid: false, superseded: true };
  }

  // All good — update last_ping
  await admin
    .from("user_sessions")
    .update({ last_ping: new Date().toISOString() })
    .eq("id", session.id);

  return { valid: true, superseded: false };
}

/**
 * Force-invalidate ALL sessions for a user (admin use or on logout).
 */
export async function invalidateAllSessions(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("user_sessions")
    .update({ invalidated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("invalidated_at", null);
}

/**
 * List non-invalidated sessions for a user (admin info panel).
 */
export async function getUserActiveSessions(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_sessions")
    .select("id, session_token, created_at, last_ping, device_hint")
    .eq("user_id", userId)
    .is("invalidated_at", null)
    .order("last_ping", { ascending: false })
    .limit(10);
  return data ?? [];
}
