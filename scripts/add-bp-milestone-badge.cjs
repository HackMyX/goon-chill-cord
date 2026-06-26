// Run: node scripts/add-bp-milestone-badge.cjs
//
// WHY: The Battle Pass auto-fill (adminAutoFillBpTiers) assigns
// reward_badge_key = "bp_milestone" to milestone badge tiers, but that
// badge_definitions row was never seeded. Since user_badges.badge_key has a
// FK to badge_definitions.key, claiming such a tier could never grant the badge.
// Also backfills any existing badge tier that has a NULL reward_badge_key.
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // 1. Seed the missing badge definition (idempotent).
    const ins = await client.query(
      `INSERT INTO badge_definitions (key, label, color, icon, description)
       VALUES ('bp_milestone', 'Meilenstein', '#f59e0b', '⭐', 'Battle-Pass-Meilenstein erreicht')
       ON CONFLICT (key) DO NOTHING`
    );
    console.log(`OK   badge_definitions 'bp_milestone' ${ins.rowCount > 0 ? 'angelegt' : 'existierte bereits'}`);

    // 2. Backfill badge tiers that reference no badge → point them at bp_milestone.
    const upd = await client.query(
      `UPDATE battle_pass_tiers
         SET reward_badge_key = 'bp_milestone'
       WHERE reward_type = 'badge' AND reward_badge_key IS NULL`
    );
    console.log(`OK   ${upd.rowCount} Badge-Tier(s) ohne Key auf 'bp_milestone' gesetzt`);

    // 3. Report any badge tiers still referencing a non-existent badge.
    const orphan = await client.query(
      `SELECT t.tier_number, t.reward_badge_key
         FROM battle_pass_tiers t
         LEFT JOIN badge_definitions b ON b.key = t.reward_badge_key
        WHERE t.reward_type = 'badge' AND (t.reward_badge_key IS NULL OR b.key IS NULL)`
    );
    if (orphan.rowCount === 0) {
      console.log('OK   alle Badge-Tiers referenzieren jetzt ein gültiges Badge');
    } else {
      console.log(`WARN ${orphan.rowCount} Badge-Tier(s) zeigen weiter auf ein unbekanntes Badge:`);
      for (const r of orphan.rows) console.log(`     Tier ${r.tier_number}: ${r.reward_badge_key ?? 'NULL'}`);
    }
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
