// One-time balance fix, driven by a live-DB audit (checked the actual
// `items` rows, not just the code defaults):
//
// 1) Every weapon_cosmetic item's `damage` was NULL (normal/selten/ultra)
//    or a stray `5` (mythisch) — never actually seeded by
//    scripts/generate-all-items.js, which only ever set name/rarity/type/
//    price_cr for weapons. lib/combat.ts' getEquippedDamage() floors any
//    value at or below FIST_DAMAGE (8) up to 8, so in practice *every
//    weapon in the game dealt exactly the same damage as bare fists*,
//    regardless of rarity or its 150–20000 CR price — rarity was 100%
//    cosmetic for combat power. Seeds lib/combat.ts'
//    SUGGESTED_DAMAGE_BY_RARITY (15/30/55/100) by rarity — idempotent
//    (only touches rows still at/under the fist-damage floor, so a future
//    admin's manual tuning above 8 is never clobbered by a re-run).
//
// 2) 7 single-row price_cr outliers (3x+ away from every other item of the
//    same type+rarity, confirmed by checking each type+rarity's full price
//    distribution — every other row sat at one consistent value, so each
//    outlier was an isolated stray edit, not a deliberate per-type pricing
//    decision) snapped back to the price every other item of that
//    type+rarity actually has. The worst was a mythisch weapon at 800,001
//    CR instead of 3,000 — at the shop's 3-8x listing multiplier
//    (lib/shop.ts), that's a 2.4-6.4 *million* CR shop listing, exactly
//    the kind of stray-zero data bug that visibly breaks trust in the
//    whole shop the moment it rotates in. Targeted by exact id, not
//    name/type/rarity, so a re-run can never accidentally touch a
//    different row even if names are edited later.
//
// Usage: node scripts/fix-weapon-damage-and-price-outliers.mjs

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

const PRICE_FIXES = [
  { id: "7d619df2-ed50-49a6-ae5f-1e132124d428", name: "Butterfly", from: 800001, to: 3000 },
  { id: "7833792a-c803-48f4-92f0-a0d4bf13605d", name: "Mythische Schwarze Haare", from: 35000, to: 3000 },
  { id: "222720ef-2b89-4dd1-954c-e8d309d7c677", name: "Weiße Katze", from: 900, to: 150 },
  { id: "20f5648c-8cbc-40c1-be9e-e50e9034003d", name: "Lila Aura", from: 2000, to: 600 },
  { id: "ce2900ab-b35e-48c8-84c1-345da5dfdd7e", name: "Seltene Rote Aura", from: 2000, to: 600 },
  { id: "16fd1bf9-51f6-43f1-bdbb-d8656319713e", name: "Legendärer Ring", from: 5000, to: 20000 },
  { id: "20e6f0c4-8bc0-43ba-af0f-ef42e650c31a", name: "Legendäres Amulett", from: 5000, to: 20000 },
];

async function main() {
  await client.connect();

  const dmgResult = await client.query(`
    UPDATE items SET damage = CASE rarity
      WHEN 'normal' THEN 15
      WHEN 'selten' THEN 30
      WHEN 'mythisch' THEN 55
      WHEN 'ultra' THEN 100
      ELSE damage
    END
    WHERE type = 'weapon_cosmetic' AND (damage IS NULL OR damage <= 8)
  `);
  console.log(`weapon damage: fixed ${dmgResult.rowCount} rows`);

  for (const fix of PRICE_FIXES) {
    const r = await client.query(
      `UPDATE items SET price_cr = $1 WHERE id = $2 AND price_cr = $3`,
      [fix.to, fix.id, fix.from]
    );
    console.log(`price outlier "${fix.name}": ${r.rowCount ? `${fix.from} -> ${fix.to}` : "skipped (already changed)"}`);
  }

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
