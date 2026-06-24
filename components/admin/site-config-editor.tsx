"use client";

import { useState } from "react";
import {
  Save, Loader2, Palette, Coins, Swords, ShieldHalf, Sparkles, Zap, Layout,
  ChevronUp, ChevronDown, Eye, EyeOff, Home, Megaphone, ToggleLeft, ToggleRight,
  Type, Monitor,
} from "lucide-react";
import { updateSiteConfig } from "@/lib/actions/site-config";
import {
  type SiteConfig,
  type HomepageCardId,
  DEFAULT_TOPBAR_RIGHT_SLOTS,
  DEFAULT_HOMEPAGE_CONFIG,
  ALL_HOMEPAGE_CARDS,
} from "@/lib/site-config";
import { SITE_LOGO_ICONS, resolveSiteLogoIcon, type SiteLogoIconName } from "@/lib/site-logo-icons";
import { useSoundManager } from "@/lib/sound-manager";

const ICON_NAMES = Object.keys(SITE_LOGO_ICONS) as SiteLogoIconName[];

const SLOT_LABELS: Record<string, string> = {
  games: "Spiele-Menü",
  shop: "Shop",
  auctions: "Auktionshaus",
  trading: "Trading",
  community: "Community",
  surveys: "Umfragen",
  wardrobe: "Garderobe",
  notifications: "Benachrichtigungen",
  profile: "Profil",
  logout: "Abmelden",
};

const CARD_LABELS: Record<HomepageCardId, string> = {
  shop: "Shop",
  cases: "Cases",
  garderobe: "Garderobe",
  world: "3D-Welt",
  snake: "Snake",
  mine: "Mine",
  don: "Double or Nothing",
  community: "Community",
  trading: "Trading",
  auctions: "Auktionshaus",
  surveys: "Umfragen",
};

const ANNOUNCEMENT_COLORS = [
  { key: "purple", label: "Lila", dot: "bg-purple-500" },
  { key: "amber", label: "Amber", dot: "bg-amber-500" },
  { key: "sky", label: "Blau", dot: "bg-sky-500" },
  { key: "emerald", label: "Grün", dot: "bg-emerald-500" },
  { key: "red", label: "Rot", dot: "bg-red-500" },
] as const;

export function SiteConfigEditor({ config }: { config: SiteConfig }) {
  const [form, setForm] = useState<SiteConfig>({
    ...config,
    topbarShowLabels: config.topbarShowLabels ?? false,
    topbarButtonStyle: config.topbarButtonStyle ?? "icon",
    homepageConfig: config.homepageConfig ?? { ...DEFAULT_HOMEPAGE_CONFIG },
  });
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

  function setHp<K extends keyof SiteConfig["homepageConfig"]>(
    key: K,
    value: SiteConfig["homepageConfig"][K]
  ) {
    setForm((f) => ({
      ...f,
      homepageConfig: { ...(f.homepageConfig ?? DEFAULT_HOMEPAGE_CONFIG), [key]: value },
    }));
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
      <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-zinc-100">
        <Palette className="h-5 w-5 text-pink-400" />
        Branding
      </h3>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-semibold text-zinc-400">Seitenname</span>
          <input
            type="text"
            maxLength={60}
            value={form.siteName}
            onChange={(e) => setForm((f) => ({ ...f, siteName: e.target.value }))}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
          <span className="text-[11px] text-zinc-600">
            Erscheint oben links in der Navigation, als Browser-Tab-Titel und auf der Login-Seite.
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-zinc-400">Versions-Badge (TopBar)</span>
          <input
            type="text"
            maxLength={20}
            placeholder="v1.0.0"
            value={form.siteVersion ?? "v1.0.0"}
            onChange={(e) => setForm((f) => ({ ...f, siteVersion: e.target.value }))}
            className="w-40 rounded-lg border border-purple-500/30 bg-black/30 px-3 py-1.5 text-sm text-purple-200 outline-none focus:border-purple-400/60"
          />
          <span className="text-[11px] text-zinc-600">
            Klickbarer Badge links neben dem Logo — führt zu /patchnotes.
          </span>
        </label>
      </div>

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
          Überschreibt das ausgewählte Icon, solange diese URL gesetzt ist.
        </span>
      </label>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
        <span className="text-xs text-zinc-500">Vorschau:</span>
        {form.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
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
      </label>

      {/* Global labels */}
      <div className="mt-6 border-t border-white/10 pt-5">
        <h4 className="mb-4 text-sm font-bold text-zinc-200">Globale Bezeichnungen</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
              <Coins className="h-3.5 w-3.5" />
              Währungsname
            </span>
            <input
              type="text"
              maxLength={12}
              value={form.currencyName}
              onChange={(e) => setForm((f) => ({ ...f, currencyName: e.target.value }))}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm font-semibold text-amber-100 outline-none focus:border-amber-400/60"
            />
          </div>
          <div className="flex flex-col gap-1 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
              <Swords className="h-3.5 w-3.5" />
              Schadens-Label
            </span>
            <input
              type="text"
              maxLength={12}
              value={form.damageLabel}
              onChange={(e) => setForm((f) => ({ ...f, damageLabel: e.target.value }))}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm font-semibold text-emerald-100 outline-none focus:border-emerald-400/60"
            />
          </div>
          <div className="flex flex-col gap-1 rounded-xl border border-blue-400/20 bg-blue-400/5 p-3">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-300">
              <ShieldHalf className="h-3.5 w-3.5" />
              Rüstungs-Label
            </span>
            <input
              type="text"
              maxLength={12}
              value={form.armorLabel}
              onChange={(e) => setForm((f) => ({ ...f, armorLabel: e.target.value }))}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm font-semibold text-blue-100 outline-none focus:border-blue-400/60"
            />
          </div>
        </div>
      </div>

      {/* Rarity labels */}
      <div className="mt-6 border-t border-white/10 pt-5">
        <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-200">
          <Sparkles className="h-4 w-4 text-purple-400" />
          Seltenheits-Bezeichnungen
        </h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["normal", "selten", "mythisch", "ultra"] as const).map((r) => (
            <label key={r} className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-zinc-400 capitalize">{r}</span>
              <input
                type="text"
                maxLength={20}
                value={form.rarityLabels[r]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, rarityLabels: { ...f.rarityLabels, [r]: e.target.value } }))
                }
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Perk labels */}
      <div className="mt-6 border-t border-white/10 pt-5">
        <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-200">
          <Zap className="h-4 w-4 text-amber-400" />
          Perk-Bezeichnungen
        </h4>
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              { key: "speed", icon: "⚡", default: "Tempo" },
              { key: "jump", icon: "↑", default: "Sprung" },
              { key: "regen", icon: "♥", default: "Regen" },
            ] as const
          ).map(({ key, icon, default: def }) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-zinc-400">{icon} {def}</span>
              <input
                type="text"
                maxLength={20}
                value={form.perkLabels[key]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, perkLabels: { ...f.perkLabels, [key]: e.target.value } }))
                }
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Save (branding) */}
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

      {/* ── TopBar Layout ── */}
      <TopBarLayoutEditor
        slots={form.topbarRightSlots ?? [...DEFAULT_TOPBAR_RIGHT_SLOTS]}
        showLabels={form.topbarShowLabels ?? false}
        buttonStyle={form.topbarButtonStyle ?? "icon"}
        onChange={(slots) => setForm((f) => ({ ...f, topbarRightSlots: slots }))}
        onShowLabelsChange={(v) => setForm((f) => ({ ...f, topbarShowLabels: v }))}
        onButtonStyleChange={(v) => setForm((f) => ({ ...f, topbarButtonStyle: v }))}
        onSave={handleSave}
        saving={saving}
        message={message}
        sound={sound}
      />

      {/* ── Homepage Config ── */}
      <HomepageConfigEditor
        cfg={form.homepageConfig ?? DEFAULT_HOMEPAGE_CONFIG}
        onHeroTitle={(v) => setHp("heroTitle", v)}
        onHeroSubtitle={(v) => setHp("heroSubtitle", v)}
        onShowStats={(v) => setHp("showStats", v)}
        onShowLeaderboard={(v) => setHp("showLeaderboard", v)}
        onShowFeatureCards={(v) => setHp("showFeatureCards", v)}
        onCardOrder={(v) => setHp("cardOrder", v)}
        onDisabledCards={(v) => setHp("disabledCards", v)}
        onAnnouncementEnabled={(v) => setHp("announcementEnabled", v)}
        onAnnouncementText={(v) => setHp("announcementText", v)}
        onAnnouncementColor={(v) => setHp("announcementColor", v)}
        onShowStreakLeaderboard={(v) => setHp("showStreakLeaderboard", v)}
        onLeaderboardStyle={(v) => setHp("leaderboardStyle", v)}
        onSave={handleSave}
        saving={saving}
        message={message}
        sound={sound}
      />
    </div>
  );
}

// ── TopBar Layout Editor ────────────────────────────────────────────────────

function TopBarLayoutEditor({
  slots,
  showLabels,
  buttonStyle,
  onChange,
  onShowLabelsChange,
  onButtonStyleChange,
  onSave,
  saving,
  message,
  sound,
}: {
  slots: string[];
  showLabels: boolean;
  buttonStyle: "icon" | "pill";
  onChange: (slots: string[]) => void;
  onShowLabelsChange: (v: boolean) => void;
  onButtonStyleChange: (v: "icon" | "pill") => void;
  onSave: () => void;
  saving: boolean;
  message: string | null;
  sound: { hover: () => void; click: () => void };
}) {
  const allSlots = [...DEFAULT_TOPBAR_RIGHT_SLOTS];

  function moveUp(i: number) {
    if (i === 0) return;
    const next = [...slots];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onChange(next);
  }

  function moveDown(i: number) {
    if (i === slots.length - 1) return;
    const next = [...slots];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    onChange(next);
  }

  function toggle(slot: string) {
    if (slots.includes(slot)) {
      onChange(slots.filter((s) => s !== slot));
    } else {
      onChange([...slots, slot]);
    }
  }

  return (
    <div className="mt-6 border-t border-white/10 pt-5">
      <h4 className="mb-1 flex items-center gap-2 text-sm font-bold text-zinc-200">
        <Layout className="h-4 w-4 text-purple-400" />
        TopBar-Layout (rechte Seite)
      </h4>
      <p className="mb-4 text-[11px] text-zinc-500">
        Aktiviere Buttons und lege die Reihenfolge fest. Logo, Credits und Admin/Mod-Buttons sind immer sichtbar.
      </p>

      {/* Button style controls */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Show labels toggle */}
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
              <Type className="h-3.5 w-3.5 text-indigo-400" />
              Button-Beschriftungen
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5">Icon + Textlabel anzeigen</p>
          </div>
          <button
            onMouseEnter={sound.hover}
            onClick={() => { sound.click(); onShowLabelsChange(!showLabels); }}
            className="transition-colors"
          >
            {showLabels ? (
              <ToggleRight className="h-7 w-7 text-purple-400" />
            ) : (
              <ToggleLeft className="h-7 w-7 text-zinc-600" />
            )}
          </button>
        </div>

        {/* Button style */}
        <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <p className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
            <Monitor className="h-3.5 w-3.5 text-sky-400" />
            Button-Stil
          </p>
          <div className="flex gap-2">
            {(["icon", "pill"] as const).map((style) => (
              <button
                key={style}
                onMouseEnter={sound.hover}
                onClick={() => { sound.click(); onButtonStyleChange(style); }}
                className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  buttonStyle === style
                    ? "border-purple-400/60 bg-purple-500/20 text-purple-200"
                    : "border-white/10 text-zinc-500 hover:border-white/20 hover:text-zinc-300"
                }`}
              >
                {style === "icon" ? "Icon-Only" : "Icon + Text"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Active slots */}
      <div className="mb-3 flex flex-col gap-1.5">
        {slots.map((slot, i) => (
          <div key={slot} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <span className="w-4 text-center text-xs font-bold text-zinc-600">{i + 1}</span>
            <span className="flex-1 text-xs font-semibold text-zinc-200">{SLOT_LABELS[slot] ?? slot}</span>
            <button
              onMouseEnter={sound.hover}
              onClick={() => { sound.click(); moveUp(i); }}
              disabled={i === 0}
              className="rounded p-0.5 text-zinc-500 hover:text-zinc-200 disabled:opacity-20"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              onMouseEnter={sound.hover}
              onClick={() => { sound.click(); moveDown(i); }}
              disabled={i === slots.length - 1}
              className="rounded p-0.5 text-zinc-500 hover:text-zinc-200 disabled:opacity-20"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              onMouseEnter={sound.hover}
              onClick={() => { sound.click(); toggle(slot); }}
              className="rounded p-0.5 text-emerald-400 hover:text-emerald-300"
              title="Ausblenden"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Hidden slots */}
      {allSlots.filter((s) => !slots.includes(s)).length > 0 && (
        <div className="mb-3 flex flex-col gap-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600">Ausgeblendet</p>
          {allSlots.filter((s) => !slots.includes(s)).map((slot) => (
            <div key={slot} className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.01] px-3 py-2 opacity-50">
              <span className="flex-1 text-xs font-semibold text-zinc-500">{SLOT_LABELS[slot] ?? slot}</span>
              <button
                onMouseEnter={sound.hover}
                onClick={() => { sound.click(); toggle(slot); }}
                className="rounded p-0.5 text-zinc-600 hover:text-zinc-300"
                title="Einblenden"
              >
                <EyeOff className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onMouseEnter={sound.hover}
          onClick={onSave}
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

// ── Homepage Config Editor ──────────────────────────────────────────────────

function HomepageConfigEditor({
  cfg,
  onHeroTitle,
  onHeroSubtitle,
  onShowStats,
  onShowLeaderboard,
  onShowFeatureCards,
  onCardOrder,
  onDisabledCards,
  onAnnouncementEnabled,
  onAnnouncementText,
  onAnnouncementColor,
  onShowStreakLeaderboard,
  onLeaderboardStyle,
  onSave,
  saving,
  message,
  sound,
}: {
  cfg: SiteConfig["homepageConfig"];
  onHeroTitle: (v: string) => void;
  onHeroSubtitle: (v: string) => void;
  onShowStats: (v: boolean) => void;
  onShowLeaderboard: (v: boolean) => void;
  onShowFeatureCards: (v: boolean) => void;
  onCardOrder: (v: HomepageCardId[]) => void;
  onDisabledCards: (v: HomepageCardId[]) => void;
  onAnnouncementEnabled: (v: boolean) => void;
  onAnnouncementText: (v: string) => void;
  onAnnouncementColor: (v: SiteConfig["homepageConfig"]["announcementColor"]) => void;
  onShowStreakLeaderboard: (v: boolean) => void;
  onLeaderboardStyle: (v: "podium" | "list") => void;
  onSave: () => void;
  saving: boolean;
  message: string | null;
  sound: { hover: () => void; click: () => void };
}) {
  const enabledCards = cfg.cardOrder.filter((id) => !cfg.disabledCards.includes(id));
  const disabledCards = ALL_HOMEPAGE_CARDS.filter((id) => cfg.disabledCards.includes(id));

  function moveCardUp(i: number) {
    if (i === 0) return;
    const next = [...cfg.cardOrder];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onCardOrder(next);
  }

  function moveCardDown(i: number) {
    const enabled = cfg.cardOrder.filter((id) => !cfg.disabledCards.includes(id));
    if (i === enabled.length - 1) return;
    const enabledIdx = cfg.cardOrder.indexOf(enabled[i]);
    const nextEnabledIdx = cfg.cardOrder.indexOf(enabled[i + 1]);
    const next = [...cfg.cardOrder];
    [next[enabledIdx], next[nextEnabledIdx]] = [next[nextEnabledIdx], next[enabledIdx]];
    onCardOrder(next);
  }

  function toggleCard(id: HomepageCardId) {
    if (cfg.disabledCards.includes(id)) {
      onDisabledCards(cfg.disabledCards.filter((c) => c !== id));
    } else {
      onDisabledCards([...cfg.disabledCards, id]);
      if (!cfg.cardOrder.includes(id)) {
        onCardOrder([...cfg.cardOrder, id]);
      }
    }
  }

  return (
    <div className="mt-6 border-t border-white/10 pt-5">
      <h4 className="mb-1 flex items-center gap-2 text-sm font-bold text-zinc-200">
        <Home className="h-4 w-4 text-fuchsia-400" />
        Startseite konfigurieren
      </h4>
      <p className="mb-5 text-[11px] text-zinc-500">
        Steuere Inhalt, Reihenfolge und Ankündigungen der Startseite — alles in Echtzeit nach dem Speichern.
      </p>

      {/* Hero text */}
      <div className="mb-5 rounded-xl border border-white/8 bg-white/[0.02] p-4">
        <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
          <Type className="h-3.5 w-3.5" />
          Hero-Text
        </p>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-zinc-400">
              Titel <span className="text-zinc-600">(leer = Seitenname wird genutzt)</span>
            </span>
            <input
              type="text"
              maxLength={80}
              placeholder="z.B. Willkommen zurück!"
              value={cfg.heroTitle}
              onChange={(e) => onHeroTitle(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-fuchsia-400/60"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-zinc-400">Untertitel</span>
            <textarea
              maxLength={200}
              rows={2}
              value={cfg.heroSubtitle}
              onChange={(e) => onHeroSubtitle(e.target.value)}
              className="resize-none rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-fuchsia-400/60"
            />
          </label>
        </div>
      </div>

      {/* Announcement */}
      <div className="mb-5 rounded-xl border border-white/8 bg-white/[0.02] p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
            <Megaphone className="h-3.5 w-3.5" />
            Ankündigung
          </p>
          <button
            onMouseEnter={sound.hover}
            onClick={() => { sound.click(); onAnnouncementEnabled(!cfg.announcementEnabled); }}
          >
            {cfg.announcementEnabled ? (
              <ToggleRight className="h-6 w-6 text-purple-400" />
            ) : (
              <ToggleLeft className="h-6 w-6 text-zinc-600" />
            )}
          </button>
        </div>
        <label className="mb-3 flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-zinc-400">Ankündigungstext</span>
          <input
            type="text"
            maxLength={300}
            placeholder="z.B. Doppelte Credits dieses Wochenende!"
            value={cfg.announcementText}
            onChange={(e) => onAnnouncementText(e.target.value)}
            disabled={!cfg.announcementEnabled}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-fuchsia-400/60 disabled:opacity-40"
          />
        </label>
        <div>
          <p className="mb-2 text-[11px] font-semibold text-zinc-400">Farbe</p>
          <div className="flex flex-wrap gap-2">
            {ANNOUNCEMENT_COLORS.map(({ key, label, dot }) => (
              <button
                key={key}
                onMouseEnter={sound.hover}
                onClick={() => { sound.click(); onAnnouncementColor(key); }}
                disabled={!cfg.announcementEnabled}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
                  cfg.announcementColor === key
                    ? "border-white/30 bg-white/10 text-zinc-100"
                    : "border-white/10 text-zinc-400 hover:border-white/20"
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Section toggles */}
      <div className="mb-5 rounded-xl border border-white/8 bg-white/[0.02] p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">
          Sektionen ein-/ausblenden
        </p>
        <div className="flex flex-col gap-2">
          {[
            { key: "showStats", label: "Statistik-Zeile (Online, Spieler, Credits)", value: cfg.showStats, onChange: onShowStats },
            { key: "showFeatureCards", label: "Feature-Cards (alle Spielbereiche)", value: cfg.showFeatureCards, onChange: onShowFeatureCards },
            { key: "showLeaderboard", label: "Bestenliste", value: cfg.showLeaderboard, onChange: onShowLeaderboard },
          ].map(({ key, label, value, onChange }) => (
            <div key={key} className="flex items-center justify-between gap-3 rounded-lg border border-white/6 bg-black/20 px-3 py-2.5">
              <span className="text-xs font-semibold text-zinc-300">{label}</span>
              <button
                onMouseEnter={sound.hover}
                onClick={() => { sound.click(); onChange(!value); }}
              >
                {value ? (
                  <ToggleRight className="h-6 w-6 text-purple-400" />
                ) : (
                  <ToggleLeft className="h-6 w-6 text-zinc-600" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Leaderboard options */}
      <div className="mb-5 rounded-xl border border-white/8 bg-white/[0.02] p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">
          Bestenliste — Optionen
        </p>

        {/* Streak tab toggle */}
        <div className="mb-3 flex items-center justify-between rounded-lg border border-white/6 bg-black/20 px-3 py-2.5">
          <span className="text-xs font-semibold text-zinc-300">Streak-Tab anzeigen</span>
          <button
            onMouseEnter={sound.hover}
            onClick={() => { sound.click(); onShowStreakLeaderboard(!cfg.showStreakLeaderboard); }}
          >
            {cfg.showStreakLeaderboard ? (
              <ToggleRight className="h-6 w-6 text-purple-400" />
            ) : (
              <ToggleLeft className="h-6 w-6 text-zinc-600" />
            )}
          </button>
        </div>

        {/* Style picker */}
        <div>
          <p className="mb-2 text-[11px] font-semibold text-zinc-400">Darstellungsstil</p>
          <div className="flex gap-2">
            {(["podium", "list"] as const).map((s) => (
              <button
                key={s}
                onMouseEnter={sound.hover}
                onClick={() => { sound.click(); onLeaderboardStyle(s); }}
                className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  cfg.leaderboardStyle === s
                    ? "border-purple-400/60 bg-purple-500/20 text-purple-200"
                    : "border-white/10 text-zinc-500 hover:border-white/20 hover:text-zinc-300"
                }`}
              >
                {s === "podium" ? "🏆 Podium (Top 3 + Liste)" : "📋 Kompakte Liste"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Feature card order */}
      <div className="mb-5 rounded-xl border border-white/8 bg-white/[0.02] p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">
          Feature-Cards — Reihenfolge & Sichtbarkeit
        </p>
        <div className="mb-2 flex flex-col gap-1.5">
          {enabledCards.map((id, i) => (
            <div key={id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <span className="w-4 text-center text-xs font-bold text-zinc-600">{i + 1}</span>
              <span className="flex-1 text-xs font-semibold text-zinc-200">{CARD_LABELS[id]}</span>
              <button
                onMouseEnter={sound.hover}
                onClick={() => { sound.click(); moveCardUp(i); }}
                disabled={i === 0}
                className="rounded p-0.5 text-zinc-500 hover:text-zinc-200 disabled:opacity-20"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                onMouseEnter={sound.hover}
                onClick={() => { sound.click(); moveCardDown(i); }}
                disabled={i === enabledCards.length - 1}
                className="rounded p-0.5 text-zinc-500 hover:text-zinc-200 disabled:opacity-20"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                onMouseEnter={sound.hover}
                onClick={() => { sound.click(); toggleCard(id); }}
                className="rounded p-0.5 text-emerald-400 hover:text-emerald-300"
                title="Verstecken"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        {disabledCards.length > 0 && (
          <>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">Versteckt</p>
            <div className="flex flex-col gap-1.5">
              {disabledCards.map((id) => (
                <div key={id} className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.01] px-3 py-2 opacity-50">
                  <span className="flex-1 text-xs font-semibold text-zinc-500">{CARD_LABELS[id]}</span>
                  <button
                    onMouseEnter={sound.hover}
                    onClick={() => { sound.click(); toggleCard(id); }}
                    className="rounded p-0.5 text-zinc-600 hover:text-zinc-300"
                    title="Einblenden"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onMouseEnter={sound.hover}
          onClick={onSave}
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
