import { NextResponse, type NextRequest } from "next/server";
import { runAllEnabledCleanups } from "@/lib/actions/cleanup-config";

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

    return NextResponse.json({
      ok: result.success,
      ranAt: new Date().toISOString(),
      totalDeleted,
      results: result.results,
    });
  } catch (e) {
    // Niemals 500 werfen — Cron-Runner sollen einen sauberen JSON-Fehler sehen.
    return NextResponse.json({ ok: false, error: String(e) }, { status: 200 });
  }
}
