// Run: node scripts/add-game-leaderboard-config.cjs
// Creates the game_leaderboard_config singleton table that controls which
// game leaderboards appear on the homepage, in what order, and with what limit.
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const DEFAULT_ITEMS = [
  { id: "snake_x1",    label: "Snake Classic ×1", enabled: true,  limit: 10, sort: 0 },
  { id: "snake_x2",    label: "Snake Turbo ×2",   enabled: true,  limit: 10, sort: 1 },
  { id: "snake_grind", label: "Snake Grind",       enabled: false, limit: 10, sort: 2 },
  { id: "snake_farm",  label: "Snake Endless",     enabled: false, limit: 10, sort: 3 },
  { id: "mine",        label: "Mine",              enabled: true,  limit: 10, sort: 4 },
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS game_leaderboard_config (
        id         TEXT        PRIMARY KEY DEFAULT 'default',
        items      JSONB       NOT NULL    DEFAULT '[]',
        updated_at TIMESTAMPTZ NOT NULL    DEFAULT now()
      )
    `);
    console.log('OK   Created game_leaderboard_config');

    await client.query(`ALTER TABLE game_leaderboard_config ENABLE ROW LEVEL SECURITY`);
    console.log('OK   RLS enabled');

    const { rowCount } = await client.query(`
      INSERT INTO game_leaderboard_config (id, items)
      VALUES ('default', $1::jsonb)
      ON CONFLICT (id) DO NOTHING
    `, [JSON.stringify(DEFAULT_ITEMS)]);
    console.log(`OK   Default row ${rowCount > 0 ? 'inserted' : 'already exists'}`);

  } finally {
    await client.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
