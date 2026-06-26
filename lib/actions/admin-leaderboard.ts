"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Kein Zugriff.");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) throw new Error("Kein Zugriff.");
  return { user, admin: createAdminClient() };
}

// ---------------------------------------------------------------------------
// Snake
// ---------------------------------------------------------------------------

export interface AdminSnakeScoreRow {
  userId: string;
  username: string;
  speedMode: "x1" | "x2" | "grind";
  bestScore: number;
  totalCrEarned: number;
  gamesPlayed: number;
  updatedAt: string;
}

export interface AdminSnakeSnapshot {
  id: string;
  name: string;
  speedMode: "x1" | "x2" | "grind";
  createdAt: string;
  entryCount: number;
}

export async function adminGetSnakeLeaderboard(
  speedMode: "x1" | "x2" | "grind"
): Promise<AdminSnakeScoreRow[]> {
  try {
    const { admin } = await requireAdmin();
    const { data, error } = await admin
      .from("snake_best_scores")
      .select("user_id, best_score, total_cr_earned, games_played, updated_at, profiles(username)")
      .eq("speed_mode", speedMode)
      .order("best_score", { ascending: false })
      .limit(200);

    if (error || !data) return [];

    return (data as unknown as {
      user_id: string;
      best_score: number;
      total_cr_earned: number;
      games_played: number;
      updated_at: string;
      profiles: { username: string } | null;
    }[]).map((row) => ({
      userId: row.user_id,
      username: row.profiles?.username ?? "Unbekannt",
      speedMode,
      bestScore: row.best_score,
      totalCrEarned: row.total_cr_earned,
      gamesPlayed: row.games_played,
      updatedAt: row.updated_at,
    }));
  } catch { return []; }
}

export async function adminUpdateSnakeScore(
  userId: string,
  speedMode: "x1" | "x2" | "grind",
  bestScore: number,
  totalCrEarned: number,
  gamesPlayed: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, admin } = await requireAdmin();

    const { error } = await admin.from("snake_best_scores").upsert({
      user_id: userId,
      speed_mode: speedMode,
      best_score: Math.max(0, Math.round(bestScore)),
      total_cr_earned: Math.max(0, Math.round(totalCrEarned)),
      games_played: Math.max(0, Math.round(gamesPlayed)),
      updated_at: new Date().toISOString(),
    });

    if (error) return { success: false, error: "Speichern fehlgeschlagen." };

    try {
      await admin.from("audit_logs").insert({
        user_id: user.id,
        action: "admin_snake_score_edit",
        payload: { target_user: userId, speed_mode: speedMode, best_score: bestScore, total_cr_earned: totalCrEarned, games_played: gamesPlayed },
      });
    } catch { /* non-fatal */ }

    revalidatePath("/snake");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function adminDeleteSnakeScore(
  userId: string,
  speedMode: "x1" | "x2" | "grind"
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, admin } = await requireAdmin();

    await admin.from("snake_best_scores").delete().eq("user_id", userId).eq("speed_mode", speedMode);

    try {
      await admin.from("audit_logs").insert({
        user_id: user.id,
        action: "admin_snake_score_delete",
        payload: { target_user: userId, speed_mode: speedMode },
      });
    } catch { /* non-fatal */ }

    revalidatePath("/snake");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function adminCreateSnakeSnapshot(
  speedMode: "x1" | "x2" | "grind",
  name: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, admin } = await requireAdmin();

    const entries = await adminGetSnakeLeaderboard(speedMode);

    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: `admin_snake_lb_snapshot_${speedMode}`,
      payload: {
        snapshot_name: name.trim() || `Snapshot ${new Date().toLocaleDateString("de-DE")}`,
        entries: entries.map((e) => ({
          user_id: e.userId,
          username: e.username,
          best_score: e.bestScore,
          total_cr_earned: e.totalCrEarned,
          games_played: e.gamesPlayed,
        })),
      },
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function adminGetSnakeSnapshots(
  speedMode: "x1" | "x2" | "grind"
): Promise<AdminSnakeSnapshot[]> {
  try {
    const { admin } = await requireAdmin();

    const { data } = await admin
      .from("audit_logs")
      .select("id, payload, created_at")
      .eq("action", `admin_snake_lb_snapshot_${speedMode}`)
      .order("created_at", { ascending: false })
      .limit(20);

    return (data ?? []).map((row) => {
      const p = row.payload as Record<string, unknown>;
      const entries = Array.isArray(p?.entries) ? p.entries : [];
      return {
        id: row.id,
        name: String(p?.snapshot_name ?? "Snapshot"),
        speedMode,
        createdAt: row.created_at,
        entryCount: (entries as unknown[]).length,
      };
    });
  } catch { return []; }
}

export async function adminRestoreSnakeSnapshot(
  snapshotId: string,
  speedMode: "x1" | "x2" | "grind"
): Promise<{ success: boolean; error?: string; restored?: number }> {
  try {
    const { user, admin } = await requireAdmin();

    const { data } = await admin
      .from("audit_logs")
      .select("payload")
      .eq("id", snapshotId)
      .single();

    if (!data) return { success: false, error: "Snapshot nicht gefunden." };

    const p = data.payload as Record<string, unknown>;
    const entries = Array.isArray(p?.entries) ? (p.entries as Record<string, unknown>[]) : [];

    if (entries.length === 0) return { success: false, error: "Leerer Snapshot." };

    // Delete all current scores for this mode then re-insert
    await admin.from("snake_best_scores").delete().eq("speed_mode", speedMode);

    const rows = entries.map((e) => ({
      user_id: String(e.user_id),
      speed_mode: speedMode,
      best_score: Number(e.best_score) || 0,
      total_cr_earned: Number(e.total_cr_earned) || 0,
      games_played: Number(e.games_played) || 0,
      updated_at: new Date().toISOString(),
    }));

    if (rows.length > 0) await admin.from("snake_best_scores").insert(rows);

    try {
      await admin.from("audit_logs").insert({
        user_id: user.id,
        action: "admin_snake_lb_restore",
        payload: { speed_mode: speedMode, snapshot_id: snapshotId, restored: rows.length },
      });
    } catch { /* non-fatal */ }

    revalidatePath("/snake");
    return { success: true, restored: rows.length };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ---------------------------------------------------------------------------
// Mine
// ---------------------------------------------------------------------------

export interface AdminMineProgressRow {
  userId: string;
  username: string;
  level: number;
  totalMined: number;
  lastCollectedAt: string;
  updatedAt: string;
}

export interface AdminMineSnapshot {
  id: string;
  name: string;
  createdAt: string;
  entryCount: number;
}

export async function adminGetMineLeaderboard(): Promise<AdminMineProgressRow[]> {
  try {
    const { admin } = await requireAdmin();
    const { data, error } = await admin
      .from("mine_progress")
      .select("user_id, level, total_mined, last_collected_at, updated_at, profiles(username)")
      .order("total_mined", { ascending: false })
      .limit(200);

    if (error || !data) return [];

    return (data as unknown as {
      user_id: string;
      level: number;
      total_mined: number;
      last_collected_at: string;
      updated_at: string;
      profiles: { username: string } | null;
    }[]).map((row) => ({
      userId: row.user_id,
      username: row.profiles?.username ?? "Unbekannt",
      level: row.level,
      totalMined: row.total_mined,
      lastCollectedAt: row.last_collected_at,
      updatedAt: row.updated_at,
    }));
  } catch { return []; }
}

export async function adminUpdateMineProgress(
  userId: string,
  level: number,
  totalMined: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, admin } = await requireAdmin();

    const { error } = await admin.from("mine_progress").update({
      level: Math.max(1, Math.round(level)),
      total_mined: Math.max(0, Math.round(totalMined)),
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);

    if (error) return { success: false, error: "Speichern fehlgeschlagen." };

    try {
      await admin.from("audit_logs").insert({
        user_id: user.id,
        action: "admin_mine_progress_edit",
        payload: { target_user: userId, level, total_mined: totalMined },
      });
    } catch { /* non-fatal */ }

    revalidatePath("/mine");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function adminDeleteMineProgress(
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, admin } = await requireAdmin();

    await admin.from("mine_progress").delete().eq("user_id", userId);

    try {
      await admin.from("audit_logs").insert({
        user_id: user.id,
        action: "admin_mine_progress_delete",
        payload: { target_user: userId },
      });
    } catch { /* non-fatal */ }

    revalidatePath("/mine");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function adminCreateMineSnapshot(
  name: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, admin } = await requireAdmin();

    const entries = await adminGetMineLeaderboard();

    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "admin_mine_lb_snapshot",
      payload: {
        snapshot_name: name.trim() || `Snapshot ${new Date().toLocaleDateString("de-DE")}`,
        entries: entries.map((e) => ({
          user_id: e.userId,
          username: e.username,
          level: e.level,
          total_mined: e.totalMined,
          last_collected_at: e.lastCollectedAt,
        })),
      },
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function adminGetMineSnapshots(): Promise<AdminMineSnapshot[]> {
  try {
    const { admin } = await requireAdmin();

    const { data } = await admin
      .from("audit_logs")
      .select("id, payload, created_at")
      .eq("action", "admin_mine_lb_snapshot")
      .order("created_at", { ascending: false })
      .limit(20);

    return (data ?? []).map((row) => {
      const p = row.payload as Record<string, unknown>;
      const entries = Array.isArray(p?.entries) ? p.entries : [];
      return {
        id: row.id,
        name: String(p?.snapshot_name ?? "Snapshot"),
        createdAt: row.created_at,
        entryCount: (entries as unknown[]).length,
      };
    });
  } catch { return []; }
}

export async function adminRestoreMineSnapshot(
  snapshotId: string,
): Promise<{ success: boolean; error?: string; restored?: number }> {
  try {
    const { user, admin } = await requireAdmin();

    const { data } = await admin
      .from("audit_logs")
      .select("payload")
      .eq("id", snapshotId)
      .single();

    if (!data) return { success: false, error: "Snapshot nicht gefunden." };

    const p = data.payload as Record<string, unknown>;
    const entries = Array.isArray(p?.entries) ? (p.entries as Record<string, unknown>[]) : [];

    if (entries.length === 0) return { success: false, error: "Leerer Snapshot." };

    let restored = 0;
    for (const e of entries) {
      const { error } = await admin.from("mine_progress").update({
        level: Number(e.level) || 1,
        total_mined: Number(e.total_mined) || 0,
        last_collected_at: String(e.last_collected_at),
        updated_at: new Date().toISOString(),
      }).eq("user_id", String(e.user_id));
      if (!error) restored++;
    }

    try {
      await admin.from("audit_logs").insert({
        user_id: user.id,
        action: "admin_mine_lb_restore",
        payload: { snapshot_id: snapshotId, restored },
      });
    } catch { /* non-fatal */ }

    revalidatePath("/mine");
    return { success: true, restored };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ---------------------------------------------------------------------------
// Plinko — reads from plinko_plays (no dedicated score table; best win per user)
// ---------------------------------------------------------------------------

export interface AdminPlinkoRow {
  userId: string;
  username: string;
  bestWinCr: number;
  totalWinsCr: number;
  totalSpent: number;
  gamesPlayed: number;
  bestMultiplier: number;
}

export async function adminGetPlinkoLeaderboard(): Promise<AdminPlinkoRow[]> {
  try {
    const { admin } = await requireAdmin();
    const { data, error } = await admin
      .from("plinko_plays")
      .select("user_id, payout_cr, ball_cost, result_multiplier, profiles(username)")
      .order("payout_cr", { ascending: false })
      .limit(2000);

    if (error || !data) return [];

    // Aggregate per user
    const map = new Map<string, AdminPlinkoRow>();
    for (const row of data as unknown as {
      user_id: string;
      payout_cr: number;
      ball_cost: number;
      result_multiplier: number;
      profiles: { username: string } | null;
    }[]) {
      const existing = map.get(row.user_id);
      if (existing) {
        existing.gamesPlayed++;
        existing.totalSpent += row.ball_cost ?? 0;
        existing.totalWinsCr += row.payout_cr ?? 0;
        if ((row.payout_cr ?? 0) > existing.bestWinCr) existing.bestWinCr = row.payout_cr;
        if ((row.result_multiplier ?? 0) > existing.bestMultiplier) existing.bestMultiplier = row.result_multiplier;
      } else {
        map.set(row.user_id, {
          userId: row.user_id,
          username: row.profiles?.username ?? "Unbekannt",
          bestWinCr: row.payout_cr ?? 0,
          totalWinsCr: row.payout_cr ?? 0,
          totalSpent: row.ball_cost ?? 0,
          gamesPlayed: 1,
          bestMultiplier: row.result_multiplier ?? 0,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.bestWinCr - a.bestWinCr).slice(0, 100);
  } catch { return []; }
}

export async function adminDeletePlinkoHistory(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { admin } = await requireAdmin();
    const { error } = await admin.from("plinko_plays").delete().eq("user_id", userId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ---------------------------------------------------------------------------
// DON — aggregated from profiles credits (DON is a pure credits-transfer game)
// ---------------------------------------------------------------------------

export interface AdminDonRow {
  userId: string;
  username: string;
  credits: number;
  role: string;
}

export async function adminGetDonLeaderboard(): Promise<AdminDonRow[]> {
  try {
    const { admin } = await requireAdmin();
    const { data, error } = await admin
      .from("profiles")
      .select("id, username, credits, role")
      .order("credits", { ascending: false })
      .limit(100);

    if (error || !data) return [];

    return (data as { id: string; username: string; credits: number; role: string }[]).map((r) => ({
      userId: r.id,
      username: r.username,
      credits: r.credits,
      role: r.role,
    }));
  } catch { return []; }
}
