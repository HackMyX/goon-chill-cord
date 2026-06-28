// scripts/remove-bp-elite.cjs
// The Battle-Pass "Elite" track has been removed from the app (only FREE + PREMIUM
// remain). The is_elite / has_elite / elite_enabled columns stay in the schema but
// are now dormant. This migration reconciles EXISTING data so nothing breaks:
//   • Former Elite tiers (is_elite=true) → become PREMIUM, so they stay paid-gated
//     instead of silently turning into FREE (which would hand out their ultra
//     rewards for free — an economy leak).
//   • Former Elite buyers (has_elite=true) → keep PREMIUM access.
//   • No pass advertises Elite anymore (elite_enabled=false).
// Idempotent: re-running it is a no-op once the rows are converted.

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    const tiers = await client.query(
      "UPDATE battle_pass_tiers SET is_premium = true, is_elite = false WHERE is_elite = true"
    );
    const buyers = await client.query(
      "UPDATE user_battle_passes SET has_premium = true, has_elite = false WHERE has_elite = true"
    );
    const passes = await client.query(
      "UPDATE battle_passes SET elite_enabled = false WHERE elite_enabled = true"
    );
    console.log(`✅ Elite reconciled — tiers→premium: ${tiers.rowCount}, buyers→premium: ${buyers.rowCount}, passes elite-off: ${passes.rowCount}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
