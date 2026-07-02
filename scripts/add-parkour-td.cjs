// scripts/add-parkour-td.cjs — T/D-System: death_penalty_ms in parkour_config
// (globale Todes-Strafe für den kombinierten T/D-Score). Idempotent.
try { require("dotenv").config({ path: ".env.local" }); } catch {}
const { Client } = require("pg");
const DB_URL = process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";
(async () => {
  const c = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query(`ALTER TABLE parkour_config ADD COLUMN IF NOT EXISTS death_penalty_ms integer NOT NULL DEFAULT 2500;`);
    console.log("✅  parkour_config.death_penalty_ms");
  } finally { await c.end(); }
})().catch((e) => { console.error("❌", e); process.exit(1); });
