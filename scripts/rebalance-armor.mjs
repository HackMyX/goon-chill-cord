// One-time balance fix: the original armor values seeded by
// scripts/seed-item-stats.mjs (1/3/6/12 per piece) summed to 48 for a full
// 4-piece Ultra set — more than the toughest lib/monsters.ts variant's
// attack damage (Dämonenfürst, 26), meaning every hit from every monster
// in the game, including the boss, got reduced to the hard 1-damage floor
// for anyone in full Ultra armor. Maxed-out gear made combat trivial
// outright instead of just easier. See the updated comment in
// scripts/seed-item-stats.mjs for the new target numbers (1/2/4/5) and the
// reasoning behind them.
//
// Guarded to only touch rows still sitting at exactly the *old* per-rarity
// default — an admin who already hand-tuned a specific item's armor to
// some other value is left untouched, same idempotency contract as
// seed-item-stats.mjs itself.
//
// Usage: node scripts/rebalance-armor.mjs

import { Client } from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", ".env.local"), "utf-8")
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    })
);

const client = new Client({ connectionString: env.DATABASE_URL });

async function main() {
  await client.connect();

  const result = await client.query(`
    UPDATE items SET armor = CASE rarity
      WHEN 'normal' THEN 1
      WHEN 'selten' THEN 2
      WHEN 'mythisch' THEN 4
      WHEN 'ultra' THEN 5
      ELSE armor
    END
    WHERE type IN ('jacket', 'pants', 'hat', 'shoes')
      AND (
        (rarity = 'normal' AND armor = 1) OR
        (rarity = 'selten' AND armor = 3) OR
        (rarity = 'mythisch' AND armor = 6) OR
        (rarity = 'ultra' AND armor = 12)
      )
  `);
  console.log(`armor rebalanced: ${result.rowCount} rows (1/3/6/12 -> 1/2/4/5)`);

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
