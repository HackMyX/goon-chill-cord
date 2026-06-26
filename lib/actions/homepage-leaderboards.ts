"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { logDebugEvent, logActivity } from "@/lib/debug-log-server";
import {
  DEFAULT_GAME_LEADERBOARD_CONFIG,
  type GameLeaderboardListId,
  type GameLeaderboardItem,
  type UnifiedGameEntry,
  type GameLeaderboardSection,
} from "@/lib/game-leaderboard-types";

// Types re-exported for consumers — "export type" is erased at runtime so it's safe in a "use server" file
export type {
  GameLeaderboardListId,
  GameLeaderboardItem,
  UnifiedGameEntry,
  GameLeaderboardSection,
} from "@/lib/game-leaderboard-types";

// ── Config read/write ─────────────────────────────────────────────────────────

export async function getGameLeaderboardConfig(): Promise<GameLeaderboardItem[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("game_leaderboard_config")
      .select("items")
      .eq("id", "default")
      .maybeSingle();
    if (error || !data) return DEFAULT_GAME_LEADERBOARD_CONFIG;
    return (data.items as GameLeaderboardItem[]) ?? DEFAULT_GAME_LEADERBOARD_CONFIG;
  } catch {
    return DEFAULT_GAME_LEADERBOARD_CONFIG;
  }
}

export async function updateGameLeaderboardConfig(
  items: GameLeaderboardItem[]
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Admin-Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("game_leaderboard_config")
    .upsert({ id: "default", items, updated_at: new Date().toISOString() });

  if (error) {
    void logDebugEvent({
      level: "error",
      scope: "game-leaderboard-config:update",
      message: "Fehler beim Speichern",
      context: { error: error.message },
    });
    return { success: false, error: error.message };
  }

  void logActivity(
    "admin:game-leaderboard-config:update",
    `Leaderboard-Konfig gespeichert von ${user.id}`,
    { count: items.length, enabled: items.filter((i) => i.enabled).length }
  );
  revalidatePath("/");
  return { success: true };
}

// ── Data fetchers ─────────────────────────────────────────────────────────────

type ProfileJoin = {
  username: string;
  active_name_style_key: string | null;
  prio_badges: string[] | null;
  avatar_url: string | null;
} | null;

async function fetchSnakeEntries(
  mode: "x1" | "x2" | "grind" | "farm",
  limit: number
): Promise<UnifiedGameEntry[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("snake_best_scores")
    .select("user_id, best_score, games_played, profiles(username, active_name_style_key, prio_badges, avatar_url)")
    .eq("speed_mode", mode)
    .order("best_score", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as unknown as {
    user_id: string;
    best_score: number;
    games_played: number;
    profiles: ProfileJoin;
  }[]).map((row, i) => ({
    rank: i + 1,
    userId: row.user_id,
    username: row.profiles?.username ?? "Unbekannt",
    nameStyleKey: row.profiles?.active_name_style_key ?? undefined,
    avatarUrl: row.profiles?.avatar_url ?? undefined,
    prioBadges: row.profiles?.prio_badges ?? [],
    primaryValue: row.best_score,
    secondaryLabel: `${row.games_played} Spiele`,
  }));
}

async function fetchMineEntries(limit: number): Promise<UnifiedGameEntry[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mine_progress")
    .select("user_id, level, total_mined, profiles(username, active_name_style_key, prio_badges, avatar_url)")
    .order("total_mined", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as unknown as {
    user_id: string;
    level: number;
    total_mined: number;
    profiles: ProfileJoin;
  }[]).map((row, i) => ({
    rank: i + 1,
    userId: row.user_id,
    username: row.profiles?.username ?? "Unbekannt",
    nameStyleKey: row.profiles?.active_name_style_key ?? undefined,
    avatarUrl: row.profiles?.avatar_url ?? undefined,
    prioBadges: row.profiles?.prio_badges ?? [],
    primaryValue: row.total_mined,
    secondaryLabel: `Level ${row.level}`,
  }));
}

/** Fetches all enabled game leaderboards in parallel. Logs timing & errors. */
export async function fetchGameLeaderboards(
  config?: GameLeaderboardItem[]
): Promise<GameLeaderboardSection[]> {
  const t0 = Date.now();
  const items = config ?? (await getGameLeaderboardConfig());
  const enabled = items.filter((i) => i.enabled).sort((a, b) => a.sort - b.sort);

  if (enabled.length === 0) return [];

  const sections = await Promise.all(
    enabled.map(async (item): Promise<GameLeaderboardSection> => {
      try {
        let entries: UnifiedGameEntry[];
        if (item.id === "mine") {
          entries = await fetchMineEntries(item.limit);
        } else {
          const mode = item.id.replace("snake_", "") as "x1" | "x2" | "grind" | "farm";
          entries = await fetchSnakeEntries(mode, item.limit);
        }
        return { item, entries };
      } catch (e) {
        void logDebugEvent({
          level: "error",
          scope: `game-leaderboard:fetch:${item.id}`,
          message: "Datenabruf fehlgeschlagen",
          context: { error: String(e) },
        });
        return { item, entries: [] };
      }
    })
  );

  const elapsed = Date.now() - t0;
  void logDebugEvent({
    level: "info",
    scope: "game-leaderboards:fetch",
    message: `${sections.length} Listen geladen in ${elapsed}ms`,
    context: { lists: enabled.map((i) => i.id), elapsed },
  });

  return sections;
}
