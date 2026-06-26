// Adds "paused" to the tickets.status CHECK constraint.
// Run once: node scripts/fix-ticket-status-constraint.cjs

const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      ALTER TABLE tickets
        DROP CONSTRAINT IF EXISTS tickets_status_check;
    `);
    await client.query(`
      ALTER TABLE tickets
        ADD CONSTRAINT tickets_status_check
        CHECK (status IN ('open', 'in_progress', 'paused', 'resolved', 'closed'));
    `);
    console.log("tickets_status_check updated — 'paused' is now a valid status.");
  } finally {
    await client.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
