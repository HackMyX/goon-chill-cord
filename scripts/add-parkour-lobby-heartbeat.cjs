// scripts/add-parkour-lobby-heartbeat.cjs
// Fügt parkour_lobbies eine Host-Heartbeat-Spalte `last_seen_at` hinzu. Der Host
// aktualisiert sie im Client periodisch (solange er auf /parkour ist); der
// Cleanup (Cron + scripts/close-stale-parkour-lobbies.cjs) schließt Lobbys, deren
// Heartbeat veraltet ist — false-positive-frei (aktive Lobbys heartbeaten weiter,
// created_at würde aktive Langzeit-Lobbys fälschlich schließen).
// Idempotent.
//
//   node scripts/add-parkour-lobby-heartbeat.cjs

const { Client } = require("pg");
try { require("dotenv").config({ path: ".env.local" }); } catch { /* dotenv optional */ }

(async () => {
  const CONN = process.env.DATABASE_URL;
  if (!CONN) { console.error("❌  DATABASE_URL fehlt (.env.local)."); process.exit(1); }
  const client = new Client({ connectionString: CONN });
  await client.connect();
  try {
    await client.query(`
      ALTER TABLE parkour_lobbies
        ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();
    `);
    // Bestehende Zeilen: Heartbeat auf created_at setzen (falls älterer Bestand).
    await client.query(`UPDATE parkour_lobbies SET last_seen_at = created_at WHERE last_seen_at IS NULL;`);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_parkour_lobbies_heartbeat
        ON parkour_lobbies (status, last_seen_at);
    `);
    console.log("✅  parkour_lobbies.last_seen_at (Host-Heartbeat) + Index.");
  } finally {
    await client.end();
  }
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
