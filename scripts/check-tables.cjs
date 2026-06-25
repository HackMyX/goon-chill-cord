const { createClient } = require("@supabase/supabase-js");
// Run: SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=sb_secret__... node scripts/check-tables.cjs
const admin = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

const tables = [
  "snake_best_scores","snake_scores","device_bans","fingerprints",
  "battle_passes","battle_pass_tiers","user_battle_passes","user_bp_tier_claims",
  "polls","poll_options","poll_votes",
  "global_chat_messages","global_chat_config",
  "cleanup_config","ai_config","don_config",
  "pet_configs","shop_categories","shop_listings","shop_purchases",
  "monster_types","kill_streak_config","mine_progress","audit_logs",
  "ip_duplicate_ignore","shop_category_day_rules","auction_bids","trade_items",
];

async function check() {
  for (const t of tables) {
    const { error } = await admin.from(t).select("*").limit(0);
    console.log(error ? `MISS  ${t}` : `OK    ${t}`);
  }
}
check();
