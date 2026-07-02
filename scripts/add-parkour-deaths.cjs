// scripts/add-parkour-deaths.cjs — fügt die Spalte `deaths` zu parkour_best_times
// hinzu (Bestenliste nach Zeit UND Toden). Idempotent. Run: node scripts/add-parkour-deaths.cjs
try { require("dotenv").config({ path: ".env.local" }); } catch {}
const { Client } = require("pg");
const DB_URL = process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";
(async () => {
  const c = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query(`ALTER TABLE parkour_best_times ADD COLUMN IF NOT EXISTS deaths integer NOT NULL DEFAULT 0;`);
    console.log("✅  parkour_best_times.deaths");
  } finally { await c.end(); }
})().catch((e) => { console.error("❌", e); process.exit(1); });
