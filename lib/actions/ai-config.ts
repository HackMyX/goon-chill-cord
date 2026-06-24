"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

// 5-minute in-memory cache — avoids a DB round-trip on every AI request
// while still picking up key changes within a few minutes.
let keyCache: { value: string | null; ts: number } | null = null;
const KEY_CACHE_TTL = 5 * 60 * 1000;

export async function getAiApiKey(): Promise<string | null> {
  if (keyCache && Date.now() - keyCache.ts < KEY_CACHE_TTL) {
    return keyCache.value;
  }

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("ai_config")
      .select("gemini_api_key")
      .eq("id", "default")
      .single();
    const dbKey = (data?.gemini_api_key as string | null)?.trim() || null;
    const finalKey = dbKey || process.env.GEMINI_API_KEY || null;
    keyCache = { value: finalKey, ts: Date.now() };
    return finalKey;
  } catch {
    const envKey = process.env.GEMINI_API_KEY || null;
    keyCache = { value: envKey, ts: Date.now() };
    return envKey;
  }
}

export async function invalidateAiKeyCache() {
  keyCache = null;
}

export async function getAiConfigStatus(): Promise<{
  hasKey: boolean;
  source: "db" | "env" | "none";
  maskedKey: string | null;
}> {
  const mask = (k: string) =>
    k.length > 12 ? k.slice(0, 8) + "…" + k.slice(-4) : k.slice(0, 4) + "…";

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("ai_config")
      .select("gemini_api_key")
      .eq("id", "default")
      .maybeSingle();
    const dbKey = (data?.gemini_api_key as string | null)?.trim() || null;
    if (dbKey) return { hasKey: true, source: "db", maskedKey: mask(dbKey) };
  } catch { /* table may not exist yet */ }

  const envKey = process.env.GEMINI_API_KEY || null;
  if (envKey) return { hasKey: true, source: "env", maskedKey: mask(envKey) };
  return { hasKey: false, source: "none", maskedKey: null };
}

export async function updateAiApiKey(
  key: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Nicht eingeloggt." };

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!isAdmin(profile)) return { success: false, error: "Nur Admins können den API-Schlüssel ändern." };

    const trimmedKey = key.trim();
    const { error } = await admin.from("ai_config").upsert({
      id: "default",
      gemini_api_key: trimmedKey || null,
      updated_at: new Date().toISOString(),
    });
    if (error) return { success: false, error: error.message };

    keyCache = null; // bust cache so next request picks up the new key
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
