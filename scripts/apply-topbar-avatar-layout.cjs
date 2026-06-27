// scripts/apply-topbar-avatar-layout.cjs
// One-off: migrate the SAVED site_config.topbar_right_slots to the new layout —
// swap the classic "profile" icon slot for "profile_avatar" (avatar + level under it)
// and drop "logout" from the top bar (logout now lives at the bottom of /account).
// Every other slot the admin had is preserved, in order. Idempotent.

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

const DEFAULT_SLOTS = ["games", "shop", "auctions", "trading", "community", "wardrobe", "notifications", "profile", "logout"];

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      "SELECT topbar_right_slots, pg_typeof(topbar_right_slots)::text AS coltype FROM site_config WHERE id = 'default'"
    );
    if (!rows.length) {
      console.log("ℹ️ Keine site_config-Zeile vorhanden — der neue Default (mit profile_avatar) greift automatisch.");
      return;
    }
    const colType = rows[0].coltype;
    let current = rows[0].topbar_right_slots;
    if (typeof current === "string") {
      try { current = JSON.parse(current); } catch { current = null; }
    }
    if (!Array.isArray(current) || current.length === 0) current = [...DEFAULT_SLOTS];

    // Transform: profile → profile_avatar (in place), drop logout, keep the rest.
    const next = [];
    let placedAvatar = false;
    for (const slot of current) {
      if (slot === "logout") continue;
      if (slot === "profile" || slot === "profile_avatar") {
        if (!placedAvatar) { next.push("profile_avatar"); placedAvatar = true; }
        continue;
      }
      next.push(slot);
    }
    if (!placedAvatar) next.push("profile_avatar");

    if (JSON.stringify(next) === JSON.stringify(current)) {
      console.log("✅ Bereits aktuell — keine Änderung nötig:", JSON.stringify(next));
      return;
    }

    // text[] vs jsonb column — write the matching representation.
    if (colType.includes("jsonb") || colType.includes("json")) {
      await client.query(
        "UPDATE site_config SET topbar_right_slots = $1::jsonb, updated_at = now() WHERE id = 'default'",
        [JSON.stringify(next)]
      );
    } else {
      await client.query(
        "UPDATE site_config SET topbar_right_slots = $1, updated_at = now() WHERE id = 'default'",
        [next]
      );
    }
    console.log("✅ topbar_right_slots aktualisiert (" + colType + "):");
    console.log("   vorher:", JSON.stringify(current));
    console.log("   nachher:", JSON.stringify(next));
    console.log("ℹ️ Clients sehen das neue Layout beim nächsten Reload (oder nach einem Speichern im Branding-Editor → Live-Broadcast).");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Update failed:", err);
  process.exit(1);
});
