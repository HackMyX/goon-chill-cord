// scripts/rebalance-plinko.cjs
// Rebalances the LIVE plinko_config so the house has a healthy edge again.
// The previous multipliers were player-favoured (binomial-weighted RTP ≈ 106 %
// low, 123 % medium, 183 % high → the house LOST credits on every risk level).
// New arrays are tuned to ~94–96 % RTP (4–6 % house edge), variance rising
// low→high. 12 rows → 13 buckets. Idempotent. Run: node scripts/rebalance-plinko.cjs

const { Client } = require("pg");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

// Binomial weights for 12 rows (C(12,k)), used to verify RTP below.
const W = [1, 12, 66, 220, 495, 792, 924, 792, 495, 220, 66, 12, 1];
const TOTAL = 4096;

const RISK_LEVELS = [
  { key: "low",    label: "Niedrig", emoji: "🟢", multipliers: [4,   1.9, 1.4, 1.15, 1.0, 0.9, 0.8, 0.9, 1.0, 1.15, 1.4, 1.9, 4  ] },
  { key: "medium", label: "Mittel",  emoji: "🟡", multipliers: [25,  6,   2.6, 1.5,  1.1, 0.7, 0.5, 0.7, 1.1, 1.5,  2.6, 6,   25 ] },
  { key: "high",   label: "Hoch",    emoji: "🔴", multipliers: [120, 22,  6,   2.5,  0.6, 0.3, 0.2, 0.3, 0.6, 2.5,  6,   22,  120] },
];

function rtp(mults) {
  return mults.reduce((s, m, i) => s + m * W[i], 0) / TOTAL;
}

async function main() {
  // Sanity: confirm each level is house-positive before writing.
  for (const r of RISK_LEVELS) {
    if (r.multipliers.length !== 13) throw new Error(`${r.key}: need 13 multipliers, got ${r.multipliers.length}`);
    const e = rtp(r.multipliers);
    console.log(`  ${r.key.padEnd(7)} RTP = ${(e * 100).toFixed(1)} %  (house edge ${((1 - e) * 100).toFixed(1)} %)  max ${Math.max(...r.multipliers)}x`);
    if (e >= 1) throw new Error(`${r.key}: RTP ${(e * 100).toFixed(1)}% is player-favoured — refusing to write.`);
  }

  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      `UPDATE plinko_config
         SET risk_levels = $1::jsonb,
             rows = 12,
             updated_at = now()
       WHERE id = 'default'`,
      [JSON.stringify(RISK_LEVELS)],
    );
    if (rowCount === 0) {
      console.log("ℹ️  Kein plinko_config-Eintrag — Spiel nutzt die (bereits balancierten) Code-Defaults.");
    } else {
      console.log("✅  plinko_config rebalanciert (risk_levels + rows=12).");
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
