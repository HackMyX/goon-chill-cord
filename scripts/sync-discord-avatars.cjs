const { Pool } = require("pg");
// Run: DATABASE_URL="postgresql://postgres.PROJECT:PASSWORD@host:6543/postgres" node scripts/sync-discord-avatars.cjs

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "",
  ssl: { rejectUnauthorized: false },
});

async function run() {
  // Reads avatar_url / picture from auth.users.raw_user_meta_data (Discord OAuth metadata)
  // and writes it into profiles.avatar_url for rows that don't have one yet.
  // The postgres superuser connection can access the auth schema directly.
  const { rowCount } = await pool.query(`
    UPDATE profiles p
    SET avatar_url = COALESCE(
      u.raw_user_meta_data->>'avatar_url',
      u.raw_user_meta_data->>'picture'
    )
    FROM auth.users u
    WHERE p.id = u.id
      AND p.avatar_url IS NULL
      AND (
        u.raw_user_meta_data->>'avatar_url' IS NOT NULL
        OR u.raw_user_meta_data->>'picture' IS NOT NULL
      )
  `);
  console.log(`OK   Synced avatar_url for ${rowCount} existing profiles`);
  await pool.end();
}

run().catch((e) => { console.error("ERR", e.message); pool.end(); process.exit(1); });
