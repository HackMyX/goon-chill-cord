/**
 * Migration: case_groups table + case_tiers new columns
 *
 * Run once:  node scripts/add-case-groups.cjs
 *
 * What this does:
 *  1. Creates case_groups table so admins can create unlimited cases from the UI
 *  2. Adds sort_order, per_rarity_item_ids, name_styles_eligible, tier_sublabel
 *     to case_tiers so per-rarity item lists and name-style drops work
 *  3. Seeds the two hardcoded groups (cosmetics + weapons) into DB
 *  4. Sets sort_order on existing tier rows
 */

const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    // ── 1. case_groups table ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS case_groups (
        id           TEXT        PRIMARY KEY,
        title        TEXT        NOT NULL,
        subtitle     TEXT,
        icon_name    TEXT        NOT NULL DEFAULT 'package',
        item_types   TEXT[]      NOT NULL DEFAULT '{}',
        display_order INTEGER    NOT NULL DEFAULT 0,
        enabled      BOOLEAN     NOT NULL DEFAULT true,
        accent_color TEXT,
        is_custom    BOOLEAN     NOT NULL DEFAULT false,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`ALTER TABLE case_groups ENABLE ROW LEVEL SECURITY;`);

    // Allow all users to read case groups (public catalogue info)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename='case_groups' AND policyname='case_groups_select_all'
        ) THEN
          CREATE POLICY case_groups_select_all ON case_groups FOR SELECT USING (true);
        END IF;
      END $$;
    `);

    console.log("✅ case_groups table created");

    // ── 2. New columns for case_tiers ────────────────────────────────────────
    await client.query(`ALTER TABLE case_tiers ADD COLUMN IF NOT EXISTS sort_order           INTEGER  DEFAULT 0;`);
    await client.query(`ALTER TABLE case_tiers ADD COLUMN IF NOT EXISTS per_rarity_item_ids  JSONB;`);
    await client.query(`ALTER TABLE case_tiers ADD COLUMN IF NOT EXISTS name_styles_eligible BOOLEAN  DEFAULT false;`);
    await client.query(`ALTER TABLE case_tiers ADD COLUMN IF NOT EXISTS tier_sublabel        TEXT;`);

    console.log("✅ case_tiers new columns added");

    // ── 3. Seed initial groups ────────────────────────────────────────────────
    await client.query(`
      INSERT INTO case_groups (id, title, subtitle, icon_name, item_types, display_order, enabled, is_custom)
      VALUES
        (
          'cosmetics',
          'Case Opening',
          NULL,
          'package',
          ARRAY['hat','jacket','pants','shoes','trail','shield_cosmetic','aura','face','hair','pet','ring','amulet'],
          0,
          true,
          false
        ),
        (
          'weapons',
          'Waffen Case',
          'Gewinne Waffen für den 3D-World-Kampf — ab 30.000 CR',
          'swords',
          ARRAY['weapon_cosmetic'],
          1,
          true,
          false
        )
      ON CONFLICT (id) DO NOTHING;
    `);

    console.log("✅ case_groups seeded");

    // ── 4. Set sort_order on existing tiers ──────────────────────────────────
    await client.query(`UPDATE case_tiers SET sort_order = 0 WHERE id LIKE '%-standard' AND sort_order IS NULL;`);
    await client.query(`UPDATE case_tiers SET sort_order = 1 WHERE id LIKE '%-premium' AND sort_order IS NULL;`);
    // Also fix nulls without the pattern
    await client.query(`UPDATE case_tiers SET sort_order = 0 WHERE sort_order IS NULL;`);

    console.log("✅ sort_order set on existing tiers");

    console.log("\n🎉 Migration complete! Admins can now create new cases in Admin → Economy & Cases.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
});
