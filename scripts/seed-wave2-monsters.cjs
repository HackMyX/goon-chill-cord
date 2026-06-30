require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "", ssl: { rejectUnauthorized: false } });
const rows = [
  ["bat_swarm","Fledermaus",40,9,7.2,13,1.3,0.7,12,20,18,"#4b5563",true],
  ["wisp_caster","Irrlicht",72,10,5.8,15,1.4,1.0,28,44,10,"#38bdf8",true],
  ["brute_troll","Troll",240,28,4.9,11,2.0,1.25,70,110,9,"#5b7553",true],
  ["spider_venom","Giftspinne",200,24,6.5,13,1.8,0.75,65,95,8,"#14532d",true],
  ["golem_ice","Eis-Golem",300,30,4.6,11,2.0,1.25,85,130,7,"#60a5fa",true],
  ["boss_reaper","Seelenschnitter",900,50,5.2,18,2.3,1.0,300,460,0,"#312e81",true],
  ["boss_titan","Erd-Titan",1500,66,4.3,15,2.7,1.4,480,720,0,"#57534e",true],
];
(async () => {
  const c = await pool.connect();
  try {
    let added = 0;
    for (const r of rows) {
      const res = await c.query(
        `INSERT INTO monster_types
          (id,name,health,attack_damage,move_speed,aggro_range,attack_range,attack_cooldown,reward_min,reward_max,spawn_weight,color_hex,enabled,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
         ON CONFLICT (id) DO NOTHING`, r);
      added += res.rowCount;
      console.log(`${r[0]}: ${res.rowCount ? "neu" : "existiert"}`);
    }
    console.log(`✅ ${added} Typen geseedet.`);
  } catch (e) { console.error("ERR:", e.message); process.exitCode = 1; }
  finally { c.release(); await pool.end(); }
})();
