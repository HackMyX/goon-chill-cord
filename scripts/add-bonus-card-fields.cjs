// Präsentations-Felder für aktive Bonus-Karten (Theme/Seltenheit/Titel pro Bonus).
const { Client } = require("pg");
const DB_URL = process.env.DATABASE_URL || "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";
(async () => {
  const c = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query(`ALTER TABLE game_bonus_allowances
      ADD COLUMN IF NOT EXISTS card_theme text,
      ADD COLUMN IF NOT EXISTS card_rarity text,
      ADD COLUMN IF NOT EXISTS card_title text,
      ADD COLUMN IF NOT EXISTS card_subtitle text;`);
    console.log("✅ game_bonus_allowances: card_theme/card_rarity/card_title/card_subtitle");
  } finally { await c.end(); }
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
