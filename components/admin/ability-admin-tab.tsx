"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Save, RefreshCw, AlertTriangle, CheckCircle2, Zap, Users, X } from "lucide-react";
import type { AbilityDefinition, AbilityCategory, AbilityEffectType, AbilityRarity } from "@/lib/abilities";
import {
  ABILITY_CATEGORY_LABELS, ABILITY_CATEGORY_COLORS,
  ABILITY_RARITY_COLORS, ABILITY_RARITY_LABELS,
  ABILITY_EFFECT_META, ABILITY_EFFECT_UNIT_HINT,
} from "@/lib/abilities";
import {
  getAllAbilityDefinitions, adminUpsertAbilityDefinition,
  adminDeleteAbilityDefinition, adminRevokeAbility, getUserAbilities,
} from "@/lib/actions/abilities";
import {
  AUTO_THEME, AUTO_RARITY,
  BONUS_CARD_THEME_LIST, BONUS_CARD_RARITY_LIST,
} from "@/lib/bonus-card-themes";
import { AbilityVoucherCard } from "@/components/rewards/ability-voucher-card";

interface AbilityAdminTabProps {
  profiles: { id: string; username: string }[];
}

// Derived from the single source of truth — new effect types appear automatically.
const EFFECT_TYPES = Object.keys(ABILITY_EFFECT_META) as AbilityEffectType[];
// Gültige effectConfig-Kombo-Keys = alle Effekt-Typ-Namen + die Mine-Sonder-Keys.
const EFFECT_CONFIG_KEYS: string[] = [...EFFECT_TYPES, "storage_bonus", "double_chance", "upgrade_discount"];
const effectConfigKeyLabel = (k: string): string =>
  (ABILITY_EFFECT_META as Record<string, { label?: string }>)[k]?.label ?? k;
const CATEGORIES: AbilityCategory[] = ["mine", "snake", "plinko", "don", "world", "global"];
// Effect types grouped by their category for the <optgroup> selector.
const EFFECTS_BY_CATEGORY = CATEGORIES.map((cat) => ({
  cat,
  types: EFFECT_TYPES.filter((t) => ABILITY_EFFECT_META[t].category === cat),
})).filter((g) => g.types.length > 0);
const RARITIES: AbilityRarity[] = ["selten", "mythisch", "ultra"];

const BLANK: Partial<AbilityDefinition> & { key: string } = {
  key: "", name: "", description: "", category: "global", effectType: "xp_boost",
  effectValue: 0, effectConfig: {}, rarity: "selten", icon: "Zap",
  shopPriceCr: 0, availableInShop: false, canDropFromCases: true, enabled: true, sortOrder: 0,
};

export function AbilityAdminTab({ profiles }: AbilityAdminTabProps) {
  const [abilities, setAbilities] = useState<AbilityDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<(Partial<AbilityDefinition> & { key: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // User inventory modal
  const [viewUserId, setViewUserId] = useState("");
  const [userInventory, setUserInventory] = useState<{ id: string; abilityKey: string; source: string; acquiredAt: string }[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  useEffect(() => {
    getAllAbilityDefinitions().then((d) => { setAbilities(d); setLoading(false); });
  }, []);

  async function handleSave() {
    if (!editing || !editing.key) { setSaveMsg("❌ Key fehlt"); return; }
    setSaving(true); setSaveMsg("");
    const result = await adminUpsertAbilityDefinition(editing);
    setSaving(false);
    if (result.success) {
      setSaveMsg("✅ Gespeichert!");
      setTimeout(() => setSaveMsg(""), 2000);
      const fresh = await getAllAbilityDefinitions();
      setAbilities(fresh);
      setEditing(null);
    } else {
      setSaveMsg(`❌ ${result.error}`);
    }
  }

  async function handleDelete(key: string) {
    if (!confirm(`Fähigkeits-Gutschein "${key}" wirklich löschen?`)) return;
    const result = await adminDeleteAbilityDefinition(key);
    if (result.success) {
      setAbilities((prev) => prev.filter((a) => a.key !== key));
    } else {
      alert(result.error);
    }
  }

  async function handleLoadInventory() {
    if (!viewUserId) return;
    setInventoryLoading(true);
    const items = await getUserAbilities(viewUserId);
    setUserInventory(items.map((i) => ({ id: i.id, abilityKey: i.abilityKey, source: i.source, acquiredAt: i.acquiredAt })));
    setInventoryLoading(false);
  }

  async function handleRevoke(userAbilityId: string) {
    const res = await adminRevokeAbility(userAbilityId);
    if (res.success) {
      setUserInventory((prev) => prev.filter((i) => i.id !== userAbilityId));
    } else {
      alert(res.error);
    }
  }

  if (loading) return (
    <div className="flex items-center gap-2 py-8 text-zinc-500">
      <RefreshCw className="h-4 w-4 animate-spin" /> Lade Fähigkeits-Gutscheine…
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-400" />
          <h2 className="text-base font-bold text-zinc-100">Fähigkeits-Gutscheine</h2>
        </div>
        <button
          onClick={() => setEditing({ ...BLANK })}
          className="flex items-center gap-1.5 rounded-xl bg-purple-600/80 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-500"
        >
          <Plus className="h-3.5 w-3.5" /> Neuer Fähigkeits-Gutschein
        </button>
      </div>

      {/* Ability grid */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {abilities.map((a) => (
          <div key={a.key} id={`ability-row-${a.key}`} className="scroll-mt-20 rounded-xl border border-white/8 bg-white/[0.02] p-4">
            <div className="mb-2 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-zinc-100">{a.name}</span>
                  <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${ABILITY_RARITY_COLORS[a.rarity]}`}>
                    {ABILITY_RARITY_LABELS[a.rarity]}
                  </span>
                </div>
                <span className={`mt-0.5 inline-block rounded-md border px-1.5 py-0.5 text-[10px] ${ABILITY_CATEGORY_COLORS[a.category]}`}>
                  {ABILITY_CATEGORY_LABELS[a.category]}
                </span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setEditing({ ...a })}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                >
                  <Save className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(a.key)}
                  className="rounded-lg p-1.5 text-red-400/70 hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <p className="mb-2 text-xs text-zinc-400">{a.description}</p>
            <div className="flex flex-wrap gap-1.5 text-[10px] text-zinc-500">
              <span className="rounded bg-black/30 px-1.5 py-0.5">{a.effectType}: {a.effectValue}</span>
              {a.availableInShop && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400">Shop</span>}
              {a.canDropFromCases && <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-400">Cases</span>}
              {!a.enabled && <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-red-400">Deaktiviert</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 pt-10">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-zinc-900 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-100">
                {abilities.some((a) => a.key === editing.key) ? "Fähigkeits-Gutschein bearbeiten" : "Neuer Fähigkeits-Gutschein"}
              </h3>
              <button onClick={() => setEditing(null)} className="rounded-lg p-1 text-zinc-400 hover:text-zinc-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Key (einmalig)", field: "key", type: "text" },
                { label: "Name", field: "name", type: "text" },
                { label: "Icon (Lucide)", field: "icon", type: "text" },
                { label: "Sortierung", field: "sortOrder", type: "number" },
                { label: "Effect Value", field: "effectValue", type: "number" },
                { label: "Shop-Preis (CR)", field: "shopPriceCr", type: "number" },
              ].map(({ label, field, type }) => (
                <label key={field} className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-400">{label}</span>
                  <input
                    type={type}
                    value={String((editing as Record<string, unknown>)[field] ?? "")}
                    onChange={(e) => setEditing((prev) => prev ? { ...prev, [field]: type === "number" ? Number(e.target.value) : e.target.value } : null)}
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </label>
              ))}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Beschreibung</span>
                <input
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing((prev) => prev ? { ...prev, description: e.target.value } : null)}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Kategorie</span>
                <select
                  value={editing.category ?? "global"}
                  onChange={(e) => setEditing((prev) => prev ? { ...prev, category: e.target.value as AbilityCategory } : null)}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none"
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{ABILITY_CATEGORY_LABELS[c]}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Effekt-Typ</span>
                <select
                  value={editing.effectType ?? "xp_boost"}
                  onChange={(e) => {
                    const t = e.target.value as AbilityEffectType;
                    // Auto-sync category to the effect's home category for consistency.
                    setEditing((prev) => prev ? { ...prev, effectType: t, category: ABILITY_EFFECT_META[t].category } : null);
                  }}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none"
                >
                  {EFFECTS_BY_CATEGORY.map((g) => (
                    <optgroup key={g.cat} label={ABILITY_CATEGORY_LABELS[g.cat]}>
                      {g.types.map((t) => <option key={t} value={t}>{ABILITY_EFFECT_META[t].label}</option>)}
                    </optgroup>
                  ))}
                </select>
                {editing.effectType && (
                  <span className="mt-0.5 text-[10px] leading-snug text-zinc-500">
                    {ABILITY_EFFECT_META[editing.effectType].description}
                    {" — "}
                    <span className="text-purple-300/80">{ABILITY_EFFECT_UNIT_HINT[ABILITY_EFFECT_META[editing.effectType].unit]}</span>
                  </span>
                )}
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Seltenheit</span>
                <select
                  value={editing.rarity ?? "selten"}
                  onChange={(e) => setEditing((prev) => prev ? { ...prev, rarity: e.target.value as AbilityRarity } : null)}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none"
                >
                  {RARITIES.map((r) => <option key={r} value={r}>{ABILITY_RARITY_LABELS[r]}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Gutschein-Theme</span>
                <select
                  value={editing.cardTheme ?? AUTO_THEME}
                  onChange={(e) => setEditing((prev) => prev ? { ...prev, cardTheme: e.target.value } : null)}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none"
                >
                  <option value={AUTO_THEME}>Auto (nach Seltenheit)</option>
                  {BONUS_CARD_THEME_LIST.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Gutschein-Seltenheit (Karte)</span>
                <select
                  value={editing.cardRarity ?? AUTO_RARITY}
                  onChange={(e) => setEditing((prev) => prev ? { ...prev, cardRarity: e.target.value } : null)}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none"
                >
                  <option value={AUTO_RARITY}>Auto</option>
                  {BONUS_CARD_RARITY_LIST.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </label>
            </div>

            {/* Live-Vorschau der Gutschein-Karte */}
            <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-3">
              <span className="mb-2 block text-xs font-bold text-zinc-300">Vorschau</span>
              <div className="flex justify-center">
                <div className="w-[300px] max-w-full">
                  <AbilityVoucherCard
                    animateEntry={false}
                    name={editing.name?.trim() ? editing.name : "Unbenannte Fähigkeit"}
                    description={editing.description}
                    icon={editing.icon}
                    category={editing.category ? ABILITY_CATEGORY_LABELS[editing.category] : undefined}
                    cardTheme={editing.cardTheme}
                    cardRarity={editing.cardRarity}
                    abilityRarity={editing.rarity}
                  />
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-4">
              {[
                { field: "availableInShop", label: "Im Shop verfügbar" },
                { field: "canDropFromCases", label: "Aus Cases dropbar" },
                { field: "enabled", label: "Aktiviert" },
              ].map(({ field, label }) => (
                <label key={field} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean((editing as Record<string, unknown>)[field])}
                    onChange={(e) => setEditing((prev) => prev ? { ...prev, [field]: e.target.checked } : null)}
                    className="rounded"
                  />
                  <span className="text-sm text-zinc-300">{label}</span>
                </label>
              ))}
            </div>
            {/* Effect-Config (Kombo-Effekte) — beliebige Zusatz-Werte als Key→Zahl */}
            <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-300">Zusatz-Effekte (effectConfig)</span>
                <button
                  onClick={() => setEditing((prev) => {
                    if (!prev) return prev;
                    const cfg = { ...(prev.effectConfig ?? {}) };
                    const used = new Set(Object.keys(cfg));
                    const k = EFFECT_CONFIG_KEYS.find((ck) => !used.has(ck)) ?? "credit_bonus";
                    return { ...prev, effectConfig: { ...cfg, [k]: 0 } };
                  })}
                  className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-bold text-zinc-300 hover:bg-white/10"
                >
                  <Plus className="h-3 w-3" /> Wert
                </button>
              </div>
              <p className="mb-2 text-[10px] text-zinc-600">Kombiniert mehrere Effekte in EINER Fähigkeit — greift ÜBER ALLE Spiele zusätzlich zum Haupt-Effekt. <b>Schlüssel = Effekt-Typ-Name</b> (z.B. <code>plinko_min_multiplier</code>, <code>snake_score_multiplier</code>, <code>case_luck</code>, <code>streak_reward_multiplier</code>, <code>credit_bonus</code>), Wert = wie beim Haupt-Effekt. Sonderfall Mine (<code>mine_cr_bonus</code>): zusätzlich <code>storage_bonus</code>/<code>double_chance</code>/<code>upgrade_discount</code>.</p>
              {Object.entries(editing.effectConfig ?? {}).length === 0 ? (
                <p className="text-[10px] text-zinc-600">Keine Zusatz-Effekte.</p>
              ) : (
                <div className="space-y-1.5">
                  {Object.entries(editing.effectConfig ?? {}).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2">
                      <select
                        value={k}
                        onChange={(e) => setEditing((prev) => {
                          if (!prev) return prev;
                          const cfg = { ...(prev.effectConfig ?? {}) };
                          const val = cfg[k]; delete cfg[k];
                          const nk = e.target.value;
                          if (nk) cfg[nk] = val ?? 0;
                          return { ...prev, effectConfig: cfg };
                        })}
                        className="flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
                      >
                        {/* aktueller (evtl. unbekannter) Key bleibt sichtbar */}
                        {!EFFECT_CONFIG_KEYS.includes(k) && <option value={k}>{k} (eigen)</option>}
                        {EFFECT_CONFIG_KEYS.map((ck) => (
                          <option key={ck} value={ck} disabled={ck !== k && editing.effectConfig?.[ck] !== undefined}>
                            {effectConfigKeyLabel(ck)}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number" step="any"
                        value={String(v ?? 0)}
                        onChange={(e) => setEditing((prev) => prev ? { ...prev, effectConfig: { ...(prev.effectConfig ?? {}), [k]: Number(e.target.value) } } : null)}
                        className="w-24 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
                      />
                      <button
                        onClick={() => setEditing((prev) => {
                          if (!prev) return prev;
                          const cfg = { ...(prev.effectConfig ?? {}) }; delete cfg[k];
                          return { ...prev, effectConfig: cfg };
                        })}
                        className="rounded-md p-1 text-zinc-500 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-xl bg-purple-600/80 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500 disabled:opacity-50"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Speichern
              </button>
              <button onClick={() => setEditing(null)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100">
                Abbrechen
              </button>
              {saveMsg && (
                <span className={`text-sm ${saveMsg.startsWith("✅") ? "text-emerald-400" : "text-red-400"}`}>{saveMsg}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* View user inventory */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">
          <Users className="h-3.5 w-3.5 text-blue-400" />
          Spieler-Inventar anzeigen
        </h3>
        <div className="flex gap-3 items-end mb-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Spieler</span>
            <select value={viewUserId} onChange={(e) => setViewUserId(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none">
              <option value="">Spieler wählen…</option>
              {[...profiles].sort((a, b) => a.username.localeCompare(b.username, "de")).map((p) => <option key={p.id} value={p.id}>{p.username}</option>)}
            </select>
          </div>
          <button onClick={handleLoadInventory} disabled={!viewUserId || inventoryLoading}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-300 hover:text-white disabled:opacity-50 flex items-center gap-1.5">
            {inventoryLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            Laden
          </button>
        </div>
        {userInventory.length > 0 && (
          <div className="space-y-1.5">
            {userInventory.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                <div>
                  <span className="text-sm font-medium text-zinc-200">{item.abilityKey}</span>
                  <span className="ml-2 text-xs text-zinc-500">{item.source} · {new Date(item.acquiredAt).toLocaleDateString("de-DE")}</span>
                </div>
                <button onClick={() => handleRevoke(item.id)} className="rounded-lg p-1 text-red-400/60 hover:text-red-400">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        {viewUserId && userInventory.length === 0 && !inventoryLoading && (
          <p className="text-xs text-zinc-500 italic">Keine Fähigkeits-Gutscheine</p>
        )}
      </div>
    </div>
  );
}
