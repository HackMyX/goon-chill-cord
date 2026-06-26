// Fine-Config table — all fine-grained hardcoded values made configurable.
// Run once: node scripts/add-fine-config.cjs

const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS fine_config (
        id                           text PRIMARY KEY DEFAULT 'default',
        -- 3D-Welt: Nametag
        nametag_distance_factor      numeric(5,2)  NOT NULL DEFAULT 7.50,
        nametag_height_offset        numeric(5,2)  NOT NULL DEFAULT 2.52,
        -- 3D-Welt: Multiplayer Sync (effective after page reload)
        mp_position_lerp_rate        numeric(5,1)  NOT NULL DEFAULT 20.0,
        mp_heading_turn_rate         numeric(5,1)  NOT NULL DEFAULT 16.0,
        mp_dead_reckoning_lookahead  numeric(6,3)  NOT NULL DEFAULT 0.150,
        mp_attack_swing_duration     numeric(6,3)  NOT NULL DEFAULT 0.380,
        -- Treffer-Effekte
        blood_burst_particle_count   int           NOT NULL DEFAULT 7,
        blood_burst_lifetime_ms      int           NOT NULL DEFAULT 500,
        slash_lifetime_ms            int           NOT NULL DEFAULT 230,
        -- Chat
        chat_max_history             int           NOT NULL DEFAULT 60,
        chat_max_message_length      int           NOT NULL DEFAULT 500,
        chat_poll_interval_ms        int           NOT NULL DEFAULT 8000,
        -- Community
        community_max_badges_shown   int           NOT NULL DEFAULT 3,
        updated_at                   timestamptz   NOT NULL DEFAULT now()
      );
    `);
    await client.query(`ALTER TABLE fine_config ENABLE ROW LEVEL SECURITY;`);
    await client.query(`
      INSERT INTO fine_config (id) VALUES ('default') ON CONFLICT DO NOTHING;
    `);
    console.log("fine_config created and seeded — all defaults match current hardcoded values.");
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
