// scripts/add-friends-system.cjs
// V-SOCIAL Phase 1 — Freundes-/Social-Netzwerk Fundament.
// Erstellt: friend_requests, friendships, blocked_users (alle mit RLS + Indizes).
// "zuletzt online" und "in-game" werden bewusst aus user_sessions (last_ping/in_world)
// abgeleitet — KEINE neue profiles-Spalte, passt zur ephemeren Presence-Philosophie.
// Idempotent (IF NOT EXISTS / Policy-Guards). Run: node scripts/add-friends-system.cjs

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
    // ── friend_requests ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS friend_requests (
        id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        from_user_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        to_user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        status        text        NOT NULL DEFAULT 'pending',
        created_at    timestamptz NOT NULL DEFAULT now(),
        responded_at  timestamptz,
        CONSTRAINT friend_requests_status_chk
          CHECK (status IN ('pending','accepted','declined','cancelled')),
        CONSTRAINT friend_requests_no_self CHECK (from_user_id <> to_user_id)
      );
    `);
    // Only ONE pending request per ordered pair at a time (partial unique index).
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_friend_requests_pending
        ON friend_requests (from_user_id, to_user_id)
        WHERE status = 'pending';
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_friend_requests_to_pending
        ON friend_requests (to_user_id, status, created_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_friend_requests_from_pending
        ON friend_requests (from_user_id, status, created_at DESC);
    `);
    console.log("✅  friend_requests");

    // ── friendships ──────────────────────────────────────────────────────────
    // One row PER DIRECTION (A->B and B->A) so "list my friends" is a single
    // indexed lookup. `favorite` is per-direction (the owner's pin).
    await client.query(`
      CREATE TABLE IF NOT EXISTS friendships (
        id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        friend_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        favorite    boolean     NOT NULL DEFAULT false,
        created_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT friendships_no_self CHECK (user_id <> friend_id),
        CONSTRAINT friendships_uniq UNIQUE (user_id, friend_id)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_friendships_user
        ON friendships (user_id, favorite DESC, created_at DESC);
    `);
    console.log("✅  friendships");

    // ── blocked_users ────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS blocked_users (
        id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        blocker_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        blocked_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        created_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT blocked_users_no_self CHECK (blocker_id <> blocked_id),
        CONSTRAINT blocked_users_uniq UNIQUE (blocker_id, blocked_id)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker
        ON blocked_users (blocker_id, created_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked
        ON blocked_users (blocked_id);
    `);
    console.log("✅  blocked_users");

    // ── RLS ──────────────────────────────────────────────────────────────────
    // All writes go through the service-role admin client in server actions, so
    // these SELECT policies just let a user read their OWN relationship rows
    // directly if ever queried client-side. Service role bypasses RLS.
    for (const t of ["friend_requests", "friendships", "blocked_users"]) {
      await client.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`);
    }
    await ensurePolicy(client, "friend_requests", "fr_select_own",
      `CREATE POLICY fr_select_own ON friend_requests FOR SELECT
         USING (from_user_id = auth.uid() OR to_user_id = auth.uid());`);
    await ensurePolicy(client, "friendships", "fs_select_own",
      `CREATE POLICY fs_select_own ON friendships FOR SELECT
         USING (user_id = auth.uid() OR friend_id = auth.uid());`);
    await ensurePolicy(client, "blocked_users", "bu_select_own",
      `CREATE POLICY bu_select_own ON blocked_users FOR SELECT
         USING (blocker_id = auth.uid());`);
    console.log("✅  RLS + SELECT-Policies");

    console.log("\n🎉  Friends-System Migration abgeschlossen.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
