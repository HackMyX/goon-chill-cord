/**
 * Migration: snake v2 — add modes_config JSONB + missing bonus/visual columns
 * Run once: node scripts/migrate-snake-v2.mjs
 */
import pg from "pg";
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

const statements = [
  // New per-mode JSONB column (stores x1, x2, grind configs)
  `ALTER TABLE snake_config ADD COLUMN IF NOT EXISTS modes_config jsonb`,

  // Bonus system columns (added in a previous session, but ensure they exist)
  `ALTER TABLE snake_config ADD COLUMN IF NOT EXISTS bonus_every_n integer NOT NULL DEFAULT 10`,
  `ALTER TABLE snake_config ADD COLUMN IF NOT EXISTS bonus_cr_flat integer NOT NULL DEFAULT 50`,
  `ALTER TABLE snake_config ADD COLUMN IF NOT EXISTS bonus_multiplier_apples integer NOT NULL DEFAULT 5`,

  // Golden apple columns
  `ALTER TABLE snake_config ADD COLUMN IF NOT EXISTS golden_apple_enabled boolean NOT NULL DEFAULT true`,
  `ALTER TABLE snake_config ADD COLUMN IF NOT EXISTS golden_apple_cr_multiplier real NOT NULL DEFAULT 5`,
  `ALTER TABLE snake_config ADD COLUMN IF NOT EXISTS golden_apple_life_apples integer NOT NULL DEFAULT 8`,

  // Visual columns
  `ALTER TABLE snake_config ADD COLUMN IF NOT EXISTS start_length integer NOT NULL DEFAULT 3`,
  `ALTER TABLE snake_config ADD COLUMN IF NOT EXISTS particles_enabled boolean NOT NULL DEFAULT true`,

  // snake_best_scores already supports any speed_mode text value (including 'grind')
  // No schema change needed there.
];

for (const sql of statements) {
  try {
    await client.query(sql);
    console.log("OK:", sql.trim().slice(0, 100));
  } catch (e) {
    console.error("SKIP:", sql.trim().slice(0, 100), "\n  →", e.message);
  }
}

await client.end();
console.log("\nSnake v2 migration complete.");
