// One-time balance fix: the low-tier (Niedrig) variants — Zombie, Skelett,
// Slime — were trimmed down a bit too far in the previous "soften the
// whole roster" pass. Small bump back up (~15%) on health/attackDamage
// only, moveSpeed untouched (already at the 4.5 floor with no headroom to
// trim further either way). Same "UPDATE the 2 stale-override
// monster_types rows" pattern as scripts/soften-monster-balance.mjs —
// zombie_weak and skeleton_weak have DB rows that mask the lib/monsters.ts
// code defaults; slime_weak doesn't, so it needs no DB write.
//
// Usage: node scripts/strengthen-low-tier-monsters.mjs

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

  let r = await client.query(
    `UPDATE monster_types SET health = 67, attack_damage = 8, updated_at = now() WHERE id = 'zombie_weak'`
  );
  console.log(`zombie_weak: ${r.rowCount} row`);

  r = await client.query(
    `UPDATE monster_types SET health = 52, attack_damage = 10, throw_damage = 6, updated_at = now() WHERE id = 'skeleton_weak'`
  );
  console.log(`skeleton_weak: ${r.rowCount} row`);

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
