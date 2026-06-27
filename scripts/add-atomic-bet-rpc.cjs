// scripts/add-atomic-bet-rpc.cjs
// Adds public.apply_bet_result(p_user_id, p_bet, p_payout) — an ATOMIC, race-safe
// credit mutation for wager games (Plinko, Double-or-Nothing, …).
//
// Why: the games previously did read-modify-write on profiles.credits
//   (read credits → compute newCredits = credits + (payout - bet) → write absolute).
// Under concurrency (N parallel balls/flips) every call reads the same balance and
// the LAST absolute write wins — letting a player re-roll for free / duplicate credits.
// A single relative UPDATE under the row lock fixes this; the WHERE credits >= p_bet
// guard also enforces affordability atomically.
//
// Returns the NEW credit balance, or NULL when the user can't afford the bet
// (no row matched the guard). Idempotent (CREATE OR REPLACE).

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    console.log("Creating apply_bet_result(uuid, bigint, bigint)…");
    await client.query(`
      CREATE OR REPLACE FUNCTION public.apply_bet_result(
        p_user_id uuid,
        p_bet bigint,
        p_payout bigint
      ) RETURNS bigint
      LANGUAGE plpgsql
      AS $$
      DECLARE
        new_credits bigint;
      BEGIN
        IF p_bet < 0 OR p_payout < 0 THEN
          RAISE EXCEPTION 'apply_bet_result: bet/payout must be non-negative';
        END IF;
        UPDATE profiles
          SET credits = credits + (p_payout - p_bet)
          WHERE id = p_user_id AND credits >= p_bet
          RETURNING credits INTO new_credits;
        RETURN new_credits; -- NULL when the affordability guard did not match
      END;
      $$;
    `);
    await client.query(`GRANT EXECUTE ON FUNCTION public.apply_bet_result(uuid, bigint, bigint) TO service_role, authenticated;`);

    // Smoke test: function exists and returns NULL for an impossible bet.
    const r = await client.query(
      `SELECT public.apply_bet_result('00000000-0000-0000-0000-000000000000'::uuid, 1, 1) AS res;`
    );
    console.log("✅ apply_bet_result created. Smoke (non-existent user → NULL):", r.rows[0].res);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
