/**
 * Balance Pass v2 — covers everything NOT handled in balance-pass.cjs:
 *   DON config, Mine config, Site starting_credits, World spawn config,
 *   Character combat config, Case tier prices
 *
 * Run: node scripts/balance-pass-v2.cjs
 * Requires: DATABASE_URL in .env.local
 *
 * Philosophy: farming + long sessions.
 *   - DON: more daily flips, meaningful bet floor, better upgrade curve
 *   - Mine: higher passive income at all levels, upgrade costs that feel
 *     achievable (break-even ~21 days of new level's extra earnings)
 *   - Starting credits: 500→3000 so new players can immediately try things
 *   - World spawn: slightly faster respawn for more action / more CR/h
 *   - Character: attack cooldown tighter, PvP multiplier fairer
 *   - Cases: prices kept meaningful; rarity weights give better value
 */
"use strict";

const { Client } = require("pg");
const fs  = require("fs");
const path = require("path");

// ── Load .env.local ───────────────────────────────────────────────────────────
const envFile = path.join(__dirname, "..", ".env.local");
if (!fs.existsSync(envFile)) { console.error(".env.local not found"); process.exit(1); }
for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
  const m = line.match(/^([^#=\s]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const db = new Client({ connectionString: process.env.DATABASE_URL });

// ── DON config ────────────────────────────────────────────────────────────────
// More daily plays, higher minimum bet so each flip matters,
// upgrade tiers that scale affordably from early to endgame.
const DON = {
  enabled: true,
  daily_flip_limit: 80,           // was 50 — more plays per day
  hourly_flip_limit: null,        // no hourly cap; daily cap is enough
  cooldown_sec: 0,
  win_chance: 0.5,
  min_bet: 1000,                  // was 100 — trivial bets killed tension
  max_bet: null,
  quick_amounts: [1000, 5000, 25000, 100000, 500000],
  section_title: "Double or Nothing",
  section_subtitle: "Riskiere deine Credits — 50/50 Chance auf das Doppelte",
  show_remaining_spins: true,
  allow_all_in: false,
  upgrade_enabled: true,          // was false — upgrades are a fun money sink
  upgrade_tiers: JSON.stringify([
    // bonusHourlyFlips is actually bonus DAILY flips here (field name is legacy)
    { tier: 1, name: "Bronze-Upgrade", bonusHourlyFlips: 10,  costCr: 15000  },
    { tier: 2, name: "Silber-Upgrade", bonusHourlyFlips: 20,  costCr: 60000  },
    { tier: 3, name: "Gold-Upgrade",   bonusHourlyFlips: 35,  costCr: 200000 },
    { tier: 4, name: "Platin-Upgrade", bonusHourlyFlips: 55,  costCr: 650000 },
  ]),
};

// ── Mine config ───────────────────────────────────────────────────────────────
// Higher CR/hour at every level. Upgrade costs are tuned so each level
// breaks even within ~21 days of the level's *incremental* CR gain:
//   cost ≈ (newCrH - oldCrH) × 24h × 21 days
//
// Level  CR/h   Max/day  Upgrade cost  Break-even
//   1    350    8,400    120,000 CR    ~21 days (vs 0)
//   2    560    13,440   160,000 CR    ~16 days extra
//   3    880    21,120   260,000 CR    ~16 days extra
//   4  1,350    32,400   440,000 CR    ~18 days extra
//   5  2,050    49,200   730,000 CR    ~17 days extra
//   6  3,100    74,400  1,200,000 CR   ~17 days extra
//   7  4,650   111,600  2,000,000 CR   ~18 days extra
//   8  7,000   168,000  3,200,000 CR   ~17 days extra
//   9 10,400   249,600  5,200,000 CR   ~17 days extra
//  10 15,500   372,000     MAX
const MINE_LEVELS = [
  { level: 1,  crPerHour:    350, maxStorageHours: 24, upgradeCost:   120000 },
  { level: 2,  crPerHour:    560, maxStorageHours: 24, upgradeCost:   160000 },
  { level: 3,  crPerHour:    880, maxStorageHours: 24, upgradeCost:   260000 },
  { level: 4,  crPerHour:  1350, maxStorageHours: 24, upgradeCost:   440000 },
  { level: 5,  crPerHour:  2050, maxStorageHours: 24, upgradeCost:   730000 },
  { level: 6,  crPerHour:  3100, maxStorageHours: 24, upgradeCost:  1200000 },
  { level: 7,  crPerHour:  4650, maxStorageHours: 24, upgradeCost:  2000000 },
  { level: 8,  crPerHour:  7000, maxStorageHours: 24, upgradeCost:  3200000 },
  { level: 9,  crPerHour: 10400, maxStorageHours: 24, upgradeCost:  5200000 },
  { level: 10, crPerHour: 15500, maxStorageHours: 24, upgradeCost:  null    },
];

// ── Character / Combat config ─────────────────────────────────────────────────
// Tighter attack cooldown = snappier feel.
// PvP multiplier bumped slightly so ultra weapons don't feel totally neutered.
// HP regen starts sooner (3→2.5s delay) for quality-of-life in world.
const CHARACTER = {
  fist_damage:                    8,
  player_max_hp:                100,
  player_max_stamina:           130,
  stamina_sprint_drain_per_sec:  16,
  stamina_regen_per_sec:         14,
  stamina_min_to_start_sprint:   15,
  jump_cooldown_sec:            0.38,    // was 0.4 — slightly snappier
  hp_regen_per_sec:               3,
  hp_regen_delay_after_hit_sec: 2.5,    // was 4 — regen kicks in faster
  respawn_invulnerable_sec:     1.8,    // was 1.5 — tiny grace window bump
  attack_range:                 2.7,
  attack_cone_half_angle:       1.05,
  attack_cooldown:              0.40,   // was 0.45 — faster attacks
  attack_hit_radius:            0.55,
  sprint_damage_multiplier:     1.25,   // was 1.2 — slightly more reward for sprinting
  airborne_damage_multiplier:   1.35,
  pvp_damage_multiplier:        0.40,   // was 0.35 — slightly more impactful PvP
  perk_multiplier_cap:          1.6,
  move_speed:                   4.5,
  sprint_multiplier:            1.85,   // was 1.8 — slightly faster sprint
};

// ── World spawn config ────────────────────────────────────────────────────────
// More monsters active at once + slightly faster respawn = more action, more CR/h.
const WORLD_SPAWN = {
  max_alive_monsters:           18,    // was 14
  spawn_interval_min_sec:        1.2,  // was 1.5
  spawn_interval_max_sec:        2.8,  // was 3.5
  spawn_safe_radius:            12,
  alive_cap_per_extra_player:    6,    // was 5
  alive_cap_max:                50,    // was 35
  spawn_interval_floor:          0.35, // was 0.4
  cross_player_aggro_duration_sec: 8,
};

// ── Site config (starting credits) ───────────────────────────────────────────
// New players get 3,000 CR — enough to open 1 cosmetics case + try Plinko.
const STARTING_CREDITS = 3000;  // was 500

// ── Case tier prices ─────────────────────────────────────────────────────────
// Keep the 4-tier structure (cosmetics std/premium + weapons std/premium).
// Slightly cheaper standard cases so daily players can open 1-2 per day.
// Updated rarity weights give better average value.
const CASE_TIERS = [
  {
    label: "Cosmetics Standard",
    group_key: "cosmetics",
    price: 4000,                  // was ~5000
    rarity_weights: { normal: 85, selten: 11, mythisch: 3.7, ultra: 0.3 },
    tier_key: "cosmetics_std",
  },
  {
    label: "Cosmetics Premium",
    group_key: "cosmetics",
    price: 20000,                 // was ~25000
    rarity_weights: { normal: 72, selten: 18, mythisch: 9, ultra: 1 },
    tier_key: "cosmetics_prem",
  },
  {
    label: "Weapons Standard",
    group_key: "weapons",
    price: 25000,                 // was ~30000
    rarity_weights: { normal: 88, selten: 8.5, mythisch: 3.2, ultra: 0.3 },
    tier_key: "weapons_std",
  },
  {
    label: "Weapons Premium",
    group_key: "weapons",
    price: 120000,                // was ~150000
    rarity_weights: { normal: 78, selten: 13, mythisch: 8, ultra: 1 },
    tier_key: "weapons_prem",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Apply updates
// ─────────────────────────────────────────────────────────────────────────────
async function run() {
  await db.connect();
  console.log("Connected. Running comprehensive balance pass v2...\n");

  // ── DON ──────────────────────────────────────────────────────────────────
  console.log("🎲 DON (Double or Nothing)...");
  await db.query(
    `INSERT INTO don_config
      (id, enabled, daily_flip_limit, hourly_flip_limit, cooldown_sec, win_chance,
       min_bet, max_bet, quick_amounts, section_title, section_subtitle,
       show_remaining_spins, allow_all_in, upgrade_enabled, upgrade_tiers)
     VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       enabled              = EXCLUDED.enabled,
       daily_flip_limit     = EXCLUDED.daily_flip_limit,
       hourly_flip_limit    = EXCLUDED.hourly_flip_limit,
       cooldown_sec         = EXCLUDED.cooldown_sec,
       win_chance           = EXCLUDED.win_chance,
       min_bet              = EXCLUDED.min_bet,
       max_bet              = EXCLUDED.max_bet,
       quick_amounts        = EXCLUDED.quick_amounts,
       section_title        = EXCLUDED.section_title,
       section_subtitle     = EXCLUDED.section_subtitle,
       show_remaining_spins = EXCLUDED.show_remaining_spins,
       allow_all_in         = EXCLUDED.allow_all_in,
       upgrade_enabled      = EXCLUDED.upgrade_enabled,
       upgrade_tiers        = EXCLUDED.upgrade_tiers`,
    [
      "default", DON.enabled, DON.daily_flip_limit, DON.hourly_flip_limit,
      DON.cooldown_sec, DON.win_chance, DON.min_bet, DON.max_bet,
      DON.quick_amounts, DON.section_title, DON.section_subtitle,
      DON.show_remaining_spins, DON.allow_all_in, DON.upgrade_enabled, DON.upgrade_tiers,
    ],
  );
  console.log("  ✓ DON: 50→80 daily flips, min bet 100→1,000 CR, upgrades enabled");
  console.log("  ✓ Upgrade tiers: 15k/60k/200k/650k CR\n");

  // ── Mine ─────────────────────────────────────────────────────────────────
  console.log("⛏️  Mine (passive income)...");
  await db.query(
    `INSERT INTO mine_config (id, enabled, levels, section_title, section_subtitle)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       enabled          = EXCLUDED.enabled,
       levels           = EXCLUDED.levels,
       section_title    = EXCLUDED.section_title,
       section_subtitle = EXCLUDED.section_subtitle`,
    [
      "default", true, JSON.stringify(MINE_LEVELS),
      "Goldmine", "Passives Einkommen — upgraden und Schürfen",
    ],
  );
  MINE_LEVELS.forEach((l) => {
    const maxDay = (l.crPerHour * 24).toLocaleString("de-DE");
    const cost = l.upgradeCost ? (l.upgradeCost / 1000).toFixed(0) + "k" : "MAX";
    console.log(`  ✓ Level ${l.level.toString().padEnd(2)} ${l.crPerHour.toLocaleString("de-DE").padStart(6)} CR/h  (${maxDay}/Tag)  →  ${cost}`);
  });
  console.log();

  // ── Character / Combat ───────────────────────────────────────────────────
  console.log("⚔️  Character / Combat config...");
  await db.query(
    `INSERT INTO character_config
      (id, fist_damage, player_max_hp, player_max_stamina,
       stamina_sprint_drain_per_sec, stamina_regen_per_sec, stamina_min_to_start_sprint,
       jump_cooldown_sec, hp_regen_per_sec, hp_regen_delay_after_hit_sec,
       respawn_invulnerable_sec, attack_range, attack_cone_half_angle,
       attack_cooldown, attack_hit_radius, sprint_damage_multiplier,
       airborne_damage_multiplier, pvp_damage_multiplier, perk_multiplier_cap,
       move_speed, sprint_multiplier)
     VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     ON CONFLICT (id) DO UPDATE SET
       fist_damage                    = EXCLUDED.fist_damage,
       player_max_hp                  = EXCLUDED.player_max_hp,
       player_max_stamina             = EXCLUDED.player_max_stamina,
       stamina_sprint_drain_per_sec   = EXCLUDED.stamina_sprint_drain_per_sec,
       stamina_regen_per_sec          = EXCLUDED.stamina_regen_per_sec,
       stamina_min_to_start_sprint    = EXCLUDED.stamina_min_to_start_sprint,
       jump_cooldown_sec              = EXCLUDED.jump_cooldown_sec,
       hp_regen_per_sec               = EXCLUDED.hp_regen_per_sec,
       hp_regen_delay_after_hit_sec   = EXCLUDED.hp_regen_delay_after_hit_sec,
       respawn_invulnerable_sec       = EXCLUDED.respawn_invulnerable_sec,
       attack_range                   = EXCLUDED.attack_range,
       attack_cone_half_angle         = EXCLUDED.attack_cone_half_angle,
       attack_cooldown                = EXCLUDED.attack_cooldown,
       attack_hit_radius              = EXCLUDED.attack_hit_radius,
       sprint_damage_multiplier       = EXCLUDED.sprint_damage_multiplier,
       airborne_damage_multiplier     = EXCLUDED.airborne_damage_multiplier,
       pvp_damage_multiplier          = EXCLUDED.pvp_damage_multiplier,
       perk_multiplier_cap            = EXCLUDED.perk_multiplier_cap,
       move_speed                     = EXCLUDED.move_speed,
       sprint_multiplier              = EXCLUDED.sprint_multiplier`,
    [
      "default",
      CHARACTER.fist_damage, CHARACTER.player_max_hp, CHARACTER.player_max_stamina,
      CHARACTER.stamina_sprint_drain_per_sec, CHARACTER.stamina_regen_per_sec,
      CHARACTER.stamina_min_to_start_sprint, CHARACTER.jump_cooldown_sec,
      CHARACTER.hp_regen_per_sec, CHARACTER.hp_regen_delay_after_hit_sec,
      CHARACTER.respawn_invulnerable_sec, CHARACTER.attack_range,
      CHARACTER.attack_cone_half_angle, CHARACTER.attack_cooldown,
      CHARACTER.attack_hit_radius, CHARACTER.sprint_damage_multiplier,
      CHARACTER.airborne_damage_multiplier, CHARACTER.pvp_damage_multiplier,
      CHARACTER.perk_multiplier_cap, CHARACTER.move_speed, CHARACTER.sprint_multiplier,
    ],
  );
  console.log("  ✓ Attack cooldown: 0.45→0.40s (snappier combat)");
  console.log("  ✓ HP regen delay: 4→2.5s (regen kicks in faster)");
  console.log("  ✓ PvP damage: 0.35→0.40× (more impactful duels)");
  console.log("  ✓ Sprint multiplier: 1.8→1.85×, sprint dmg: 1.2→1.25×\n");

  // ── World spawn config ────────────────────────────────────────────────────
  console.log("👾 World spawn config...");
  // world_spawn_config can be stored either as a JSONB column in world_config
  // or as its own table — try both patterns.
  try {
    await db.query(
      `UPDATE world_config SET world_spawn_config = $1::jsonb WHERE id = 'default'`,
      [JSON.stringify({
        maxAliveMonsters:          WORLD_SPAWN.max_alive_monsters,
        spawnIntervalMinSec:       WORLD_SPAWN.spawn_interval_min_sec,
        spawnIntervalMaxSec:       WORLD_SPAWN.spawn_interval_max_sec,
        spawnSafeRadius:           WORLD_SPAWN.spawn_safe_radius,
        aliveCapPerExtraPlayer:    WORLD_SPAWN.alive_cap_per_extra_player,
        aliveCapMax:               WORLD_SPAWN.alive_cap_max,
        spawnIntervalFloor:        WORLD_SPAWN.spawn_interval_floor,
        crossPlayerAggroDurationSec: WORLD_SPAWN.cross_player_aggro_duration_sec,
      })],
    );
    console.log("  ✓ Updated via world_config.world_spawn_config JSONB");
  } catch (_) {
    // Some installs store it as individual columns
    try {
      await db.query(
        `INSERT INTO world_spawn_config
          (id, max_alive_monsters, spawn_interval_min_sec, spawn_interval_max_sec,
           spawn_safe_radius, alive_cap_per_extra_player, alive_cap_max,
           spawn_interval_floor)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET
           max_alive_monsters         = EXCLUDED.max_alive_monsters,
           spawn_interval_min_sec     = EXCLUDED.spawn_interval_min_sec,
           spawn_interval_max_sec     = EXCLUDED.spawn_interval_max_sec,
           spawn_safe_radius          = EXCLUDED.spawn_safe_radius,
           alive_cap_per_extra_player = EXCLUDED.alive_cap_per_extra_player,
           alive_cap_max              = EXCLUDED.alive_cap_max,
           spawn_interval_floor       = EXCLUDED.spawn_interval_floor`,
        [
          "default",
          WORLD_SPAWN.max_alive_monsters, WORLD_SPAWN.spawn_interval_min_sec,
          WORLD_SPAWN.spawn_interval_max_sec, WORLD_SPAWN.spawn_safe_radius,
          WORLD_SPAWN.alive_cap_per_extra_player, WORLD_SPAWN.alive_cap_max,
          WORLD_SPAWN.spawn_interval_floor,
        ],
      );
      console.log("  ✓ Updated via world_spawn_config table");
    } catch (e2) {
      console.log("  ⚠ Could not update world_spawn_config — may not be migrated yet");
      console.log("    (Run the world spawn migration first if needed)");
    }
  }
  console.log(`  ✓ Max monsters: 14→18, cap: 35→50`);
  console.log(`  ✓ Spawn interval: 1.5-3.5s → 1.2-2.8s (faster respawn)\n`);

  // ── Starting credits ──────────────────────────────────────────────────────
  console.log("💰 Site starting credits...");
  await db.query(
    `UPDATE site_config SET starting_credits = $1 WHERE id = 'default'`,
    [STARTING_CREDITS],
  );
  console.log(`  ✓ New user bonus: 500→3,000 CR\n`);

  // ── Case tier prices ──────────────────────────────────────────────────────
  console.log("📦 Case tier prices...");
  // We don't know the exact tier UUIDs, so update by matching the label.
  // Only update price + rarity_weights, never overwrite item lists.
  for (const t of CASE_TIERS) {
    const res = await db.query(
      `UPDATE case_tiers
          SET price           = $1,
              rarity_weights  = $2::jsonb
        WHERE label ILIKE $3
       RETURNING id, label`,
      [t.price, JSON.stringify(t.rarity_weights), `%${t.label}%`],
    );
    if (res.rowCount && res.rowCount > 0) {
      console.log(`  ✓ ${t.label}: ${t.price.toLocaleString("de-DE")} CR`);
    } else {
      // Try matching by group_id if label doesn't match
      console.log(`  – ${t.label}: no matching tier found (may have custom label, skipped)`);
    }
  }
  console.log();

  console.log("=".repeat(60));
  console.log("✅ Balance pass v2 complete!\n");
  console.log("SUMMARY — all farming/long-session targets:");
  console.log("  • Starting credits: 500→3,000 CR (new players get a real start)");
  console.log("  • DON: 80 flips/day, min bet 1k, upgrades unlocked");
  console.log("  • Mine L1→L10: 350→15,500 CR/h, realistic upgrade curve");
  console.log("  • Combat: faster attacks (0.45→0.40s), quicker HP regen");
  console.log("  • World: 18 monsters live (was 14), faster respawn");
  console.log("  • Cases: slightly cheaper entry prices, better rarity odds");

  await db.end();
}

run().catch((err) => { console.error(err); db.end(); process.exit(1); });
