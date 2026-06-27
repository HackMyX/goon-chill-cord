// scripts/add-redemption-codes.cjs
// Redeemable voucher/gift-code system:
//   redemption_codes  — the codes an admin creates (credits / ability / badge / name_style reward)
//   redemption_claims — one row per (code,user) redemption; UNIQUE prevents double-claim
// Idempotent.

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    console.log("Creating redemption_codes…");
    await client.query(`
      CREATE TABLE IF NOT EXISTS redemption_codes (
        code text PRIMARY KEY,
        label text,
        reward_type text NOT NULL CHECK (reward_type IN ('credits','ability','badge','name_style')),
        reward_value jsonb NOT NULL DEFAULT '{}',
        ability_duration_hours integer NOT NULL DEFAULT 0,
        max_uses integer NOT NULL DEFAULT 0,
        expires_at timestamptz,
        enabled boolean NOT NULL DEFAULT true,
        created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    console.log("Creating redemption_claims…");
    await client.query(`
      CREATE TABLE IF NOT EXISTS redemption_claims (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code text NOT NULL REFERENCES redemption_codes(code) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        reward_summary text,
        claimed_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (code, user_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS redemption_claims_code_idx ON redemption_claims(code);`);
    await client.query(`CREATE INDEX IF NOT EXISTS redemption_claims_user_idx ON redemption_claims(user_id);`);

    console.log("Enabling RLS (service-role only — access via admin client)…");
    await client.query(`ALTER TABLE redemption_codes ENABLE ROW LEVEL SECURITY;`);
    await client.query(`ALTER TABLE redemption_claims ENABLE ROW LEVEL SECURITY;`);

    console.log("✅ redemption_codes + redemption_claims ready.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
