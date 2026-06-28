// Neue Spalten für: User-Einstellungen (Freundschaftsanfragen), Chat-Stummschaltung,
// Mod-Rechte (Chat-Mute + Max-Dauer). Idempotent. Run: node scripts/add-settings-chatmod.cjs
const { Client } = require("pg");
const DB_URL = process.env.DATABASE_URL || "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";
(async () => {
  const c = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query(`ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS accept_friend_requests boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS chat_muted_until timestamptz;`);
    console.log("✅ profiles: accept_friend_requests + chat_muted_until");
    await c.query(`ALTER TABLE mod_permissions
      ADD COLUMN IF NOT EXISTS can_mute_chat boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS max_chat_mute_hours integer NOT NULL DEFAULT 24;`);
    console.log("✅ mod_permissions: can_mute_chat + max_chat_mute_hours");
    console.log("\n🎉 Migration abgeschlossen.");
  } finally { await c.end(); }
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
