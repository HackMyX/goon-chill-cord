// ─────────────────────────────────────────────────────────────────────────────
// Bereinigt die Farb-Item-Duplikate: entfernt Seltenheits-PRÄFIXE aus allen
// Item-Namen und führt danach exakte Doppel (gleicher Typ + Name + Seltenheit)
// zusammen. Seltenheits-STUFEN bleiben erhalten (z.B. "Gelbe Hose" bleibt in
// normal/selten/mythisch bestehen — nur die Präfix-Doppel je Seltenheit fallen weg).
//
// Hängt ALLE Referenzen sicher um (inventory, auctions, shop_listings,
// battle_pass_tiers.reward_item_id, case_tiers.item_ids/per_rarity_item_ids,
// trades.offered/requested_item_ids) BEVOR Items gelöscht werden — kein Spieler
// verliert ein Item. Läuft in EINER Transaktion (atomar).
//
// Dry-Run (zeigt nur, was passieren würde):  node scripts/dedupe-color-items.cjs
// Wirklich anwenden:                          node scripts/dedupe-color-items.cjs --apply
// ─────────────────────────────────────────────────────────────────────────────
require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "", ssl: { rejectUnauthorized: false } });

const APPLY = process.argv.includes("--apply");

const PREFIXES = [
  "Ungewöhnliche", "Ungewöhnlicher", "Ungewöhnliches",
  "Seltene", "Seltener", "Seltenes",
  "Epische", "Epischer", "Episches",
  "Legendäre", "Legendärer", "Legendäres",
  "Mythische", "Mythischer", "Mythisches",
];
function strip(name) {
  let n = (name || "").trim();
  for (const p of PREFIXES) { if (n.startsWith(p + " ")) { n = n.slice(p.length + 1).trim(); break; } }
  return n;
}

(async () => {
  const c = await pool.connect();
  try {
    const { rows: items } = await c.query("SELECT id, name, type, rarity FROM items");

    // Gruppen nach (type, stripped, rarity)
    const groups = new Map();
    for (const it of items) {
      const k = `${it.type}::${strip(it.name)}::${it.rarity}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(it);
    }

    const remap = [];          // { old, new }
    const rename = [];         // { id, name }
    for (const g of groups.values()) {
      // Survivor: bevorzugt das Item, dessen Name bereits präfixfrei ist.
      g.sort((a, b) => {
        const aClean = strip(a.name) === a.name ? 0 : 1;
        const bClean = strip(b.name) === b.name ? 0 : 1;
        return aClean - bClean || String(a.id).localeCompare(String(b.id));
      });
      const survivor = g[0];
      const stripped = strip(survivor.name);
      if (survivor.name !== stripped) rename.push({ id: survivor.id, name: stripped });
      for (const dropped of g.slice(1)) remap.push({ old: dropped.id, new: survivor.id });
    }
    // Einzel-Items (keine Gruppe) mit Präfix ebenfalls umbenennen
    for (const it of items) {
      const s = strip(it.name);
      if (s !== it.name && !rename.find((r) => r.id === it.id) && !remap.find((r) => r.old === it.id)) {
        rename.push({ id: it.id, name: s });
      }
    }

    console.log(`Items: ${items.length} | Gruppen: ${groups.size} | zu löschen (Doppel): ${remap.length} | umzubenennen: ${rename.length}`);
    if (!APPLY) {
      console.log("\nDRY-RUN — nichts geändert. Mit --apply ausführen.");
      const sample = [...groups.values()].filter((g) => g.length > 1).slice(0, 2);
      for (const g of sample) console.log(`  Beispiel ${strip(g[0].name)} [${g[0].rarity}]: behalte 1, lösche ${g.length - 1}`);
      return;
    }

    await c.query("BEGIN");
    const oldIds = remap.map((r) => r.old);
    const newIds = remap.map((r) => r.new);

    // Temp-Remap-Tabelle
    await c.query("CREATE TEMP TABLE item_remap(old uuid, new uuid) ON COMMIT DROP");
    if (remap.length) {
      await c.query("INSERT INTO item_remap(old, new) SELECT * FROM unnest($1::uuid[], $2::uuid[])", [oldIds, newIds]);
    }

    // Einfache FK-Spalten umhängen
    const r1 = await c.query("UPDATE inventory i SET item_id = r.new FROM item_remap r WHERE i.item_id = r.old");
    const r2 = await c.query("UPDATE auctions a SET item_id = r.new FROM item_remap r WHERE a.item_id = r.old");
    // shop_listings: erst Konflikt-Doppel löschen (falls new schon gelistet), dann umhängen
    await c.query("DELETE FROM shop_listings sl USING item_remap r WHERE sl.item_id = r.old AND EXISTS (SELECT 1 FROM shop_listings s2 WHERE s2.item_id = r.new)");
    const r3 = await c.query("UPDATE shop_listings sl SET item_id = r.new FROM item_remap r WHERE sl.item_id = r.old");
    // battle_pass_tiers.reward_item_id ist TEXT
    const r4 = await c.query("UPDATE battle_pass_tiers t SET reward_item_id = r.new::text FROM item_remap r WHERE t.reward_item_id = r.old::text");
    console.log(`  inventory:${r1.rowCount} auctions:${r2.rowCount} shop_listings:${r3.rowCount} bp_tiers:${r4.rowCount}`);

    const map = new Map(remap.map((r) => [String(r.old), String(r.new)]));

    // case_tiers: item_ids (array) + per_rarity_item_ids (jsonb)
    const { rows: tiers } = await c.query("SELECT id, item_ids, per_rarity_item_ids FROM case_tiers");
    let tiersChanged = 0;
    for (const t of tiers) {
      let changed = false;
      let ids = Array.isArray(t.item_ids) ? t.item_ids.slice() : null;
      if (ids) {
        const mapped = ids.map((x) => map.get(String(x)) ?? x);
        const deduped = [...new Set(mapped)];
        if (JSON.stringify(deduped) !== JSON.stringify(ids)) { ids = deduped; changed = true; }
      }
      let per = t.per_rarity_item_ids;
      if (per && typeof per === "object") {
        per = JSON.parse(JSON.stringify(per));
        for (const k of Object.keys(per)) {
          if (Array.isArray(per[k])) {
            const mapped = per[k].map((x) => map.get(String(x)) ?? x);
            const deduped = [...new Set(mapped)];
            if (JSON.stringify(deduped) !== JSON.stringify(per[k])) { per[k] = deduped; changed = true; }
          }
        }
      }
      if (changed) {
        await c.query("UPDATE case_tiers SET item_ids = $1, per_rarity_item_ids = $2 WHERE id = $3",
          [ids, per, t.id]);
        tiersChanged++;
      }
    }

    // trades: offered/requested_item_ids (arrays) — Anzahl bewahren (kein Dedupe)
    const { rows: trades } = await c.query("SELECT id, offered_item_ids, requested_item_ids FROM trades");
    let tradesChanged = 0;
    for (const tr of trades) {
      const off = Array.isArray(tr.offered_item_ids) ? tr.offered_item_ids.map((x) => map.get(String(x)) ?? x) : tr.offered_item_ids;
      const req = Array.isArray(tr.requested_item_ids) ? tr.requested_item_ids.map((x) => map.get(String(x)) ?? x) : tr.requested_item_ids;
      if (JSON.stringify(off) !== JSON.stringify(tr.offered_item_ids) || JSON.stringify(req) !== JSON.stringify(tr.requested_item_ids)) {
        await c.query("UPDATE trades SET offered_item_ids = $1, requested_item_ids = $2 WHERE id = $3", [off, req, tr.id]);
        tradesChanged++;
      }
    }
    console.log(`  case_tiers geändert:${tiersChanged} trades geändert:${tradesChanged}`);

    // Umbenennen (Präfixe entfernen)
    if (rename.length) {
      await c.query("CREATE TEMP TABLE name_remap(id uuid, name text) ON COMMIT DROP");
      await c.query("INSERT INTO name_remap(id, name) SELECT * FROM unnest($1::uuid[], $2::text[])",
        [rename.map((r) => r.id), rename.map((r) => r.name)]);
      const rn = await c.query("UPDATE items i SET name = n.name FROM name_remap n WHERE i.id = n.id");
      console.log(`  umbenannt:${rn.rowCount}`);
    }

    // Duplikate löschen (alle Referenzen sind umgehängt)
    if (oldIds.length) {
      const del = await c.query("DELETE FROM items WHERE id = ANY($1::uuid[])", [oldIds]);
      console.log(`  Items gelöscht:${del.rowCount}`);
    }

    await c.query("COMMIT");
    console.log("✅ Fertig (committed).");
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch { /* ignore */ }
    console.error("ERR — ROLLBACK:", e.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
