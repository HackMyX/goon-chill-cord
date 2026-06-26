"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Palette, Save, Check, Loader2, AlertTriangle, Eye, Users, Sparkles } from "lucide-react";
import { getThemeConfig, saveThemeConfig } from "@/lib/actions/theme";
import {
  THEME_CATALOG, DEFAULT_THEME_CONFIG,
  type ThemeConfig, type ThemeKey,
} from "@/lib/theme-config";
import { useSoundManager } from "@/lib/sound-manager";
import { AdminTooltip } from "@/components/admin/admin-tooltip";

/** Apply a theme to <html> for instant live preview. */
function applyThemePreview(key: ThemeKey) {
  const el = document.documentElement;
  if (key === "default") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", key);
}

export function ThemeConfigEditor() {
  const [config, setConfig] = useState<ThemeConfig>(DEFAULT_THEME_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const sound = useSoundManager();

  // The theme that is actually persisted — restore to this if the admin
  // leaves without saving, so a preview never gets stranded.
  const savedThemeRef = useRef<ThemeKey>("default");

  useEffect(() => {
    getThemeConfig().then((cfg) => {
      setConfig(cfg);
      savedThemeRef.current = cfg.activeTheme;
      setLoading(false);
    });
  }, []);

  // On unmount, restore the persisted theme (discard unsaved preview).
  useEffect(() => {
    return () => applyThemePreview(savedThemeRef.current);
  }, []);

  const selectTheme = useCallback((key: ThemeKey) => {
    setConfig((c) => ({ ...c, activeTheme: key }));
    applyThemePreview(key); // instant, site-wide live preview
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    const res = await saveThemeConfig(config);
    setSaving(false);
    if (res.success) {
      savedThemeRef.current = config.activeTheme;
      sound.save();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      sound.error();
      setError(res.error ?? "Fehler beim Speichern.");
    }
  }, [config, sound]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-zinc-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Lade Theme-Konfiguration…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header + Save */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Palette className="h-5 w-5 text-purple-400" />
          <div>
            <p className="text-base font-extrabold text-zinc-100">Theming-Engine</p>
            <p className="text-[11px] text-zinc-500">
              {THEME_CATALOG.length} Designs · greift seitenweit (inkl. Admin-Panel) · Live-Vorschau aktiv
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-5 py-2 text-sm font-bold text-purple-300 hover:bg-purple-500/20 transition-colors disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4 text-emerald-400" /> : <Save className="h-4 w-4" />}
          {saved ? "Gespeichert!" : "Speichern"}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Live preview hint */}
      <div className="flex items-start gap-2.5 rounded-xl border border-purple-900/40 bg-purple-950/20 px-4 py-3">
        <Eye className="h-4 w-4 shrink-0 text-purple-400/80 mt-0.5" />
        <p className="text-xs text-purple-300/80">
          <strong>Live-Vorschau:</strong> Klick auf ein Design wendet es sofort auf die ganze Seite an (auch hier im Admin-Panel).
          Erst <strong>Speichern</strong> macht es für alle Nutzer dauerhaft — die Änderung greift bei allen <em>ohne Reload</em> (Echtzeit).
          Verlässt du den Tab ohne zu speichern, wird das gespeicherte Design wiederhergestellt.
        </p>
      </div>

      {/* Theme grid */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 border border-purple-500/20">
            <Sparkles className="h-3.5 w-3.5 text-purple-400" />
          </div>
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-400">
            Gesamt-Designs
            <AdminTooltip text="Jedes Design tauscht die komplette Markenfarbe (alle violetten Akzente), die Hintergrund-Stimmung und die animierten Glow-Blobs aus — auf jeder Seite, in jedem Spiel und im Admin-Panel. Klick = Live-Vorschau, Speichern = global für alle." />
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {THEME_CATALOG.map((t) => {
            const active = config.activeTheme === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => selectTheme(t.key)}
                className={`group relative flex flex-col gap-2 overflow-hidden rounded-xl border p-3 text-left transition-all ${
                  active
                    ? "border-purple-400/70 ring-2 ring-purple-500/40"
                    : "border-white/8 hover:border-white/20"
                }`}
                style={{ background: t.bg }}
              >
                {/* Swatch / mini mockup */}
                <div className="relative h-20 w-full overflow-hidden rounded-lg">
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `radial-gradient(120% 100% at 0% 0%, ${t.brand} 0%, transparent 55%), radial-gradient(120% 100% at 100% 100%, ${t.accent} 0%, transparent 60%)`,
                      opacity: 0.55,
                    }}
                  />
                  <div className="absolute bottom-2 left-2 flex gap-1.5">
                    <span className="h-4 w-4 rounded-full ring-1 ring-white/20" style={{ background: t.brand }} />
                    <span className="h-4 w-4 rounded-full ring-1 ring-white/20" style={{ background: t.accent }} />
                  </div>
                  {active && (
                    <span className="absolute top-2 right-2 flex h-5 items-center gap-1 rounded-full bg-black/60 px-2 text-[9px] font-bold text-white backdrop-blur">
                      <Check className="h-3 w-3" /> AKTIV
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">{t.label}</span>
                </div>
                <p className="text-[11px] leading-snug text-zinc-400">{t.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* User control */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 border border-purple-500/20">
            <Users className="h-3.5 w-3.5 text-purple-400" />
          </div>
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-400">
            Nutzer-Designwahl
            <AdminTooltip text="Wenn aktiv, dürfen Nutzer aus den Designs ihr eigenes wählen (gespeichert lokal im Browser). Ist es aus, gilt für alle zwingend das oben gewählte Design (Diktatur-Modus). Standard: AUS." />
          </p>
        </div>
        <label className="flex cursor-pointer items-start gap-3">
          <div className="relative mt-0.5 shrink-0">
            <div
              onClick={() => setConfig((c) => ({ ...c, allowUserChoice: !c.allowUserChoice }))}
              className={`h-6 w-11 rounded-full border transition-colors cursor-pointer ${
                config.allowUserChoice ? "border-purple-500/60 bg-purple-500/30" : "border-zinc-700 bg-zinc-800"
              }`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full shadow transition-all ${
                config.allowUserChoice ? "left-5 bg-purple-400" : "left-0.5 bg-zinc-600"
              }`} />
            </div>
          </div>
          <div>
            <p className="text-sm text-zinc-200">Nutzer dürfen eigenes Design wählen</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {config.allowUserChoice
                ? "An — Nutzer können ihr Design selbst setzen (überschreibt das globale für sie)."
                : "Aus — für alle gilt zwingend das oben gewählte globale Design."}
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}
