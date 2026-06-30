"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { broadcastLive } from "@/lib/realtime-broadcast";
import {
  DEFAULT_WORLD_ENVIRONMENT,
  normalizeEnvironmentConfig,
  type WorldEnvironmentConfig,
} from "@/lib/world-environment-config";

/** Reads the world_config.environment_config JSONB column; falls back to the
 * code defaults if the column doesn't exist yet (migration not applied) or is
 * empty — same defensive pattern as the other world config getters. */
export async function getWorldEnvironmentConfig(): Promise<WorldEnvironmentConfig> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("world_config")
      .select("environment_config")
      .eq("id", "default")
      .maybeSingle();
    if (error || !data) return DEFAULT_WORLD_ENVIRONMENT;
    return normalizeEnvironmentConfig((data as { environment_config?: Partial<WorldEnvironmentConfig> }).environment_config);
  } catch {
    return DEFAULT_WORLD_ENVIRONMENT;
  }
}

export interface WorldEnvironmentActionResult {
  success: boolean;
  error?: string;
}

const CLAMP_FIELDS: (keyof WorldEnvironmentConfig)[] = [
  "fogDensity", "ambientIntensity", "accentIntensity", "starIntensity",
  "treeDensity", "grassDensity", "rockDensity", "ruinDensity", "mushroomDensity",
  "fireflyDensity",
];

export async function updateWorldEnvironmentConfig(
  input: WorldEnvironmentConfig
): Promise<WorldEnvironmentActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  const cfg = normalizeEnvironmentConfig(input);
  for (const key of CLAMP_FIELDS) {
    const v = cfg[key] as number;
    if (!Number.isFinite(v) || v < 0 || v > 4) {
      return { success: false, error: `${key} muss zwischen 0 und 4 liegen.` };
    }
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("world_config")
    .upsert({ id: "default", environment_config: cfg, updated_at: new Date().toISOString() });

  if (error) {
    return { success: false, error: "Speichern fehlgeschlagen — ist die Spalte world_config.environment_config migriert?" };
  }

  await broadcastLive("world-environment-live");
  revalidatePath("/admin");
  revalidatePath("/world");
  return { success: true };
}
