import { NextResponse, type NextRequest } from "next/server";
import { runAllEnabledCleanups } from "@/lib/actions/cleanup-config";
import { createAdminClient } from "@/lib/supabase/admin";

/** Self-heal abandoned parkour lobbies whose host heartbeat (`last_seen_at`) has
 * gone stale — covers a hard-crashed host that never ran an explicit leave.
 * False-positive-free: an active lobby keeps heartbeating so it's never touched.
 * Fully non-fatal — a failure here must never break the log cleanup above. */
async function closeStaleParkourLobbies(): Promise<number> {
  try {
    const admin = createAdminClient();
    const cutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString(); // 3 min stale
    const { data: doomed } = await admin
      .from("parkour_lobbies")
      .select("id")
      .in("status", ["open", "in_run"])
      .lt("last_seen_at", cutoff);
    const ids = (doomed ?? []).map((r) => r.id as string);
    if (ids.length === 0) return 0;
    await admin.from("parkour_lobby_members").delete().in("lobby_id", ids);
    await admin.from("parkour_lobbies").update({ status: "closed", closed_at: new Date().toISOString() }).in("id", ids);
    return ids.length;
  } catch {
    return 0;
  }
}

// Cron-Endpunkt darf nicht statisch optimiert werden — er muss bei jedem
// Aufruf laufen (Vercel Cron ruft ihn stündlich auf, siehe vercel.json).
export const dynamic = "force-dynamic";

/**
 * Automatischer Log-Cleanup.
 *
 * Authentifizierung:
 *  - Header `authorization: Bearer <CRON_SECRET>` (so ruft Vercel Cron auf), ODER
 *  - Query `?key=<CRON_SECRET>`.
 * Ist `CRON_SECRET` nicht gesetzt, läuft der Endpunkt trotzdem (interner Betrieb).
 *
 * Führt `runAllEnabledCleanups({ system: true })` aus — überspringt die
 * Admin-Session-Prüfung, da hier das Secret die Autorisierung übernimmt.
 * Fehler werden sauber als JSON zurückgegeben (kein 500-Crash).
 */
export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const authHeader = req.headers.get("authorization");
      const keyParam = req.nextUrl.searchParams.get("key");
      const authorized = authHeader === `Bearer ${secret}` || keyParam === secret;
      if (!authorized) {
        return NextResponse.json({ ok: false, error: "Nicht autorisiert." }, { status: 401 });
      }
    }

    const result = await runAllEnabledCleanups({ system: true });
    const totalDeleted = result.results.reduce((sum, r) => sum + (r.deleted ?? 0), 0);
    const staleLobbiesClosed = await closeStaleParkourLobbies();

    return NextResponse.json({
      ok: result.success,
      ranAt: new Date().toISOString(),
      totalDeleted,
      staleLobbiesClosed,
      results: result.results,
    });
  } catch (e) {
    // Niemals 500 werfen — Cron-Runner sollen einen sauberen JSON-Fehler sehen.
    return NextResponse.json({ ok: false, error: String(e) }, { status: 200 });
  }
}
