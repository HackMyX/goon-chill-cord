"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { broadcastLive } from "@/lib/realtime-broadcast";
import {
  DEFAULT_CASE_DISPLAY_CONFIG,
  normalizeCaseDisplayConfig,
  type CaseDisplayConfig,
} from "@/lib/case-display-config";

const TABLE = "case_display_config";
const ROW_ID = "default";

/** Reads the case display config. Never throws — falls back to defaults. */
export async function getCaseDisplayConfig(): Promise<CaseDisplayConfig> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from(TABLE).select("config").eq("id", ROW_ID).single();
    return normalizeCaseDisplayConfig(data?.config);
  } catch {
    return DEFAULT_CASE_DISPLAY_CONFIG;
  }
}

export async function updateCaseDisplayConfig(
  config: CaseDisplayConfig,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  const clean = normalizeCaseDisplayConfig(config);
  const admin = createAdminClient();
  const { error } = await admin
    .from(TABLE)
    .upsert({ id: ROW_ID, config: clean, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) return { success: false, error: error.message };

  await broadcastLive("case-display-live");
  return { success: true };
}
