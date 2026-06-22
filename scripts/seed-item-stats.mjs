// One-time balancing pass for the new armor/perk/shield columns
// (scripts/migrate-item-stats.mjs) — every item currently has 0/"none"
// since those are the column defaults. This seeds sensible, playable
// numbers scaled by rarity (same "rarer = clearly better, not a rounding
// error" philosophy as lib/combat.ts' SUGGESTED_DAMAGE_BY_RARITY for
// weapons) so the admin panel opens with a balanced starting point instead
// of every stat item being functionally identical until someone manually
// tunes all ~900 rows by hand.
//
// Idempotent: every UPDATE is guarded by "this stat is still at its
// just-migrated default", so re-running this after an admin has since
// hand-tuned specific items never clobbers their changes.
//
// Usage: node scripts/seed-item-stats.mjs

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

  // Armor (jacket/pants/hat/shoes): summed across all 4 slots in
  // lib/combat.ts' applyIncomingDamage, so these are per-item points, not
  // the total a fully-geared player ends up with. Calibrated against
  // lib/monsters.ts' attack damage (6-16) so a full Ultra set (4 × 12 = 48)
  // meaningfully softens even the toughest variant without going below the
  // hard 1-damage floor every hit still keeps.
  const armorResult = await client.query(`
    UPDATE items SET armor = CASE rarity
      WHEN 'normal' THEN 1
      WHEN 'selten' THEN 3
      WHEN 'mythisch' THEN 6
      WHEN 'ultra' THEN 12
      ELSE armor
    END
    WHERE type IN ('jacket', 'pants', 'hat', 'shoes') AND armor = 0
  `);
  console.log(`armor: updated ${armorResult.rowCount} rows`);

  // Shield (shield_cosmetic): absorb pool + respawn cooldown, rarer =
  // bigger pool AND faster recharge (a double upgrade, same as weapons
  // getting both more damage and nothing taken away at higher rarity).
  const shieldResult = await client.query(`
    UPDATE items SET
      shield_hp = CASE rarity
        WHEN 'normal' THEN 15
        WHEN 'selten' THEN 35
        WHEN 'mythisch' THEN 70
        WHEN 'ultra' THEN 130
        ELSE shield_hp
      END,
      shield_regen_cooldown_sec = CASE rarity
        WHEN 'normal' THEN 14
        WHEN 'selten' THEN 11
        WHEN 'mythisch' THEN 8
        WHEN 'ultra' THEN 5
        ELSE shield_regen_cooldown_sec
      END
    WHERE type = 'shield_cosmetic' AND shield_hp = 0
  `);
  console.log(`shield: updated ${shieldResult.rowCount} rows`);

  // Perks (ring/amulet): magnitude scales with rarity; perk *type* is
  // distributed deterministically across the 3 kinds via the item id's
  // first hex character (stable across re-runs, no real randomness needed
  // here — the point is variety across the catalogue, not per-row
  // significance) so speed/jump/hp-regen rings & amulets all exist in
  // meaningful numbers instead of every ring rolling the same perk.
  const perkResult = await client.query(`
    UPDATE items SET
      perk_type = (ARRAY['speed_boost', 'jump_boost', 'hp_regen_boost'])[(ascii(substr(id::text, 1, 1)) % 3) + 1],
      perk_magnitude = CASE rarity
        WHEN 'normal' THEN 0.05
        WHEN 'selten' THEN 0.10
        WHEN 'mythisch' THEN 0.20
        WHEN 'ultra' THEN 0.35
        ELSE 0
      END
    WHERE type IN ('ring', 'amulet') AND perk_type = 'none'
  `);
  console.log(`perks: updated ${perkResult.rowCount} rows`);

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
