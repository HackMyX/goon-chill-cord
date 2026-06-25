const { Pool } = require("pg");
// Run: DATABASE_URL="postgresql://..." node scripts/run-bp-v2-migration.cjs

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "",
  ssl: { rejectUnauthorized: false },
});

const migrations = [
  // New columns on battle_passes
  `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'default'`,
  `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS accent_color text NOT NULL DEFAULT '#7c3aed'`,
  `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS banner_image_url text`,
  `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS show_in_shop boolean NOT NULL DEFAULT true`,
  `ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS show_on_dashboard boolean NOT NULL DEFAULT true`,

  // New columns on battle_pass_tiers
  `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS reward_badge_text text`,
  `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS reward_item_rarity text`,
  `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS reward_xp_boost integer`,
  `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS reward_quantity integer NOT NULL DEFAULT 1`,
  `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS highlight_tier boolean NOT NULL DEFAULT false`,
  `ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS description text`,
];

async function run() {
  for (const sql of migrations) {
    try {
      await pool.query(sql);
      console.log("OK   " + sql.trim().slice(0, 80));
    } catch (e) {
      console.log("ERR  " + sql.trim().slice(0, 80) + " :: " + e.message.split("\n")[0]);
    }
  }
  await pool.end();
}
run();
