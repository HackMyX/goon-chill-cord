// scripts/add-homepage-chat-config.cjs
// Run: node scripts/add-homepage-chat-config.cjs
// Creates homepage_chat_config table for the glassmorphism global chat sidebar.

"use strict";

const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Verbunden mit der Datenbank.");

  try {
    await client.query("BEGIN");

    // Create the table
    await client.query(`
      CREATE TABLE IF NOT EXISTS homepage_chat_config (
        id                       text PRIMARY KEY DEFAULT 'default',
        enabled                  boolean NOT NULL DEFAULT true,
        default_open_desktop     boolean NOT NULL DEFAULT true,
        default_open_mobile      boolean NOT NULL DEFAULT false,
        sidebar_width            integer NOT NULL DEFAULT 320,
        sidebar_position         text NOT NULL DEFAULT 'left',
        bg_opacity               integer NOT NULL DEFAULT 20,
        blur_intensity           text NOT NULL DEFAULT 'md',
        show_avatars             boolean NOT NULL DEFAULT true,
        show_badges              boolean NOT NULL DEFAULT true,
        show_timestamps          boolean NOT NULL DEFAULT true,
        show_timestamps_relative boolean NOT NULL DEFAULT true,
        show_input               boolean NOT NULL DEFAULT true,
        max_messages             integer NOT NULL DEFAULT 50,
        max_badge_count          integer NOT NULL DEFAULT 3,
        font_size                text NOT NULL DEFAULT 'sm',
        message_animation        boolean NOT NULL DEFAULT true,
        input_placeholder        text NOT NULL DEFAULT 'Nachricht...',
        tab_title                text NOT NULL DEFAULT 'Community Chat',
        header_visible           boolean NOT NULL DEFAULT true,
        show_online_count        boolean NOT NULL DEFAULT true,
        compact_mode             boolean NOT NULL DEFAULT false,
        highlight_mentions       boolean NOT NULL DEFAULT true,
        mention_sound            boolean NOT NULL DEFAULT false,
        auto_scroll              boolean NOT NULL DEFAULT true,
        updated_at               timestamptz DEFAULT now()
      );
    `);
    console.log("Tabelle homepage_chat_config erstellt (oder bereits vorhanden).");

    // Enable RLS
    await client.query(`ALTER TABLE homepage_chat_config ENABLE ROW LEVEL SECURITY;`);
    console.log("RLS aktiviert.");

    // Drop policies if they already exist (idempotent)
    await client.query(`DROP POLICY IF EXISTS "admin_all" ON homepage_chat_config;`);
    await client.query(`DROP POLICY IF EXISTS "auth_select" ON homepage_chat_config;`);

    // Admin: all operations
    await client.query(`
      CREATE POLICY "admin_all" ON homepage_chat_config
        FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
          )
        );
    `);
    console.log("Admin-Policy erstellt.");

    // Authenticated users: SELECT only
    await client.query(`
      CREATE POLICY "auth_select" ON homepage_chat_config
        FOR SELECT
        USING (auth.role() = 'authenticated');
    `);
    console.log("Auth-Select-Policy erstellt.");

    // Insert default row
    await client.query(`
      INSERT INTO homepage_chat_config (id) VALUES ('default')
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log("Standard-Konfigurationszeile eingefügt (falls nicht vorhanden).");

    await client.query("COMMIT");
    console.log("Migration erfolgreich abgeschlossen.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration fehlgeschlagen:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
