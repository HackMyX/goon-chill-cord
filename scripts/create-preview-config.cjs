// Creates the preview_config singleton table for the Universal Preview Engine.
// Usage: node scripts/create-preview-config.cjs

const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS preview_config (
        id                      TEXT PRIMARY KEY DEFAULT 'default',
        item3d_auto_rotate       BOOLEAN NOT NULL DEFAULT TRUE,
        item3d_rotation_speed    NUMERIC(4,2) NOT NULL DEFAULT 1.8,
        item3d_camera_fov        NUMERIC(5,2) NOT NULL DEFAULT 42,
        item3d_camera_distance   NUMERIC(4,2) NOT NULL DEFAULT 3.6,
        name_style_size          TEXT NOT NULL DEFAULT 'xl',
        name_style_glow_pulse    BOOLEAN NOT NULL DEFAULT TRUE,
        badge_glow_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
        badge_glow_intensity     INTEGER NOT NULL DEFAULT 60,
        particle_effects_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        preview_bg_style         TEXT NOT NULL DEFAULT 'dark',
        updated_at               TIMESTAMPTZ
      );
    `);
    console.log("preview_config table created (or already existed).");

    // Enable RLS
    await client.query(`ALTER TABLE preview_config ENABLE ROW LEVEL SECURITY;`);

    // Admin full access
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'preview_config' AND policyname = 'admins_all'
        ) THEN
          CREATE POLICY admins_all ON preview_config
            FOR ALL
            USING (
              EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = auth.uid()
                  AND profiles.role = 'admin'
              )
            );
        END IF;
      END $$;
    `);

    // Public read
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'preview_config' AND policyname = 'public_read'
        ) THEN
          CREATE POLICY public_read ON preview_config
            FOR SELECT
            USING (TRUE);
        END IF;
      END $$;
    `);

    console.log("RLS policies applied.");

    // Seed default row if missing
    await client.query(`
      INSERT INTO preview_config (id) VALUES ('default')
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log("Default row seeded.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
