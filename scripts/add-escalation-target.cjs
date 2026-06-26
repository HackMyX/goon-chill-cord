const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL missing in .env.local"); process.exit(1); }

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected.");

  await client.query(`
    ALTER TABLE tickets
      ADD COLUMN IF NOT EXISTS escalated_to_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
  `);
  console.log("  Added: tickets.escalated_to_user_id");

  await client.end();
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
