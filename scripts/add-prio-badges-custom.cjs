// scripts/add-prio-badges-custom.cjs
// Adds profiles.prio_badges_custom (boolean) and backfills the effective
// prio_badges so the new auto-equip behaviour is correct for existing users:
//   - users who had already pinned badges  -> custom = true (kept as-is)
//   - everyone else                        -> custom = false + prio_badges
//     auto-filled with their top `max_prio_badges` owned badges by the same
//     prestige order as lib/badges.ts' BADGE_DISPLAY_PRIORITY.
// Idempotent: safe to run more than once.

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

// MUST stay in sync with BADGE_DISPLAY_PRIORITY in lib/badges.ts.
const PRIORITY = [
  "admin", "mod", "elite", "premium", "vip", "og",
  "ns_ultra", "ns_mythisch", "ns_collector",
  "season_vet", "grinder", "verified", "streaker", "helper",
];
const rank = (k) => {
  const i = PRIORITY.indexOf(k);
  return i === -1 ? PRIORITY.length : i;
};

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    console.log("Adding prio_badges_custom column to profiles...");
    await client.query(`
      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS prio_badges_custom boolean NOT NULL DEFAULT false;
    `);
    console.log("✅ prio_badges_custom column added.");

    console.log("Marking existing pinners as custom...");
    const marked = await client.query(`
      UPDATE profiles
      SET prio_badges_custom = true
      WHERE prio_badges IS NOT NULL AND array_length(prio_badges, 1) >= 1;
    `);
    console.log(`✅ ${marked.rowCount} profiles marked custom (had pinned badges).`);

    const cfg = await client.query(`SELECT max_prio_badges FROM site_config LIMIT 1;`);
    const rawMax = cfg.rows[0] ? cfg.rows[0].max_prio_badges : 2;
    const max = Math.min(4, Math.max(1, rawMax == null ? 2 : rawMax));
    console.log(`Backfilling auto prio_badges for non-custom users (max ${max})...`);

    const res = await client.query(`
      SELECT p.id,
             COALESCE(array_agg(ub.badge_key) FILTER (WHERE ub.badge_key IS NOT NULL), '{}') AS owned
      FROM profiles p
      LEFT JOIN user_badges ub ON ub.user_id = p.id
      WHERE p.prio_badges_custom = false
      GROUP BY p.id;
    `);

    let updated = 0;
    for (const row of res.rows) {
      const owned = Array.from(new Set(row.owned || []));
      const top = owned.sort((a, b) => rank(a) - rank(b)).slice(0, max);
      await client.query(`UPDATE profiles SET prio_badges = $1 WHERE id = $2;`, [top, row.id]);
      if (top.length > 0) updated++;
    }
    console.log(`✅ Backfill done — ${updated} non-custom users now auto-equip badges.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
