// scripts/add-reward-vouchers.cjs
// V-REWARDS Phase 1 — Case-Gutscheine + Spiel-Bonus-Gutscheine.
//  - case_tokens: Gratis-Case-Öffnung (konkreter Tier ODER nach Seltenheitsstufe,
//    schließt neue Cases automatisch ein), mit optionaler Ablaufzeit.
//  - game_bonus_allowances: konsumierbarer Pool an EXTRA-Spielzügen über das
//    Stunden-/Tageslimit hinaus (Plinko/Snake/DON), zeitlich begrenzbar.
//  - consume_game_bonus RPC: atomar EINEN Bonus-Zug abbuchen (FOR UPDATE SKIP LOCKED).
// RLS aktiv, idempotent. Run: node scripts/add-reward-vouchers.cjs

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function ensurePolicy(client, table, name, sql) {
  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = '${table}' AND policyname = '${name}') THEN
        ${sql}
      END IF;
    END $$;
  `);
}

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    // ── case_tokens ────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS case_tokens (
        id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        mode         text        NOT NULL DEFAULT 'tier',   -- 'tier' = konkreter Case | 'rarity' = beliebiger Case, garantierte Mindest-Seltenheit
        tier_id      text,                                  -- nur mode='tier'
        rarity_floor text,                                  -- nur mode='rarity' (normal|selten|mythisch|ultra)
        label        text,
        source       text        NOT NULL DEFAULT 'voucher',
        expires_at   timestamptz,
        redeemed_at  timestamptz,
        won_summary  text,
        created_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT case_tokens_mode_chk CHECK (mode IN ('tier','rarity'))
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_case_tokens_user_active
        ON case_tokens (user_id, redeemed_at, expires_at);
    `);
    console.log("✅  case_tokens");

    // ── game_bonus_allowances ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS game_bonus_allowances (
        id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        game        text        NOT NULL,                  -- 'plinko' | 'snake' | 'don'
        amount      integer     NOT NULL CHECK (amount > 0),
        used        integer     NOT NULL DEFAULT 0 CHECK (used >= 0),
        label       text,
        source      text        NOT NULL DEFAULT 'voucher',
        expires_at  timestamptz,
        created_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT gba_used_le_amount CHECK (used <= amount)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gba_user_game_active
        ON game_bonus_allowances (user_id, game, expires_at);
    `);
    console.log("✅  game_bonus_allowances");

    // ── consume_game_bonus RPC (atomar EINEN Zug abbuchen) ────────────────────────
    await client.query(`
      CREATE OR REPLACE FUNCTION public.consume_game_bonus(p_user_id uuid, p_game text)
      RETURNS boolean
      LANGUAGE plpgsql
      AS $$
      DECLARE v_id uuid;
      BEGIN
        SELECT id INTO v_id FROM game_bonus_allowances
          WHERE user_id = p_user_id AND game = p_game AND used < amount
            AND (expires_at IS NULL OR expires_at > now())
          ORDER BY (expires_at IS NULL), expires_at ASC, created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED;
        IF v_id IS NULL THEN RETURN false; END IF;
        UPDATE game_bonus_allowances SET used = used + 1 WHERE id = v_id;
        RETURN true;
      END;
      $$;
    `);
    console.log("✅  consume_game_bonus RPC");

    // ── RLS ──────────────────────────────────────────────────────────────────────
    for (const t of ["case_tokens", "game_bonus_allowances"]) {
      await client.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`);
    }
    await ensurePolicy(client, "case_tokens", "ct_select_own",
      `CREATE POLICY ct_select_own ON case_tokens FOR SELECT USING (user_id = auth.uid());`);
    await ensurePolicy(client, "game_bonus_allowances", "gba_select_own",
      `CREATE POLICY gba_select_own ON game_bonus_allowances FOR SELECT USING (user_id = auth.uid());`);
    console.log("✅  RLS + SELECT-Policies");

    console.log("\n🎉  Reward-Vouchers Migration abgeschlossen.");
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error("❌ Migration failed:", e.message); process.exit(1); });
