// Fügt global_chat_config Broadcast-Steuerung hinzu (was/ab welcher Seltenheit
// Gewinne in den Chat broadcastet werden). Idempotent.
require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "", ssl: { rejectUnauthorized: false } });
(async () => {
  const c = await pool.connect();
  try {
    await c.query("ALTER TABLE global_chat_config ADD COLUMN IF NOT EXISTS broadcast_wins boolean NOT NULL DEFAULT true");
    await c.query("ALTER TABLE global_chat_config ADD COLUMN IF NOT EXISTS broadcast_min_rarity text NOT NULL DEFAULT 'mythisch'");
    console.log("✅ global_chat_config: broadcast_wins + broadcast_min_rarity vorhanden");
  } finally { c.release(); await pool.end(); }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
