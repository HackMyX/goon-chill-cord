const { Pool } = require("pg");
// Run: DATABASE_URL="postgresql://..." node scripts/create-optional-tables.cjs
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "",
  ssl: { rejectUnauthorized: false }
});

const migrations = [
  // auction_bids: tracks individual bids placed on auction listings
  `CREATE TABLE IF NOT EXISTS auction_bids (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auction_id uuid NOT NULL,
    bidder_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
    amount integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE auction_bids ENABLE ROW LEVEL SECURITY`,
  `CREATE INDEX IF NOT EXISTS idx_auction_bids_auction ON auction_bids(auction_id)`,
  `CREATE INDEX IF NOT EXISTS idx_auction_bids_bidder ON auction_bids(bidder_id)`,

  // trade_items: tracks individual items in multi-item trade offers
  `CREATE TABLE IF NOT EXISTS trade_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id uuid NOT NULL,
    inventory_id uuid REFERENCES user_inventory(id) ON DELETE SET NULL,
    side text NOT NULL DEFAULT 'from' CHECK (side IN ('from', 'to')),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE trade_items ENABLE ROW LEVEL SECURITY`,
  `CREATE INDEX IF NOT EXISTS idx_trade_items_trade ON trade_items(trade_id)`,
];

async function run() {
  const client = await pool.connect();
  try {
    for (const sql of migrations) {
      await client.query(sql);
      const preview = sql.replace(/\s+/g, " ").slice(0, 72);
      console.log("OK:", preview);
    }
    console.log("\nAlle Migrationen erfolgreich.");
  } catch (e) {
    console.error("Fehler:", e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
