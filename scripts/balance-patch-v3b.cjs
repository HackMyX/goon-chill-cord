"use strict";
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const envFile = path.join(__dirname, "..", ".env.local");
for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
  const m = line.match(/^([^#=\s]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const db = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await db.connect();

  // Name style prices — 75% reduction
  const styles = [
    { rarity: "normal",   base: 12000,    max: 45000    },
    { rarity: "selten",   base: 80000,    max: 300000   },
    { rarity: "mythisch", base: 500000,   max: 2000000  },
    { rarity: "ultra",    base: 3000000,  max: 12000000 },
  ];
  console.log("Name style prices:");
  for (const s of styles) {
    await db.query(
      "UPDATE name_style_rarity_config SET base_shop_price_cr=$1, max_shop_price_cr=$2 WHERE rarity=$3",
      [s.base, s.max, s.rarity]
    );
    console.log("  " + s.rarity + " -> " + s.base + " / " + s.max + " CR");
  }

  // Shop multiplier
  await db.query(
    "UPDATE shop_settings SET auto_generate_price_multiplier_min=$1, auto_generate_price_multiplier_max=$2 WHERE id=$3",
    [1.2, 1.6, "default"]
  );
  console.log("Shop multiplier: 1.5-2.5x -> 1.2-1.6x");

  // World perk cap
  await db.query("UPDATE world_config SET perk_multiplier_cap=$1 WHERE id=$2", [1.0, "default"]);
  console.log("World perk_multiplier_cap: 0.4 -> 1.0");

  await db.end();
  console.log("Done.");
}

run().catch(function(e) { console.error(e.message); db.end(); process.exit(1); });
