// scripts/full-column-check.cjs
// Checks every column listed in system-health.ts COLUMN_CHECKS against the live DB
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const COLS = [
  ['mod_permissions','max_reward_per_ticket'],
  ['mod_permissions','can_pause_tickets'],
  ['profiles','don_upgrade_tier'],
  ['profiles','verified'],
  ['profiles','temp_banned_until'],
  ['profiles','mod_permissions_override'],
  ['don_config','upgrade_enabled'],
  ['don_config','upgrade_tiers'],
  ['global_chat_messages','avatar_url'],
  ['login_events','fingerprint'],
  ['site_config','homepage_config'],
  ['site_config','topbar_show_labels'],
  ['site_config','topbar_right_slots'],
  ['site_config','topbar_button_style'],
  ['site_config','site_version'],
  ['patch_notes','show_popup'],
  ['case_tiers','preview_cost'],
  ['case_tiers','multi_open_max'],
  ['case_tiers','sort_order'],
  ['case_tiers','per_rarity_item_ids'],
  ['case_tiers','name_styles_eligible'],
  ['case_tiers','tier_sublabel'],
  ['shop_settings','motd'],
  ['shop_settings','motd_enabled'],
  ['streak_config','special_event_enabled'],
  ['streak_config','special_event_multiplier'],
  ['world_config','max_alive_monsters'],
  ['tickets','reward_pending'],
  ['tickets','escalated_to_admin'],
  ['tickets','escalated_to_user_id'],
  ['battle_passes','theme'],
  ['battle_passes','accent_color'],
  ['battle_passes','banner_image_url'],
  ['battle_passes','show_in_shop'],
  ['battle_passes','show_on_dashboard'],
  ['battle_pass_tiers','reward_badge_text'],
  ['battle_pass_tiers','reward_item_rarity'],
  ['battle_pass_tiers','reward_xp_boost'],
  ['battle_pass_tiers','reward_quantity'],
  ['battle_pass_tiers','highlight_tier'],
  ['battle_pass_tiers','description'],
  ['plinko_config','daily_ball_limit'],
  ['plinko_config','show_history'],
  ['plinko_config','show_leaderboard'],
  ['plinko_config','leaderboard_size'],
  ['plinko_config','min_bet_cr'],
  ['plinko_config','max_bet_cr'],
  ['plinko_config','quick_bet_amounts'],
  ['plinko_config','particles_enabled'],
  ['plinko_config','trail_length'],
  ['plinko_config','glow_intensity'],
  ['plinko_config','animation_speed'],
  ['plinko_config','auto_bet_enabled'],
  ['battle_passes','elite_price_cr'],
  ['battle_passes','elite_enabled'],
  ['battle_pass_tiers','is_elite'],
  ['user_battle_passes','has_elite'],
  ['user_battle_passes','elite_purchased_at'],
  ['profiles','active_name_style_key'],
  ['profiles','warning_strikes'],
  ['profiles','warning_note'],
  ['name_styles','available_in_shop'],
  ['name_styles','shop_price_cr'],
  ['name_styles','shop_stock'],
  ['name_styles','shop_expires_at'],
  ['name_styles','shop_sort_order'],
  ['battle_passes','shop_sort_order'],
  ['battle_pass_tiers','reward_name_style_key'],
  ['battle_passes','shop_position'],
  ['battle_passes','shop_banner_size'],
  ['battle_passes','custom_buy_text'],
  ['battle_passes','custom_elite_buy_text'],
  ['battle_passes','highlight_color'],
  ['battle_passes','show_tier_count_in_shop'],
  ['battle_passes','show_countdown'],
  ['battle_passes','pass_icon'],
  ['battle_passes','updated_at'],
  ['battle_passes','incompatible_with'],
  ['ticket_messages','attachment_url'],
  ['world_config','spawn_interval_min_sec'],
  ['world_config','spawn_interval_max_sec'],
  ['world_config','alive_cap_max'],
  ['world_config','alive_cap_per_extra_player'],
  ['world_config','perk_multiplier_cap'],
  ['character_config','attack_cooldown'],
  ['character_config','hp_regen_per_sec'],
  ['character_config','hp_regen_delay_after_hit_sec'],
  ['character_config','pvp_damage_multiplier'],
  ['character_config','perk_multiplier_cap'],
  ['character_config','fist_damage'],
  ['character_config','move_speed'],
  ['character_config','sprint_multiplier'],
  ['character_config','sprint_damage_multiplier'],
  ['monster_types','credits_reward'],
  ['monster_types','reward_min'],
  ['monster_types','reward_max'],
  ['monster_types','spawn_weight'],
  ['profiles','xp'],
  ['profiles','level'],
  ['profiles','equipped_ability_key'],
  ['battle_pass_tiers','reward_ability_key'],
  ['profiles','dismissed_patchnote_id'],
  ['battle_passes','progression_type'],
  ['battle_passes','bp_xp_per_tier'],
  ['battle_passes','bp_xp_cap_per_day'],
  ['battle_passes','visual_config'],
  ['battle_pass_tiers','reward_item_type'],
  ['battle_pass_tiers','bp_xp_required'],
  ['profiles','prio_badges'],
  ['site_config','max_prio_badges'],
  ['user_battle_passes','bp_xp'],
  ['fine_config','nametag_distance_factor'],
  ['fine_config','nametag_height_offset'],
  ['fine_config','mp_position_lerp_rate'],
  ['fine_config','mp_heading_turn_rate'],
  ['fine_config','mp_dead_reckoning_lookahead'],
  ['fine_config','mp_attack_swing_duration'],
  ['fine_config','blood_burst_particle_count'],
  ['fine_config','blood_burst_lifetime_ms'],
  ['fine_config','slash_lifetime_ms'],
  ['fine_config','chat_max_history'],
  ['fine_config','chat_max_message_length'],
  ['fine_config','chat_poll_interval_ms'],
  ['fine_config','community_max_badges_shown'],
];

// Singleton configs — check they have at least 1 row
const SINGLETONS = [
  'mod_permissions','site_config','streak_config','shop_settings','world_config',
  'character_config','global_chat_config','don_config','ai_config','snake_config',
  'plinko_config','kill_streak_config','xp_config','sound_config','mine_config',
  'homepage_chat_config','preview_config','fine_config','game_leaderboard_config','music_config',
];

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  // 1. Load all columns at once
  const { rows: allCols } = await c.query(
    'SELECT table_name, column_name FROM information_schema.columns WHERE table_schema=$1',
    ['public']
  );
  const colSet = new Set(allCols.map(r => r.table_name + '.' + r.column_name));

  // 2. Column checks
  const missingCols = COLS.filter(([t, col]) => !colSet.has(t + '.' + col));

  console.log('\n=== COLUMN CHECKS (' + COLS.length + ' total) ===');
  if (missingCols.length === 0) {
    console.log('✅ All ' + COLS.length + ' columns present');
  } else {
    console.log('❌ MISSING ' + missingCols.length + ' columns:');
    missingCols.forEach(([t, col]) => console.log('   ' + t + '.' + col));
  }

  // 3. Singleton row checks
  console.log('\n=== SINGLETON ROW CHECKS ===');
  const missingRows = [];
  for (const table of SINGLETONS) {
    try {
      const { rows } = await c.query('SELECT COUNT(*) FROM ' + table);
      const cnt = parseInt(rows[0].count);
      if (cnt === 0) missingRows.push(table);
      else process.stdout.write('  ✅ ' + table + ' (' + cnt + ' row)\n');
    } catch (e) {
      console.log('  ❌ ' + table + ': ' + e.message);
      missingRows.push(table);
    }
  }
  if (missingRows.length > 0) {
    console.log('MISSING SINGLETON ROWS:', missingRows.join(', '));
  }

  // 4. profiles columns full list
  const profileCols = allCols.filter(r => r.table_name === 'profiles').map(r => r.column_name);
  console.log('\n=== PROFILES COLUMNS (' + profileCols.length + ') ===');
  console.log(profileCols.sort().join(', '));

  // 5. site_config columns
  const scCols = allCols.filter(r => r.table_name === 'site_config').map(r => r.column_name);
  console.log('\n=== SITE_CONFIG COLUMNS (' + scCols.length + ') ===');
  console.log(scCols.sort().join(', '));

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
