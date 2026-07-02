"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { broadcastLive } from "@/lib/realtime-broadcast";
import { logDebugEvent, logActivity } from "@/lib/debug-log-server";
import {
  DEFAULT_GAME_LEADERBOARD_CONFIG,
  DEFAULT_HOMEPAGE_AVATAR_MODE,
  isHomepageAvatarMode,
  type GameLeaderboardListId,
  type GameLeaderboardItem,
  type UnifiedGameEntry,
  type GameLeaderboardSection,
  type HomepageAvatarMode,
} from "@/lib/game-leaderboard-types";

// Types re-exported for consumers — "export type" is erased at runtime so it's safe in a "use server" file
export type {
  GameLeaderboardListId,
  GameLeaderboardItem,
  UnifiedGameEntry,
  GameLeaderboardSection,
  HomepageAvatarMode,
} from "@/lib/game-leaderboard-types";

// ── Config read/write ─────────────────────────────────────────────────────────

/**
 * Reconciles a stored config with DEFAULT_GAME_LEADERBOARD_CONFIG so that any
 * game list added to the defaults *after* the admin last saved (e.g. plinko,
 * Farmwelt/world, cases, xp) still shows up in the admin UI and can be embedded
 * on the homepage — without that merge a stale stored row permanently hid the
 * newer lists. Existing entries keep all their admin settings (enabled/limit/
 * sort); brand-new lists are appended at the end. Stored ids that no longer
 * exist in the defaults are dropped.
 */
function mergeWithDefaults(stored: GameLeaderboardItem[]): GameLeaderboardItem[] {
  const validIds = new Set(DEFAULT_GAME_LEADERBOARD_CONFIG.map((d) => d.id));
  const byId = new Map(stored.map((it) => [it.id, it] as const));

  // Keep stored entries (in their saved order), dropping any stale ids.
  const merged: GameLeaderboardItem[] = stored
    .filter((it) => validIds.has(it.id))
    .map((it) => ({ ...it }));

  // Append any default list the stored config never knew about, with sensible
  // defaults so it appears (disabled by default → admin opts in explicitly).
  let nextSort = merged.length;
  for (const def of DEFAULT_GAME_LEADERBOARD_CONFIG) {
    if (!byId.has(def.id)) {
      merged.push({ ...def, sort: nextSort++ });
    }
  }
  // Normalise sort to a clean 0..n-1 by current order.
  return merged
    .sort((a, b) => a.sort - b.sort)
    .map((it, i) => ({ ...it, sort: i }));
}

export async function getGameLeaderboardConfig(): Promise<GameLeaderboardItem[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("game_leaderboard_config")
      .select("items")
      .eq("id", "default")
      .maybeSingle();
    if (error || !data) return DEFAULT_GAME_LEADERBOARD_CONFIG;
    const stored = (data.items as GameLeaderboardItem[]) ?? [];
    if (stored.length === 0) return DEFAULT_GAME_LEADERBOARD_CONFIG;
    return mergeWithDefaults(stored);
  } catch {
    return DEFAULT_GAME_LEADERBOARD_CONFIG;
  }
}

/**
 * Liest den Profilbild-Modus der Startseiten-Bestenlisten. Steuert, ob ALLE
 * Plätze oder nur die ersten 3 ein Profilbild bekommen (Default: "top3").
 * Robust gegen fehlende Spalte/Zeile → fällt auf den Default zurück.
 */
export async function getHomepageAvatarMode(): Promise<HomepageAvatarMode> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("game_leaderboard_config")
      .select("avatar_mode")
      .eq("id", "default")
      .maybeSingle();
    if (error || !data) return DEFAULT_HOMEPAGE_AVATAR_MODE;
    const raw = (data as { avatar_mode?: unknown }).avatar_mode;
    return isHomepageAvatarMode(raw) ? raw : DEFAULT_HOMEPAGE_AVATAR_MODE;
  } catch {
    return DEFAULT_HOMEPAGE_AVATAR_MODE;
  }
}

/**
 * Kombinierter Loader für das Live-Update der Startseite: liefert die aktuellen
 * Sektionen UND den Profilbild-Modus in einem Rutsch, damit ein Admin-Save
 * beides ohne Reload aktualisiert (AGENTS §3).
 */
export async function fetchHomepageLeaderboardData(): Promise<{
  sections: GameLeaderboardSection[];
  avatarMode: HomepageAvatarMode;
}> {
  const [sections, avatarMode] = await Promise.all([
    fetchGameLeaderboards(),
    getHomepageAvatarMode(),
  ]);
  return { sections, avatarMode };
}

export async function updateGameLeaderboardConfig(
  items: GameLeaderboardItem[],
  avatarMode?: HomepageAvatarMode
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

  // Nur gesetzte Spalten werden überschrieben — avatar_mode bleibt erhalten,
  // wenn der Aufrufer keinen Wert übergibt.
  const payload: Record<string, unknown> = {
    id: "default",
    items,
    updated_at: new Date().toISOString(),
  };
  if (avatarMode !== undefined) {
    payload.avatar_mode = isHomepageAvatarMode(avatarMode)
      ? avatarMode
      : DEFAULT_HOMEPAGE_AVATAR_MODE;
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("game_leaderboard_config")
    .upsert(payload);

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
    {
      count: items.length,
      enabled: items.filter((i) => i.enabled).length,
      avatarMode: avatarMode ?? "(unverändert)",
    }
  );
  await broadcastLive("game-leaderboard-live");
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

async function fetchPlinkoEntries(limit: number): Promise<UnifiedGameEntry[]> {
  const admin = createAdminClient();
  // Over-fetch to allow dedup per user (keep best single win)
  const { data, error } = await admin
    .from("plinko_plays")
    .select("user_id, payout_cr, result_multiplier, profiles(username, active_name_style_key, prio_badges, avatar_url)")
    .gt("payout_cr", 0)
    .order("payout_cr", { ascending: false })
    .limit(limit * 8);

  if (error || !data) return [];

  const seen = new Set<string>();
  const unique = (data as unknown as {
    user_id: string;
    payout_cr: number;
    result_multiplier: number;
    profiles: ProfileJoin;
  }[]).filter((row) => {
    if (seen.has(row.user_id)) return false;
    seen.add(row.user_id);
    return true;
  }).slice(0, limit);

  return unique.map((row, i) => ({
    rank: i + 1,
    userId: row.user_id,
    username: row.profiles?.username ?? "Anonym",
    nameStyleKey: row.profiles?.active_name_style_key ?? undefined,
    avatarUrl: row.profiles?.avatar_url ?? undefined,
    prioBadges: row.profiles?.prio_badges ?? [],
    primaryValue: row.payout_cr,
    secondaryLabel: `×${Number(row.result_multiplier ?? 0).toFixed(1)}`,
  }));
}

async function fetchWorldEntries(limit: number): Promise<UnifiedGameEntry[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, username, world_best_streak, level, active_name_style_key, prio_badges, avatar_url")
    .order("world_best_streak", { ascending: false })
    .gt("world_best_streak", 0)
    .limit(limit);

  if (error || !data) return [];

  return (data as unknown as {
    id: string;
    username: string;
    world_best_streak: number;
    level: number;
    active_name_style_key: string | null;
    prio_badges: string[] | null;
    avatar_url: string | null;
  }[]).map((row, i) => ({
    rank: i + 1,
    userId: row.id,
    username: row.username ?? "Unbekannt",
    nameStyleKey: row.active_name_style_key ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    prioBadges: row.prio_badges ?? [],
    primaryValue: row.world_best_streak ?? 0,
    secondaryLabel: `Level ${row.level ?? 1}`,
  }));
}

async function fetchCasesEntries(limit: number): Promise<UnifiedGameEntry[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, username, cases_opened, level, active_name_style_key, prio_badges, avatar_url")
    .order("cases_opened", { ascending: false })
    .gt("cases_opened", 0)
    .limit(limit);

  if (error || !data) return [];

  return (data as unknown as {
    id: string;
    username: string;
    cases_opened: number;
    level: number;
    active_name_style_key: string | null;
    prio_badges: string[] | null;
    avatar_url: string | null;
  }[]).map((row, i) => ({
    rank: i + 1,
    userId: row.id,
    username: row.username ?? "Unbekannt",
    nameStyleKey: row.active_name_style_key ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    prioBadges: row.prio_badges ?? [],
    primaryValue: row.cases_opened ?? 0,
    secondaryLabel: `Level ${row.level ?? 1}`,
  }));
}

async function fetchXpEntries(limit: number): Promise<UnifiedGameEntry[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, username, xp, level, active_name_style_key, prio_badges, avatar_url")
    .order("xp", { ascending: false })
    .gt("xp", 0)
    .limit(limit);

  if (error || !data) return [];

  return (data as unknown as {
    id: string;
    username: string;
    xp: number;
    level: number;
    active_name_style_key: string | null;
    prio_badges: string[] | null;
    avatar_url: string | null;
  }[]).map((row, i) => ({
    rank: i + 1,
    userId: row.id,
    username: row.username ?? "Unbekannt",
    nameStyleKey: row.active_name_style_key ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    prioBadges: row.prio_badges ?? [],
    primaryValue: (row.xp as number) ?? 0,
    secondaryLabel: `Level ${row.level ?? 1}`,
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
        } else if (item.id === "plinko") {
          entries = await fetchPlinkoEntries(item.limit);
        } else if (item.id === "world") {
          entries = await fetchWorldEntries(item.limit);
        } else if (item.id === "cases") {
          entries = await fetchCasesEntries(item.limit);
        } else if (item.id === "xp") {
          entries = await fetchXpEntries(item.limit);
        } else if (item.id === "parkour") {
          // Rendered by the custom <ParkourHomeLeaderboard> block (map switcher +
          // Gesamt), which fetches its own data — the section just needs to exist.
          entries = [];
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
