const { Client } = require("pg");
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL fehlt"); process.exit(1); }

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected.");

  await client.query(`
    CREATE TABLE IF NOT EXISTS pet_rarity_overrides (
      pet_type_id TEXT NOT NULL,
      rarity      TEXT NOT NULL,
      damage      INTEGER NOT NULL DEFAULT 4,
      aggro_radius FLOAT NOT NULL DEFAULT 5,
      attack_speed FLOAT NOT NULL DEFAULT 1.0,
      move_speed   FLOAT NOT NULL DEFAULT 3.4,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (pet_type_id, rarity)
    );
    ALTER TABLE pet_rarity_overrides ENABLE ROW LEVEL SECURITY;
  `);
  console.log("Table pet_rarity_overrides created/verified.");

  // Read-only for everyone (stats are public knowledge)
  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'pet_rarity_overrides' AND policyname = 'allow_read'
      ) THEN
        CREATE POLICY allow_read ON pet_rarity_overrides FOR SELECT USING (true);
      END IF;
    END $$;
  `);
  console.log("RLS policy set.");

  await client.end();
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
