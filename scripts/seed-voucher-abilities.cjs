// Vorkonfigurierte „Fähigkeits-Gutscheine" — kleinere/normale Boosts in vielen
// Varianten (auch für die bisher presetlosen Effekt-Typen). Theme=auto (folgt der
// Seltenheit). Idempotent (ON CONFLICT key). Überschreibt KEINE bestehenden (v_ Prefix).
const { Client } = require("pg");
const DB_URL = process.env.DATABASE_URL || "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

// [key, name, desc, category, effect_type, value, ability_rarity, icon, price, card_rarity]
const P = [
  ["v_credit_s","Credit-Gutschein (klein)","+3% Credits aus allen Spiel-Erträgen.","global","credit_bonus",0.03,"selten","Coins",8000,"normal"],
  ["v_credit_m","Credit-Gutschein","+7% Credits aus allen Spiel-Erträgen.","global","credit_bonus",0.07,"selten","Coins",18000,"selten"],
  ["v_credit_l","Credit-Gutschein (groß)","+12% Credits aus allen Spiel-Erträgen.","global","credit_bonus",0.12,"mythisch","Coins",40000,"episch"],
  ["v_xp_s","XP-Gutschein (klein)","+10% XP aus allen Quellen.","global","xp_boost",0.10,"selten","Sparkles",8000,"normal"],
  ["v_xp_m","XP-Gutschein","+20% XP aus allen Quellen.","global","xp_boost",0.20,"selten","Sparkles",18000,"selten"],
  ["v_xp_l","XP-Gutschein (Mega)","+35% XP aus allen Quellen.","global","xp_boost",0.35,"mythisch","Sparkles",45000,"mythisch"],
  ["v_case_luck","Glücks-Gutschein (Cases)","+3% Chance auf eine Stufe höhere Case-Auslosung.","global","case_luck",0.03,"mythisch","Clover",30000,"episch"],
  ["v_streak_mult","Streak-Bonus-Gutschein","+10% auf die tägliche Streak-Belohnung.","global","streak_reward_multiplier",0.10,"selten","Flame",15000,"selten"],
  ["v_streak_grace","Streak-Gnade-Gutschein","+6 Stunden Kulanzzeit, bevor der Streak bricht.","global","streak_grace_hours",6,"selten","Clock",12000,"normal"],
  ["v_mine_cr","Mine-Gutschein (klein)","+10% Credits aus der Mine.","mine","mine_cr_bonus",0.10,"selten","Pickaxe",10000,"normal"],
  ["v_mine_storage","Lager-Gutschein +4h","Erhöht die Mine-Lagerkapazität um 4 Stunden.","mine","mine_storage_hours",4,"selten","Package",9000,"normal"],
  ["v_mine_storage_mult","Lager-Multiplikator-Gutschein","+15% maximale Mine-Lagerkapazität.","mine","mine_storage_multiplier",0.15,"selten","Package",16000,"selten"],
  ["v_mine_double","Doppel-Chance-Gutschein","+8% Chance auf doppelte Mine-Abholung.","mine","mine_double_chance",0.08,"selten","Gem",14000,"selten"],
  ["v_mine_jackpot","Mine-Jackpot-Gutschein","+3% Chance, dass eine Abholung 3× zahlt.","mine","mine_jackpot_chance",0.03,"mythisch","Dice5",28000,"episch"],
  ["v_snake_apple","Apfel-Gutschein","+1 Credit pro gegessenem Apfel (Snake).","snake","snake_cr_per_apple",1,"selten","Apple",7000,"normal"],
  ["v_snake_score","Snake-Score-Gutschein","+10% Credits eines Snake-Laufs.","snake","snake_score_multiplier",0.10,"selten","Gauge",15000,"selten"],
  ["v_plinko_boost","Plinko-Boost-Gutschein","+3% auf alle Plinko-Multiplikatoren.","plinko","plinko_multiplier_boost",0.03,"selten","Target",10000,"normal"],
  ["v_plinko_min","Plinko-Mindest-Gutschein","Garantiert mind. 0,5× Ergebnis-Multiplikator.","plinko","plinko_min_multiplier",0.5,"selten","Target",16000,"selten"],
  ["v_plinko_cushion","Plinko-Polster-Gutschein","Erstattet 10% des Einsatzes bei jedem Verlust-Wurf.","plinko","plinko_loss_cushion",0.10,"mythisch","Shield",22000,"episch"],
  ["v_don_flips","DON-Flip-Gutschein","+2 Extra-Flips über dem Limit.","don","don_bonus_flips",2,"selten","Coins",9000,"normal"],
  ["v_don_refund","DON-Rückgabe-Gutschein","Erstattet 20% des Einsatzes bei verlorenem Flip.","don","don_loss_refund",0.20,"mythisch","RotateCcw",20000,"episch"],
  ["v_don_shield","DON-Schild-Gutschein","Einmal pro Tag wird ein DON-Verlust ignoriert.","don","don_daily_shield",1,"mythisch","Shield",26000,"mythisch"],
  ["v_world_dmg","Welt-Schaden-Gutschein","+8% Kampfschaden in der Welt.","world","world_damage_boost",0.08,"selten","Swords",12000,"selten"],
  ["v_world_xp","Welt-XP-Gutschein","+15% XP aus Welt-Kills.","world","world_xp_boost",0.15,"selten","Sword",11000,"selten"],
  ["v_world_regen","Welt-Regen-Gutschein","+15% HP-Regeneration in der Welt.","world","world_hp_regen",0.15,"selten","Heart",11000,"selten"],
];

(async () => {
  const c = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  let n = 0, base = 200;
  for (const [key,name,desc,cat,et,val,rar,icon,price,cardRar] of P) {
    await c.query(
      `INSERT INTO ability_definitions
        (key,name,description,category,effect_type,effect_value,effect_config,rarity,icon,shop_price_cr,available_in_shop,can_drop_from_cases,enabled,sort_order,card_theme,card_rarity)
       VALUES ($1,$2,$3,$4,$5,$6,'{}'::jsonb,$7,$8,$9,false,false,true,$10,'auto',$11)
       ON CONFLICT (key) DO UPDATE SET
        name=EXCLUDED.name, description=EXCLUDED.description, category=EXCLUDED.category,
        effect_type=EXCLUDED.effect_type, effect_value=EXCLUDED.effect_value, rarity=EXCLUDED.rarity,
        icon=EXCLUDED.icon, shop_price_cr=EXCLUDED.shop_price_cr, card_theme=EXCLUDED.card_theme, card_rarity=EXCLUDED.card_rarity`,
      [key,name,desc,cat,et,val,rar,icon,price,base+n,cardRar]
    );
    n++;
  }
  console.log(`✅ ${n} Fähigkeits-Gutschein-Presets eingespielt (Theme=auto, card_rarity gesetzt).`);
  await c.end();
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
