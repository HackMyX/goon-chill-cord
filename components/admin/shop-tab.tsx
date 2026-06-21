"use client";

import { useState } from "react";
import { Store, Save, Loader2, Plus, Trash2, RefreshCw, Star, Search } from "lucide-react";
import { RarityBadge } from "@/components/dashboard/rarity-badge";
import { useConfirm } from "@/components/layout/confirm-dialog-provider";
import { useSoundManager } from "@/lib/sound-manager";
import {
  updateShopSettings,
  addManualShopListing,
  removeShopListing,
  updateShopListing,
  regenerateAutoShopListings,
  type AdminShopListing,
} from "@/lib/actions/shop";
import { ALL_SHOP_ITEM_TYPES, type ShopSettings } from "@/lib/shop";
import type { ItemRow } from "@/components/admin/admin-shell";

interface ShopTabProps {
  settings: ShopSettings;
  todayListings: AdminShopListing[];
  tomorrowListings: AdminShopListing[];
  items: ItemRow[];
}

const CATEGORY_LABELS: Record<string, string> = {
  hat: "Hüte",
  jacket: "Jacken",
  pants: "Hosen",
  shoes: "Schuhe",
  weapon: "Waffen",
  weapon_cosmetic: "Waffen-Skins",
  pet: "Pets",
  aura: "Auren",
  trail: "Trails",
  ring: "Ringe",
  amulet: "Amulette",
  hair: "Haare",
  face: "Gesichter",
  shield_cosmetic: "Schilde",
};

function SettingsCard({ settings }: { settings: ShopSettings }) {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sound = useSoundManager();

  function toggleType(type: string) {
    setForm((f) => ({
      ...f,
      autoGenerateItemTypes: f.autoGenerateItemTypes.includes(type)
        ? f.autoGenerateItemTypes.filter((t) => t !== type)
        : [...f.autoGenerateItemTypes, type],
    }));
  }

  async function handleSave() {
    setSaving(true);
    sound.click();
    const res = await updateShopSettings(form);
    setSaving(false);
    if (res.success) {
      sound.win();
      setMessage("Gespeichert.");
    } else {
      sound.error();
      setMessage(res.error ?? "Fehler.");
    }
    setTimeout(() => setMessage(null), 3000);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-bold text-zinc-100">
          <Store className="h-5 w-5 text-purple-400" />
          Shop-Automatik
        </h3>
        <button
          onMouseEnter={sound.hover}
          onClick={() => setForm((f) => ({ ...f, autoGenerateEnabled: !f.autoGenerateEnabled }))}
          className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
            form.autoGenerateEnabled ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
          }`}
        >
          {form.autoGenerateEnabled ? "AKTIV" : "DEAKTIVIERT"}
        </button>
      </div>

      <p className="mb-4 text-[11px] text-zinc-500">
        Die Automatik füllt jeden Tag fehlende Plätze bis zur Ziel-Anzahl mit zufälligen, überteuerten Items
        — manuell eingestellte Items (unten) werden nie überschrieben, die Automatik ergänzt nur den Rest.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-zinc-400">Ziel-Anzahl Items/Tag</span>
          <input
            type="number"
            min={0}
            max={50}
            value={form.autoGenerateItemCount}
            onChange={(e) => setForm((f) => ({ ...f, autoGenerateItemCount: Number(e.target.value) }))}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-zinc-400">Preisaufschlag min (x)</span>
          <input
            type="number"
            min={1}
            step={0.5}
            value={form.autoGeneratePriceMultiplierMin}
            onChange={(e) =>
              setForm((f) => ({ ...f, autoGeneratePriceMultiplierMin: Number(e.target.value) }))
            }
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-zinc-400">Preisaufschlag max (x)</span>
          <input
            type="number"
            min={1}
            step={0.5}
            value={form.autoGeneratePriceMultiplierMax}
            onChange={(e) =>
              setForm((f) => ({ ...f, autoGeneratePriceMultiplierMax: Number(e.target.value) }))
            }
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>
      </div>

      <p className="mb-2 mt-4 text-xs font-semibold text-zinc-400">Item-Kategorien für die Automatik</p>
      <div className="flex flex-wrap gap-1.5">
        {ALL_SHOP_ITEM_TYPES.map((type) => (
          <button
            key={type}
            onMouseEnter={sound.hover}
            onClick={() => toggleType(type)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              form.autoGenerateItemTypes.includes(type)
                ? "bg-purple-500/30 text-purple-200"
                : "bg-white/5 text-zinc-500 hover:bg-white/10"
            }`}
          >
            {CATEGORY_LABELS[type] ?? type}
          </button>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onMouseEnter={sound.hover}
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-500 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Speichern
        </button>
        {message && <span className="text-sm text-zinc-400">{message}</span>}
      </div>
    </div>
  );
}

function ListingRow({ listing, onChanged }: { listing: AdminShopListing; onChanged: () => void }) {
  const [priceCr, setPriceCr] = useState(listing.priceCr);
  const sound = useSoundManager();
  const confirm = useConfirm();

  async function savePrice() {
    if (priceCr === listing.priceCr) return;
    sound.click();
    await updateShopListing(listing.id, { priceCr });
    onChanged();
  }

  async function toggleFeatured() {
    sound.click();
    await updateShopListing(listing.id, { featured: !listing.featured });
    onChanged();
  }

  async function handleRemove() {
    const ok = await confirm({
      title: "Item entfernen",
      message: `${listing.itemName} aus dem Shop entfernen?`,
      confirmLabel: "Entfernen",
      danger: true,
    });
    if (!ok) return;
    sound.click();
    await removeShopListing(listing.id);
    onChanged();
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
      <div className="flex items-center gap-2">
        <button onClick={toggleFeatured} title="Featured umschalten">
          <Star className={`h-4 w-4 ${listing.featured ? "fill-amber-400 text-amber-400" : "text-zinc-600"}`} />
        </button>
        <span className="text-sm font-semibold text-zinc-200">{listing.itemName}</span>
        <RarityBadge rarity={listing.itemRarity} />
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            listing.source === "auto" ? "bg-sky-500/20 text-sky-300" : "bg-purple-500/20 text-purple-300"
          }`}
        >
          {listing.source === "auto" ? "Automatik" : "Manuell"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          value={priceCr}
          onChange={(e) => setPriceCr(Number(e.target.value))}
          onBlur={savePrice}
          className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
        />
        <span className="text-[11px] text-zinc-500">CR</span>
        <button onClick={handleRemove} className="text-zinc-500 hover:text-red-400">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function AddListingForm({
  dateOffsetDays,
  items,
  onAdded,
}: {
  dateOffsetDays: number;
  items: ItemRow[];
  onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ItemRow | null>(null);
  const [priceCr, setPriceCr] = useState(500);
  const [open, setOpen] = useState(false);
  const sound = useSoundManager();

  const filtered = items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase())).slice(0, 30);

  async function handleAdd() {
    if (!selected) return;
    sound.click();
    const res = await addManualShopListing({
      dateOffsetDays,
      itemId: selected.id,
      priceCr,
      purchaseLimit: 1,
      featured: false,
    });
    if (res.success) {
      sound.win();
      setSelected(null);
      setQuery("");
      onAdded();
    } else {
      sound.error();
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-white/15 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            value={selected ? selected.name : query}
            onChange={(e) => {
              setSelected(null);
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Item suchen..."
            className="w-full rounded-lg border border-white/10 bg-black/30 py-1.5 pl-8 pr-3 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
          {open && !selected && query && (
            <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-white/10 bg-[#0b0814] shadow-lg">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelected(item);
                    setPriceCr(Math.max(50, item.price_cr * 4));
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-purple-500/10"
                >
                  <span className="truncate">{item.name}</span>
                  <RarityBadge rarity={item.rarity} />
                </button>
              ))}
              {filtered.length === 0 && <p className="px-3 py-2 text-xs text-zinc-500">Keine Treffer.</p>}
            </div>
          )}
        </div>
        <input
          type="number"
          min={1}
          value={priceCr}
          onChange={(e) => setPriceCr(Number(e.target.value))}
          className="w-28 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
        />
        <button
          onMouseEnter={sound.hover}
          onClick={handleAdd}
          disabled={!selected}
          className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Hinzufügen
        </button>
      </div>
    </div>
  );
}

function DayShopPanel({
  label,
  dateOffsetDays,
  listings,
  items,
  onChanged,
}: {
  label: string;
  dateOffsetDays: number;
  listings: AdminShopListing[];
  items: ItemRow[];
  onChanged: () => void;
}) {
  const sound = useSoundManager();
  const [regenerating, setRegenerating] = useState(false);

  async function handleRegenerate() {
    setRegenerating(true);
    sound.click();
    await regenerateAutoShopListings(dateOffsetDays);
    setRegenerating(false);
    onChanged();
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-zinc-200">{label}</h3>
        <button
          onMouseEnter={sound.hover}
          onClick={handleRegenerate}
          disabled={regenerating}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/5 disabled:opacity-50"
        >
          {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Automatik neu würfeln
        </button>
      </div>

      <div className="mb-3 flex flex-col gap-1.5">
        {listings.length === 0 && <p className="text-xs text-zinc-500">Noch keine Items für diesen Tag.</p>}
        {listings.map((l) => (
          <ListingRow key={l.id} listing={l} onChanged={onChanged} />
        ))}
      </div>

      <AddListingForm dateOffsetDays={dateOffsetDays} items={items} onAdded={onChanged} />
    </div>
  );
}

export function ShopTab({ settings, todayListings, tomorrowListings, items }: ShopTabProps) {
  function onChanged() {
    // Server actions already revalidatePath the admin route, but this
    // component still holds the props from the last server render — a
    // full reload is the simplest reliable way to pick up the fresh
    // listings without threading a router-refresh callback through
    // AdminShell just for this one tab.
    window.location.reload();
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard settings={settings} />
      <DayShopPanel
        label="Heutiger Shop"
        dateOffsetDays={0}
        listings={todayListings}
        items={items}
        onChanged={onChanged}
      />
      <DayShopPanel
        label="Morgiger Shop (Vorschau / Vorab-Bestückung)"
        dateOffsetDays={1}
        listings={tomorrowListings}
        items={items}
        onChanged={onChanged}
      />
    </div>
  );
}
