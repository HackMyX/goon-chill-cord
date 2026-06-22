// Admin-configurable player/combat base stats — every constant lib/
// combat.ts (and lib/player-movement-config.ts) used to hardcode, now
// overridable from the admin Games tab. Same single-row, id='default'
// shape as world_config/kill_streak_config (see scripts/create-world-
// config.mjs for the original of this pattern).
//
// Usage: node scripts/create-character-config.mjs

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

  await client.query(`
    CREATE TABLE IF NOT EXISTS character_config (
      id text PRIMARY KEY DEFAULT 'default',
      fist_damage numeric NOT NULL DEFAULT 8,
      player_max_hp numeric NOT NULL DEFAULT 100,
      player_max_stamina numeric NOT NULL DEFAULT 130,
      stamina_sprint_drain_per_sec numeric NOT NULL DEFAULT 16,
      stamina_regen_per_sec numeric NOT NULL DEFAULT 14,
      stamina_min_to_start_sprint numeric NOT NULL DEFAULT 15,
      jump_cooldown_sec numeric NOT NULL DEFAULT 1,
      hp_regen_per_sec numeric NOT NULL DEFAULT 3,
      hp_regen_delay_after_hit_sec numeric NOT NULL DEFAULT 4,
      respawn_invulnerable_sec numeric NOT NULL DEFAULT 1.5,
      attack_range numeric NOT NULL DEFAULT 2.7,
      attack_cone_half_angle numeric NOT NULL DEFAULT 1.05,
      attack_cooldown numeric NOT NULL DEFAULT 0.45,
      attack_hit_radius numeric NOT NULL DEFAULT 0.55,
      sprint_damage_multiplier numeric NOT NULL DEFAULT 1.2,
      airborne_damage_multiplier numeric NOT NULL DEFAULT 1.35,
      pvp_damage_multiplier numeric NOT NULL DEFAULT 0.35,
      perk_multiplier_cap numeric NOT NULL DEFAULT 1.4,
      move_speed numeric NOT NULL DEFAULT 4.5,
      sprint_multiplier numeric NOT NULL DEFAULT 1.8,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("character_config table ready.");

  await client.query(`ALTER TABLE character_config ENABLE ROW LEVEL SECURITY;`);
  console.log("RLS enabled on character_config.");

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
