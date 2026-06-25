/**
 * Fix plinko_config risk level multipliers: rows=12 creates 13 buckets,
 * so each risk level needs exactly 13 multiplier values.
 */
const { Client } = require("pg");

const FIXED_RISK_LEVELS = [
  { key: "low",    label: "Niedrig", emoji: "🟢", multipliers: [5.0, 2.2, 1.6, 1.3, 1.1, 1.0, 0.9, 1.0, 1.1, 1.3, 1.6, 2.2, 5.0] },
  { key: "medium", label: "Mittel",  emoji: "🟡", multipliers: [20,  12,  5,   2.5, 1.5, 0.7, 0.4, 0.7, 1.5, 2.5, 5,   12,  20 ] },
  { key: "high",   label: "Hoch",    emoji: "🔴", multipliers: [100, 30,  12,  5,   2,   0.4, 0.2, 0.4, 2,   5,   12,  30,  100] },
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Update risk_levels column directly
  await client.query("UPDATE plinko_config SET risk_levels = $1", [JSON.stringify(FIXED_RISK_LEVELS)]);
  console.log("plinko_config risk_levels updated to 13-element arrays.");
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
