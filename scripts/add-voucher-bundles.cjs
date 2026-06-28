// scripts/add-voucher-bundles.cjs
// Adds redemption_codes.rewards (jsonb array) so ONE voucher code can grant a
// whole BUNDLE of rewards — e.g. a 48h mining boost + a snake boost + an XP boost
// at once — instead of a single reward. The legacy reward_type / reward_value /
// ability_duration_hours columns are kept (the first bundle entry is mirrored into
// them) for backward compatibility. Existing single-reward codes are backfilled
// into the new array. Idempotent.

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(
      "ALTER TABLE redemption_codes ADD COLUMN IF NOT EXISTS rewards jsonb NOT NULL DEFAULT '[]'::jsonb"
    );
    console.log("✅ redemption_codes.rewards column ensured.");

    // Backfill: turn each legacy single-reward code into a one-entry bundle.
    const { rows } = await client.query(
      "SELECT code, reward_type, reward_value, ability_duration_hours FROM redemption_codes WHERE rewards = '[]'::jsonb OR rewards IS NULL"
    );
    let patched = 0;
    for (const r of rows) {
      const v = r.reward_value && typeof r.reward_value === "object" ? r.reward_value : {};
      const reward = { type: r.reward_type };
      if (r.reward_type === "credits") reward.amount = Number(v.amount) || 0;
      else if (r.reward_type === "ability") { reward.abilityKey = v.abilityKey; if (r.ability_duration_hours) reward.durationHours = Number(r.ability_duration_hours); }
      else if (r.reward_type === "badge") reward.badgeKey = v.badgeKey;
      else if (r.reward_type === "name_style") reward.styleKey = v.styleKey;
      await client.query("UPDATE redemption_codes SET rewards = $1 WHERE code = $2", [JSON.stringify([reward]), r.code]);
      patched++;
    }
    console.log(`✅ Backfilled ${patched} legacy code(s) into bundle form.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
