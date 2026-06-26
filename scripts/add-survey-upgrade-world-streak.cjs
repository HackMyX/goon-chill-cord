// Migration: Survey upgrade fields + Farmwelt best-streak column
// Run: node scripts/add-survey-upgrade-world-streak.cjs

const { Client } = require("pg");

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log("Connected. Running migration...");

  // ── Survey enhancements ───────────────────────────────────────────────────
  await client.query(`
    ALTER TABLE surveys
      ADD COLUMN IF NOT EXISTS image_url              TEXT,
      ADD COLUMN IF NOT EXISTS show_results_after_submit BOOLEAN NOT NULL DEFAULT TRUE;
  `);
  console.log("✅ surveys: image_url, show_results_after_submit added");

  await client.query(`
    ALTER TABLE survey_questions
      ADD COLUMN IF NOT EXISTS hint_text   TEXT,
      ADD COLUMN IF NOT EXISTS image_url   TEXT,
      ADD COLUMN IF NOT EXISTS scale_min   INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS scale_max   INTEGER NOT NULL DEFAULT 10,
      ADD COLUMN IF NOT EXISTS max_length  INTEGER NOT NULL DEFAULT 2000;
  `);
  console.log("✅ survey_questions: hint_text, image_url, scale_min, scale_max, max_length added");

  await client.query(`
    ALTER TABLE survey_answers
      ADD COLUMN IF NOT EXISTS answer_number NUMERIC;
  `);
  console.log("✅ survey_answers: answer_number added");

  // ── Farmwelt best-streak ──────────────────────────────────────────────────
  await client.query(`
    ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS world_best_streak INTEGER NOT NULL DEFAULT 0;
  `);
  console.log("✅ profiles: world_best_streak added");

  await client.end();
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
