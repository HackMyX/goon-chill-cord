"use client";

import { useState } from "react";
import { Store, Save, Loader2, Plus, Trash2, RefreshCw, Star, Search, Megaphone, Eye } from "lucide-react";
import { RarityBadge } from "@/components/dashboard/rarity-badge";
import { useConfirm } from "@/components/layout/confirm-dialog-provider";
import { useSoundManager } from "@/lib/sound-manager";
import {
  getShopSettings,
  updateShopSettings,
  getAdminShopListings,
  addManualShopListing,
  removeShopListing,
  updateShopListing,
  regenerateAutoShopListings,
  type AdminShopListing,
} from "@/lib/actions/shop";
import { ALL_SHOP_ITEM_TYPES, SHOP_ITEM_TYPE_LABELS, type ShopSettings } from "@/lib/shop";
import { ShopCategoryManager } from "@/components/admin/shop-category-manager";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import type { ItemRow } from "@/components/admin/admin-shell";

interface ShopTabProps {
  settings: ShopSettings;
  todayListings: AdminShopListing[];
  tomorrowListings: AdminShopListing[];
  items: ItemRow[];
}

function MotdCard({ settings }: { settings: ShopSettings }) {
  const [motd, setMotd] = useState(settings.motd ?? "");
  const [enabled, setEnabled] = useState(settings.motdEnabled);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sound = useSoundManager();

  async function handleSave() {
    setSaving(true);
    sound.click();
    const res = await updateShopSettings({
      ...settings,
      motd: motd || null,
      motdEnabled: enabled,
    });
    setSaving(false);
    if (res.success) { sound.win(); setMessage("Gespeichert."); }
    else { sound.error(); setMessage(res.error ?? "Fehler."); }
    setTimeout(() => setMessage(null), 3000);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-bold text-zinc-100">
          <Megaphone className="h-5 w-5 text-purple-400" />
          Nachrichten-Banner (MOTD)
        </h3>
        <button
          onMouseEnter={sound.hover}
          onClick={() => setEnabled((v) => !v)}
          className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
            enabled ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-700 text-zinc-400"
          }`}
        >
          {enabled ? "AKTIV" : "DEAKTIVIERT"}
        </button>
      </div>

      <p className="mb-3 text-[11px] text-zinc-500">
        Wird oben im Shop als farbiger Banner angezeigt — z.B. für Events, Wartungshinweise oder Aktionen.
      </p>

      <textarea
        value={motd}
        onChange={(e) => setMotd(e.target.value)}
        placeholder="Nachricht eingeben (leer = kein Banner)..."
        rows={3}
        className="w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
      />

      <div className="mt-3 flex items-center gap-3">
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
            {SHOP_ITEM_TYPE_LABELS[type] ?? type}
          </button>
        ))}
      </div>

      <p className="mb-2 mt-4 text-xs font-semibold text-zinc-400">
        Seltenheits-Gewichte <span className="font-normal text-zinc-600">(höher = häufiger · die %-Angabe zeigt live die effektive Häufigkeit)</span>
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["normal", "selten", "mythisch", "ultra"] as const).map((r) => {
          const w = form.rarityWeights;
          const total = w.normal + w.selten + w.mythisch + w.ultra;
          const pct = total > 0 ? Math.round((w[r] / total) * 100) : 0;
          const label = { normal: "Normal", selten: "Selten", mythisch: "Mythisch", ultra: "Ultra" }[r];
          const col = { normal: "#9ca3af", selten: "#3b82f6", mythisch: "#f59e0b", ultra: "#a855f7" }[r];
          return (
            <label key={r} className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: col }}>
                {label} <span className="text-zinc-500">· ~{pct}%</span>
              </span>
              <input
                type="number"
                min={0}
                step={0.1}
                value={w[r]}
                onChange={(e) => setForm((f) => ({ ...f, rarityWeights: { ...f.rarityWeights, [r]: Math.max(0, Number(e.target.value)) } }))}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
              />
            </label>
          );
        })}
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
  const [savingPrice, setSavingPrice] = useState(false);
  const dirty = priceCr !== listing.priceCr;
  const sound = useSoundManager();
  const confirm = useConfirm();
  const { currencyName } = useSiteConfig();

  async function savePrice() {
    if (!dirty) return;
    setSavingPrice(true);
    sound.click();
    const res = await updateShopListing(listing.id, { priceCr });
    setSavingPrice(false);
    if (res.success) sound.save();
    else sound.error();
    onChanged();
  }

  async function toggleFeatured() {
    sound.click();
    const res = await updateShopListing(listing.id, { featured: !listing.featured });
    if (res.success) sound.save();
    else sound.error();
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
        {listing.categoryName && (
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
            {listing.categoryName}
          </span>
        )}
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
        <span className="text-[11px] text-zinc-500">{currencyName}</span>
        {dirty && (
          <button
            onClick={savePrice}
            disabled={savingPrice}
            title="Preis speichern"
            className="flex items-center gap-1 rounded-lg bg-purple-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-purple-500 disabled:opacity-60"
          >
            {savingPrice ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Speichern
          </button>
        )}
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
  type LType = "item" | "ability" | "name_style" | "badge" | "voucher";
  const [listingType, setListingType] = useState<LType>("item");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ItemRow | null>(null);
  const [keyVal, setKeyVal] = useState("");
  const [badgeText, setBadgeText] = useState("");
  const [voucherKind, setVoucherKind] = useState<"case" | "game_bonus">("case");
  const [voucherRarity, setVoucherRarity] = useState("selten");
  const [voucherGame, setVoucherGame] = useState<"plinko" | "snake" | "don">("plinko");
  const [voucherAmount, setVoucherAmount] = useState(3);
  const [priceCr, setPriceCr] = useState(500);
  const [open, setOpen] = useState(false);
  const sound = useSoundManager();

  const filtered = items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase())).slice(0, 30);
  const KEY_PLACEHOLDER: Record<string, string> = { ability: "ability_key", name_style: "style_key", badge: "badge_key" };
  const canAdd = listingType === "item" ? !!selected : listingType === "voucher" ? true : keyVal.trim().length > 0;

  async function handleAdd() {
    if (!canAdd) return;
    sound.click();
    const input: Parameters<typeof addManualShopListing>[0] = { dateOffsetDays, priceCr, purchaseLimit: 1, featured: false, listingType };
    if (listingType === "item") input.itemId = selected!.id;
    else if (listingType === "ability") input.abilityKey = keyVal.trim();
    else if (listingType === "name_style") input.nameStyleKey = keyVal.trim();
    else if (listingType === "badge") { input.badgeKey = keyVal.trim(); input.badgeText = badgeText.trim() || undefined; }
    else input.voucherConfig = voucherKind === "game_bonus"
      ? { kind: "game_bonus", game: voucherGame, amount: voucherAmount, durationHours: 0 }
      : { kind: "case", mode: "rarity", rarityFloor: voucherRarity };
    const res = await addManualShopListing(input);
    if (res.success) {
      sound.win();
      setSelected(null); setQuery(""); setKeyVal(""); setBadgeText("");
      onAdded();
    } else {
      sound.error();
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-white/15 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={listingType}
          onChange={(e) => { setListingType(e.target.value as LType); setSelected(null); setKeyVal(""); }}
          className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
        >
          <option value="item">Item</option>
          <option value="ability">Fähigkeits-Gutschein</option>
          <option value="name_style">Name-Style</option>
          <option value="badge">Badge</option>
          <option value="voucher">Gutschein</option>
        </select>

        {listingType === "item" && (
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              value={selected ? selected.name : query}
              onChange={(e) => { setSelected(null); setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder="Item suchen..."
              className="w-full rounded-lg border border-white/10 bg-black/30 py-1.5 pl-8 pr-3 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            />
            {open && !selected && query && (
              <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-white/10 bg-[#0b0814] shadow-lg">
                {filtered.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { setSelected(item); setPriceCr(Math.max(50, item.price_cr * 4)); setOpen(false); }}
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
        )}

        {(listingType === "ability" || listingType === "name_style" || listingType === "badge") && (
          <KeySelect
            kind={listingType}
            value={keyVal}
            onChange={setKeyVal}
            placeholder={KEY_PLACEHOLDER[listingType]}
            className="flex-1 min-w-[160px] rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
        )}
        {listingType === "badge" && (
          <input
            value={badgeText}
            onChange={(e) => setBadgeText(e.target.value)}
            placeholder="Badge-Text (optional)"
            className="w-40 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
        )}

        {listingType === "voucher" && (
          <>
            <select value={voucherKind} onChange={(e) => setVoucherKind(e.target.value as "case" | "game_bonus")} className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60">
              <option value="case">Gratis-Case</option>
              <option value="game_bonus">Spiel-Bonus</option>
            </select>
            {voucherKind === "case" ? (
              <select value={voucherRarity} onChange={(e) => setVoucherRarity(e.target.value)} className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60">
                <option value="normal">Normal</option><option value="selten">Selten</option><option value="mythisch">Mythisch</option><option value="ultra">Ultra</option>
              </select>
            ) : (
              <>
                <select value={voucherGame} onChange={(e) => setVoucherGame(e.target.value as "plinko" | "snake" | "don")} className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60">
                  <option value="plinko">Plinko</option><option value="snake">Snake</option><option value="don">DON</option>
                </select>
                <input type="number" min={1} value={voucherAmount} onChange={(e) => setVoucherAmount(Number(e.target.value))} placeholder="Züge" className="w-20 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
              </>
            )}
          </>
        )}

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
          disabled={!canAdd}
          className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Hinzufügen
        </button>
      </div>
    </div>
  );
}

import { ShopVisualPreview } from "@/components/admin/shop-visual-preview";
import { KeySelect } from "@/components/admin/key-select";

const R_COL: Record<string, string> = { normal: "#9ca3af", selten: "#3b82f6", mythisch: "#f59e0b", ultra: "#a855f7" };
const R_LBL: Record<string, string> = { normal: "Normal", selten: "Selten", mythisch: "Mythisch", ultra: "Ultra" };
const LT_LBL: Record<string, string> = { item: "Items", ability: "Fähigkeits-Gutscheine", name_style: "Styles", badge: "Badges", voucher: "Gutscheine" };

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
  const [show3D, setShow3D] = useState(false);

  async function handleRegenerate() {
    setRegenerating(true);
    sound.click();
    await regenerateAutoShopListings(dateOffsetDays);
    setRegenerating(false);
    onChanged();
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-zinc-200">{label}</h3>
        <div className="flex items-center gap-2">
          <button
            onMouseEnter={sound.hover}
            onClick={() => { sound.click(); setShow3D((v) => !v); }}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${show3D ? "border-purple-400/60 bg-purple-500/15 text-purple-200" : "border-white/10 text-zinc-300 hover:bg-white/5"}`}
          >
            <Eye className="h-3.5 w-3.5" />
            3D-Vorschau
          </button>
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
      </div>

      {show3D && (
        <div className="mb-3">
          <ShopVisualPreview listings={listings} />
        </div>
      )}

      {listings.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-white/5 bg-black/20 px-2.5 py-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{listings.length} Angebote ·</span>
          {(["normal", "selten", "mythisch", "ultra"] as const).map((r) => {
            const n = listings.filter((l) => l.itemRarity === r).length;
            return n > 0 ? (
              <span key={r} className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${R_COL[r]}22`, color: R_COL[r] }}>{R_LBL[r]} {n}</span>
            ) : null;
          })}
          <span className="mx-0.5 text-zinc-700">|</span>
          {Object.entries(listings.reduce((acc, l) => { acc[l.listingType] = (acc[l.listingType] ?? 0) + 1; return acc; }, {} as Record<string, number>)).map(([t, n]) => (
            <span key={t} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-zinc-300">{LT_LBL[t] ?? t} {n}</span>
          ))}
        </div>
      )}

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

export function ShopTab({
  settings: initialSettings,
  todayListings: initialTodayListings,
  tomorrowListings: initialTomorrowListings,
  items,
}: ShopTabProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [todayListings, setTodayListings] = useState(initialTodayListings);
  const [tomorrowListings, setTomorrowListings] = useState(initialTomorrowListings);

  // Re-fetches just the listings (and settings, in case regenerate touched
  // auto-generate state) in place — no page reload, so nothing the admin
  // is mid-editing in this tab or any other gets blown away. Same
  // self-contained load()-on-mutation pattern as TicketsTab/DebugLogTab.
  async function refresh() {
    const [freshSettings, freshToday, freshTomorrow] = await Promise.all([
      getShopSettings(),
      getAdminShopListings(0),
      getAdminShopListings(1),
    ]);
    setSettings(freshSettings);
    setTodayListings(freshToday);
    setTomorrowListings(freshTomorrow);
  }

  return (
    <div className="flex flex-col gap-4">
      <MotdCard settings={settings} />
      <SettingsCard settings={settings} />
      <ShopCategoryManager onChanged={refresh} />
      <DayShopPanel
        label="Heutiger Shop"
        dateOffsetDays={0}
        listings={todayListings}
        items={items}
        onChanged={refresh}
      />
      <DayShopPanel
        label="Morgiger Shop (Vorschau / Vorab-Bestückung)"
        dateOffsetDays={1}
        listings={tomorrowListings}
        items={items}
        onChanged={refresh}
      />
    </div>
  );
}
