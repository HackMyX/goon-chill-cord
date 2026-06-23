"use client";

import { useState } from "react";
import { Save, Loader2, Palette, Coins, Swords, ShieldHalf, Sparkles, Zap } from "lucide-react";
import { updateSiteConfig } from "@/lib/actions/site-config";
import type { SiteConfig } from "@/lib/site-config";
import { SITE_LOGO_ICONS, resolveSiteLogoIcon, type SiteLogoIconName } from "@/lib/site-logo-icons";
import { useSoundManager } from "@/lib/sound-manager";

const ICON_NAMES = Object.keys(SITE_LOGO_ICONS) as SiteLogoIconName[];

/**
 * Admin config for sitewide branding (lib/site-config.ts) — the name shown
 * top-left in every page's TopBar (and the browser tab title, and the
 * logged-out homepage) plus the logo: either a custom image URL or one of
 * lib/site-logo-icons.ts' curated icon choices. Lives in its own top-level
 * admin tab ("Branding") rather than inside the Games tab, since this
 * isn't specific to any one game.
 */
export function SiteConfigEditor({ config }: { config: SiteConfig }) {
  const [form, setForm] = useState(config);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sound = useSoundManager();

  async function handleSave() {
    setSaving(true);
    sound.click();
    const res = await updateSiteConfig(form);
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

  const PreviewIcon = resolveSiteLogoIcon(form.logoIconName);

  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
      <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-zinc-100">
        <Palette className="h-5 w-5 text-pink-400" />
        Branding
      </h3>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-zinc-400">Seitenname</span>
        <input
          type="text"
          maxLength={60}
          value={form.siteName}
          onChange={(e) => setForm((f) => ({ ...f, siteName: e.target.value }))}
          className="w-full max-w-sm rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
        />
        <span className="text-[11px] text-zinc-600">
          Erscheint oben links in der Navigation, als Browser-Tab-Titel und auf der Login-Seite.
        </span>
      </label>

      <div className="mt-5">
        <span className="text-xs font-semibold text-zinc-400">Logo-Icon</span>
        <p className="mb-2 text-[11px] text-zinc-600">
          Eines auswählen — wird genutzt, solange unten keine eigene Bild-URL eingetragen ist.
        </p>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-10">
          {ICON_NAMES.map((name) => {
            const Icon = SITE_LOGO_ICONS[name];
            const selected = form.logoIconName === name;
            return (
              <button
                key={name}
                type="button"
                title={name}
                onMouseEnter={sound.hover}
                onClick={() => {
                  sound.click();
                  setForm((f) => ({ ...f, logoIconName: name }));
                }}
                className={`flex items-center justify-center rounded-lg border p-2.5 transition-colors ${
                  selected
                    ? "border-purple-400 bg-purple-500/20 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.45)]"
                    : "border-white/10 text-zinc-400 hover:border-white/30 hover:text-zinc-200"
                }`}
              >
                <Icon className="h-5 w-5" />
              </button>
            );
          })}
        </div>
      </div>

      <label className="mt-5 flex flex-col gap-1">
        <span className="text-xs font-semibold text-zinc-400">Eigene Logo-Bild-URL (optional)</span>
        <input
          type="text"
          placeholder="https://…"
          value={form.logoUrl ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value || null }))}
          className="w-full max-w-sm rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
        />
        <span className="text-[11px] text-zinc-600">
          Überschreibt das ausgewählte Icon, solange diese URL gesetzt ist. Leeren, um wieder das
          Icon oben zu verwenden. Es gibt keinen Datei-Upload — eine bereits gehostete Bild-URL
          eintragen.
        </span>
      </label>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
        <span className="text-xs text-zinc-500">Vorschau:</span>
        {form.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-provided URL preview
          <img src={form.logoUrl} alt={form.siteName} className="h-6 w-6 rounded object-cover" />
        ) : (
          <PreviewIcon className="h-6 w-6 text-purple-400" />
        )}
        <span className="font-extrabold tracking-tight text-zinc-100">{form.siteName || "—"}</span>
      </div>

      <label className="mt-5 flex flex-col gap-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
          <Coins className="h-3.5 w-3.5 text-amber-400" />
          Startguthaben für neue User ({form.currencyName || "CR"})
        </span>
        <input
          type="number"
          min={0}
          max={1000000}
          step={50}
          value={form.startingCredits ?? 500}
          onChange={(e) => setForm((f) => ({ ...f, startingCredits: Math.max(0, Number(e.target.value) || 0) }))}
          className="w-40 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60"
        />
        <span className="text-[11px] text-zinc-600">
          Credits, die jeder neue Spieler beim ersten Login automatisch erhält. Der DB-Trigger liest diesen Wert direkt — Änderungen gelten sofort für alle neuen Accounts.
        </span>
      </label>

      <div className="mt-6 border-t border-white/10 pt-5">
        <h4 className="mb-1 flex items-center gap-2 text-sm font-bold text-zinc-200">
          Globale Bezeichnungen
        </h4>
        <p className="mb-4 text-[11px] text-zinc-500">
          Werden überall angezeigt — TopBar, Shop, Auktionen, Trading, Benachrichtigungen, Audit-Log,
          Item-Badges. Änderungen gelten sofort auf der gesamten Seite.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Currency */}
          <div className="flex flex-col gap-1 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <Coins className="h-3.5 w-3.5" />
                Währungsname
              </span>
              <span className="text-[10px] tabular-nums text-zinc-600">
                {form.currencyName.length}/12
              </span>
            </div>
            <input
              type="text"
              maxLength={12}
              value={form.currencyName}
              onChange={(e) => setForm((f) => ({ ...f, currencyName: e.target.value }))}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm font-semibold text-amber-100 outline-none focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/20"
            />
            <span className="text-[10px] text-zinc-600">Standard: „CR" — z.B. „Coins", „Gold".</span>
            <div className="mt-1 flex items-center gap-1.5 rounded-md border border-amber-400/15 bg-black/30 px-2 py-1">
              <Coins className="h-3 w-3 shrink-0 text-amber-400/70" />
              <span className="text-xs font-bold text-amber-300">
                1.250 {form.currencyName || "—"}
              </span>
            </div>
          </div>

          {/* Damage */}
          <div className="flex flex-col gap-1 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                <Swords className="h-3.5 w-3.5" />
                Schadens-Label
              </span>
              <span className="text-[10px] tabular-nums text-zinc-600">
                {form.damageLabel.length}/12
              </span>
            </div>
            <input
              type="text"
              maxLength={12}
              value={form.damageLabel}
              onChange={(e) => setForm((f) => ({ ...f, damageLabel: e.target.value }))}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm font-semibold text-emerald-100 outline-none focus:border-emerald-400/60 focus:ring-1 focus:ring-emerald-400/20"
            />
            <span className="text-[10px] text-zinc-600">Standard: „DMG" — z.B. „ATK", „AD".</span>
            <div className="mt-1 flex items-center gap-1.5 rounded-md border border-emerald-400/15 bg-black/30 px-2 py-1">
              <span className="text-[11px] text-emerald-400/70">⚔</span>
              <span className="text-xs font-bold text-emerald-300">
                45 {form.damageLabel || "—"}
              </span>
            </div>
          </div>

          {/* Armor */}
          <div className="flex flex-col gap-1 rounded-xl border border-blue-400/20 bg-blue-400/5 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-300">
                <ShieldHalf className="h-3.5 w-3.5" />
                Rüstungs-Label
              </span>
              <span className="text-[10px] tabular-nums text-zinc-600">
                {form.armorLabel.length}/12
              </span>
            </div>
            <input
              type="text"
              maxLength={12}
              value={form.armorLabel}
              onChange={(e) => setForm((f) => ({ ...f, armorLabel: e.target.value }))}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm font-semibold text-blue-100 outline-none focus:border-blue-400/60 focus:ring-1 focus:ring-blue-400/20"
            />
            <span className="text-[10px] text-zinc-600">Standard: „AP" — z.B. „DEF", „Rüstung".</span>
            <div className="mt-1 flex items-center gap-1.5 rounded-md border border-blue-400/15 bg-black/30 px-2 py-1">
              <span className="text-[11px] text-blue-400/70">🛡</span>
              <span className="text-xs font-bold text-blue-300">
                20 {form.armorLabel || "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Combined live preview strip */}
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-black/20 px-4 py-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
            Live-Vorschau
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-xs font-bold text-amber-300">
              <Coins className="h-3 w-3" />
              {form.currencyName || "—"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-xs font-bold text-emerald-300">
              ⚔ {form.damageLabel || "—"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-blue-400/30 bg-blue-400/10 px-2 py-0.5 text-xs font-bold text-blue-300">
              🛡 {form.armorLabel || "—"}
            </span>
          </div>
          <span className="text-[10px] text-zinc-700">
            → erscheint z.B. als „850 {form.currencyName || "—"} · ⚔ 32 {form.damageLabel || "—"} · 🛡 15 {form.armorLabel || "—"}"
          </span>
        </div>
      </div>

      {/* Rarity labels */}
      <div className="mt-6 border-t border-white/10 pt-5">
        <h4 className="mb-1 flex items-center gap-2 text-sm font-bold text-zinc-200">
          <Sparkles className="h-4 w-4 text-purple-400" />
          Seltenheits-Bezeichnungen
        </h4>
        <p className="mb-3 text-[11px] text-zinc-500">
          Eigene Namen für die vier Seltenheitsstufen — werden überall angezeigt: Item-Badges,
          Shop, Auktionen, Case-Öffnungen, Trading, Garderobe. Leer lassen = Standard.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["normal", "selten", "mythisch", "ultra"] as const).map((r) => (
            <label key={r} className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-zinc-400 capitalize">{r}</span>
              <input
                type="text"
                maxLength={20}
                value={form.rarityLabels[r]}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    rarityLabels: { ...f.rarityLabels, [r]: e.target.value },
                  }))
                }
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
              />
            </label>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["normal", "selten", "mythisch", "ultra"] as const).map((r) => (
            <span
              key={r}
              className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2.5 py-0.5 text-xs font-bold text-purple-200"
            >
              {form.rarityLabels[r] || `(${r})`}
            </span>
          ))}
        </div>
      </div>

      {/* Perk labels */}
      <div className="mt-6 border-t border-white/10 pt-5">
        <h4 className="mb-1 flex items-center gap-2 text-sm font-bold text-zinc-200">
          <Zap className="h-4 w-4 text-amber-400" />
          Perk-Bezeichnungen
        </h4>
        <p className="mb-3 text-[11px] text-zinc-500">
          Anzeigenamen für die drei Perk-Typen (Amulett / Ring). Erscheinen in Item-Badges,
          Tooltips und Hover-Beschreibungen im Shop und Inventar.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              { key: "speed", icon: "⚡", default: "Tempo" },
              { key: "jump", icon: "↑", default: "Sprung" },
              { key: "regen", icon: "♥", default: "Regen" },
            ] as const
          ).map(({ key, icon, default: def }) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-zinc-400">
                {icon} {def}
              </span>
              <input
                type="text"
                maxLength={20}
                value={form.perkLabels[key]}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    perkLabels: { ...f.perkLabels, [key]: e.target.value },
                  }))
                }
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60"
              />
            </label>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-md border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-300">
            ⚡ +15% {form.perkLabels.speed || "—"}
          </span>
          <span className="rounded-md border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-300">
            ↑ +15% {form.perkLabels.jump || "—"}
          </span>
          <span className="rounded-md border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-300">
            ♥ +15% {form.perkLabels.regen || "—"}
          </span>
        </div>
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
