/**
 * Migration: add body_html to patch_notes (free-form rich-text body,
 * replaces the structured added/changed/fixed section builder).
 * Run once: node scripts/migrate-patchnotes-richtext.mjs
 */
import pg from "pg";
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

const statements = [
  `ALTER TABLE patch_notes ADD COLUMN IF NOT EXISTS body_html text`,
];

for (const sql of statements) {
  try {
    await client.query(sql);
    console.log("OK:", sql.trim().slice(0, 100));
  } catch (e) {
    console.error("SKIP:", sql.trim().slice(0, 100), "\n →", e.message);
  }
}

await client.end();
console.log("\nDone.");
