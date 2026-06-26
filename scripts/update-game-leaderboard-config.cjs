// Run: node scripts/update-game-leaderboard-config.cjs
// Adds plinko, world, cases, xp to game_leaderboard_config without overwriting
// any admin-customized values (ON CONFLICT DO UPDATE merges safely).
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const NEW_DEFAULTS = [
  { id: "snake_x1",    label: "Snake Classic ×1", enabled: true,  limit: 10, sort: 0 },
  { id: "snake_x2",    label: "Snake Turbo ×2",   enabled: true,  limit: 10, sort: 1 },
  { id: "snake_grind", label: "Snake Grind",       enabled: false, limit: 10, sort: 2 },
  { id: "snake_farm",  label: "Snake Endless",     enabled: false, limit: 10, sort: 3 },
  { id: "mine",        label: "Mine",              enabled: true,  limit: 10, sort: 4 },
  { id: "plinko",      label: "Plinko",            enabled: true,  limit: 10, sort: 5 },
  { id: "world",       label: "Farmwelt",          enabled: true,  limit: 10, sort: 6 },
  { id: "cases",       label: "Cases",             enabled: false, limit: 10, sort: 7 },
  { id: "xp",          label: "Level & XP",        enabled: false, limit: 10, sort: 8 },
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // Check if game_leaderboard_config table exists
    const { rows } = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'game_leaderboard_config'
      ) AS "exists"
    `);
    if (!rows[0].exists) {
      console.log('WARN game_leaderboard_config table does not exist — run add-game-leaderboard-config.cjs first');
      return;
    }

    // Fetch current config
    const { rows: currentRows } = await client.query(`SELECT items FROM game_leaderboard_config WHERE id = 'default'`);
    let current = currentRows.length > 0 ? (currentRows[0].items || []) : [];

    // Merge: keep existing entries, add missing new ones
    const existingIds = new Set(current.map(r => r.id));
    const newEntries = NEW_DEFAULTS.filter(d => !existingIds.has(d.id));

    if (newEntries.length === 0) {
      console.log('OK   No new leaderboard entries to add — already up to date');
      return;
    }

    const merged = [...current, ...newEntries];

    await client.query(`
      INSERT INTO game_leaderboard_config (id, items, updated_at)
      VALUES ('default', $1::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET items = $1::jsonb, updated_at = now()
    `, [JSON.stringify(merged)]);

    console.log(`OK   Added ${newEntries.length} new leaderboard entries: ${newEntries.map(e => e.id).join(', ')}`);
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
