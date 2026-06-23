/**
 * Migration: add site_version to site_config, create patch_notes table.
 * Run once: node scripts/migrate-patchnotes.mjs
 */
import pg from "pg";
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

const statements = [
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS site_version text NOT NULL DEFAULT 'v1.0.0'`,

  `CREATE TABLE IF NOT EXISTS patch_notes (
    id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    version      text        NOT NULL DEFAULT 'v1.0.0',
    title        text        NOT NULL DEFAULT 'Update',
    summary      text,
    content      jsonb       NOT NULL DEFAULT '[]',
    note_type    text        NOT NULL DEFAULT 'update',
    status       text        NOT NULL DEFAULT 'draft',
    is_pinned    boolean     NOT NULL DEFAULT false,
    published_at timestamptz,
    created_at   timestamptz DEFAULT now(),
    updated_at   timestamptz DEFAULT now()
  )`,

  `ALTER TABLE patch_notes ENABLE ROW LEVEL SECURITY`,
];

for (const sql of statements) {
  try {
    await client.query(sql);
    console.log("OK:", sql.trim().slice(0, 80));
  } catch (e) {
    console.error("SKIP:", sql.trim().slice(0, 80), "\n →", e.message);
  }
}

await client.end();
console.log("\nDone.");
