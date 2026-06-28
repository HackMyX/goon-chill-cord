"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Save, Trash2, Loader2, Tags, CalendarPlus, X } from "lucide-react";
import {
  listShopCategories,
  upsertShopCategory,
  deleteShopCategory,
  upsertShopCategoryDayRule,
  deleteShopCategoryDayRule,
  type ShopCategory,
  type ShopCategoryDayRule,
} from "@/lib/actions/shop";
import { RARITY_ORDER, RARITY_LABELS, type Rarity } from "@/lib/cases";
import { ALL_SHOP_ITEM_TYPES, SHOP_ITEM_TYPE_LABELS } from "@/lib/shop";
import { SHOP_CATEGORY_ICONS, SHOP_CATEGORY_COLORS, resolveShopCategoryIcon } from "@/lib/shop-category-icons";
import { CollapsibleAdminRow } from "@/components/admin/collapsible-admin-row";
import { useConfirm } from "@/components/layout/confirm-dialog-provider";
import { useSoundManager } from "@/lib/sound-manager";

const DAY_LABELS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function RarityFilterPicker({ value, onChange }: { value: Rarity[] | null; onChange: (v: Rarity[] | null) => void }) {
  const sound = useSoundManager();
  function toggle(r: Rarity) {
    sound.click();
    const curr = value ?? [];
    const next = curr.includes(r) ? curr.filter((x) => x !== r) : [...curr, r];
    onChange(next.length === 0 ? null : next);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        onMouseEnter={sound.hover}
        onClick={() => { sound.click(); onChange(null); }}
        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
          value === null ? "border-purple-400/60 bg-purple-500/15 text-purple-200" : "border-white/10 text-zinc-500 hover:border-white/30"
        }`}
      >
        Alle Raritäten
      </button>
      {RARITY_ORDER.map((r) => (
        <button
          key={r}
          onMouseEnter={sound.hover}
          onClick={() => toggle(r)}
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            value?.includes(r) ? "border-purple-400/60 bg-purple-500/15 text-purple-200" : "border-white/10 text-zinc-500 hover:border-white/30"
          }`}
        >
          {RARITY_LABELS[r]}
        </button>
      ))}
    </div>
  );
}

function TypeFilterPicker({ value, onChange }: { value: string[] | null; onChange: (v: string[] | null) => void }) {
  const sound = useSoundManager();
  function toggle(t: string) {
    sound.click();
    const curr = value ?? [];
    const next = curr.includes(t) ? curr.filter((x) => x !== t) : [...curr, t];
    onChange(next.length === 0 ? null : next);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        onMouseEnter={sound.hover}
        onClick={() => { sound.click(); onChange(null); }}
        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
          value === null ? "border-purple-400/60 bg-purple-500/15 text-purple-200" : "border-white/10 text-zinc-500 hover:border-white/30"
        }`}
      >
        Alle Typen
      </button>
      {ALL_SHOP_ITEM_TYPES.map((t) => (
        <button
          key={t}
          onMouseEnter={sound.hover}
          onClick={() => toggle(t)}
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            value?.includes(t) ? "border-purple-400/60 bg-purple-500/15 text-purple-200" : "border-white/10 text-zinc-500 hover:border-white/30"
          }`}
        >
          {SHOP_ITEM_TYPE_LABELS[t] ?? t}
        </button>
      ))}
    </div>
  );
}

interface DayRuleFormState {
  enabled: boolean;
  rarityFilter: Rarity[] | null;
  typeFilter: string[] | null;
  itemCountOverride: number | null;
}

function ruleToForm(rule: ShopCategoryDayRule | undefined): DayRuleFormState {
  return {
    enabled: rule?.enabled ?? true,
    rarityFilter: rule?.rarityFilter ?? null,
    typeFilter: rule?.typeFilter ?? null,
    itemCountOverride: rule?.itemCountOverride ?? null,
  };
}

/** Inline override editor shared by both the weekly grid (day_of_week) and
 * the future-dates planner (specific_date) — only one of the two slot
 * kinds is ever passed in. */
function DayRuleEditor({
  categoryId,
  dayOfWeek,
  specificDate,
  existingRule,
  onSaved,
  onCancel,
}: {
  categoryId: string;
  dayOfWeek?: number;
  specificDate?: string;
  existingRule: ShopCategoryDayRule | undefined;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<DayRuleFormState>(ruleToForm(existingRule));
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const sound = useSoundManager();

  async function handleSave() {
    sound.click();
    setSaving(true);
    const res = await upsertShopCategoryDayRule({
      categoryId,
      dayOfWeek: dayOfWeek ?? null,
      specificDate: specificDate ?? null,
      enabled: form.enabled,
      rarityFilter: form.rarityFilter,
      typeFilter: form.typeFilter,
      itemCountOverride: form.itemCountOverride,
    });
    setSaving(false);
    if (res.success) sound.save();
    else sound.error();
    onSaved();
  }

  async function handleRemoveOverride() {
    if (!existingRule) {
      onCancel();
      return;
    }
    sound.click();
    setRemoving(true);
    await deleteShopCategoryDayRule(existingRule.id);
    setRemoving(false);
    onSaved();
  }

  return (
    <div className="rounded-lg border border-purple-400/20 bg-purple-500/[0.04] p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          onMouseEnter={sound.hover}
          onClick={() => { sound.click(); setForm((f) => ({ ...f, enabled: !f.enabled })); }}
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
            form.enabled ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
          }`}
        >
          {form.enabled ? "Aktiv an diesem Tag" : "Pausiert an diesem Tag"}
        </button>
        <button onClick={onCancel} className="text-zinc-500 hover:text-zinc-300">
          <X className="h-4 w-4" />
        </button>
      </div>

      <label className="mb-1 block text-[11px] font-semibold text-zinc-400">Item-Anzahl (leer = Standard)</label>
      <input
        type="number"
        min={0}
        max={50}
        value={form.itemCountOverride ?? ""}
        onChange={(e) => setForm((f) => ({ ...f, itemCountOverride: e.target.value === "" ? null : Number(e.target.value) }))}
        placeholder="Standard verwenden"
        className="mb-2 w-40 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-400/60"
      />

      <label className="mb-1 block text-[11px] font-semibold text-zinc-400">Raritäten-Override</label>
      <div className="mb-2">
        <RarityFilterPicker value={form.rarityFilter} onChange={(v) => setForm((f) => ({ ...f, rarityFilter: v }))} />
      </div>

      <label className="mb-1 block text-[11px] font-semibold text-zinc-400">Typen-Override</label>
      <div className="mb-3">
        <TypeFilterPicker value={form.typeFilter} onChange={(v) => setForm((f) => ({ ...f, typeFilter: v }))} />
      </div>

      <div className="flex gap-2">
        <button
          onMouseEnter={sound.hover}
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Speichern
        </button>
        {existingRule && (
          <button
            onMouseEnter={sound.hover}
            onClick={handleRemoveOverride}
            disabled={removing}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
          >
            {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Override entfernen
          </button>
        )}
      </div>
    </div>
  );
}

function WeeklySchedule({ category, onChanged }: { category: ShopCategory; onChanged: () => void }) {
  const [openDay, setOpenDay] = useState<number | null>(null);
  const sound = useSoundManager();
  const dowRules = category.dayRules.filter((r) => r.dayOfWeek !== null);

  return (
    <div>
      <p className="mb-2 text-xs font-semibold tracking-wide text-purple-300">WOCHENPLAN — feste Rotation pro Wochentag</p>
      <div className="flex flex-wrap gap-1.5">
        {DAY_LABELS.map((label, dow) => {
          const rule = dowRules.find((r) => r.dayOfWeek === dow);
          const hasOverride = !!rule;
          const paused = rule && !rule.enabled;
          return (
            <button
              key={dow}
              onMouseEnter={sound.hover}
              onClick={() => { sound.click(); setOpenDay(openDay === dow ? null : dow); }}
              className={`flex flex-col items-center rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                openDay === dow
                  ? "border-purple-400 bg-purple-500/20 text-purple-200"
                  : paused
                  ? "border-red-500/30 bg-red-500/10 text-red-300"
                  : hasOverride
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  : "border-white/10 text-zinc-400 hover:border-white/30"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {openDay !== null && (
        <div className="mt-2">
          <DayRuleEditor
            categoryId={category.id}
            dayOfWeek={openDay}
            existingRule={dowRules.find((r) => r.dayOfWeek === openDay)}
            onSaved={() => { setOpenDay(null); onChanged(); }}
            onCancel={() => setOpenDay(null)}
          />
        </div>
      )}
    </div>
  );
}

function FutureDatePlanner({ category, onChanged }: { category: ShopCategory; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [newDate, setNewDate] = useState("");
  const sound = useSoundManager();
  const confirm = useConfirm();
  const dateRules = category.dayRules
    .filter((r) => r.specificDate !== null)
    .sort((a, b) => (a.specificDate! < b.specificDate! ? -1 : 1));

  async function handleDeleteRule(rule: ShopCategoryDayRule) {
    const ok = await confirm({
      title: "Geplanten Tag löschen",
      message: `Sonderregel für ${rule.specificDate} entfernen?`,
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    sound.click();
    await deleteShopCategoryDayRule(rule.id);
    onChanged();
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-purple-300">ZUKÜNFTIGE TAGE — einmalige Sonderregeln</p>
        <button
          onMouseEnter={sound.hover}
          onClick={() => { sound.click(); setAdding((a) => !a); }}
          className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:bg-white/5"
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          Tag planen
        </button>
      </div>

      {adding && (
        <div className="mb-2 flex items-center gap-2">
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
          />
          {newDate && (
            <span className="text-[11px] text-zinc-500">
              ({DAY_LABELS[new Date(`${newDate}T00:00:00.000Z`).getUTCDay()]})
            </span>
          )}
        </div>
      )}

      {adding && newDate && (
        <DayRuleEditor
          categoryId={category.id}
          specificDate={newDate}
          existingRule={dateRules.find((r) => r.specificDate === newDate)}
          onSaved={() => { setAdding(false); setNewDate(""); onChanged(); }}
          onCancel={() => { setAdding(false); setNewDate(""); }}
        />
      )}

      <div className="flex flex-col gap-1.5">
        {dateRules.length === 0 && !adding && <p className="text-xs text-zinc-600">Keine geplanten Sondertage.</p>}
        {dateRules.map((rule) => (
          <div key={rule.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5">
            <span className="text-xs font-semibold text-zinc-300">
              {rule.specificDate} ({DAY_LABELS[new Date(`${rule.specificDate}T00:00:00.000Z`).getUTCDay()]})
              {!rule.enabled && <span className="ml-2 text-red-400">pausiert</span>}
            </span>
            <button onClick={() => handleDeleteRule(rule)} className="text-zinc-500 hover:text-red-400">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryCard({ category, onChanged }: { category: ShopCategory; onChanged: () => void }) {
  const [form, setForm] = useState(category);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const sound = useSoundManager();
  const confirm = useConfirm();
  const Icon = resolveShopCategoryIcon(form.icon);

  async function handleSave() {
    sound.click();
    setSaving(true);
    setStatus("idle");
    const res = await upsertShopCategory({
      id: category.id,
      name: form.name,
      icon: form.icon,
      color: form.color,
      enabled: form.enabled,
      sortOrder: form.sortOrder,
      contentType: form.contentType,
      rarityFilter: form.rarityFilter,
      typeFilter: form.typeFilter,
      itemCount: form.itemCount,
      priceMultiplierMin: form.priceMultiplierMin,
      priceMultiplierMax: form.priceMultiplierMax,
    });
    setSaving(false);
    setStatus(res.success ? "saved" : "error");
    if (res.success) {
      sound.save();
      onChanged();
    } else {
      sound.error();
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await confirm({
      title: "Kategorie löschen",
      message: `„${category.name}" und ihren gesamten Wochenplan unwiderruflich löschen?`,
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    sound.click();
    setDeleting(true);
    await deleteShopCategory(category.id);
    setDeleting(false);
    onChanged();
  }

  return (
    <CollapsibleAdminRow
      header={
        <div className="flex flex-wrap items-center gap-3">
          <Icon className="h-5 w-5 shrink-0 text-purple-300" />
          <div className="min-w-[120px] flex-1">
            <p className="font-semibold text-zinc-100">{form.name || "Unbenannt"}</p>
            <p className="text-xs text-zinc-500">{form.itemCount} Items/Tag · {form.priceMultiplierMin}–{form.priceMultiplierMax}x</p>
          </div>
          <button
            onMouseEnter={sound.hover}
            onClick={(e) => { e.stopPropagation(); sound.click(); setForm((f) => ({ ...f, enabled: !f.enabled })); }}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              form.enabled ? "border-emerald-400/50 text-emerald-300" : "border-red-400/50 text-red-300"
            }`}
          >
            {form.enabled ? "Aktiv" : "Deaktiviert"}
          </button>
          <button
            onMouseEnter={sound.hover}
            onClick={(e) => { e.stopPropagation(); handleSave(); }}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white shadow-[0_0_10px_rgba(147,51,234,0.5)] transition-colors hover:bg-purple-500 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          </button>
          <button
            onMouseEnter={sound.hover}
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center rounded-lg border border-white/10 p-1.5 text-zinc-500 hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
          {status === "saved" && <span className="text-sm font-medium text-emerald-400">Gespeichert.</span>}
          {status === "error" && <span className="text-sm font-medium text-red-400">Fehler.</span>}
        </div>
      }
    >
      <div onClick={(e) => e.stopPropagation()} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Name
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Inhalt
            <select
              value={form.contentType ?? "item"}
              onChange={(e) => setForm((f) => ({ ...f, contentType: e.target.value as typeof f.contentType }))}
              className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            >
              <option value="item">Items</option>
              <option value="ability">Fähigkeiten</option>
              <option value="name_style">Name-Styles</option>
              <option value="badge">Badges</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Anzahl/Tag
            <input
              type="number"
              min={0}
              max={50}
              value={form.itemCount}
              onChange={(e) => setForm((f) => ({ ...f, itemCount: Number(e.target.value) }))}
              className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Preisaufschlag min (x)
            <input
              type="number"
              min={1}
              step={0.5}
              value={form.priceMultiplierMin}
              onChange={(e) => setForm((f) => ({ ...f, priceMultiplierMin: Number(e.target.value) }))}
              className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Preisaufschlag max (x)
            <input
              type="number"
              min={1}
              step={0.5}
              value={form.priceMultiplierMax}
              onChange={(e) => setForm((f) => ({ ...f, priceMultiplierMax: Number(e.target.value) }))}
              className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            />
          </label>
        </div>

        <div>
          <p className="mb-1 text-[11px] font-semibold text-zinc-400">Icon</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(SHOP_CATEGORY_ICONS).map((iconName) => {
              const IconOpt = SHOP_CATEGORY_ICONS[iconName];
              return (
                <button
                  key={iconName}
                  onMouseEnter={sound.hover}
                  onClick={() => { sound.click(); setForm((f) => ({ ...f, icon: iconName })); }}
                  title={iconName}
                  className={`rounded-lg border p-1.5 transition-colors ${
                    form.icon === iconName ? "border-purple-400 bg-purple-500/20 text-purple-200" : "border-white/10 text-zinc-500 hover:border-white/30"
                  }`}
                >
                  <IconOpt className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-1 text-[11px] font-semibold text-zinc-400">Farbe</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(SHOP_CATEGORY_COLORS).map((colorName) => (
              <button
                key={colorName}
                onMouseEnter={sound.hover}
                onClick={() => { sound.click(); setForm((f) => ({ ...f, color: colorName })); }}
                className={`h-6 w-6 rounded-full border-2 ${SHOP_CATEGORY_COLORS[colorName].bg} ${
                  form.color === colorName ? "border-white" : "border-transparent"
                }`}
                title={colorName}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-[11px] font-semibold text-zinc-400">Standard-Raritäten (gilt an Tagen ohne Override)</p>
          <RarityFilterPicker value={form.rarityFilter} onChange={(v) => setForm((f) => ({ ...f, rarityFilter: v }))} />
        </div>

        <div>
          <p className="mb-1 text-[11px] font-semibold text-zinc-400">Standard-Typen (gilt an Tagen ohne Override)</p>
          <TypeFilterPicker value={form.typeFilter} onChange={(v) => setForm((f) => ({ ...f, typeFilter: v }))} />
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <WeeklySchedule category={category} onChanged={onChanged} />
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <FutureDatePlanner category={category} onChanged={onChanged} />
        </div>
      </div>
    </CollapsibleAdminRow>
  );
}

export function ShopCategoryManager({ onChanged }: { onChanged: () => void }) {
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const sound = useSoundManager();

  const load = useCallback(async () => {
    setLoading(true);
    setCategories(await listShopCategories());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleChanged() {
    await load();
    onChanged();
  }

  async function handleCreate() {
    sound.click();
    setCreating(true);
    const res = await upsertShopCategory({
      name: "Neue Kategorie",
      icon: "Tag",
      color: "purple",
      enabled: true,
      sortOrder: categories.length,
      rarityFilter: null,
      typeFilter: null,
      itemCount: 2,
      priceMultiplierMin: 3,
      priceMultiplierMax: 8,
    });
    setCreating(false);
    if (res.success) sound.save();
    else sound.error();
    handleChanged();
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-bold text-zinc-100">
          <Tags className="h-5 w-5 text-purple-400" />
          Shop-Kategorien &amp; Tagesplan
        </h3>
        <button
          onMouseEnter={sound.hover}
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Neue Kategorie
        </button>
      </div>

      <p className="mb-4 text-[11px] text-zinc-500">
        Jede Kategorie liefert ihre eigene, unabhängig gefilterte und bepreiste Auswahl an Items pro Tag.
        Ein Wochenplan kann das für einzelne Wochentage überschreiben (z.B. "Montags nur Seltene"), und
        zukünftige Sondertage überschreiben wiederum den Wochenplan für genau ein Datum. Ohne Kategorien
        läuft die Automatik weiter im klassischen globalen Modus (Einstellungen oben).
      </p>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      )}

      {!loading && categories.length === 0 && (
        <p className="rounded-lg border border-dashed border-white/15 px-4 py-6 text-center text-xs text-zinc-500">
          Noch keine Kategorien — klick „Neue Kategorie", um die erste anzulegen.
        </p>
      )}

      {!loading && categories.length > 0 && (
        <div className="flex flex-col gap-2">
          {categories.map((c) => (
            <CategoryCard key={c.id} category={c} onChanged={handleChanged} />
          ))}
        </div>
      )}
    </div>
  );
}
