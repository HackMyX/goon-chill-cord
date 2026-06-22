"use client";

import { Settings, X, MousePointer2, Zap, Volume2, RotateCcw } from "lucide-react";
import { type WorldSettings, SETTINGS_BOUNDS, DEFAULT_WORLD_SETTINGS } from "@/lib/world-settings";

interface SliderProps {
  label: string;
  icon: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

function Slider({ label, icon, value, min, max, step, onChange }: SliderProps) {
  const pct = Math.round(((value - min) / (max - min)) * 100);
  const display = `${Math.round(value * 100)}%`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
          {icon}
          {label}
        </div>
        <span className="font-mono text-sm font-bold text-purple-300">{display}</span>
      </div>
      <div className="relative h-5 flex items-center">
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-purple-500/60"
            style={{ width: `${pct}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="relative w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(168,85,247,0.6)] [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-purple-400 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
        />
      </div>
      <div className="flex justify-between text-[10px] text-zinc-600">
        <span>{Math.round(min * 100)}%</span>
        <span className="text-zinc-700">Standard: 100%</span>
        <span>{Math.round(max * 100)}%</span>
      </div>
    </div>
  );
}

interface WorldSettingsPanelProps {
  settings: WorldSettings;
  onChange: (s: WorldSettings) => void;
  onClose: () => void;
}

export function WorldSettingsPanel({ settings, onChange, onClose }: WorldSettingsPanelProps) {
  function update<K extends keyof WorldSettings>(key: K, value: WorldSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  function reset() {
    onChange({ ...DEFAULT_WORLD_SETTINGS });
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950/95 p-6 shadow-[0_0_60px_rgba(0,0,0,0.8)]">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-purple-400" />
            <h2 className="text-lg font-bold text-zinc-100">Spielereinstellungen</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sliders */}
        <div className="flex flex-col gap-6">
          <Slider
            label="Mausbewegung"
            icon={<MousePointer2 className="h-4 w-4 text-cyan-400" />}
            value={settings.sensitivity}
            min={SETTINGS_BOUNDS.sensitivity.min}
            max={SETTINGS_BOUNDS.sensitivity.max}
            step={SETTINGS_BOUNDS.sensitivity.step}
            onChange={(v) => update("sensitivity", v)}
          />
          <Slider
            label="Bewegungsgeschwindigkeit"
            icon={<Zap className="h-4 w-4 text-emerald-400" />}
            value={settings.moveSpeed}
            min={SETTINGS_BOUNDS.moveSpeed.min}
            max={SETTINGS_BOUNDS.moveSpeed.max}
            step={SETTINGS_BOUNDS.moveSpeed.step}
            onChange={(v) => update("moveSpeed", v)}
          />
          <Slider
            label="Lautstärke"
            icon={<Volume2 className="h-4 w-4 text-amber-400" />}
            value={settings.volume}
            min={SETTINGS_BOUNDS.volume.min}
            max={SETTINGS_BOUNDS.volume.max}
            step={SETTINGS_BOUNDS.volume.step}
            onChange={(v) => update("volume", v)}
          />
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between border-t border-white/[0.06] pt-4">
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-xs text-zinc-600 transition-colors hover:text-zinc-400"
          >
            <RotateCcw className="h-3 w-3" />
            Zurücksetzen
          </button>
          <button
            onClick={onClose}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white shadow-[0_0_16px_rgba(147,51,234,0.4)] transition-colors hover:bg-purple-500"
          >
            Schließen
          </button>
        </div>

        <p className="mt-3 text-center text-[10px] text-zinc-700">
          Tab · Einstellungen ein-/ausblenden
        </p>
      </div>
    </div>
  );
}
