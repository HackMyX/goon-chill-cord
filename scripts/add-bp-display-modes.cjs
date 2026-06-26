// Migration: Battle Pass per-tier display mode + global layout switch
// Run: node scripts/add-bp-display-modes.cjs

const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  await client.connect();
  console.log("Connected. Running migration...");

  await client.query(`
    ALTER TABLE battle_pass_tiers
      ADD COLUMN IF NOT EXISTS display_mode text NOT NULL DEFAULT 'auto',
      ADD COLUMN IF NOT EXISTS show_tier_name boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS show_tier_description boolean NOT NULL DEFAULT true;
  `);
  console.log("✅ battle_pass_tiers: display_mode, show_tier_name, show_tier_description added");

  await client.end();
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
