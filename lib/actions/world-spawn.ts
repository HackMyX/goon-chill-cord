"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { broadcastLive } from "@/lib/realtime-broadcast";
import { DEFAULT_WORLD_SPAWN_CONFIG, type WorldSpawnConfig } from "@/lib/world-spawn-config";

interface WorldSpawnRow {
  max_alive_monsters: number | null;
  spawn_interval_min_sec: number | null;
  spawn_interval_max_sec: number | null;
  spawn_safe_radius: number | null;
  alive_cap_per_extra_player: number | null;
  alive_cap_max: number | null;
  spawn_interval_floor: number | null;
  cross_player_aggro_duration_sec: number | null;
}

function withDefault<T extends number>(val: T | null | undefined, fallback: T): T {
  return val !== null && val !== undefined && Number.isFinite(val) ? val : fallback;
}

/** Falls back to code defaults if the columns don't exist yet (new migration
 * not yet applied) — same defensive pattern as getWorldSessionConfig(). */
export async function getWorldSpawnConfig(): Promise<WorldSpawnConfig> {
  const def = DEFAULT_WORLD_SPAWN_CONFIG;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("world_config")
    .select(
      "max_alive_monsters, spawn_interval_min_sec, spawn_interval_max_sec, spawn_safe_radius, alive_cap_per_extra_player, alive_cap_max, spawn_interval_floor, cross_player_aggro_duration_sec"
    )
    .eq("id", "default")
    .maybeSingle();

  if (error || !data) return def;
  const row = data as WorldSpawnRow;
  return {
    maxAliveMonsters:             withDefault(row.max_alive_monsters,              def.maxAliveMonsters),
    spawnIntervalMinSec:          withDefault(row.spawn_interval_min_sec,          def.spawnIntervalMinSec),
    spawnIntervalMaxSec:          withDefault(row.spawn_interval_max_sec,          def.spawnIntervalMaxSec),
    spawnSafeRadius:              withDefault(row.spawn_safe_radius,               def.spawnSafeRadius),
    aliveCapPerExtraPlayer:       withDefault(row.alive_cap_per_extra_player,      def.aliveCapPerExtraPlayer),
    aliveCapMax:                  withDefault(row.alive_cap_max,                   def.aliveCapMax),
    spawnIntervalFloor:           withDefault(row.spawn_interval_floor,            def.spawnIntervalFloor),
    crossPlayerAggroDurationSec:  withDefault(row.cross_player_aggro_duration_sec, def.crossPlayerAggroDurationSec),
  };
}

export interface WorldSpawnActionResult {
  success: boolean;
  error?: string;
}

export async function updateWorldSpawnConfig(input: WorldSpawnConfig): Promise<WorldSpawnActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const { data: profile } = await supabase.from("profiles").select("username, role").eq("id", user.id).single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  if (!Number.isFinite(input.maxAliveMonsters) || input.maxAliveMonsters < 1 || input.maxAliveMonsters > 200) {
    return { success: false, error: "Max. lebende Monster muss zwischen 1 und 200 liegen." };
  }
  if (!Number.isFinite(input.spawnIntervalMinSec) || input.spawnIntervalMinSec < 0.1 || input.spawnIntervalMinSec > 60) {
    return { success: false, error: "Spawn-Min muss zwischen 0.1 und 60 Sekunden liegen." };
  }
  if (!Number.isFinite(input.spawnIntervalMaxSec) || input.spawnIntervalMaxSec < input.spawnIntervalMinSec) {
    return { success: false, error: "Spawn-Max muss >= Spawn-Min sein." };
  }
  if (!Number.isFinite(input.spawnSafeRadius) || input.spawnSafeRadius < 0) {
    return { success: false, error: "Sicherheitsradius darf nicht negativ sein." };
  }
  if (!Number.isFinite(input.aliveCapMax) || input.aliveCapMax < input.maxAliveMonsters) {
    return { success: false, error: "Alive-Cap-Max muss >= Max-lebende-Monster sein." };
  }
  if (!Number.isFinite(input.spawnIntervalFloor) || input.spawnIntervalFloor <= 0 || input.spawnIntervalFloor > 1) {
    return { success: false, error: "Spawn-Floor muss zwischen 0 und 1 liegen." };
  }
  if (!Number.isFinite(input.crossPlayerAggroDurationSec) || input.crossPlayerAggroDurationSec < 0 || input.crossPlayerAggroDurationSec > 120) {
    return { success: false, error: "Cross-Aggro-Dauer muss zwischen 0 und 120 Sekunden liegen." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("world_config").upsert({
    id: "default",
    max_alive_monsters:              Math.round(input.maxAliveMonsters),
    spawn_interval_min_sec:          input.spawnIntervalMinSec,
    spawn_interval_max_sec:          input.spawnIntervalMaxSec,
    spawn_safe_radius:               input.spawnSafeRadius,
    alive_cap_per_extra_player:      Math.round(input.aliveCapPerExtraPlayer),
    alive_cap_max:                   Math.round(input.aliveCapMax),
    spawn_interval_floor:            input.spawnIntervalFloor,
    cross_player_aggro_duration_sec: input.crossPlayerAggroDurationSec,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return { success: false, error: "Speichern fehlgeschlagen — sind die Spawn-Spalten in world_config migriert?" };
  }

  await broadcastLive("world-spawn-live");
  revalidatePath("/admin");
  revalidatePath("/world");
  return { success: true };
}
