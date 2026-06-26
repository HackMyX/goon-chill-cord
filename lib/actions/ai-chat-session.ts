"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ChatContext = "user" | "admin" | "mod";

export interface PersistedMessage {
  role: "user" | "model";
  text: string;
  ts?: number;
}

/**
 * Load saved chat history for the current user + context.
 * Returns [] if no session exists or table is missing.
 */
export async function loadChatSession(context: ChatContext): Promise<PersistedMessage[]> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
      .from("ai_chat_sessions")
      .select("messages")
      .eq("user_id", user.id)
      .eq("context", context)
      .maybeSingle();

    if (!data?.messages) return [];
    const msgs = data.messages as PersistedMessage[];
    // Cap to last 80 messages to avoid bloat
    return msgs.slice(-80);
  } catch {
    return [];
  }
}

/**
 * Upsert the full chat history for the current user + context.
 * Best-effort — never throws.
 */
export async function saveChatSession(
  context: ChatContext,
  messages: PersistedMessage[]
): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Keep max 80 messages
    const trimmed = messages.slice(-80);

    await supabase
      .from("ai_chat_sessions")
      .upsert(
        {
          user_id: user.id,
          context,
          messages: trimmed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,context" }
      );
  } catch {
    // Silent — persistence is best-effort
  }
}

/**
 * Clear saved chat history for the current user + context.
 */
export async function clearChatSession(context: ChatContext): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("ai_chat_sessions")
      .delete()
      .eq("user_id", user.id)
      .eq("context", context);
  } catch {
    // Silent
  }
}

/**
 * Admin: get all chat sessions (for moderation / debugging).
 */
export async function adminGetAllChatSessions(): Promise<Array<{
  userId: string;
  context: string;
  messageCount: number;
  updatedAt: string;
}>> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("ai_chat_sessions")
      .select("user_id, context, messages, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200);
    return (data ?? []).map((r) => ({
      userId: r.user_id as string,
      context: r.context as string,
      messageCount: Array.isArray(r.messages) ? (r.messages as unknown[]).length : 0,
      updatedAt: r.updated_at as string,
    }));
  } catch {
    return [];
  }
}
