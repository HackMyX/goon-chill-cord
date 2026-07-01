// scripts/add-parkour.cjs
// V-PARKOUR-SINGULARITY — 3D Jump & Run Fundament.
// Erstellt:
//   parkour_config        (Singleton id='default' — Physik/Rewards-Overrides + Master-Schalter)
//   parkour_best_times    (Bestenliste: ms-genaue Bestzeit pro User+Map)
//   parkour_lobbies       (Multiplayer-/Custom-Räume; Host bestimmt Map/Randomizer)
//   parkour_lobby_members (Lobby-Mitgliedschaften inkl. Renn-Bestzeit dieser Session)
// Alle mit RLS + Indizes. Idempotent (IF NOT EXISTS / Policy-Guards).
// Run: node scripts/add-parkour.cjs
try { require("dotenv").config({ path: ".env.local" }); } catch { /* dotenv optional */ }

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function ensurePolicy(client, table, name, sql) {
  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = '${table}' AND policyname = '${name}'
      ) THEN
        ${sql}
      END IF;
    END $$;
  `);
}

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    // ── parkour_config (Singleton) ────────────────────────────────────────────
    // Genau EINE Zeile (id='default'). maps_config = per-Map-Overrides (Physik +
    // Rewards) als JSONB, damit neue Maps ohne DDL-Änderung tunebar bleiben.
    await client.query(`
      CREATE TABLE IF NOT EXISTS parkour_config (
        id                       text        PRIMARY KEY DEFAULT 'default',
        enabled                  boolean     NOT NULL DEFAULT true,
        admin_only               boolean     NOT NULL DEFAULT false,
        max_lobby_size           integer     NOT NULL DEFAULT 6,
        daily_rewarded_finishes  integer     NOT NULL DEFAULT 3,
        maps_config              jsonb       NOT NULL DEFAULT '{}'::jsonb,
        updated_at               timestamptz NOT NULL DEFAULT now()
      );
    `);
    await client.query(`
      INSERT INTO parkour_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
    `);
    await client.query(`ALTER TABLE parkour_config ENABLE ROW LEVEL SECURITY;`);
    // RLS an, KEINE Policy → nur Service-Role (Server-Actions) liest/schreibt.
    console.log("✅  parkour_config (Singleton) + Standard-Zeile");

    // ── parkour_best_times (Bestenliste) ──────────────────────────────────────
    // Eine Zeile pro User+Map: ms-genaue Bestzeit. Öffentlich lesbar (Leaderboard),
    // Self-Write; Server schreibt über Service-Role (bypass RLS) autoritativ.
    await client.query(`
      CREATE TABLE IF NOT EXISTS parkour_best_times (
        user_id       uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        map_id        text        NOT NULL,
        best_time_ms  integer     NOT NULL,
        runs          integer     NOT NULL DEFAULT 0,
        finishes      integer     NOT NULL DEFAULT 0,
        updated_at    timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, map_id)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_parkour_best_map_time
        ON parkour_best_times (map_id, best_time_ms ASC);
    `);
    await client.query(`ALTER TABLE parkour_best_times ENABLE ROW LEVEL SECURITY;`);
    await ensurePolicy(client, "parkour_best_times", "pbt_select_all",
      `CREATE POLICY pbt_select_all ON parkour_best_times FOR SELECT USING (true);`);
    await ensurePolicy(client, "parkour_best_times", "pbt_self_write",
      `CREATE POLICY pbt_self_write ON parkour_best_times FOR ALL USING (auth.uid() = user_id);`);
    console.log("✅  parkour_best_times + RLS");

    // ── parkour_lobbies ───────────────────────────────────────────────────────
    // Custom-/Multiplayer-Räume. run_seed = geteilter Renn-Start-Timestamp (ms),
    // damit alle Clients bewegliche Plattformen (period+phase) deterministisch
    // gleich sehen. map_id = feste Map ODER 'random' (Host-Randomizer).
    await client.query(`
      CREATE TABLE IF NOT EXISTS parkour_lobbies (
        id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        host_id       uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        map_id        text        NOT NULL DEFAULT 'neon_ascent',
        randomizer    boolean     NOT NULL DEFAULT false,
        status        text        NOT NULL DEFAULT 'open',
        max_players   integer     NOT NULL DEFAULT 6,
        run_seed      bigint,
        active_map_id text,
        created_at    timestamptz NOT NULL DEFAULT now(),
        closed_at     timestamptz,
        CONSTRAINT parkour_lobbies_status_chk
          CHECK (status IN ('open','in_run','closed'))
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_parkour_lobbies_open
        ON parkour_lobbies (status, created_at DESC);
    `);
    await client.query(`ALTER TABLE parkour_lobbies ENABLE ROW LEVEL SECURITY;`);
    await ensurePolicy(client, "parkour_lobbies", "pl_select_all",
      `CREATE POLICY pl_select_all ON parkour_lobbies FOR SELECT USING (true);`);
    console.log("✅  parkour_lobbies + RLS");

    // ── parkour_lobby_members ─────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS parkour_lobby_members (
        id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        lobby_id      uuid        NOT NULL REFERENCES parkour_lobbies(id) ON DELETE CASCADE,
        user_id       uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        joined_at     timestamptz NOT NULL DEFAULT now(),
        best_time_ms  integer,
        CONSTRAINT parkour_lobby_members_uniq UNIQUE (lobby_id, user_id)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_parkour_lobby_members_lobby
        ON parkour_lobby_members (lobby_id, joined_at ASC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_parkour_lobby_members_user
        ON parkour_lobby_members (user_id);
    `);
    await client.query(`ALTER TABLE parkour_lobby_members ENABLE ROW LEVEL SECURITY;`);
    await ensurePolicy(client, "parkour_lobby_members", "plm_select_all",
      `CREATE POLICY plm_select_all ON parkour_lobby_members FOR SELECT USING (true);`);
    console.log("✅  parkour_lobby_members + RLS");

    // Realtime für Lobby-Listen-Refresh (Presence/broadcastLive laufen separat).
    for (const t of ["parkour_lobbies", "parkour_lobby_members", "parkour_best_times"]) {
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND tablename = '${t}'
          ) THEN
            EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE ${t}';
          END IF;
        END $$;
      `);
    }
    console.log("✅  Realtime-Publication");

    console.log("\n🎉  Parkour-System Migration abgeschlossen.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
