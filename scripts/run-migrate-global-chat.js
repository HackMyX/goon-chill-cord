const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const sql = fs.readFileSync(path.join(__dirname, "migrate-global-chat.sql"), "utf8");
  await client.query(sql);
  console.log("Global chat migration OK");
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
