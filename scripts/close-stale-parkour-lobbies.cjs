// scripts/close-stale-parkour-lobbies.cjs
// Schließt verwaiste Parkour-Lobbys (Host hart getrennt / Tab-Crash ohne sauberes
// Leave), deren Host-Heartbeat (`last_seen_at`) seit > N Minuten still steht — inkl.
// Löschen ihrer Mitgliedschaften. Idempotent + FALSE-POSITIVE-FREI: aktive Lobbys
// heartbeaten weiter (der Host pingt im Client), also wird eine echte Lobby nie
// fälschlich geschlossen. Laufzeit-Mechanismen (Host-pagehide/-unmount-Leave +
// Presence-Grace der Mitglieder) decken den Normalfall ab; dieses Skript / der
// Cron ist der doppelte Boden für hart abgestürzte Hosts.
//
//   node scripts/close-stale-parkour-lobbies.cjs [maxStaleMinutes=3]

const { Client } = require("pg");
try { require("dotenv").config({ path: ".env.local" }); } catch { /* dotenv optional */ }

const MAX_AGE_MIN = Math.max(1, parseInt(process.argv[2] || "3", 10) || 3);
const CONN = process.env.DATABASE_URL;

(async () => {
  if (!CONN) { console.error("❌  DATABASE_URL fehlt (.env.local)."); process.exit(1); }
  const client = new Client({ connectionString: CONN });
  await client.connect();
  try {
    // Which lobbies will be closed (for the log).
    const { rows: doomed } = await client.query(
      `SELECT id FROM parkour_lobbies
       WHERE status IN ('open','in_run')
         AND last_seen_at < now() - ($1 || ' minutes')::interval`,
      [String(MAX_AGE_MIN)],
    );
    if (doomed.length === 0) { console.log(`✅  Keine Lobbys mit Heartbeat älter als ${MAX_AGE_MIN} min.`); return; }
    const ids = doomed.map((r) => r.id);
    // Delete memberships first (FK is ON DELETE CASCADE, but we keep the closed
    // lobby row for audit history so we clear members explicitly).
    await client.query(`DELETE FROM parkour_lobby_members WHERE lobby_id = ANY($1::uuid[])`, [ids]);
    await client.query(
      `UPDATE parkour_lobbies SET status='closed', closed_at=now() WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    console.log(`✅  ${ids.length} verwaiste Lobby(s) geschlossen (älter als ${MAX_AGE_MIN} min) + Mitglieder bereinigt.`);
  } finally {
    await client.end();
  }
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
