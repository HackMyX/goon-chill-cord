// scripts/add-bp-visual-config.cjs
// Adds visual_config jsonb column to battle_passes table

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

const DEFAULT_VISUAL_CONFIG = JSON.stringify({
  tileScale: 1.0,
  showTileAnimations: true,
  showParticleField: true,
  milestoneGlowIntensity: 0.6,
  trackGlowIntensity: 0.5,
  rarityColorOverrides: {},
});

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    console.log("Adding visual_config column to battle_passes...");
    await client.query(`
      ALTER TABLE battle_passes
      ADD COLUMN IF NOT EXISTS visual_config jsonb NOT NULL DEFAULT '${DEFAULT_VISUAL_CONFIG}';
    `);
    console.log("✅ visual_config column added.");

    // Back-fill existing rows that have a null/missing value (DEFAULT takes care of new rows)
    await client.query(`
      UPDATE battle_passes
      SET visual_config = '${DEFAULT_VISUAL_CONFIG}'::jsonb
      WHERE visual_config IS NULL;
    `);
    console.log("✅ Existing rows back-filled.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
