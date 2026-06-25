const { Pool } = require("pg");
// Run: DATABASE_URL="..." node scripts/add-bp-elite.cjs
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "",
  ssl: { rejectUnauthorized: false },
});

const migrations = [
  // Elite track on the pass itself
  `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS elite_price_cr integer NOT NULL DEFAULT 0`,
  `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS elite_enabled boolean NOT NULL DEFAULT false`,
  // Elite flag on individual tiers
  `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS is_elite boolean NOT NULL DEFAULT false`,
  // Elite ownership on user records
  `ALTER TABLE user_battle_passes ADD COLUMN IF NOT EXISTS has_elite boolean NOT NULL DEFAULT false`,
  `ALTER TABLE user_battle_passes ADD COLUMN IF NOT EXISTS elite_purchased_at timestamptz`,
];

async function run() {
  const client = await pool.connect();
  try {
    for (const sql of migrations) {
      await client.query(sql);
      console.log("OK:", sql.slice(0, 80));
    }
    console.log("\nBattle Pass Elite-Migrationen erfolgreich.");
  } catch (e) {
    console.error("Fehler:", e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
