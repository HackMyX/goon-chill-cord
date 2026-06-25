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
  const snake = await db.query("SELECT * FROM snake_config WHERE id='default'");
  console.log("=== snake_config ===");
  console.log(JSON.stringify(snake.rows[0], null, 2));

  const streak = await db.query("SELECT * FROM streak_config WHERE id='default'");
  console.log("=== streak_config ===");
  console.log(JSON.stringify(streak.rows[0], null, 2));

  const plinko = await db.query("SELECT id, ball_cost, hourly_ball_limit, daily_ball_limit FROM plinko_config WHERE id='default'");
  console.log("=== plinko_config (key cols) ===");
  console.log(JSON.stringify(plinko.rows[0], null, 2));

  await db.end();
}

run().catch(function(e) { console.error(e.message); db.end(); process.exit(1); });
