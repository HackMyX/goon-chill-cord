"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface GlobalChatMessage {
  id: string;
  userId: string | null;
  username: string;
  role: string;
  content: string;
  isSystem: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

function rowToMsg(r: Record<string, unknown>): GlobalChatMessage {
  return {
    id: r.id as string,
    userId: r.user_id as string | null,
    username: r.username as string,
    role: (r.role as string) ?? "user",
    content: r.content as string,
    isSystem: (r.is_system as boolean) ?? false,
    metadata: (r.metadata as Record<string, unknown>) ?? null,
    createdAt: r.created_at as string,
  };
}

export async function getGlobalChatMessages(limit = 60): Promise<GlobalChatMessage[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("global_chat_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map(rowToMsg).reverse();
}

export async function sendGlobalChatMessage(content: string): Promise<{ success: boolean; error?: string }> {
  if (!content?.trim()) return { success: false, error: "Leere Nachricht." };
  const trimmed = content.trim().slice(0, 500);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const { data: profile } = await supabase.from("profiles").select("username, role, temp_banned_until").eq("id", user.id).single();
  if (!profile) return { success: false, error: "Profil nicht gefunden." };

  if (profile.temp_banned_until && new Date(profile.temp_banned_until) > new Date()) {
    return { success: false, error: "Du bist temporär gesperrt." };
  }

  // Rate limit: check last message in the last 2 seconds
  const admin = createAdminClient();
  const since = new Date(Date.now() - 2000).toISOString();
  const { data: recent } = await admin
    .from("global_chat_messages")
    .select("id")
    .eq("user_id", user.id)
    .gte("created_at", since)
    .limit(1);
  if (recent && recent.length > 0) {
    return { success: false, error: "Zu schnell! Warte kurz bevor du die nächste Nachricht sendest." };
  }

  const { error } = await admin.from("global_chat_messages").insert({
    user_id: user.id,
    username: profile.username ?? "Unbekannt",
    role: profile.role ?? "user",
    content: trimmed,
    is_system: false,
  });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// Called by server actions when big wins happen — bypasses RLS
export async function broadcastSystemWin(opts: {
  username: string;
  itemName: string;
  rarity: string;
  caseName?: string;
}) {
  try {
    const admin = createAdminClient();
    const emoji = opts.rarity === "ultra" ? "🌟" : opts.rarity === "mythisch" ? "✨" : "⭐";
    const rarityLabel = opts.rarity === "ultra" ? "Ultra" : opts.rarity === "mythisch" ? "Mythisch" : opts.rarity;
    const content = `${emoji} ${opts.username} hat „${opts.itemName}" (${rarityLabel}) ${opts.caseName ? `aus „${opts.caseName}" ` : ""}gewonnen!`;
    await admin.from("global_chat_messages").insert({
      user_id: null,
      username: "System",
      role: "system",
      content,
      is_system: true,
      metadata: {
        type: "win",
        rarity: opts.rarity,
        itemName: opts.itemName,
        username: opts.username,
      },
    });
  } catch { /* never let broadcast failure affect case opening */ }
}
