// One-time balance fix: shield regen cooldowns (14/11/8/5 sec by rarity)
// were too short across the board — a broken shield popped back to full
// too quickly to feel like a real, felt risk window, for every rarity, not
// just one tier. Lengthened to 22/17/13/9 (still strictly faster at higher
// rarity, same progression shape, just a meaningfully longer "you're
// exposed" window at every tier).
//
// Guarded to only touch rows still sitting at exactly the *old* per-rarity
// default — an admin who already hand-tuned a specific shield's cooldown
// to some other value is left untouched.
//
// Usage: node scripts/lengthen-shield-cooldown.mjs

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
    UPDATE items SET shield_regen_cooldown_sec = CASE rarity
      WHEN 'normal' THEN 22
      WHEN 'selten' THEN 17
      WHEN 'mythisch' THEN 13
      WHEN 'ultra' THEN 9
      ELSE shield_regen_cooldown_sec
    END
    WHERE type = 'shield_cosmetic'
      AND (
        (rarity = 'normal' AND shield_regen_cooldown_sec = 14) OR
        (rarity = 'selten' AND shield_regen_cooldown_sec = 11) OR
        (rarity = 'mythisch' AND shield_regen_cooldown_sec = 8) OR
        (rarity = 'ultra' AND shield_regen_cooldown_sec = 5)
      )
  `);
  console.log(`shield cooldown lengthened: ${result.rowCount} rows (14/11/8/5 -> 22/17/13/9)`);

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
