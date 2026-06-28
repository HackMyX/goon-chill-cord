// scripts/add-voucher-pro.cjs
// "Voucher Pro" — turns the simple code system into a full distribution platform:
//   • target_user_ids  jsonb   — null = public code; array = only these users may redeem
//   • starts_at        timestamptz — null = active now; else the code is "scheduled"
//   • per_user_limit   integer  — how many times ONE user may redeem the same code (default 1)
// To support per_user_limit > 1 we must allow multiple claims per (code,user), so the
// old UNIQUE(code,user_id) constraint is dropped and replaced by a plain index — the
// per-user / total caps are enforced race-safely in code (earliest-N reservation).
// Idempotent.

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query("ALTER TABLE redemption_codes ADD COLUMN IF NOT EXISTS target_user_ids jsonb");
    await client.query("ALTER TABLE redemption_codes ADD COLUMN IF NOT EXISTS starts_at timestamptz");
    await client.query("ALTER TABLE redemption_codes ADD COLUMN IF NOT EXISTS per_user_limit integer NOT NULL DEFAULT 1");
    console.log("✅ redemption_codes: target_user_ids, starts_at, per_user_limit ensured.");

    // Drop ANY unique constraint on redemption_claims (was UNIQUE(code,user_id)).
    await client.query(`
      DO $$
      DECLARE c text;
      BEGIN
        SELECT conname INTO c FROM pg_constraint
        WHERE conrelid = 'redemption_claims'::regclass AND contype = 'u' LIMIT 1;
        IF c IS NOT NULL THEN EXECUTE 'ALTER TABLE redemption_claims DROP CONSTRAINT ' || quote_ident(c); END IF;
      END $$;
    `);
    await client.query("CREATE INDEX IF NOT EXISTS idx_rc_claims_code_user ON redemption_claims(code, user_id)");
    console.log("✅ redemption_claims: per-user unique dropped, (code,user_id) index ensured.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
