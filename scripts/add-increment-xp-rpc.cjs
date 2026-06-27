// scripts/add-increment-xp-rpc.cjs
// Adds public.increment_xp(p_user_id, p_amount) — an ATOMIC xp increment so the
// many fire-and-forget `void awardXp(...)` calls across the app can't lose XP or
// double-grant level rewards under concurrency.
//
// Why: awardXp previously did read-modify-write (read xp/level → write absolute).
// Two parallel calls read the same xp and the last absolute write won → lost XP;
// and if both crossed the same level boundary they each granted that level's reward.
// A single relative UPDATE under the row lock serialises the increments, and the
// RETURNING value lets the caller derive its own contiguous [oldXp, newXp] window —
// so every level boundary is owned by exactly one increment (no double rewards).
//
// Returns the NEW xp total. Idempotent (CREATE OR REPLACE).

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    console.log("Creating increment_xp(uuid, bigint)…");
    await client.query(`
      CREATE OR REPLACE FUNCTION public.increment_xp(
        p_user_id uuid,
        p_amount bigint
      ) RETURNS bigint
      LANGUAGE plpgsql
      AS $$
      DECLARE
        new_xp bigint;
      BEGIN
        UPDATE profiles
          SET xp = COALESCE(xp, 0) + GREATEST(0, p_amount)
          WHERE id = p_user_id
          RETURNING xp INTO new_xp;
        RETURN new_xp; -- NULL if the user row does not exist
      END;
      $$;
    `);
    await client.query(`GRANT EXECUTE ON FUNCTION public.increment_xp(uuid, bigint) TO service_role, authenticated;`);

    const r = await client.query(
      `SELECT public.increment_xp('00000000-0000-0000-0000-000000000000'::uuid, 0) AS res;`
    );
    console.log("✅ increment_xp created. Smoke (non-existent user → NULL):", r.rows[0].res);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
