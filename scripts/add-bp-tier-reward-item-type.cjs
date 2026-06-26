// scripts/add-bp-tier-reward-item-type.cjs
// Adds reward_item_type text column to battle_pass_tiers table

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    console.log("Adding reward_item_type column to battle_pass_tiers...");
    await client.query(`
      ALTER TABLE battle_pass_tiers
      ADD COLUMN IF NOT EXISTS reward_item_type text;
    `);
    console.log("✅ reward_item_type column added.");

    // Back-fill existing rows: join items table to pull type for rows that have reward_item_id
    const result = await client.query(`
      UPDATE battle_pass_tiers t
      SET reward_item_type = i.type
      FROM items i
      WHERE t.reward_item_id::uuid = i.id
        AND t.reward_item_type IS NULL
        AND t.reward_item_id IS NOT NULL;
    `);
    console.log(`✅ Back-filled ${result.rowCount} existing tier rows from items table.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
