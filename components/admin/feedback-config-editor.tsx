"use client";

import { useEffect, useState } from "react";
import { Save, CheckCircle, XCircle, RotateCcw, Sparkles, Play } from "lucide-react";
import { getFeedbackConfig, saveFeedbackConfig } from "@/lib/actions/feedback-config";
import { useSoundManager } from "@/lib/sound-manager";
import {
  DEFAULT_FEEDBACK_CONFIG, FEEDBACK_EVENT_META, FEEDBACK_ANIMATIONS, FEEDBACK_STYLES, FEEDBACK_POSITIONS,
  FEEDBACK_INTENSITIES, FEEDBACK_PARTICLES,
  LIMIT_METER_STYLES, feedbackAnimationStyle, hexToRgba, resolveFeedbackConfig,
  type FeedbackConfig, type FeedbackEventConfig, type FeedbackEventKey,
  type FeedbackAnimation, type FeedbackStyle, type FeedbackPosition,
  type FeedbackIntensity, type FeedbackParticle,
  type LimitMeterConfig, type LimitMeterStyle,
} from "@/lib/feedback-config";
import { LimitMeterPreview } from "@/components/rewards/limit-meter";
import { ParticleField } from "@/components/layout/feedback-host";
import { INTENSITY_FACTOR } from "@/lib/feedback-config";
import { Gauge } from "lucide-react";

const STYLE_LABEL: Record<FeedbackStyle, string> = { toast: "Toast (Pille)", popup: "Popup (Karte)", confetti: "Popup + Konfetti" };
const POSITION_LABEL: Record<FeedbackPosition, string> = { "top": "Oben Mitte", "top-right": "Oben rechts", "bottom": "Unten Mitte", "bottom-right": "Unten rechts" };
const ANIM_LABEL: Record<FeedbackAnimation, string> = {
  "pop": "Pop", "slide-up": "Hoch schieben", "slide-down": "Runter schieben",
  "zoom": "Zoom + Dreh", "bounce": "Bounce", "flip": "Flip", "fade": "Einblenden", "glow": "Glow-Flash",
  "drop": "Fallen lassen", "rubber": "Gummi", "swing": "Schwingen",
};
const LIMIT_STYLE_LABEL: Record<LimitMeterStyle, string> = { bar: "Balken", segments: "Segmente", ring: "Ring" };
const INTENSITY_LABEL: Record<FeedbackIntensity, string> = { subtle: "Dezent", normal: "Normal", epic: "Episch 🔥" };
const PARTICLE_LABEL: Record<FeedbackParticle, string> = { confetti: "Konfetti", fireworks: "Feuerwerk", stars: "Sterne", streamers: "Luftschlangen" };

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
    >
      <span className={`relative block h-6 w-11 rounded-full transition-colors duration-200 ${checked ? "bg-purple-600" : "bg-white/10"}`}>
        <span className={`absolute left-0 top-[2px] h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? "translate-x-[22px]" : "translate-x-[2px]"}`} />
      </span>
    </button>
  );
}

function Select<T extends string>({ value, options, labels, onChange }: {
  value: T; options: T[]; labels: Record<T, string>; onChange: (v: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-purple-400/50"
    >
      {options.map((o) => <option key={o} value={o} className="bg-zinc-900">{labels[o]}</option>)}
    </select>
  );
}

function ColorPick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span className="flex items-center gap-1.5">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-white/10 bg-transparent p-0" />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="w-[72px] rounded border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] font-mono text-zinc-300 outline-none" />
    </span>
  );
}

/** Parse a percent text input → clamped 0..1 ratio (keeps low/mid thresholds ordered). */
function clampPct(raw: string, minPct: number, maxPct: number): number {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return minPct / 100;
  return Math.max(minPct, Math.min(maxPct, n)) / 100;
}

export function FeedbackConfigEditor() {
  const [form, setForm] = useState<FeedbackConfig>(DEFAULT_FEEDBACK_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [previewKey, setPreviewKey] = useState<Record<string, number>>({});
  const sound = useSoundManager();

  // Load current config once.
  useEffect(() => {
    getFeedbackConfig().then((c) => { setForm(c); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  const setEvent = (key: FeedbackEventKey, patch: Partial<FeedbackEventConfig>) =>
    setForm((f) => ({ ...f, events: { ...f.events, [key]: { ...f.events[key], ...patch } } }));

  const setLimit = (patch: Partial<LimitMeterConfig>) =>
    setForm((f) => ({ ...f, limitMeter: { ...f.limitMeter, ...patch } }));

  async function save() {
    setSaving(true);
    sound.click();
    const res = await saveFeedbackConfig(resolveFeedbackConfig(form));
    setSaving(false);
    if (res.success) sound.save(); else sound.error();
    setMsg({ text: res.error ?? "Gespeichert!", ok: res.success });
    if (res.success) setTimeout(() => setMsg(null), 3000);
  }

  function preview(key: FeedbackEventKey) {
    setPreviewKey((p) => ({ ...p, [key]: (p[key] ?? 0) + 1 }));
    const ev = form.events[key];
    if (ev.sound) sound.win();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-amber-400" />
        <span className="text-base font-extrabold text-zinc-100">Belohnungs-Feedback</span>
      </div>
      <p className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3 text-[12px] leading-relaxed text-amber-100/90">
        Steuere <strong>jedes</strong> Belohnungs-Feedback der Seite: XP, Level-Up, Meilensteine, Tages- &amp;
        Battle-Pass-Quests, Battle-Pass-Stufen und allgemeine Belohnungen. Pro Event: Farbe, Animation, Stil,
        Dauer, Sound, Konfetti und An/Aus. Nutzer können einzelne Typen zusätzlich in ihrem Profil
        (<code className="text-amber-300">/account</code>) abschalten. Änderungen sind sofort live.
      </p>

      {msg && (
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${
          msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"
        }`}>
          {msg.ok ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{msg.text}
        </div>
      )}

      {/* Master */}
      <div className="rounded-xl border border-white/8 bg-black/10 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-zinc-100">Feedback aktiviert (Master)</p>
            <p className="text-xs text-zinc-500">Schaltet alle Belohnungs-Popups/Toasts global ein oder aus.</p>
          </div>
          <Toggle checked={form.enabled} onChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-4 border-t border-white/8 pt-3">
          <div>
            <p className="text-sm font-bold text-zinc-100">Position</p>
            <p className="text-xs text-zinc-500">Wo Toasts &amp; Popups erscheinen.</p>
          </div>
          <Select<FeedbackPosition> value={form.position} options={FEEDBACK_POSITIONS} labels={POSITION_LABEL} onChange={(v) => setForm((f) => ({ ...f, position: v }))} />
        </div>
      </div>

      {/* ── Spiel-Limit-Anzeige (LimitMeter) ──────────────────────────────── */}
      {(() => {
        const lm = form.limitMeter;
        return (
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-extrabold text-zinc-100">
                  <Gauge className="h-4 w-4 text-cyan-300" /> Spiel-Limit-Anzeige
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
                  Die animierte „Restanzahl"-Anzeige in Plinko, Snake &amp; Double-or-Nothing (z. B. „Bälle/h").
                  Farbe wechselt automatisch grün → gelb → rot, je weniger übrig ist. Nutzer können sie in
                  <code className="mx-1 text-cyan-300">/account</code> ausblenden.
                </p>
              </div>
              <span title="Schaltet die schicke Limit-Anzeige an. Aus = nur ein schlichter Text (3/10).">
                <Toggle checked={lm.enabled} onChange={(v) => setLimit({ enabled: v })} />
              </span>
            </div>

            <div className={`mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 ${lm.enabled ? "" : "pointer-events-none opacity-40"}`}>
              <label className="flex items-center justify-between gap-2 text-xs text-zinc-300" title="Balken = klassischer Fortschrittsbalken. Segmente = einzelne Pips (ideal bei kleinen Limits). Ring = runder Radial-Ring.">
                Stil
                <Select<LimitMeterStyle> value={lm.style} options={LIMIT_METER_STYLES} labels={LIMIT_STYLE_LABEL} onChange={(v) => setLimit({ style: v })} />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs text-zinc-300" title="Bewegte Glanz-Animation auf dem Balken bzw. weiches Aufleuchten der Segmente.">
                Animation
                <Toggle checked={lm.animate} onChange={(v) => setLimit({ animate: v })} />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs text-zinc-300" title="Farbe, solange noch viel übrig ist (über der mittleren Schwelle).">
                Farbe „viel übrig"
                <ColorPick value={lm.highColor} onChange={(v) => setLimit({ highColor: v })} />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs text-zinc-300" title="Farbe im mittleren Bereich (zwischen unterer und mittlerer Schwelle) — Warnung, dass es knapper wird.">
                Farbe „wird knapp"
                <ColorPick value={lm.midColor} onChange={(v) => setLimit({ midColor: v })} />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs text-zinc-300" title="Farbe, wenn fast nichts mehr übrig ist (unter der unteren Schwelle) oder das Limit erreicht wurde.">
                Farbe „fast leer"
                <ColorPick value={lm.lowColor} onChange={(v) => setLimit({ lowColor: v })} />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs text-zinc-300" title="Pulsiert die Anzeige (Leuchten + leichtes Pochen), sobald sie im roten Fast-leer-Bereich ist — fällt sofort ins Auge.">
                Pulsieren bei „fast leer"
                <Toggle checked={lm.pulseWhenLow} onChange={(v) => setLimit({ pulseWhenLow: v })} />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs text-zinc-300" title="Ab welchem Anteil (Prozent) auf die mittlere Warnfarbe gewechselt wird. Beispiel: 50 = unter der Hälfte wird es gelb.">
                Schwelle „wird knapp" (%)
                <input type="number" min={5} max={95} step={5} value={Math.round(lm.midThreshold * 100)}
                  onChange={(e) => setLimit({ midThreshold: clampPct(e.target.value, lm.lowThreshold * 100 + 5, 95) })}
                  className="w-20 rounded border border-white/10 bg-black/40 px-2 py-1 text-right text-xs text-zinc-200 outline-none focus:border-cyan-400/50" />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs text-zinc-300" title="Ab welchem Anteil (Prozent) auf die rote Fast-leer-Farbe gewechselt wird. Beispiel: 25 = unter einem Viertel wird es rot.">
                Schwelle „fast leer" (%)
                <input type="number" min={5} max={90} step={5} value={Math.round(lm.lowThreshold * 100)}
                  onChange={(e) => setLimit({ lowThreshold: clampPct(e.target.value, 5, lm.midThreshold * 100 - 5) })}
                  className="w-20 rounded border border-white/10 bg-black/40 px-2 py-1 text-right text-xs text-zinc-200 outline-none focus:border-cyan-400/50" />
              </label>
            </div>

            {/* Live-Vorschau: drei Füllstände */}
            <div className="mt-3 border-t border-white/8 pt-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600">Live-Vorschau</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <LimitMeterPreview cfg={lm} remaining={11} total={12} label="Viel übrig" />
                <LimitMeterPreview cfg={lm} remaining={5} total={12} label="Wird knapp" />
                <LimitMeterPreview cfg={lm} remaining={1} total={12} label="Fast leer" />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Per-event */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {FEEDBACK_EVENT_META.map((meta) => {
          const ev = form.events[meta.key];
          const pk = previewKey[meta.key] ?? 0;
          return (
            <div key={meta.key} className={`rounded-xl border bg-black/10 p-4 transition-opacity ${ev.enabled ? "border-white/10" : "border-white/5 opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-extrabold text-zinc-100">
                    <span className="text-base">{ev.icon}</span>{meta.label}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{meta.description}</p>
                </div>
                <Toggle checked={ev.enabled} onChange={(v) => setEvent(meta.key, { enabled: v })} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                <label className="flex items-center justify-between gap-2 text-xs text-zinc-300">
                  Stil
                  <Select<FeedbackStyle> value={ev.style} options={FEEDBACK_STYLES} labels={STYLE_LABEL} onChange={(v) => setEvent(meta.key, { style: v })} />
                </label>
                <label className="flex items-center justify-between gap-2 text-xs text-zinc-300">
                  Animation
                  <Select<FeedbackAnimation> value={ev.animation} options={FEEDBACK_ANIMATIONS} labels={ANIM_LABEL} onChange={(v) => setEvent(meta.key, { animation: v })} />
                </label>
                <label className="flex items-center justify-between gap-2 text-xs text-zinc-300">
                  Farbe
                  <span className="flex items-center gap-1.5">
                    <input type="color" value={ev.accent} onChange={(e) => setEvent(meta.key, { accent: e.target.value })} className="h-7 w-9 cursor-pointer rounded border border-white/10 bg-transparent p-0" />
                    <input type="text" value={ev.accent} onChange={(e) => setEvent(meta.key, { accent: e.target.value })} className="w-[72px] rounded border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] font-mono text-zinc-300 outline-none" />
                  </span>
                </label>
                <label className="flex items-center justify-between gap-2 text-xs text-zinc-300">
                  Symbol
                  <input type="text" value={ev.icon} maxLength={4} onChange={(e) => setEvent(meta.key, { icon: e.target.value })} className="w-14 rounded border border-white/10 bg-black/40 px-2 py-1 text-center text-base outline-none focus:border-purple-400/50" />
                </label>
                <label className="flex items-center justify-between gap-2 text-xs text-zinc-300">
                  Dauer (ms)
                  <input type="number" min={1200} max={12000} step={100} value={ev.durationMs} onChange={(e) => setEvent(meta.key, { durationMs: Math.max(1200, parseInt(e.target.value) || 1200) })} className="w-20 rounded border border-white/10 bg-black/40 px-2 py-1 text-right text-xs text-zinc-200 outline-none focus:border-purple-400/50" />
                </label>
                <label className="flex items-center justify-between gap-2 text-xs text-zinc-300">
                  Sound
                  <Toggle checked={ev.sound} onChange={(v) => setEvent(meta.key, { sound: v })} />
                </label>
                <label className="flex items-center justify-between gap-2 text-xs text-zinc-300" title="Schaltet den Partikel-Effekt an/aus. Der Typ wird unten gewählt.">
                  Partikel
                  <Toggle checked={ev.confetti} onChange={(v) => setEvent(meta.key, { confetti: v })} />
                </label>
                <label className="flex items-center justify-between gap-2 text-xs text-zinc-300" title="Wie wuchtig die Feier ist: Dezent (klein, kaum Partikel), Normal, oder Episch (groß, viele Partikel, Shockwave-Ring).">
                  Intensität
                  <Select<FeedbackIntensity> value={ev.intensity} options={FEEDBACK_INTENSITIES} labels={INTENSITY_LABEL} onChange={(v) => setEvent(meta.key, { intensity: v })} />
                </label>
                <label className="flex items-center justify-between gap-2 text-xs text-zinc-300" title="Welcher Partikel-Effekt fliegt: Konfetti (Regen), Feuerwerk (radiale Funken), Sterne (steigen auf) oder Luftschlangen.">
                  Effekt
                  <Select<FeedbackParticle> value={ev.particleType} options={FEEDBACK_PARTICLES} labels={PARTICLE_LABEL} onChange={(v) => setEvent(meta.key, { particleType: v })} />
                </label>
                <label className="flex items-center justify-between gap-2 text-xs text-zinc-300" title="Lässt bei diesem Event kurz den ganzen Bildschirm in der Akzentfarbe aufleuchten — für die wirklich großen Momente (Level-Up, Battle-Pass-Stufe).">
                  Screen-Blitz
                  <Toggle checked={ev.screenFlash} onChange={(v) => setEvent(meta.key, { screenFlash: v })} />
                </label>
              </div>

              {/* Live preview */}
              <div className="mt-3 flex items-center gap-3 border-t border-white/8 pt-3">
                <button type="button" onClick={() => preview(meta.key)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 hover:border-white/25 hover:text-zinc-100">
                  <Play className="h-3 w-3" /> Vorschau
                </button>
                <div className="relative flex min-h-[48px] flex-1 items-center justify-center overflow-visible">
                  {pk > 0 && ev.confetti && (
                    <div key={`p${pk}`} className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0">
                      <ParticleField accent={ev.accent} type={ev.particleType} count={INTENSITY_FACTOR[ev.intensity].particles} />
                    </div>
                  )}
                  <div
                    key={pk}
                    className="relative flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-extrabold backdrop-blur-md"
                    style={{
                      animation: pk > 0 ? feedbackAnimationStyle(ev.animation) : undefined,
                      transform: `scale(${INTENSITY_FACTOR[ev.intensity].scale})`,
                      borderColor: hexToRgba(ev.accent, 0.5),
                      background: `linear-gradient(90deg, ${hexToRgba(ev.accent, 0.22)}, ${hexToRgba(ev.accent, 0.1)})`,
                      boxShadow: `0 8px ${Math.round(20 + INTENSITY_FACTOR[ev.intensity].glow * 50)}px ${hexToRgba(ev.accent, 0.28)}`,
                      color: ev.accent,
                    }}
                  >
                    <span className="text-base leading-none">{ev.icon}</span>
                    {meta.label}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 border-t border-white/8 pt-4">
        <button onClick={save} disabled={saving || !loaded}
          className="flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2 text-sm font-bold text-white hover:bg-purple-500 disabled:opacity-50">
          {saving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="h-4 w-4" />}
          Speichern
        </button>
        <button onClick={() => { setForm(DEFAULT_FEEDBACK_CONFIG); setMsg(null); }}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-300">
          <RotateCcw className="h-3.5 w-3.5" /> Auf Standard zurücksetzen
        </button>
      </div>
    </div>
  );
}
