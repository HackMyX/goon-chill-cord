"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { broadcastLive } from "@/lib/realtime-broadcast";
import { notifyUser } from "@/lib/notifications-internal";
import { grantReward } from "@/lib/rewards-grant";
import {
  DEFAULT_PARKOUR_CONFIG,
  PARKOUR_MAPS,
  PARKOUR_MAP_IDS,
  getParkourMap,
  resolveMap,
  isMapEnabled,
  parkourTd,
  type ParkourConfig,
  type ParkourMapOverride,
} from "@/lib/parkour-config";

// ─────────────────────────────────────────────────────────────────────────────
// Config (singleton parkour_config, id='default') — code default + DB override
// ─────────────────────────────────────────────────────────────────────────────

export async function getParkourConfig(): Promise<ParkourConfig> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("parkour_config")
    .select("enabled, admin_only, max_lobby_size, daily_rewarded_finishes, death_penalty_ms, maps_config")
    .eq("id", "default")
    .maybeSingle();

  if (error || !data) return DEFAULT_PARKOUR_CONFIG;

  const rawMaps = (data.maps_config ?? {}) as Record<string, ParkourMapOverride>;
  const maps: Record<string, ParkourMapOverride> = {};
  // Only keep overrides for maps that actually exist in code (defensive).
  for (const id of PARKOUR_MAP_IDS) {
    if (rawMaps[id] && typeof rawMaps[id] === "object") maps[id] = rawMaps[id];
  }

  return {
    enabled: data.enabled ?? DEFAULT_PARKOUR_CONFIG.enabled,
    adminOnly: data.admin_only ?? DEFAULT_PARKOUR_CONFIG.adminOnly,
    maxLobbySize: data.max_lobby_size ?? DEFAULT_PARKOUR_CONFIG.maxLobbySize,
    dailyRewardedFinishes: data.daily_rewarded_finishes ?? DEFAULT_PARKOUR_CONFIG.dailyRewardedFinishes,
    deathPenaltyMs: data.death_penalty_ms ?? DEFAULT_PARKOUR_CONFIG.deathPenaltyMs,
    maps,
  };
}

export interface ParkourConfigActionResult { success: boolean; error?: string }

export async function updateParkourConfig(input: ParkourConfig): Promise<ParkourConfigActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Kein Zugriff." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  const num = (v: unknown, def: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : def;
  };

  // Sanitize per-map overrides — clamp physics/rewards to sane ranges so a bad
  // save can't make the game unplayable or hand out absurd credits.
  const cleanMaps: Record<string, ParkourMapOverride> = {};
  for (const map of PARKOUR_MAPS) {
    const o = input.maps?.[map.id];
    if (!o) continue;
    const c: ParkourMapOverride = {};
    if (typeof o.enabled === "boolean") c.enabled = o.enabled;
    if (o.gravity !== undefined) c.gravity = Math.max(-60, Math.min(-4, Number(o.gravity)));
    if (o.jumpVelocity !== undefined) c.jumpVelocity = Math.max(3, Math.min(20, Number(o.jumpVelocity)));
    if (o.airJumps !== undefined) c.airJumps = num(o.airJumps, map.airJumps, 0, 3);
    if (o.moveSpeed !== undefined) c.moveSpeed = Math.max(2, Math.min(18, Number(o.moveSpeed)));
    if (o.sprintMultiplier !== undefined) c.sprintMultiplier = Math.max(1, Math.min(3, Number(o.sprintMultiplier)));
    if (o.voidY !== undefined) c.voidY = Math.max(-300, Math.min(-2, Number(o.voidY)));
    if (o.rewardCredits !== undefined) c.rewardCredits = num(o.rewardCredits, map.rewardCredits, 0, 100000);
    if (o.rewardXp !== undefined) c.rewardXp = num(o.rewardXp, map.rewardXp, 0, 50000);
    if (o.bestBonusCredits !== undefined) c.bestBonusCredits = num(o.bestBonusCredits, map.bestBonusCredits, 0, 100000);
    if (o.checkpointCredits !== undefined) c.checkpointCredits = num(o.checkpointCredits, map.checkpointCredits, 0, 50000);
    cleanMaps[map.id] = c;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("parkour_config").upsert({
    id: "default",
    enabled: !!input.enabled,
    admin_only: !!input.adminOnly,
    max_lobby_size: num(input.maxLobbySize, DEFAULT_PARKOUR_CONFIG.maxLobbySize, 1, 6),
    daily_rewarded_finishes: num(input.dailyRewardedFinishes, DEFAULT_PARKOUR_CONFIG.dailyRewardedFinishes, 0, 100),
    death_penalty_ms: num(input.deathPenaltyMs, DEFAULT_PARKOUR_CONFIG.deathPenaltyMs, 0, 60000),
    maps_config: cleanMaps,
    updated_at: new Date().toISOString(),
  });
  if (error) return { success: false, error: "Speichern fehlgeschlagen — ist die parkour-Migration eingespielt?" };

  await broadcastLive("parkour-config-live");
  revalidatePath("/admin");
  revalidatePath("/parkour");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Runs + rewards + leaderboard
// ─────────────────────────────────────────────────────────────────────────────

export interface ParkourSubmitResult {
  success: boolean;
  error?: string;
  timeMs?: number;
  isNewRecord?: boolean;
  previousBestMs?: number | null;
  rank?: number;
  creditsAwarded?: number;
  xpAwarded?: number;
  rewardCapped?: boolean;
}

/** The absolute floor a legit run can take on a given map, ms — a run faster
 * than this is physically impossible and rejected outright (anti-cheat, mirrors
 * snake's board-geometry sanity cap). Derived from the diamond medal target so
 * it scales with map length without a second hand-tuned number. */
function minPlausibleMs(diamondMs: number): number {
  return Math.round(diamondMs * 0.45);
}

export async function submitParkourRun(mapId: string, timeMs: number, checkpointsReached = 0, deaths = 0): Promise<ParkourSubmitResult> {
  if (!Number.isFinite(timeMs) || timeMs <= 0) return { success: false, error: "Ungültige Zeit." };
  const safeDeaths = Number.isFinite(deaths) ? Math.max(0, Math.min(9999, Math.round(deaths))) : 0;

  const map = getParkourMap(mapId);
  if (!map) return { success: false, error: "Unbekannte Map." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const admin = createAdminClient();
  const cfg = await getParkourConfig();
  if (!cfg.enabled) return { success: false, error: "Parkour ist derzeit deaktiviert." };
  if (!isMapEnabled(mapId, cfg)) return { success: false, error: "Diese Map ist deaktiviert." };

  const eff = resolveMap(map, cfg);

  // ── Anti-cheat: reject impossibly-fast or absurdly-long times ──
  const floor = minPlausibleMs(map.medals.diamond);
  if (timeMs < floor) return { success: false, error: "Zeit unplausibel schnell." };
  if (timeMs > 30 * 60 * 1000) return { success: false, error: "Zeit zu lang." };
  const clampedMs = Math.round(timeMs);

  // ── Best time upsert (leaderboard) ──
  const { data: current } = await admin
    .from("parkour_best_times")
    .select("best_time_ms, runs, finishes, deaths")
    .eq("user_id", user.id)
    .eq("map_id", mapId)
    .maybeSingle();

  const previousBestMs: number | null = current?.best_time_ms ?? null;
  const isNewRecord = previousBestMs === null || clampedMs < previousBestMs;
  const newBestMs = isNewRecord ? clampedMs : previousBestMs!;

  await admin.from("parkour_best_times").upsert({
    user_id: user.id,
    map_id: mapId,
    best_time_ms: newBestMs,
    // Deaths shown on the leaderboard are those of the best-time run.
    deaths: isNewRecord ? safeDeaths : (current?.deaths ?? 0),
    runs: (current?.runs ?? 0) + 1,
    finishes: (current?.finishes ?? 0) + 1,
    updated_at: new Date().toISOString(),
  });

  // ── Reward: gated by the daily reward-granting-finish cap (anti-farm) ──
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { data: todayFinishes } = await admin
    .from("audit_logs")
    .select("payload")
    .eq("user_id", user.id)
    .eq("action", "parkour_finish")
    .gte("created_at", todayStart.toISOString());
  const rewardedToday = (todayFinishes ?? []).filter((r) => {
    const p = r.payload as Record<string, unknown> | null;
    return p?.rewarded === true;
  }).length;

  const cap = cfg.dailyRewardedFinishes;
  const withinCap = cap === 0 || rewardedToday < cap;

  let creditsAwarded = 0;
  let xpAwarded = 0;
  if (withinCap) {
    // Finish reward + best-time bonus + a bonus per checkpoint actually reached.
    const cpReached = Math.max(0, Math.min(Math.round(checkpointsReached), map.checkpoints.length));
    const creditReward = eff.rewardCredits + (isNewRecord ? eff.bestBonusCredits : 0) + cpReached * eff.checkpointCredits;
    if (creditReward > 0) {
      const r = await grantReward(admin, user.id, { type: "credits", amount: creditReward }, "parkour");
      if (r.ok) creditsAwarded = creditReward;
    }
    if (eff.rewardXp > 0) {
      const r = await grantReward(admin, user.id, { type: "xp", amount: eff.rewardXp }, "parkour");
      if (r.ok) xpAwarded = eff.rewardXp;
    }
  }

  // ── Audit log (player_activity) ──
  try {
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "parkour_finish",
      payload: {
        map_id: mapId,
        map_name: map.name,
        time_ms: clampedMs,
        deaths: safeDeaths,
        is_new_record: isNewRecord,
        credits_awarded: creditsAwarded,
        xp_awarded: xpAwarded,
        rewarded: withinCap && (creditsAwarded > 0 || xpAwarded > 0),
      },
    });
  } catch { /* non-fatal */ }

  // ── Rank on the map (1 + faster finishers) ──
  const { count: faster } = await admin
    .from("parkour_best_times")
    .select("user_id", { count: "exact", head: true })
    .eq("map_id", mapId)
    .lt("best_time_ms", newBestMs);
  const rank = (faster ?? 0) + 1;

  // ── New-record notification + BP/quest progress (fire-and-forget) ──
  if (isNewRecord) {
    void notifyUser({
      userId: user.id,
      type: "parkour_record",
      title: `Neue Bestzeit — ${map.name}!`,
      message: `${(clampedMs / 1000).toFixed(2)}s · Rang #${rank}`,
      link: "/parkour",
    });
  }
  try {
    const { incrementBpQuestProgress } = await import("@/lib/actions/bp-quests");
    void incrementBpQuestProgress(user.id, "parkour_finish", 1);
  } catch { /* non-fatal */ }
  try {
    const { incrementDailyQuestProgress } = await import("@/lib/actions/daily-quests");
    void incrementDailyQuestProgress("parkour_finish", 1);
  } catch { /* non-fatal */ }

  revalidatePath("/parkour");
  return {
    success: true,
    timeMs: clampedMs,
    isNewRecord,
    previousBestMs,
    rank,
    creditsAwarded,
    xpAwarded,
    rewardCapped: !withinCap,
  };
}

export interface ParkourLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  nameStyleKey?: string | null;
  bestTimeMs: number;
  deaths: number;
  /** Combined T/D score (effective time incl. death penalty). Rank basis by default. */
  tdMs: number;
  finishes: number;
}

/** Single-map leaderboard. Default ranks by the combined T/D score (time + death
 * penalty); `sortBy` "time"/"deaths" offer the pure alternatives. */
export async function getParkourLeaderboard(mapId: string, limit = 20, sortBy: "td" | "time" | "deaths" = "td"): Promise<ParkourLeaderboardEntry[]> {
  const admin = createAdminClient();
  const cfg = await getParkourConfig();
  const penalty = cfg.deathPenaltyMs;
  const { data, error } = await admin
    .from("parkour_best_times")
    .select("user_id, best_time_ms, deaths, finishes, profiles(username, active_name_style_key)")
    .eq("map_id", mapId)
    .order("best_time_ms", { ascending: true })
    .limit(Math.max(1, Math.min(100, limit * 3)));
  if (error || !data) return [];
  const rows = (data as unknown as {
    user_id: string; best_time_ms: number; deaths: number; finishes: number;
    profiles: { username: string | null; active_name_style_key: string | null } | null;
  }[]).map((r) => ({ ...r, deaths: r.deaths ?? 0, td: parkourTd(r.best_time_ms, r.deaths ?? 0, penalty) }));
  rows.sort((a, b) =>
    sortBy === "deaths" ? (a.deaths - b.deaths) || (a.td - b.td)
      : sortBy === "time" ? (a.best_time_ms - b.best_time_ms) || (a.deaths - b.deaths)
        : (a.td - b.td) || (a.best_time_ms - b.best_time_ms));
  return rows.slice(0, Math.max(1, Math.min(100, limit))).map((row, i) => ({
    rank: i + 1,
    userId: row.user_id,
    username: row.profiles?.username ?? "Unbekannt",
    nameStyleKey: row.profiles?.active_name_style_key ?? null,
    bestTimeMs: row.best_time_ms,
    deaths: row.deaths,
    tdMs: row.td,
    finishes: row.finishes,
  }));
}

// ── Homepage leaderboard (per-map + „Gesamt" über alle Maps) ──────────────────

export interface ParkourHomeEntry {
  rank: number;
  userId: string;
  username: string;
  nameStyleKey: string | null;
  avatarUrl: string | null;
  prioBadges: string[];
  /** Map: Bestzeit in ms · Gesamt: Summe der Bestzeiten aller absolvierten Maps. */
  timeMs: number;
  deaths: number;
  /** Combined T/D score (rank basis). */
  tdMs: number;
  /** Nur „Gesamt": Anzahl absolvierter Maps. */
  mapsDone?: number;
}

/** `scope` = a map id OR "overall". Map: rank by time (tiebreak deaths). Overall:
 * rank by maps completed desc, then total best-time asc — der Allround-König. */
export async function getParkourHomeLeaderboard(scope: string, limit = 10): Promise<ParkourHomeEntry[]> {
  const admin = createAdminClient();
  const lim = Math.max(1, Math.min(50, limit));
  const penalty = (await getParkourConfig()).deathPenaltyMs;

  if (scope !== "overall") {
    const { data } = await admin
      .from("parkour_best_times")
      .select("user_id, best_time_ms, deaths, profiles(username, active_name_style_key, avatar_url, prio_badges)")
      .eq("map_id", scope)
      .order("best_time_ms", { ascending: true })
      .limit(lim * 3);
    const rows = (data as unknown as {
      user_id: string; best_time_ms: number; deaths: number;
      profiles: { username: string | null; active_name_style_key: string | null; avatar_url: string | null; prio_badges: string[] | null } | null;
    }[] ?? []).map((r) => ({ ...r, deaths: r.deaths ?? 0, td: parkourTd(r.best_time_ms, r.deaths ?? 0, penalty) }));
    rows.sort((a, b) => (a.td - b.td) || (a.best_time_ms - b.best_time_ms));
    return rows.slice(0, lim).map((row, i) => ({
      rank: i + 1,
      userId: row.user_id,
      username: row.profiles?.username ?? "Unbekannt",
      nameStyleKey: row.profiles?.active_name_style_key ?? null,
      avatarUrl: row.profiles?.avatar_url ?? null,
      prioBadges: row.profiles?.prio_badges ?? [],
      timeMs: row.best_time_ms,
      deaths: row.deaths,
      tdMs: row.td,
    }));
  }

  // Overall: aggregate every user's rows in JS (bounded by #players × 4 maps).
  const { data } = await admin
    .from("parkour_best_times")
    .select("user_id, best_time_ms, deaths, profiles(username, active_name_style_key, avatar_url, prio_badges)")
    .limit(5000);
  const byUser = new Map<string, { total: number; deaths: number; maps: number; p: { username: string | null; active_name_style_key: string | null; avatar_url: string | null; prio_badges: string[] | null } | null }>();
  for (const row of (data as unknown as {
    user_id: string; best_time_ms: number; deaths: number;
    profiles: { username: string | null; active_name_style_key: string | null; avatar_url: string | null; prio_badges: string[] | null } | null;
  }[] ?? [])) {
    const e = byUser.get(row.user_id) ?? { total: 0, deaths: 0, maps: 0, p: row.profiles };
    e.total += row.best_time_ms;
    e.deaths += row.deaths ?? 0;
    e.maps += 1;
    e.p = row.profiles ?? e.p;
    byUser.set(row.user_id, e);
  }
  return Array.from(byUser.entries())
    // Allround-King: most maps completed, then best combined T/D score.
    .sort((a, b) => (b[1].maps - a[1].maps) || (parkourTd(a[1].total, a[1].deaths, penalty) - parkourTd(b[1].total, b[1].deaths, penalty)))
    .slice(0, lim)
    .map(([userId, e], i) => ({
      rank: i + 1,
      userId,
      username: e.p?.username ?? "Unbekannt",
      nameStyleKey: e.p?.active_name_style_key ?? null,
      avatarUrl: e.p?.avatar_url ?? null,
      prioBadges: e.p?.prio_badges ?? [],
      tdMs: parkourTd(e.total, e.deaths, penalty),
      timeMs: e.total,
      deaths: e.deaths,
      mapsDone: e.maps,
    }));
}

/** This user's best time per map (map_id → ms). */
export async function getMyParkourBests(userId: string): Promise<Record<string, number>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("parkour_best_times")
    .select("map_id, best_time_ms")
    .eq("user_id", userId);
  const out: Record<string, number> = {};
  for (const row of (data ?? []) as { map_id: string; best_time_ms: number }[]) {
    out[row.map_id] = row.best_time_ms;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lobbies (Multiplayer / Custom rooms)
// ─────────────────────────────────────────────────────────────────────────────

export interface ParkourLobbyMember {
  userId: string;
  username: string;
  nameStyleKey: string | null;
  bestTimeMs: number | null;
  isHost: boolean;
}

export interface ParkourLobbyState {
  id: string;
  hostId: string;
  mapId: string;
  randomizer: boolean;
  status: "open" | "in_run" | "closed";
  maxPlayers: number;
  runSeed: number | null;
  activeMapId: string | null;
  members: ParkourLobbyMember[];
}

async function loadLobby(admin: ReturnType<typeof createAdminClient>, lobbyId: string): Promise<ParkourLobbyState | null> {
  const { data: lobby } = await admin
    .from("parkour_lobbies")
    .select("id, host_id, map_id, randomizer, status, max_players, run_seed, active_map_id")
    .eq("id", lobbyId)
    .maybeSingle();
  if (!lobby) return null;
  const { data: members } = await admin
    .from("parkour_lobby_members")
    .select("user_id, best_time_ms, profiles(username, active_name_style_key)")
    .eq("lobby_id", lobbyId)
    .order("joined_at", { ascending: true });
  const memberRows = (members ?? []) as unknown as {
    user_id: string; best_time_ms: number | null;
    profiles: { username: string | null; active_name_style_key: string | null } | null;
  }[];
  return {
    id: lobby.id,
    hostId: lobby.host_id,
    mapId: lobby.map_id,
    randomizer: lobby.randomizer,
    status: lobby.status,
    maxPlayers: lobby.max_players,
    runSeed: lobby.run_seed ?? null,
    activeMapId: lobby.active_map_id ?? null,
    members: memberRows.map((m) => ({
      userId: m.user_id,
      username: m.profiles?.username ?? "Spieler",
      nameStyleKey: m.profiles?.active_name_style_key ?? null,
      bestTimeMs: m.best_time_ms,
      isHost: m.user_id === lobby.host_id,
    })),
  };
}

export async function createParkourLobby(mapId: string, randomizer: boolean): Promise<{ ok: boolean; lobbyId?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const cfg = await getParkourConfig();
  if (!cfg.enabled) return { ok: false, error: "Parkour ist deaktiviert." };
  const startMap = randomizer ? "random" : (getParkourMap(mapId) ? mapId : PARKOUR_MAP_IDS[0]);

  const admin = createAdminClient();
  // A user can only host/be in one lobby — clear any stale membership first.
  await admin.from("parkour_lobby_members").delete().eq("user_id", user.id);

  const { data: created, error } = await admin
    .from("parkour_lobbies")
    .insert({ host_id: user.id, map_id: startMap, randomizer, status: "open", max_players: cfg.maxLobbySize })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: "Lobby konnte nicht erstellt werden." };

  await admin.from("parkour_lobby_members").insert({ lobby_id: created.id, user_id: user.id });
  return { ok: true, lobbyId: created.id };
}

export async function joinParkourLobby(lobbyId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();
  const { data: lobby } = await admin
    .from("parkour_lobbies")
    .select("id, host_id, max_players, status")
    .eq("id", lobbyId)
    .maybeSingle();
  if (!lobby) return { ok: false, error: "Lobby nicht gefunden." };
  if (lobby.status === "closed") return { ok: false, error: "Lobby ist geschlossen." };

  const { count } = await admin
    .from("parkour_lobby_members")
    .select("id", { count: "exact", head: true })
    .eq("lobby_id", lobbyId);
  // Already a member? Idempotent success.
  const { data: mine } = await admin
    .from("parkour_lobby_members").select("id").eq("lobby_id", lobbyId).eq("user_id", user.id).maybeSingle();
  if (!mine) {
    if ((count ?? 0) >= lobby.max_players) return { ok: false, error: "Lobby ist voll." };
    // Leave any other lobby first (one lobby per user).
    await admin.from("parkour_lobby_members").delete().eq("user_id", user.id);
    const { error } = await admin.from("parkour_lobby_members").insert({ lobby_id: lobbyId, user_id: user.id });
    if (error) return { ok: false, error: "Beitritt fehlgeschlagen." };
  }
  await broadcastLive(`parkour-lobby:${lobbyId}`);
  return { ok: true };
}

export async function leaveParkourLobby(lobbyId: string): Promise<{ ok: boolean; wasHost?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const admin = createAdminClient();
  const { data: lobby } = await admin.from("parkour_lobbies").select("host_id, status").eq("id", lobbyId).maybeSingle();
  const wasHost = lobby?.host_id === user.id;
  await admin.from("parkour_lobby_members").delete().eq("lobby_id", lobbyId).eq("user_id", user.id);
  // Host leaving (or disconnecting) closes the lobby for EVERYONE — at any status,
  // including mid-run — so nobody is left stranded in a hostless room.
  if (wasHost) {
    await admin.from("parkour_lobbies").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", lobbyId);
    await admin.from("parkour_lobby_members").delete().eq("lobby_id", lobbyId);
  }
  await broadcastLive(`parkour-lobby:${lobbyId}`);
  return { ok: true, wasHost };
}

export async function getParkourLobby(lobbyId: string): Promise<ParkourLobbyState | null> {
  const admin = createAdminClient();
  return loadLobby(admin, lobbyId);
}

/** Host-only: pick a fixed map or toggle the randomizer for the room. */
export async function setParkourLobbyMap(lobbyId: string, mapId: string, randomizer: boolean): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };
  const admin = createAdminClient();
  const { data: lobby } = await admin.from("parkour_lobbies").select("host_id, status").eq("id", lobbyId).maybeSingle();
  if (!lobby) return { ok: false, error: "Lobby nicht gefunden." };
  if (lobby.host_id !== user.id) return { ok: false, error: "Nur der Host darf die Map wählen." };
  const mid = randomizer ? "random" : (getParkourMap(mapId) ? mapId : PARKOUR_MAP_IDS[0]);
  await admin.from("parkour_lobbies").update({ map_id: mid, randomizer }).eq("id", lobbyId);
  await broadcastLive(`parkour-lobby:${lobbyId}`);
  return { ok: true };
}

/** Host-only: launch the run. Picks the active map (resolving the randomizer)
 * and stamps a shared run_seed so every client sees identical moving-platform
 * phases + the same race start. */
export async function startParkourLobbyRun(lobbyId: string, seed: number): Promise<{ ok: boolean; error?: string; activeMapId?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };
  const admin = createAdminClient();
  const { data: lobby } = await admin.from("parkour_lobbies").select("host_id, map_id, randomizer").eq("id", lobbyId).maybeSingle();
  if (!lobby) return { ok: false, error: "Lobby nicht gefunden." };
  if (lobby.host_id !== user.id) return { ok: false, error: "Nur der Host darf starten." };

  const cfg = await getParkourConfig();
  const enabledIds = PARKOUR_MAP_IDS.filter((id) => isMapEnabled(id, cfg));
  const pool = enabledIds.length > 0 ? enabledIds : PARKOUR_MAP_IDS;
  let activeMapId: string;
  if (lobby.randomizer || lobby.map_id === "random") {
    // Deterministic pick from the shared seed so it's not host-forgeable UX-wise.
    activeMapId = pool[Math.abs(Math.round(seed)) % pool.length];
  } else {
    activeMapId = pool.includes(lobby.map_id) ? lobby.map_id : pool[0];
  }
  const safeSeed = Math.abs(Math.round(seed)) || 1;
  await admin.from("parkour_lobbies")
    .update({ status: "in_run", run_seed: safeSeed, active_map_id: activeMapId })
    .eq("id", lobbyId);
  // Reset session race times for the new run.
  await admin.from("parkour_lobby_members").update({ best_time_ms: null }).eq("lobby_id", lobbyId);
  await broadcastLive(`parkour-lobby:${lobbyId}`);
  return { ok: true, activeMapId };
}

/** Host heartbeat — the host's client pings this periodically while it sits on
 * /parkour, bumping `last_seen_at`. The cleanup (cron + maintenance script) closes
 * lobbies whose heartbeat has gone stale, so a hard-crashed host's room self-heals
 * WITHOUT ever false-closing a genuinely active lobby. No-op for non-hosts. */
export async function heartbeatParkourLobby(lobbyId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const admin = createAdminClient();
  await admin.from("parkour_lobbies")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", lobbyId)
    .eq("host_id", user.id)
    .neq("status", "closed");
  return { ok: true };
}

/** Host-only: end the current race and return the lobby to the "open" waiting
 * room so it can be re-raced (and any spectators become normal members again).
 * Clears the run fields; keeps the members + their last race times. */
export async function endParkourLobbyRun(lobbyId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };
  const admin = createAdminClient();
  const { data: lobby } = await admin.from("parkour_lobbies").select("host_id, status").eq("id", lobbyId).maybeSingle();
  if (!lobby) return { ok: false, error: "Lobby nicht gefunden." };
  if (lobby.host_id !== user.id) return { ok: false, error: "Nur der Host darf das Rennen beenden." };
  if (lobby.status !== "in_run") return { ok: true }; // already back in the waiting room — idempotent
  await admin.from("parkour_lobbies")
    .update({ status: "open", run_seed: null, active_map_id: null })
    .eq("id", lobbyId);
  await broadcastLive(`parkour-lobby:${lobbyId}`);
  return { ok: true };
}

/** Report a lobby-race finish time (for the in-lobby race board; the global
 * leaderboard reward path is submitParkourRun, called separately). */
export async function reportParkourLobbyTime(lobbyId: string, timeMs: number): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  if (!Number.isFinite(timeMs) || timeMs <= 0) return { ok: false };
  const admin = createAdminClient();
  const { data: mine } = await admin
    .from("parkour_lobby_members").select("best_time_ms").eq("lobby_id", lobbyId).eq("user_id", user.id).maybeSingle();
  const prev = mine?.best_time_ms ?? null;
  if (prev === null || timeMs < prev) {
    await admin.from("parkour_lobby_members").update({ best_time_ms: Math.round(timeMs) }).eq("lobby_id", lobbyId).eq("user_id", user.id);
    await broadcastLive(`parkour-lobby:${lobbyId}`);
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin leaderboard management
// ─────────────────────────────────────────────────────────────────────────────

/** Admin: wipe all recorded best times for a single map (leaderboard reset). */
export async function adminResetParkourMap(mapId: string): Promise<{ success: boolean; error?: string; removed?: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Kein Zugriff." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { count } = await admin.from("parkour_best_times").select("user_id", { count: "exact", head: true }).eq("map_id", mapId);
  const { error } = await admin.from("parkour_best_times").delete().eq("map_id", mapId);
  if (error) return { success: false, error: "Zurücksetzen fehlgeschlagen." };
  try {
    await admin.from("audit_logs").insert({ user_id: user.id, action: "admin_parkour_reset", payload: { map_id: mapId, removed: count ?? 0 } });
  } catch { /* non-fatal */ }
  revalidatePath("/parkour");
  return { success: true, removed: count ?? 0 };
}

/** Seconds a user must wait before re-inviting the SAME friend again (across any
 * lobby) — stops invite-spam. On top of that, each friend can only be invited
 * ONCE per lobby (they already have the link + can join any time). */
const PARKOUR_INVITE_COOLDOWN_SEC = 45;

export async function inviteFriendToParkour(lobbyId: string, friendId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };
  if (friendId === user.id) return { ok: false, error: "Du kannst dich nicht selbst einladen." };
  const admin = createAdminClient();

  // Must actually be friends (a friendship row from me → friend exists).
  const { data: friendship } = await admin
    .from("friendships").select("user_id").eq("user_id", user.id).eq("friend_id", friendId).maybeSingle();
  if (!friendship) return { ok: false, error: "Ihr seid keine Freunde." };

  const { data: lobby } = await admin.from("parkour_lobbies").select("id, status").eq("id", lobbyId).maybeSingle();
  if (!lobby || lobby.status === "closed") return { ok: false, error: "Lobby nicht verfügbar." };

  // Already in the lobby? Nothing to invite.
  const { data: alreadyMember } = await admin
    .from("parkour_lobby_members").select("id").eq("lobby_id", lobbyId).eq("user_id", friendId).maybeSingle();
  if (alreadyMember) return { ok: false, error: "Ist schon in der Lobby." };

  // ── Anti-spam: block a re-invite to the same friend within the cooldown, and
  // never invite the same friend to the SAME lobby twice. Both checked against
  // the persistent audit log of past invites. ──
  const since = new Date(Date.now() - PARKOUR_INVITE_COOLDOWN_SEC * 1000).toISOString();
  const { data: recent } = await admin
    .from("audit_logs")
    .select("payload, created_at")
    .eq("user_id", user.id)
    .eq("action", "parkour_invite")
    .eq("payload->>friend_id", friendId)
    .order("created_at", { ascending: false })
    .limit(20);
  for (const r of recent ?? []) {
    const p = (r.payload as Record<string, unknown> | null) ?? {};
    if (p.lobby_id === lobbyId) return { ok: false, error: "Diesen Freund hast du bereits eingeladen." };
    if (typeof r.created_at === "string" && r.created_at > since) {
      return { ok: false, error: `Zu schnell — bitte kurz warten, bevor du erneut einlädst.` };
    }
  }

  const { data: me } = await admin.from("profiles").select("username").eq("id", user.id).maybeSingle();
  await notifyUser({
    userId: friendId,
    type: "parkour_invite",
    title: "Parkour-Einladung",
    message: `${me?.username ?? "Ein Freund"} lädt dich in eine Parkour-Lobby ein.`,
    link: `/parkour?lobby=${lobbyId}`,
  });
  // Record the invite so the cooldown + one-per-lobby rules above can enforce.
  try {
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "parkour_invite",
      payload: { lobby_id: lobbyId, friend_id: friendId },
    });
  } catch { /* non-fatal */ }
  return { ok: true };
}
