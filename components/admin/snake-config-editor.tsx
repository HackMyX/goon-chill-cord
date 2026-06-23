"use client";

import { useState } from "react";
import { RotateCcw, Save, CheckCircle, XCircle, Joystick, Gift, Star, Sparkles, Zap } from "lucide-react";
import { updateSnakeConfig } from "@/lib/actions/snake";
import { DEFAULT_SNAKE_CONFIG, type SnakeConfig } from "@/lib/snake-config";

interface SnakeConfigEditorProps {
  config: SnakeConfig;
}

export function SnakeConfigEditor({ config }: SnakeConfigEditorProps) {
  const [form, setForm] = useState<SnakeConfig>(config);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  function set<K extends keyof SnakeConfig>(key: K, value: SnakeConfig[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    const res = await updateSnakeConfig(form);
    setSaving(false);
    setMsg({ text: res.error ?? "Gespeichert!", ok: res.success });
    if (res.success) setTimeout(() => setMsg(null), 3000);
  }

  function reset() {
    setForm(DEFAULT_SNAKE_CONFIG);
    setMsg(null);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Status message */}
      {msg && (
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${
          msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"
        }`}>
          {msg.ok ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {msg.text}
        </div>
      )}

      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/20 px-4 py-3">
        <div>
          <p className="text-sm font-bold text-zinc-200">Snake aktiviert</p>
          <p className="text-xs text-zinc-500">Wenn deaktiviert, wird die Seite als offline angezeigt</p>
        </div>
        <button
          onClick={() => set("enabled", !form.enabled)}
          className={`relative h-6 w-11 rounded-full transition-colors ${form.enabled ? "bg-emerald-500" : "bg-white/10"}`}
        >
          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${form.enabled ? "left-6" : "left-1"}`} />
        </button>
      </div>

      {/* Section text */}
      <div className="rounded-xl border border-white/8 bg-black/10 p-4">
        <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
          <Joystick className="h-3.5 w-3.5" /> Anzeige-Texte
        </h4>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-400">Titel</span>
            <input type="text" maxLength={40} value={form.sectionTitle}
              onChange={(e) => set("sectionTitle", e.target.value)}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-400">Untertitel</span>
            <input type="text" maxLength={80} value={form.sectionSubtitle}
              onChange={(e) => set("sectionSubtitle", e.target.value)}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
          </label>
        </div>
      </div>

      {/* Credits */}
      <div className="rounded-xl border border-white/8 bg-black/10 p-4">
        <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">Credits-Einstellungen</h4>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-400">CR pro Apfel (x1)</span>
            <input type="number" min={1} max={1000} value={form.creditsPerAppleX1}
              onChange={(e) => set("creditsPerAppleX1", Math.max(1, parseInt(e.target.value) || 1))}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-400">CR pro Apfel (x2)</span>
            <input type="number" min={1} max={2000} value={form.creditsPerAppleX2}
              onChange={(e) => set("creditsPerAppleX2", Math.max(1, parseInt(e.target.value) || 1))}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-400">x2-CR ab Apfel Nr.</span>
            <input type="number" min={1} max={200} value={form.x2AppleThreshold}
              onChange={(e) => set("x2AppleThreshold", Math.max(1, parseInt(e.target.value) || 30))}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-400">Tageslimit CR (leer = unbegrenzt)</span>
            <input type="number" min={0} value={form.dailyCrLimit ?? ""}
              placeholder="unbegrenzt"
              onChange={(e) => set("dailyCrLimit", e.target.value === "" ? null : Math.max(1, parseInt(e.target.value) || 1))}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
          </label>
        </div>
      </div>

      {/* Speed */}
      <div className="rounded-xl border border-white/8 bg-black/10 p-4">
        <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">Geschwindigkeit</h4>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-400">Startgeschwindigkeit x1 (ms)</span>
            <input type="number" min={50} max={500} value={form.initialSpeedMs}
              onChange={(e) => set("initialSpeedMs", Math.max(50, parseInt(e.target.value) || 150))}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-400">Startgeschwindigkeit x2 (ms)</span>
            <input type="number" min={30} max={400} value={form.x2InitialSpeedMs}
              onChange={(e) => set("x2InitialSpeedMs", Math.max(30, parseInt(e.target.value) || 100))}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-400">Speedbonus pro Apfel (ms)</span>
            <input type="number" min={0} max={20} step={0.5} value={form.speedIncreasePerApple}
              onChange={(e) => set("speedIncreasePerApple", Math.max(0, parseFloat(e.target.value) || 0))}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-400">Mindestgeschwindigkeit (ms)</span>
            <input type="number" min={30} max={200} value={form.minSpeedMs}
              onChange={(e) => set("minSpeedMs", Math.max(30, parseInt(e.target.value) || 60))}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
          </label>
        </div>
      </div>

      {/* Board & rules */}
      <div className="rounded-xl border border-white/8 bg-black/10 p-4">
        <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">Spielfeld & Regeln</h4>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-400">Feldgröße (Zellen)</span>
              <input type="number" min={10} max={40} value={form.boardSize}
                onChange={(e) => set("boardSize", Math.max(10, Math.min(40, parseInt(e.target.value) || 20)))}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-400">Bestenlisten-Größe</span>
              <input type="number" min={5} max={100} value={form.leaderboardSize}
                onChange={(e) => set("leaderboardSize", Math.max(5, parseInt(e.target.value) || 20))}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
            </label>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/20 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-zinc-200">Wand = kein Tod</p>
              <p className="text-xs text-zinc-500">Snake teleportiert zur gegenüberliegenden Seite</p>
            </div>
            <button
              onClick={() => set("wallWrap", !form.wallWrap)}
              className={`relative h-6 w-11 rounded-full transition-colors ${form.wallWrap ? "bg-emerald-500" : "bg-white/10"}`}
            >
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${form.wallWrap ? "left-6" : "left-1"}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Bonus system */}
      <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-4">
        <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-400">
          <Gift className="h-3.5 w-3.5" /> Bonus-System
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-400">Bonus alle N Äpfel</span>
            <input type="number" min={1} max={100} value={form.bonusEveryN}
              onChange={(e) => set("bonusEveryN", Math.max(1, parseInt(e.target.value) || 10))}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-400">Bonus-CR (flach)</span>
            <input type="number" min={0} max={10000} value={form.bonusCrFlat}
              onChange={(e) => set("bonusCrFlat", Math.max(0, parseInt(e.target.value) || 0))}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60" />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-400">
              2× Multiplikator für die nächsten N Äpfel nach Bonus (0 = deaktiviert)
            </span>
            <input type="number" min={0} max={50} value={form.bonusMultiplierApples}
              onChange={(e) => set("bonusMultiplierApples", Math.max(0, parseInt(e.target.value) || 0))}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60" />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-zinc-600">
          Alle {form.bonusEveryN} Äpfel → +{form.bonusCrFlat} CR flat{form.bonusMultiplierApples > 0 ? ` + 2× für ${form.bonusMultiplierApples} Äpfel` : ""}.
        </p>
      </div>

      {/* Golden apple */}
      <div className="rounded-xl border border-yellow-400/20 bg-yellow-500/5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-yellow-400">
            <Star className="h-3.5 w-3.5" /> Goldener Apfel
          </h4>
          <button
            onClick={() => set("goldenAppleEnabled", !form.goldenAppleEnabled)}
            className={`relative h-6 w-11 rounded-full transition-colors ${form.goldenAppleEnabled ? "bg-yellow-500" : "bg-white/10"}`}
          >
            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${form.goldenAppleEnabled ? "left-6" : "left-1"}`} />
          </button>
        </div>
        {form.goldenAppleEnabled && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-400">CR-Multiplikator (×normal)</span>
              <input type="number" min={1} max={50} step={0.5} value={form.goldenAppleCrMultiplier}
                onChange={(e) => set("goldenAppleCrMultiplier", Math.max(1, parseFloat(e.target.value) || 5))}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-yellow-400/60" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-400">Verschwindet nach N Äpfeln</span>
              <input type="number" min={1} max={50} value={form.goldenAppleLifeApples}
                onChange={(e) => set("goldenAppleLifeApples", Math.max(1, parseInt(e.target.value) || 8))}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-yellow-400/60" />
            </label>
          </div>
        )}
      </div>

      {/* Visual settings */}
      <div className="rounded-xl border border-white/8 bg-black/10 p-4">
        <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
          <Sparkles className="h-3.5 w-3.5" /> Visuals
        </h4>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-400">Startlänge der Schlange</span>
              <input type="number" min={1} max={10} value={form.startLength}
                onChange={(e) => set("startLength", Math.max(1, Math.min(10, parseInt(e.target.value) || 3)))}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
            </label>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/20 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-zinc-200">Partikel-Effekte</p>
              <p className="text-xs text-zinc-500">Explosionen beim Apfel essen, Bonus-Bursts</p>
            </div>
            <button
              onClick={() => set("particlesEnabled", !form.particlesEnabled)}
              className={`relative h-6 w-11 rounded-full transition-colors ${form.particlesEnabled ? "bg-purple-500" : "bg-white/10"}`}
            >
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${form.particlesEnabled ? "left-6" : "left-1"}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_12px_rgba(147,51,234,0.3)] hover:bg-purple-500 disabled:opacity-50">
          <Save className="h-4 w-4" />
          {saving ? "Speichert…" : "Speichern"}
        </button>
        <button onClick={reset}
          className="flex items-center gap-2 rounded-xl border border-white/10 px-5 py-2.5 text-sm font-semibold text-zinc-400 hover:border-white/20 hover:text-zinc-200">
          <RotateCcw className="h-4 w-4" />
          Zurücksetzen
        </button>
      </div>
    </div>
  );
}
