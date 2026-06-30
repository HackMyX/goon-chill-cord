require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "", ssl: { rejectUnauthorized: false } });
const rows = [
  ["imp_scout","Kobold",64,11,6.4,12,1.4,0.8,20,32,16,"#b91c1c",true],
  ["spider_giant","Riesenspinne",130,19,6.8,13,1.7,0.7,48,74,12,"#3b2f4a",true],
  ["golem_stone","Steingolem",360,33,4.7,11,2.1,1.3,95,150,7,"#6b7280",true],
  ["imp_hellfire","Höllen-Imp",120,20,6.9,14,1.5,0.7,55,85,8,"#ea580c",true],
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
         ON CONFLICT (id) DO NOTHING`,
        r
      );
      added += res.rowCount;
      console.log(`${r[0]}: ${res.rowCount ? "neu eingefügt" : "existiert bereits (übersprungen)"}`);
    }
    console.log(`✅ ${added} neue Monster-Typen geseedet.`);
  } catch (e) { console.error("ERR:", e.message); process.exitCode = 1; }
  finally { c.release(); await pool.end(); }
})();
