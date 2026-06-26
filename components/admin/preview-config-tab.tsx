"use client";

import { useEffect, useState, useTransition } from "react";
import { Eye, RotateCcw, Save, Sparkles } from "lucide-react";
import { getPreviewConfig, updatePreviewConfig } from "@/lib/actions/preview-config";
import { UniversalPreviewModal, type PreviewSubject } from "@/components/ui/universal-preview-modal";
import { DEFAULT_PREVIEW_CONFIG, type PreviewConfig } from "@/lib/preview-config-types";

const DEMO_SUBJECTS: { label: string; subject: PreviewSubject }[] = [
  { label: "Item (Waffe)", subject: { kind: "item", item: { id: "demo-1", name: "Donner-Schwert", rarity: "mythisch", type: "weapon_cosmetic", damage: 28 } } },
  { label: "Name Style", subject: { kind: "name_style", styleKey: "rainbow_shimmer", displayName: "DeinName" } },
  { label: "Badge (Admin)", subject: { kind: "badge", badgeKey: "admin", badgeText: "Admin" } },
  { label: "Badge (Premium)", subject: { kind: "badge", badgeKey: "premium", badgeText: "Premium" } },
  { label: "Ability", subject: { kind: "ability", abilityKey: "speed_boost", name: "Speed Boost", category: "Bewegung", icon: "⚡", rarity: "selten", effectValue: 0.25 } },
  { label: "Credits", subject: { kind: "credits", amount: 5000 } },
  { label: "XP Boost", subject: { kind: "xp_boost", days: 7 } },
  { label: "Zufalls-Item", subject: { kind: "random_item", rarity: "mythisch" } },
];

function Slider({ label, value, min, max, step = 0.1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-zinc-300">{label}</label>
        <span className="font-mono text-xs text-purple-300">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-purple-500"
      />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 transition-colors ${
        checked ? "border-purple-500/40 bg-purple-500/10 text-purple-200" : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06]"
      }`}
    >
      <span className="text-xs font-semibold">{label}</span>
      <div className={`h-4 w-7 rounded-full transition-colors ${checked ? "bg-purple-500" : "bg-zinc-700"}`}>
        <div className={`mt-0.5 h-3 w-3 rounded-full bg-white transition-transform ${checked ? "translate-x-3.5 ml-0" : "ml-0.5"}`} />
      </div>
    </button>
  );
}

export function PreviewConfigTab() {
  const [config, setConfig] = useState<Omit<PreviewConfig, "id" | "updatedAt">>(DEFAULT_PREVIEW_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoSubject, setDemoSubject] = useState<PreviewSubject | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getPreviewConfig().then((cfg) => {
      setConfig({
        item3dAutoRotate: cfg.item3dAutoRotate,
        item3dRotationSpeed: cfg.item3dRotationSpeed,
        item3dCameraFov: cfg.item3dCameraFov,
        item3dCameraDistance: cfg.item3dCameraDistance,
        nameStyleSize: cfg.nameStyleSize,
        nameStyleGlowPulse: cfg.nameStyleGlowPulse,
        badgeGlowEnabled: cfg.badgeGlowEnabled,
        badgeGlowIntensity: cfg.badgeGlowIntensity,
        particleEffectsEnabled: cfg.particleEffectsEnabled,
        previewBgStyle: cfg.previewBgStyle,
      });
      setLoading(false);
    });
  }, []);

  function set<K extends keyof typeof config>(k: K, v: (typeof config)[K]) {
    setConfig((c) => ({ ...c, [k]: v }));
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updatePreviewConfig(config);
      if (result.success) setSaved(true);
      else setError(result.error ?? "Unbekannter Fehler");
    });
  }

  function handleReset() {
    const { id: _id, updatedAt: _u, ...defaults } = DEFAULT_PREVIEW_CONFIG;
    setConfig(defaults);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  const fullConfig: PreviewConfig = { ...config, id: "default", updatedAt: null };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-purple-500/20 bg-purple-500/10">
          <Eye className="h-5 w-5 text-purple-400" />
        </div>
        <div>
          <h2 className="text-lg font-black text-zinc-100">Preview-Engine Konfiguration</h2>
          <p className="text-xs text-zinc-500">Steuert wie Objekte in allen Vorschau-Modals aussehen</p>
        </div>
      </div>

      {/* 3D Item Settings */}
      <section className="space-y-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
        <h3 className="flex items-center gap-2 text-sm font-black text-zinc-200">
          <Sparkles className="h-4 w-4 text-purple-400" />
          3D Item-Vorschau
        </h3>
        <Toggle label="Auto-Rotation" checked={config.item3dAutoRotate} onChange={(v) => set("item3dAutoRotate", v)} />
        <Slider label="Rotationsgeschwindigkeit" value={config.item3dRotationSpeed} min={0.2} max={6} step={0.1} onChange={(v) => set("item3dRotationSpeed", v)} />
        <Slider label="Kamera FOV" value={config.item3dCameraFov} min={20} max={80} step={1} onChange={(v) => set("item3dCameraFov", v)} />
        <Slider label="Kamera-Abstand" value={config.item3dCameraDistance} min={1.5} max={6} step={0.1} onChange={(v) => set("item3dCameraDistance", v)} />
      </section>

      {/* Name Style Settings */}
      <section className="space-y-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
        <h3 className="text-sm font-black text-zinc-200">Name-Style Vorschau</h3>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-300">Schriftgröße</label>
          <div className="flex gap-2">
            {(["lg", "xl", "2xl", "hero"] as const).map((s) => (
              <button
                key={s}
                onClick={() => set("nameStyleSize", s)}
                className={`flex-1 rounded-lg border py-1.5 text-xs font-bold transition-colors ${
                  config.nameStyleSize === s
                    ? "border-purple-500/50 bg-purple-500/15 text-purple-200"
                    : "border-white/10 bg-white/[0.03] text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <Toggle label="Glow-Pulse Animation" checked={config.nameStyleGlowPulse} onChange={(v) => set("nameStyleGlowPulse", v)} />
      </section>

      {/* Badge Settings */}
      <section className="space-y-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
        <h3 className="text-sm font-black text-zinc-200">Badge Vorschau</h3>
        <Toggle label="Glow-Effekt" checked={config.badgeGlowEnabled} onChange={(v) => set("badgeGlowEnabled", v)} />
        <Slider label="Glow-Intensität" value={config.badgeGlowIntensity} min={20} max={100} step={5} onChange={(v) => set("badgeGlowIntensity", v)} />
      </section>

      {/* Master Settings */}
      <section className="space-y-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
        <h3 className="text-sm font-black text-zinc-200">Global</h3>
        <Toggle label="Partikel-Effekte" checked={config.particleEffectsEnabled} onChange={(v) => set("particleEffectsEnabled", v)} />
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-300">Hintergrund-Stil</label>
          <div className="flex gap-2">
            {(["dark", "space", "glass"] as const).map((s) => (
              <button
                key={s}
                onClick={() => set("previewBgStyle", s)}
                className={`flex-1 rounded-lg border py-1.5 text-xs font-bold capitalize transition-colors ${
                  config.previewBgStyle === s
                    ? "border-purple-500/50 bg-purple-500/15 text-purple-200"
                    : "border-white/10 bg-white/[0.03] text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Live Demo */}
      <section className="space-y-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
        <h3 className="text-sm font-black text-zinc-200">Live-Demo</h3>
        <p className="text-xs text-zinc-500">Test die aktuelle Konfiguration ohne zu speichern.</p>
        <div className="flex flex-wrap gap-2">
          {DEMO_SUBJECTS.map(({ label, subject }) => (
            <button
              key={label}
              onClick={() => setDemoSubject(subject)}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-purple-500/15 hover:text-purple-200 hover:border-purple-500/30"
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleReset}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-zinc-400 transition-colors hover:bg-white/[0.07]"
        >
          <RotateCcw className="h-4 w-4" />
          Zurücksetzen
        </button>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/15 px-6 py-2 text-sm font-black text-purple-200 transition-colors hover:bg-purple-500/25 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {isPending ? "Speichern…" : "Speichern"}
        </button>
        {saved && <span className="text-xs font-semibold text-emerald-400">Gespeichert!</span>}
        {error && <span className="text-xs font-semibold text-red-400">{error}</span>}
      </div>

      {demoSubject && (
        <UniversalPreviewModal
          subject={demoSubject}
          previewConfig={fullConfig}
          onClose={() => setDemoSubject(null)}
        />
      )}
    </div>
  );
}
