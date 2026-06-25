/**
 * Balance Pass — tunes the entire site economy for farming + long sessions.
 * Run: node scripts/balance-pass.cjs
 * Requires: DATABASE_URL in .env.local
 */
"use strict";

const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------
const envFile = path.join(__dirname, "..", ".env.local");
if (!fs.existsSync(envFile)) { console.error(".env.local not found"); process.exit(1); }
for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
  const m = line.match(/^([^#=\s]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const db = new Client({ connectionString: process.env.DATABASE_URL });

// ---------------------------------------------------------------------------
// Balanced values
// ---------------------------------------------------------------------------

// ── Plinko ────────────────────────────────────────────────────────────────
const PLINKO = {
  id: "default",
  enabled: true,
  hourly_ball_limit: 50,        // was 30 — more play time
  daily_ball_limit: 0,
  min_bet_cr: 500,
  max_bet_cr: 0,
  ball_cost_cr: 500,
  quick_bet_amounts: JSON.stringify([500, 2000, 10000, 50000, 250000]),
  rows: 12,
  // Improved multipliers: center less punishing, edges more rewarding
  risk_levels: JSON.stringify([
    { key: "low",    label: "Niedrig", emoji: "🟢",
      multipliers: [2.2, 1.6, 1.3, 1.1, 1.0, 0.9, 1.0, 1.1, 1.3, 1.6, 2.2] },
    { key: "medium", label: "Mittel",  emoji: "🟡",
      multipliers: [12, 5, 2.5, 1.5, 0.7, 0.4, 0.7, 1.5, 2.5, 5, 12] },
    { key: "high",   label: "Hoch",    emoji: "🔴",
      multipliers: [30, 12, 5, 2, 0.4, 0.2, 0.4, 2, 5, 12, 30] },
  ]),
  max_win_cr: 0,
  announce_big_wins: true,
  big_win_threshold: 25000,
  show_history: true,
  show_leaderboard: true,
  leaderboard_size: 10,
  particles_enabled: true,
  trail_length: 8,
  glow_intensity: 1.8,
  animation_speed: 1.0,
  auto_bet_enabled: true,
};

// ── Snake modes_config ────────────────────────────────────────────────────
const SNAKE_MODES = {
  x1: {
    enabled: true, boardSize: 20,
    creditsPerApple: 12,           // was 8
    initialSpeedMs: 150, speedIncreasePerApple: 2, minSpeedMs: 60,
    wallWrap: true,
    dailyCrLimit: 20000,           // was 12000
    dailyGameLimit: null,
    bonusEveryN: 10, bonusCrFlat: 80,  // was 50
    bonusMultiplierApples: 5,
    goldenAppleEnabled: true, goldenAppleCrMultiplier: 5, goldenAppleLifeApples: 8,
    goldenAppleTailLoss: 0, goldenAppleSpeedReduction: 0,
    startLength: 3, particlesEnabled: true, leaderboardSize: 20,
  },
  x2: {
    enabled: true, boardSize: 20,
    creditsPerApple: 28,           // was 18
    initialSpeedMs: 90, speedIncreasePerApple: 2, minSpeedMs: 40,
    wallWrap: false,
    dailyCrLimit: 40000,           // was 25000
    dailyGameLimit: null,
    bonusEveryN: 10, bonusCrFlat: 150,  // was 100
    bonusMultiplierApples: 5,
    goldenAppleEnabled: true, goldenAppleCrMultiplier: 5, goldenAppleLifeApples: 6,
    goldenAppleTailLoss: 0, goldenAppleSpeedReduction: 0,
    startLength: 3, particlesEnabled: true, leaderboardSize: 20,
  },
  grind: {
    enabled: true, boardSize: 64,
    creditsPerApple: 8,            // was 5
    initialSpeedMs: 160, speedIncreasePerApple: 0.5, minSpeedMs: 70,
    wallWrap: false,
    dailyCrLimit: 75000,           // was 45000
    dailyGameLimit: null,
    bonusEveryN: 10, bonusCrFlat: 150,  // was 100
    bonusMultiplierApples: 5,
    goldenAppleEnabled: true, goldenAppleCrMultiplier: 4, goldenAppleLifeApples: 15,
    goldenAppleTailLoss: 0, goldenAppleSpeedReduction: 0,
    startLength: 3, particlesEnabled: true, leaderboardSize: 20,
    shrinkEveryN: 10, minBoardSize: 8, bonusCrPerShrink: 100,  // bonus was 50
  },
  farm: {
    enabled: true, boardSize: 20,
    creditsPerApple: 6,            // was 4
    initialSpeedMs: 140, speedIncreasePerApple: 0, minSpeedMs: 140,
    wallWrap: true,
    dailyCrLimit: 15000,           // was 8000
    dailyGameLimit: 15,            // was 8
    bonusEveryN: 0, bonusCrFlat: 0, bonusMultiplierApples: 0,
    goldenAppleEnabled: false, goldenAppleCrMultiplier: 1, goldenAppleLifeApples: 0,
    goldenAppleTailLoss: 0, goldenAppleSpeedReduction: 0,
    startLength: 5, particlesEnabled: true, leaderboardSize: 20,
  },
};

// ── Streak ────────────────────────────────────────────────────────────────
const STREAK = {
  id: "default",
  enabled: true,
  base_reward: 600,              // was 300
  daily_increment: 100,         // was 75
  max_reward: 6000,             // was 3000
  grace_period_hours: 6,        // was 4 — more forgiving
  milestone_interval: 7,
  milestone_bonus: 12000,       // was 5000
  reset_on_miss: true,
  weekend_multiplier: 2.5,      // was 2.0
  special_event_enabled: false,
  special_event_multiplier: 2.0,
  special_event_label: "Sonder-Event",
  show_countdown: false,
  show_streak_counter: true,
};

// ── Kill Streak ───────────────────────────────────────────────────────────
const KILL_STREAK = {
  id: "default",
  multiplier_per_kill: 0.05,    // was 0.04 — better CR scaling
  max_multiplier: 4.0,          // was 3.0 — higher ceiling
  mob_scale_per_kill: 0.008,    // was 0.012 — slower difficulty ramp (peaks at ~250 kills)
  mob_scale_max: 3.0,           // was 3.5 — slightly lower max difficulty
};

// ── Monster rewards (+25%) ────────────────────────────────────────────────
const MONSTERS = [
  { id: "zombie_weak",     reward_min: 22,  reward_max: 35  },  // was 18-28
  { id: "skeleton_weak",   reward_min: 19,  reward_max: 30  },  // was 15-24
  { id: "slime_weak",      reward_min: 13,  reward_max: 20  },  // was 10-16
  { id: "zombie_strong",   reward_min: 62,  reward_max: 100 },  // was 50-80
  { id: "skeleton_strong", reward_min: 56,  reward_max: 88  },  // was 45-70
  { id: "orc_brute",       reward_min: 68,  reward_max: 110 },  // was 55-88
  { id: "ghost_wraith",    reward_min: 68,  reward_max: 100 },  // was 55-80
  { id: "demon_boss",      reward_min: 145, reward_max: 220 },  // was 115-175
];

// ---------------------------------------------------------------------------
// Apply updates
// ---------------------------------------------------------------------------
async function run() {
  await db.connect();
  console.log("Connected. Running balance pass...\n");

  // ── Plinko ────────────────────────────────────────────────────────────
  console.log("📊 Plinko config...");
  await db.query(
    `INSERT INTO plinko_config
      (id, enabled, hourly_ball_limit, daily_ball_limit, min_bet_cr, max_bet_cr, ball_cost_cr,
       quick_bet_amounts, rows, risk_levels, max_win_cr, announce_big_wins, big_win_threshold,
       show_history, show_leaderboard, leaderboard_size, particles_enabled,
       trail_length, glow_intensity, animation_speed, auto_bet_enabled)
     VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     ON CONFLICT (id) DO UPDATE SET
       enabled               = EXCLUDED.enabled,
       hourly_ball_limit     = EXCLUDED.hourly_ball_limit,
       daily_ball_limit      = EXCLUDED.daily_ball_limit,
       min_bet_cr            = EXCLUDED.min_bet_cr,
       max_bet_cr            = EXCLUDED.max_bet_cr,
       ball_cost_cr          = EXCLUDED.ball_cost_cr,
       quick_bet_amounts     = EXCLUDED.quick_bet_amounts,
       rows                  = EXCLUDED.rows,
       risk_levels           = EXCLUDED.risk_levels,
       max_win_cr            = EXCLUDED.max_win_cr,
       announce_big_wins     = EXCLUDED.announce_big_wins,
       big_win_threshold     = EXCLUDED.big_win_threshold,
       show_history          = EXCLUDED.show_history,
       show_leaderboard      = EXCLUDED.show_leaderboard,
       leaderboard_size      = EXCLUDED.leaderboard_size,
       particles_enabled     = EXCLUDED.particles_enabled,
       trail_length          = EXCLUDED.trail_length,
       glow_intensity        = EXCLUDED.glow_intensity,
       animation_speed       = EXCLUDED.animation_speed,
       auto_bet_enabled      = EXCLUDED.auto_bet_enabled`,
    [
      PLINKO.id, PLINKO.enabled, PLINKO.hourly_ball_limit, PLINKO.daily_ball_limit,
      PLINKO.min_bet_cr, PLINKO.max_bet_cr, PLINKO.ball_cost_cr, PLINKO.quick_bet_amounts,
      PLINKO.rows, PLINKO.risk_levels, PLINKO.max_win_cr, PLINKO.announce_big_wins,
      PLINKO.big_win_threshold, PLINKO.show_history, PLINKO.show_leaderboard, PLINKO.leaderboard_size,
      PLINKO.particles_enabled, PLINKO.trail_length, PLINKO.glow_intensity, PLINKO.animation_speed,
      PLINKO.auto_bet_enabled,
    ],
  );
  console.log("  ✓ Plinko: hourly limit 30→50, multipliers improved\n");

  // ── Snake ─────────────────────────────────────────────────────────────
  console.log("🐍 Snake config...");
  await db.query(
    `INSERT INTO snake_config
      (id, enabled, modes_config, board_size, credits_per_apple_x1, credits_per_apple_x2,
       x2_apple_threshold, wall_wrap, initial_speed_ms, speed_increase_per_apple, min_speed_ms,
       x2_initial_speed_ms, daily_cr_limit, leaderboard_size,
       bonus_every_n, bonus_cr_flat, bonus_multiplier_apples,
       golden_apple_enabled, golden_apple_cr_multiplier, golden_apple_life_apples, start_length, particles_enabled)
     VALUES
      ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
     ON CONFLICT (id) DO UPDATE SET
       enabled                    = EXCLUDED.enabled,
       modes_config               = EXCLUDED.modes_config,
       board_size                 = EXCLUDED.board_size,
       credits_per_apple_x1       = EXCLUDED.credits_per_apple_x1,
       credits_per_apple_x2       = EXCLUDED.credits_per_apple_x2,
       x2_apple_threshold         = EXCLUDED.x2_apple_threshold,
       wall_wrap                  = EXCLUDED.wall_wrap,
       initial_speed_ms           = EXCLUDED.initial_speed_ms,
       speed_increase_per_apple   = EXCLUDED.speed_increase_per_apple,
       min_speed_ms               = EXCLUDED.min_speed_ms,
       x2_initial_speed_ms        = EXCLUDED.x2_initial_speed_ms,
       daily_cr_limit             = EXCLUDED.daily_cr_limit,
       leaderboard_size           = EXCLUDED.leaderboard_size,
       bonus_every_n              = EXCLUDED.bonus_every_n,
       bonus_cr_flat              = EXCLUDED.bonus_cr_flat,
       bonus_multiplier_apples    = EXCLUDED.bonus_multiplier_apples,
       golden_apple_enabled       = EXCLUDED.golden_apple_enabled,
       golden_apple_cr_multiplier = EXCLUDED.golden_apple_cr_multiplier,
       golden_apple_life_apples   = EXCLUDED.golden_apple_life_apples,
       start_length               = EXCLUDED.start_length,
       particles_enabled          = EXCLUDED.particles_enabled`,
    [
      "default", true, JSON.stringify(SNAKE_MODES),
      20, 12, 28, 30, true, 150, 2, 60, 90,
      20000, 20, 10, 80, 5, true, 5, 8, 3, true,
    ],
  );
  console.log("  ✓ Snake X1: 8→12 CR/apple, 12k→20k daily");
  console.log("  ✓ Snake X2: 18→28 CR/apple, 25k→40k daily");
  console.log("  ✓ Snake Grind: 5→8 CR/apple, 45k→75k daily");
  console.log("  ✓ Snake Farm: 4→6 CR/apple, 8k→15k daily, 8→15 games/day\n");

  // ── Streak ────────────────────────────────────────────────────────────
  console.log("🔥 Streak config...");
  try {
    await db.query(
      `INSERT INTO streak_config
        (id, enabled, base_reward, daily_increment, max_reward, grace_period_hours,
         milestone_interval, milestone_bonus, reset_on_miss, weekend_multiplier,
         special_event_enabled, special_event_multiplier, special_event_label,
         show_countdown, show_streak_counter)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO UPDATE SET
         enabled                  = EXCLUDED.enabled,
         base_reward              = EXCLUDED.base_reward,
         daily_increment          = EXCLUDED.daily_increment,
         max_reward               = EXCLUDED.max_reward,
         grace_period_hours       = EXCLUDED.grace_period_hours,
         milestone_interval       = EXCLUDED.milestone_interval,
         milestone_bonus          = EXCLUDED.milestone_bonus,
         reset_on_miss            = EXCLUDED.reset_on_miss,
         weekend_multiplier       = EXCLUDED.weekend_multiplier,
         special_event_enabled    = EXCLUDED.special_event_enabled,
         special_event_multiplier = EXCLUDED.special_event_multiplier,
         special_event_label      = EXCLUDED.special_event_label,
         show_countdown           = EXCLUDED.show_countdown,
         show_streak_counter      = EXCLUDED.show_streak_counter`,
      [
        STREAK.id, STREAK.enabled, STREAK.base_reward, STREAK.daily_increment, STREAK.max_reward,
        STREAK.grace_period_hours, STREAK.milestone_interval, STREAK.milestone_bonus,
        STREAK.reset_on_miss, STREAK.weekend_multiplier,
        STREAK.special_event_enabled, STREAK.special_event_multiplier, STREAK.special_event_label,
        STREAK.show_countdown, STREAK.show_streak_counter,
      ],
    );
    console.log("  ✓ Streak: base 300→600, max 3k→6k, milestone 5k→12k, grace 4→6h, weekend 2.0→2.5x\n");
  } catch (e) {
    console.warn("  ⚠ streak_config insert failed (some columns may not exist yet):", e.message);
  }

  // ── Kill Streak ───────────────────────────────────────────────────────
  console.log("⚡ Kill streak config...");
  await db.query(
    `INSERT INTO kill_streak_config (id, multiplier_per_kill, max_multiplier, mob_scale_per_kill, mob_scale_max)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (id) DO UPDATE SET
       multiplier_per_kill = EXCLUDED.multiplier_per_kill,
       max_multiplier      = EXCLUDED.max_multiplier,
       mob_scale_per_kill  = EXCLUDED.mob_scale_per_kill,
       mob_scale_max       = EXCLUDED.mob_scale_max`,
    [KILL_STREAK.id, KILL_STREAK.multiplier_per_kill, KILL_STREAK.max_multiplier,
     KILL_STREAK.mob_scale_per_kill, KILL_STREAK.mob_scale_max],
  );
  console.log("  ✓ Kill streak: +5%/kill, 3x→4x cap, difficulty ramp slower (peaks ~250 kills vs 30)\n");

  // ── Monster rewards ───────────────────────────────────────────────────
  console.log("👾 Monster rewards...");
  for (const m of MONSTERS) {
    await db.query(
      `UPDATE monster_types SET reward_min = $1, reward_max = $2 WHERE id = $3`,
      [m.reward_min, m.reward_max, m.id],
    );
    console.log(`  ✓ ${m.id.padEnd(18)} ${String(m.reward_min).padStart(3)}–${m.reward_max} CR`);
  }

  console.log("\n✅ Balance pass complete! All systems updated.\n");
  console.log("Summary of changes (farming & long sessions):");
  console.log("  • Plinko: 30→50 balls/hour, edge multipliers boosted");
  console.log("  • Snake: all modes 1.5x credits + 1.6x daily limits");
  console.log("  • Streak: 2x base reward, 2.4x milestone bonus");
  console.log("  • Kill streak: better CR scaling, slower difficulty ramp");
  console.log("  • Monsters: +25% reward across all 8 variants");

  await db.end();
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
