"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { DEFAULT_WORLD_SESSION_CONFIG, type WorldSessionConfig } from "@/lib/world-session-config";

interface WorldConfigRow {
  disconnect_countdown_sec: number;
  world_enabled: boolean;
  pvp_enabled: boolean;
}

function rowToConfig(row: WorldConfigRow): WorldSessionConfig {
  return {
    disconnectCountdownSec: row.disconnect_countdown_sec,
    worldEnabled: row.world_enabled,
    pvpEnabled: row.pvp_enabled,
  };
}

/** Falls back to the code defaults whenever the table doesn't exist yet or
 * is empty — same defensive pattern as getKillStreakConfig/getStreakConfig
 * (brand-new tables in this project are RLS-enabled with no policies, so
 * only this admin-client read ever sees the row at all). */
export async function getWorldSessionConfig(): Promise<WorldSessionConfig> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("world_config")
    .select("disconnect_countdown_sec, world_enabled, pvp_enabled")
    .eq("id", "default")
    .maybeSingle();

  if (error || !data) return DEFAULT_WORLD_SESSION_CONFIG;
  return rowToConfig(data as WorldConfigRow);
}

export interface WorldSessionActionResult {
  success: boolean;
  error?: string;
}

export async function updateWorldSessionConfig(input: WorldSessionConfig): Promise<WorldSessionActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const { data: profile } = await supabase.from("profiles").select("username, role").eq("id", user.id).single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  if (!Number.isFinite(input.disconnectCountdownSec) || input.disconnectCountdownSec < 1 || input.disconnectCountdownSec > 120) {
    return { success: false, error: "Disconnect-Timer muss zwischen 1 und 120 Sekunden liegen." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("world_config").upsert({
    id: "default",
    disconnect_countdown_sec: Math.round(input.disconnectCountdownSec),
    world_enabled: input.worldEnabled,
    pvp_enabled: input.pvpEnabled,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return { success: false, error: "Speichern fehlgeschlagen — ist die world_config-Migration eingespielt?" };
  }

  revalidatePath("/admin");
  revalidatePath("/world");
  return { success: true };
}
