/**
 * Fixes user_name_styles_style_key_fkey crashes:
 * 1. Syncs all local NAME_STYLES catalog entries into the name_styles DB table
 * 2. Removes orphaned user_name_styles rows (style_key not in name_styles)
 *
 * Run: DATABASE_URL="..." node scripts/fix-name-style-fk.cjs
 */
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "",
  ssl: { rejectUnauthorized: false },
});

// Must mirror lib/name-styles.ts NAME_STYLES keys that are built-in
const BUILT_IN_STYLES = [
  { key: "default",    label: "Standard",       rarity: "normal",   category: "solid",    color1: "#f4f4f5", animation_type: "none",      animation_speed: 1, glow_radius: 0, unlock_price_cr: 0,       can_win_from_case: false, is_special: false },
  { key: "bold_white", label: "Schneeweiß",     rarity: "normal",   category: "solid",    color1: "#ffffff", animation_type: "none",      animation_speed: 1, glow_radius: 0, unlock_price_cr: 5000,    can_win_from_case: false, is_special: false },
  { key: "steel",      label: "Stahl",          rarity: "normal",   category: "solid",    color1: "#94a3b8", animation_type: "none",      animation_speed: 1, glow_radius: 0, unlock_price_cr: 5000,    can_win_from_case: false, is_special: false },
  { key: "gold",       label: "Gold",           rarity: "normal",   category: "solid",    color1: "#f59e0b", animation_type: "none",      animation_speed: 1, glow_radius: 0, unlock_price_cr: 5000,    can_win_from_case: false, is_special: false },
  { key: "forest",     label: "Waldgrün",       rarity: "normal",   category: "solid",    color1: "#22c55e", animation_type: "none",      animation_speed: 1, glow_radius: 0, unlock_price_cr: 5000,    can_win_from_case: false, is_special: false },
  { key: "neon_blue",  label: "Neon-Blau",      rarity: "selten",   category: "glow",     color1: "#38bdf8", animation_type: "pulse",     animation_speed: 1, glow_color: "#38bdf8", glow_radius: 6, unlock_price_cr: 32000, can_win_from_case: true, is_special: false },
  { key: "neon_green", label: "Neon-Grün",      rarity: "selten",   category: "glow",     color1: "#4ade80", animation_type: "pulse",     animation_speed: 1, glow_color: "#4ade80", glow_radius: 6, unlock_price_cr: 32000, can_win_from_case: true, is_special: false },
  { key: "neon_pink",  label: "Neon-Pink",      rarity: "selten",   category: "glow",     color1: "#f472b6", animation_type: "pulse",     animation_speed: 1, glow_color: "#f472b6", glow_radius: 6, unlock_price_cr: 32000, can_win_from_case: true, is_special: false },
  { key: "ice",        label: "Eis",            rarity: "selten",   category: "gradient", color1: "#bae6fd", color2: "#7dd3fc", animation_type: "shimmer", animation_speed: 1.2, glow_radius: 0, unlock_price_cr: 32000, can_win_from_case: true, is_special: false },
  { key: "ember",      label: "Ember",          rarity: "selten",   category: "gradient", color1: "#fb923c", color2: "#ef4444", animation_type: "shimmer", animation_speed: 1.2, glow_radius: 0, unlock_price_cr: 32000, can_win_from_case: true, is_special: false },
  { key: "aqua",       label: "Aqua",           rarity: "selten",   category: "gradient", color1: "#22d3ee", color2: "#06b6d4", animation_type: "wave",    animation_speed: 1,   glow_radius: 0, unlock_price_cr: 32000, can_win_from_case: true, is_special: false },
  { key: "toxic",      label: "Toxic",          rarity: "selten",   category: "animated", color1: "#a3e635", color2: "#65a30d", animation_type: "flicker", animation_speed: 2,   glow_color: "#a3e635", glow_radius: 4, unlock_price_cr: 32000, can_win_from_case: true, is_special: false },
  { key: "dark_angel", label: "Dark Angel",     rarity: "selten",   category: "solid",    color1: "#6366f1", animation_type: "shimmer",   animation_speed: 0.8, glow_color: "#6366f1", glow_radius: 5, unlock_price_cr: 32000, can_win_from_case: true, is_special: false },
  { key: "inferno",    label: "Inferno",        rarity: "mythisch", category: "animated", color1: "#ff4500", color2: "#ff8c00", color3: "#ffff00", animation_type: "rainbow", animation_speed: 0.8, glow_color: "#ff4500", glow_radius: 10, unlock_price_cr: 135000, can_win_from_case: true, is_special: false },
  { key: "galaxy",     label: "Galaxis",        rarity: "mythisch", category: "animated", color1: "#8b5cf6", color2: "#3b82f6", color3: "#06b6d4", animation_type: "prismatic", animation_speed: 1, glow_color: "#8b5cf6", glow_radius: 8, unlock_price_cr: 135000, can_win_from_case: true, is_special: false },
  { key: "thunder",    label: "Donner",         rarity: "mythisch", category: "animated", color1: "#fcd34d", color2: "#f59e0b", animation_type: "glitch",  animation_speed: 2, glow_color: "#fcd34d", glow_radius: 8, unlock_price_cr: 135000, can_win_from_case: true, is_special: false },
  { key: "matrix",     label: "Matrix",         rarity: "mythisch", category: "animated", color1: "#00ff41", animation_type: "matrix",    animation_speed: 1.5, glow_color: "#00ff41", glow_radius: 10, unlock_price_cr: 135000, can_win_from_case: true, is_special: false },
  { key: "spectre",    label: "Spectre",        rarity: "mythisch", category: "animated", color1: "#e2e8f0", color2: "#94a3b8", animation_type: "hologram", animation_speed: 1.2, glow_color: "#e2e8f0", glow_radius: 6, unlock_price_cr: 135000, can_win_from_case: true, is_special: false },
  { key: "blood_moon", label: "Blutmond",       rarity: "mythisch", category: "animated", color1: "#dc2626", color2: "#7f1d1d", animation_type: "pulse",  animation_speed: 0.6, glow_color: "#dc2626", glow_radius: 12, unlock_price_cr: 135000, can_win_from_case: true, is_special: false },
  { key: "obfuscated", label: "Obfuskiert",     rarity: "mythisch", category: "special",  color1: "#ffffff", animation_type: "obfuscated", animation_speed: 3, glow_radius: 0, unlock_price_cr: 135000, can_win_from_case: true, is_special: false },
  { key: "glitch",     label: "Glitch",         rarity: "mythisch", category: "animated", color1: "#ff00ff", color2: "#00ffff", animation_type: "glitch", animation_speed: 3, glow_color: "#ff00ff", glow_radius: 8, unlock_price_cr: 135000, can_win_from_case: true, is_special: false },
  { key: "rainbow",    label: "Regenbogen",     rarity: "ultra",    category: "animated", color1: "#ff0000", color2: "#ff8800", color3: "#ffff00", color4: "#00ff00", animation_type: "rainbow", animation_speed: 1, glow_color: "#ff00ff", glow_radius: 14, unlock_price_cr: 560000, can_win_from_case: true, is_special: false },
  { key: "void",       label: "Leere",          rarity: "ultra",    category: "animated", color1: "#000000", color2: "#1e1b4b", animation_type: "prismatic", animation_speed: 0.5, glow_color: "#4f46e5", glow_radius: 18, unlock_price_cr: 560000, can_win_from_case: true, is_special: false },
  { key: "divine",     label: "Göttlich",       rarity: "ultra",    category: "animated", color1: "#fef9c3", color2: "#fde047", color3: "#ffffff", animation_type: "hologram", animation_speed: 0.7, glow_color: "#fef9c3", glow_radius: 20, unlock_price_cr: 560000, can_win_from_case: true, is_special: false },
  { key: "rgb_wave",   label: "RGB-Welle",      rarity: "ultra",    category: "animated", color1: "#ff0000", color2: "#00ff00", color3: "#0000ff", animation_type: "rgb_wave", animation_speed: 1, glow_radius: 0, unlock_price_cr: 560000, can_win_from_case: true, is_special: false },
  { key: "chaos",      label: "Chaos",          rarity: "ultra",    category: "animated", color1: "#ff0000", color2: "#00ff00", color3: "#0000ff", color4: "#ff00ff", animation_type: "glitch", animation_speed: 5, glow_color: "#ff0000", glow_radius: 16, unlock_price_cr: 560000, can_win_from_case: true, is_special: false },
  { key: "abyss",      label: "Abgrund",        rarity: "ultra",    category: "animated", color1: "#0f0f23", color2: "#1a0533", animation_type: "prismatic", animation_speed: 0.4, glow_color: "#7c3aed", glow_radius: 20, unlock_price_cr: 560000, can_win_from_case: true, is_special: false },
  // Special / admin-only
  { key: "admin",      label: "Admin",          rarity: "normal",   category: "special",  color1: "#ef4444", animation_type: "none",  animation_speed: 1, glow_color: "#ef4444", glow_radius: 8, unlock_price_cr: 0, can_win_from_case: false, is_special: true },
  { key: "mod",        label: "Moderator",      rarity: "normal",   category: "special",  color1: "#38bdf8", animation_type: "none",  animation_speed: 1, glow_color: "#38bdf8", glow_radius: 6, unlock_price_cr: 0, can_win_from_case: false, is_special: true },
  { key: "warned",     label: "Verwarnt",       rarity: "normal",   category: "special",  color1: "#f59e0b", animation_type: "pulse", animation_speed: 1, glow_color: "#f59e0b", glow_radius: 4, unlock_price_cr: 0, can_win_from_case: false, is_special: true },
];

async function run() {
  const client = await pool.connect();
  try {
    console.log("🔧 Syncing built-in NAME_STYLES to name_styles DB table…");
    let synced = 0;
    for (const style of BUILT_IN_STYLES) {
      const { rowCount } = await client.query(
        `INSERT INTO name_styles (
          key, label, rarity, category, color1, color2, color3, color4,
          animation_type, animation_speed, glow_color, glow_radius,
          unlock_price_cr, can_win_from_case, is_special
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
        )
        ON CONFLICT (key) DO NOTHING`,
        [
          style.key, style.label, style.rarity, style.category,
          style.color1, style.color2 ?? null, style.color3 ?? null, style.color4 ?? null,
          style.animation_type, style.animation_speed,
          style.glow_color ?? null, style.glow_radius,
          style.unlock_price_cr, style.can_win_from_case, style.is_special,
        ]
      );
      if (rowCount > 0) { console.log(`  ✅ Inserted: ${style.key}`); synced++; }
    }
    console.log(`✅ ${synced} new styles synced (${BUILT_IN_STYLES.length - synced} already existed)`);

    // Remove orphaned user_name_styles rows
    const { rows: orphans } = await client.query(`
      SELECT uns.user_id, uns.style_key
      FROM user_name_styles uns
      LEFT JOIN name_styles ns ON ns.key = uns.style_key
      WHERE ns.key IS NULL
    `);

    if (orphans.length === 0) {
      console.log("✅ No orphaned user_name_styles rows found.");
    } else {
      console.log(`⚠️  Found ${orphans.length} orphaned rows — removing…`);
      for (const r of orphans) {
        console.log(`   Removing: user=${r.user_id} style_key=${r.style_key}`);
      }
      const { rowCount: removed } = await client.query(`
        DELETE FROM user_name_styles
        WHERE style_key NOT IN (SELECT key FROM name_styles)
      `);
      console.log(`✅ Removed ${removed} orphaned rows.`);
    }

    console.log("\n✅ FK fix complete. Foreign-key constraint should no longer crash.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e) => { console.error("❌", e.message); process.exit(1); });
