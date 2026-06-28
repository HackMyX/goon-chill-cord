// Ergänzt fehlende Feature-Topbar-Slots (friends/quests) in der gespeicherten
// site_config, behält die bestehende Reihenfolge bei. Idempotent.
// Bewusst OHNE level (Dup zu profile_avatar), rewards (Gutscheine -> Garderobe), surveys.
const { Client } = require("pg");
const DB_URL = process.env.DATABASE_URL || "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";
const WANT = ["games","shop","auctions","trading","community","quests","friends","wardrobe","notifications","profile_avatar"];
(async () => {
  const c = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query("SELECT topbar_right_slots FROM site_config WHERE id='default'");
  const cur = Array.isArray(r.rows[0] && r.rows[0].topbar_right_slots) ? r.rows[0].topbar_right_slots : [];
  const missing = WANT.filter((s) => !cur.includes(s));
  let next = [...cur];
  if (missing.length) {
    const idx = next.indexOf("profile_avatar");
    if (idx >= 0) next.splice(idx, 0, ...missing); else next.push(...missing);
    await c.query("UPDATE site_config SET topbar_right_slots=$1 WHERE id='default'", [next]);
  }
  console.log("ergänzt:", JSON.stringify(missing), "-> final:", JSON.stringify(next));
  await c.end();
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
