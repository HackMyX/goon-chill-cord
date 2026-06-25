const { Client } = require("pg");
const DB_URL = "postgresql://postgres.dkgcovxypnwpwlfxmknw:kM*%5EX9ka7s15ecjsfBU@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected.");

  const newBadges = [
    { key: "ns_collector", label: "Stil-Sammler",   color: "#c084fc", icon: "Palette",  description: "Besitzt 5+ Name Styles — automatisch vergeben" },
    { key: "ns_ultra",     label: "Stil-Legende",   color: "#f59e0b", icon: "Crown",    description: "Besitzt einen Ultra Name Style — automatisch vergeben" },
    { key: "ns_mythisch",  label: "Stil-Meister",   color: "#a855f7", icon: "Sparkles", description: "Besitzt einen Mythisch Name Style — automatisch vergeben" },
    { key: "grinder",      label: "Grinder",         color: "#f97316", icon: "Flame",    description: "Aktiver Farmer und Grinder — vom Admin vergeben" },
    { key: "season_vet",   label: "Season-Veteran",  color: "#60a5fa", icon: "Star",     description: "War beim Start des Servers dabei — vom Admin vergeben" },
  ];

  for (const b of newBadges) {
    await client.query(
      `INSERT INTO badge_definitions (key, label, color, icon, description)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (key) DO UPDATE SET label=$2, color=$3, icon=$4, description=$5`,
      [b.key, b.label, b.color, b.icon, b.description]
    );
    console.log(`  Upserted badge: ${b.key}`);
  }

  console.log("All badges inserted.");
  await client.end();
}

main().catch(console.error);
