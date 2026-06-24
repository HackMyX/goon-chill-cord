"use client";

import { useState } from "react";
import { Settings, X, MousePointer2, Volume2, RotateCcw, ArrowLeftRight, ArrowUpDown, Keyboard, Pencil, Crown } from "lucide-react";
import { WorldLeaderboard } from "@/components/world/world-leaderboard";
import {
  type WorldSettings,
  type KeyBindings,
  SETTINGS_BOUNDS,
  DEFAULT_WORLD_SETTINGS,
  KEYBIND_LABELS,
  formatKeyCode,
} from "@/lib/world-settings";

// ---------------------------------------------------------------------------
// Sensitivity Slider
// ---------------------------------------------------------------------------

interface SliderProps {
  label: string;
  icon: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  sublabel?: string;
}

function Slider({ label, icon, value, min, max, step, onChange, sublabel }: SliderProps) {
  const pct = Math.round(((value - min) / (max - min)) * 100);
  const display = `${Math.round(value * 100)}%`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
          {icon}
          <span>{label}</span>
          {sublabel && <span className="text-xs font-normal text-zinc-500">{sublabel}</span>}
        </div>
        <span className="font-mono text-sm font-bold text-purple-300">{display}</span>
      </div>
      <div className="relative h-5 flex items-center">
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-purple-500/60 transition-[width] duration-75"
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

// ---------------------------------------------------------------------------
// Keybind editor row
// ---------------------------------------------------------------------------

const ACTION_ORDER: (keyof KeyBindings)[] = [
  "forward", "backward", "strafeLeft", "strafeRight", "sprint", "jump", "slide",
];

function KeybindRow({
  action,
  currentCode,
  listening,
  onStartListen,
  onCancel,
}: {
  action: keyof KeyBindings;
  currentCode: string;
  listening: boolean;
  onStartListen: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 transition-colors ${listening ? "bg-purple-500/15 ring-1 ring-purple-400/50" : "hover:bg-white/[0.03]"}`}>
      <span className="text-sm text-zinc-300">{KEYBIND_LABELS[action]}</span>
      <button
        onClick={listening ? onCancel : onStartListen}
        className={`min-w-[72px] rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
          listening
            ? "animate-pulse border-purple-400 bg-purple-500/20 text-purple-200"
            : "border-white/15 bg-black/30 text-zinc-300 hover:border-purple-400/50 hover:text-purple-200"
        }`}
      >
        {listening ? "Taste…" : formatKeyCode(currentCode)}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface WorldSettingsPanelProps {
  settings: WorldSettings;
  onChange: (s: WorldSettings) => void;
  onClose: () => void;
  userId?: string;
  username?: string;
}

export function WorldSettingsPanel({ settings, onChange, onClose, userId, username }: WorldSettingsPanelProps) {
  const [listeningFor, setListeningFor] = useState<keyof KeyBindings | null>(null);
  const [panelTab, setPanelTab] = useState<"settings" | "leaderboard">("settings");

  function update<K extends keyof WorldSettings>(key: K, value: WorldSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  function reset() {
    setListeningFor(null);
    onChange({ ...DEFAULT_WORLD_SETTINGS });
  }

  function startListen(action: keyof KeyBindings) {
    setListeningFor(action);
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        setListeningFor(null);
        window.removeEventListener("keydown", onKey, true);
        return;
      }
      const newBinds: KeyBindings = { ...settings.keybinds, [action]: e.code };
      onChange({ ...settings, keybinds: newBinds });
      setListeningFor(null);
      window.removeEventListener("keydown", onKey, true);
    };
    window.addEventListener("keydown", onKey, true);
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) { setListeningFor(null); onClose(); } }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950/95 p-6 shadow-[0_0_60px_rgba(0,0,0,0.8)] overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-purple-400" />
            <h2 className="text-lg font-bold text-zinc-100">3D Welt</h2>
          </div>
          <button
            onClick={() => { setListeningFor(null); onClose(); }}
            className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="mb-5 flex rounded-xl border border-white/8 bg-black/30 p-1">
          <button
            onClick={() => setPanelTab("settings")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-colors ${
              panelTab === "settings" ? "bg-purple-500/20 text-purple-200" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            Einstellungen
          </button>
          <button
            onClick={() => setPanelTab("leaderboard")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-colors ${
              panelTab === "leaderboard" ? "bg-amber-500/20 text-amber-300" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Crown className="h-3.5 w-3.5" />
            Bestenliste
          </button>
        </div>

        {/* Leaderboard tab */}
        {panelTab === "leaderboard" && userId && (
          <WorldLeaderboard userId={userId} username={username ?? "Spieler"} />
        )}

        {/* Settings tab */}
        {panelTab === "settings" && <div className="flex flex-col gap-6">
          {/* === Mouse section === */}
          <div className="flex items-center gap-2">
            <MousePointer2 className="h-4 w-4 text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">Bewegung</span>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>

          <Slider
            label="Horizontal"
            icon={<ArrowLeftRight className="h-4 w-4 text-cyan-400" />}
            sublabel="Links / Rechts"
            value={settings.sensitivityX}
            min={SETTINGS_BOUNDS.sensitivityX.min}
            max={SETTINGS_BOUNDS.sensitivityX.max}
            step={SETTINGS_BOUNDS.sensitivityX.step}
            onChange={(v) => update("sensitivityX", v)}
          />

          <Slider
            label="Vertikal"
            icon={<ArrowUpDown className="h-4 w-4 text-cyan-400" />}
            sublabel="Oben / Unten"
            value={settings.sensitivityY}
            min={SETTINGS_BOUNDS.sensitivityY.min}
            max={SETTINGS_BOUNDS.sensitivityY.max}
            step={SETTINGS_BOUNDS.sensitivityY.step}
            onChange={(v) => update("sensitivityY", v)}
          />

          <div className="h-px bg-white/[0.06]" />

          <Slider
            label="Lautstärke"
            icon={<Volume2 className="h-4 w-4 text-amber-400" />}
            value={settings.volume}
            min={SETTINGS_BOUNDS.volume.min}
            max={SETTINGS_BOUNDS.volume.max}
            step={SETTINGS_BOUNDS.volume.step}
            onChange={(v) => update("volume", v)}
          />

          <div className="h-px bg-white/[0.06]" />

          {/* === Keybinds section === */}
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">Tastenbelegung</span>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>

          <div className="flex flex-col gap-0.5">
            {listeningFor && (
              <p className="mb-2 text-center text-[11px] text-purple-300">
                Drücke eine Taste für <span className="font-bold">{KEYBIND_LABELS[listeningFor]}</span> — Escape = Abbrechen
              </p>
            )}
            {ACTION_ORDER.map((action) => (
              <KeybindRow
                key={action}
                action={action}
                currentCode={settings.keybinds[action]}
                listening={listeningFor === action}
                onStartListen={() => startListen(action)}
                onCancel={() => setListeningFor(null)}
              />
            ))}
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-600">
              <Pencil className="h-3 w-3" />
              Klicke eine Taste zum Neuzuweisen
            </div>
          </div>
        </div>
        }

        {/* Footer — only in settings tab */}
        {panelTab === "settings" && (<>
        <div className="mt-6 flex items-center justify-between border-t border-white/[0.06] pt-4">
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-xs text-zinc-600 transition-colors hover:text-zinc-400"
          >
            <RotateCcw className="h-3 w-3" />
            Alles zurücksetzen
          </button>
          <button
            onClick={() => { setListeningFor(null); onClose(); }}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white shadow-[0_0_16px_rgba(147,51,234,0.4)] transition-colors hover:bg-purple-500"
          >
            Schließen
          </button>
        </div>

        <p className="mt-3 text-center text-[10px] text-zinc-700">
          Tab · Einstellungen ein-/ausblenden
        </p>
        </>)}
      </div>
    </div>
  );
}
