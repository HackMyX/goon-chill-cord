const { Pool } = require("pg");
// Run: DATABASE_URL="..." node scripts/seed-cleanup-config.cjs
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "",
  ssl: { rejectUnauthorized: false },
});

const ROWS = [
  { key: "debug_logs",           days: 7   },
  { key: "global_chat_messages", days: 30  },
  { key: "mod_actions",          days: 90  },
  { key: "login_events",         days: 30  },
  { key: "notifications",        days: 60  },
  { key: "audit_logs",           days: 365 },
  { key: "tickets_closed",       days: 180 },
  { key: "trade_offers_done",    days: 30  },
  { key: "auctions_done",        days: 30  },
];

async function run() {
  const client = await pool.connect();
  try {
    for (const r of ROWS) {
      await client.query(
        `INSERT INTO cleanup_config (source_key, enabled, retention_days, updated_at)
         VALUES ($1, false, $2, now())
         ON CONFLICT (source_key) DO NOTHING`,
        [r.key, r.days]
      );
      console.log("OK:", r.key);
    }
    console.log("\ncleanup_config vollständig geseedet.");
  } catch (e) {
    console.error("Fehler:", e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
