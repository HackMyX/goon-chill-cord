const { Client } = require('pg');
const DB = 'postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*^X9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres';

const REQUIRED_TABLES = [
  'profiles','notifications','login_events','device_bans',
  'tickets','ticket_messages','ticket_internal_notes','ticket_rewards','mod_actions','mod_permissions','audit_logs',
  'inventory','items','case_tiers','case_groups',
  'auctions','trades','auction_bids','trade_items',
  'snake_best_scores','snake_config',
  'patch_notes','debug_logs',
  'global_chat_messages','global_chat_config','homepage_chat_config',
  'cleanup_config','ai_config',
  'shop_categories','shop_listings','shop_purchases','shop_settings',
  'monster_types','kill_streak_config','mine_progress',
  'pet_configs','pet_rarity_overrides',
  'don_config','plinko_config','plinko_plays',
  'surveys','survey_questions','survey_answers','survey_responses',
  'polls','poll_options','poll_votes',
  'site_config','streak_config','world_config','character_config',
  'badge_definitions','user_badges',
  'name_styles','user_name_styles','name_style_rarity_config',
  'battle_passes','battle_pass_tiers','user_battle_passes','user_bp_tier_claims',
  'bp_quest_definitions','bp_quests','user_bp_quest_progress',
  'xp_config','xp_events','ability_definitions','user_abilities',
  'sound_config','mine_config','backups'
];

const COLUMN_CHECKS = [
  ['mod_permissions','max_reward_per_ticket'],['mod_permissions','can_pause_tickets'],
  ['profiles','don_upgrade_tier'],['profiles','verified'],['profiles','temp_banned_until'],['profiles','mod_permissions_override'],
  ['don_config','upgrade_enabled'],['don_config','upgrade_tiers'],
  ['global_chat_messages','avatar_url'],
  ['login_events','fingerprint'],
  ['site_config','homepage_config'],['site_config','topbar_show_labels'],['site_config','topbar_right_slots'],['site_config','topbar_button_style'],['site_config','site_version'],
  ['patch_notes','show_popup'],
  ['case_tiers','preview_cost'],['case_tiers','multi_open_max'],['case_tiers','sort_order'],['case_tiers','per_rarity_item_ids'],['case_tiers','name_styles_eligible'],['case_tiers','tier_sublabel'],
  ['shop_settings','motd'],['shop_settings','motd_enabled'],
  ['streak_config','special_event_enabled'],['streak_config','special_event_multiplier'],
  ['world_config','max_alive_monsters'],['world_config','spawn_interval_min_sec'],['world_config','spawn_interval_max_sec'],['world_config','alive_cap_max'],['world_config','alive_cap_per_extra_player'],['world_config','perk_multiplier_cap'],
  ['tickets','reward_pending'],['tickets','escalated_to_admin'],
  ['battle_passes','theme'],['battle_passes','accent_color'],['battle_passes','banner_image_url'],['battle_passes','show_in_shop'],['battle_passes','show_on_dashboard'],
  ['battle_passes','elite_price_cr'],['battle_passes','elite_enabled'],
  ['battle_passes','shop_sort_order'],['battle_passes','shop_position'],['battle_passes','shop_banner_size'],['battle_passes','custom_buy_text'],['battle_passes','custom_elite_buy_text'],['battle_passes','highlight_color'],['battle_passes','show_tier_count_in_shop'],['battle_passes','show_countdown'],['battle_passes','pass_icon'],['battle_passes','updated_at'],['battle_passes','incompatible_with'],
  ['battle_passes','progression_type'],['battle_passes','bp_xp_per_tier'],['battle_passes','bp_xp_cap_per_day'],
  ['battle_pass_tiers','reward_badge_text'],['battle_pass_tiers','reward_item_rarity'],['battle_pass_tiers','reward_xp_boost'],['battle_pass_tiers','reward_quantity'],['battle_pass_tiers','highlight_tier'],['battle_pass_tiers','description'],
  ['battle_pass_tiers','is_elite'],['battle_pass_tiers','reward_name_style_key'],['battle_pass_tiers','reward_ability_key'],['battle_pass_tiers','bp_xp_required'],
  ['user_battle_passes','has_elite'],['user_battle_passes','elite_purchased_at'],['user_battle_passes','bp_xp'],
  ['plinko_config','daily_ball_limit'],['plinko_config','show_history'],['plinko_config','show_leaderboard'],['plinko_config','leaderboard_size'],['plinko_config','min_bet_cr'],['plinko_config','max_bet_cr'],['plinko_config','quick_bet_amounts'],['plinko_config','particles_enabled'],['plinko_config','trail_length'],['plinko_config','glow_intensity'],['plinko_config','animation_speed'],['plinko_config','auto_bet_enabled'],
  ['character_config','attack_cooldown'],['character_config','hp_regen_per_sec'],['character_config','hp_regen_delay_after_hit_sec'],['character_config','pvp_damage_multiplier'],['character_config','perk_multiplier_cap'],['character_config','fist_damage'],['character_config','move_speed'],['character_config','sprint_multiplier'],['character_config','sprint_damage_multiplier'],
  ['monster_types','credits_reward'],['monster_types','reward_min'],['monster_types','reward_max'],['monster_types','spawn_weight'],
  ['profiles','xp'],['profiles','level'],['profiles','equipped_ability_key'],
  ['profiles','active_name_style_key'],['profiles','warning_strikes'],['profiles','warning_note'],
  ['name_styles','available_in_shop'],['name_styles','shop_price_cr'],['name_styles','shop_stock'],['name_styles','shop_expires_at'],['name_styles','shop_sort_order'],
  ['ticket_messages','attachment_url'],
];

const SINGLETON_CONFIGS = [
  { id: 'default', table: 'mod_permissions' },
  { id: 'default', table: 'site_config' },
  { id: 'default', table: 'streak_config' },
  { id: 'default', table: 'shop_settings' },
  { id: 'default', table: 'world_config' },
  { id: 'default', table: 'character_config' },
  { id: 'default', table: 'global_chat_config' },
  { id: 'default', table: 'don_config' },
  { id: 'default', table: 'ai_config' },
  { id: 'default', table: 'snake_config' },
  { id: 'default', table: 'plinko_config' },
  { id: 'default', table: 'kill_streak_config' },
  { id: 'default', table: 'xp_config' },
  { id: 'default', table: 'sound_config' },
  { id: 'default', table: 'mine_config' },
  { id: 'default', table: 'homepage_chat_config' },
];

async function run() {
  const client = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const { rows: tables } = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
  );
  const existingTables = new Set(tables.map(r => r.table_name));

  const { rows: cols } = await client.query(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'"
  );
  const existingCols = new Set(cols.map(r => r.table_name + '.' + r.column_name));

  const missingTables = REQUIRED_TABLES.filter(t => !existingTables.has(t));
  const missingCols = COLUMN_CHECKS.filter(([t, c]) => existingTables.has(t) && !existingCols.has(t + '.' + c));
  const colsOnMissingTable = COLUMN_CHECKS.filter(([t]) => !existingTables.has(t));

  console.log('=== MISSING TABLES ===');
  if (missingTables.length === 0) console.log('NONE');
  else missingTables.forEach(t => console.log('MISSING: ' + t));

  console.log('\n=== MISSING COLUMNS ===');
  if (missingCols.length === 0) console.log('NONE');
  else missingCols.forEach(([t, c]) => console.log('MISSING: ' + t + '.' + c));

  console.log('\n=== COLS BLOCKED (table missing) ===');
  if (colsOnMissingTable.length === 0) console.log('NONE');
  else colsOnMissingTable.forEach(([t, c]) => console.log('BLOCKED: ' + t + '.' + c));

  console.log('\n=== SINGLETON CONFIG ROWS ===');
  for (const s of SINGLETON_CONFIGS) {
    if (!existingTables.has(s.table)) {
      console.log('TABLE MISSING: ' + s.table);
      continue;
    }
    try {
      const res = await client.query('SELECT id FROM ' + s.table + ' LIMIT 1');
      if (res.rows.length === 0) {
        console.log('NO ROW: ' + s.table);
      } else {
        console.log('OK: ' + s.table + ' -> ' + res.rows[0].id);
      }
    } catch (e) {
      console.log('ERROR: ' + s.table + ' ' + e.message);
    }
  }

  await client.end();
}

run().catch(e => { console.error(e); process.exit(1); });
