"use client";

import { useState } from "react";
import {
  RotateCcw, Save, CheckCircle, XCircle, Joystick, Gift, Star, Zap, Flame, Layers,
} from "lucide-react";
import { updateSnakeConfig } from "@/lib/actions/snake";
import {
  DEFAULT_SNAKE_CONFIG, DEFAULT_X1_CONFIG, DEFAULT_X2_CONFIG, DEFAULT_GRIND_CONFIG,
  type SnakeConfig, type SnakeModeConfig, type SnakeGrindConfig,
} from "@/lib/snake-config";

// ─────────────────────────────────────────────────────────────────────────────
// Small reusable form controls
// ─────────────────────────────────────────────────────────────────────────────

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-200">{label}</p>
        {hint && <p className="text-[11px] leading-snug text-zinc-600">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
    >
      <span className={`relative block h-6 w-11 overflow-hidden rounded-full transition-colors duration-200 ${checked ? "bg-purple-600" : "bg-white/10"}`}>
        <span className={`absolute left-0 top-[2px] h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? "translate-x-[22px]" : "translate-x-[2px]"}`} />
      </span>
    </button>
  );
}

function Num({
  value, onChange, min = 0, max, step = 1,
}: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <input
      type="number" value={value} min={min} max={max} step={step}
      onChange={(e) => {
        const v = step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value);
        if (!isNaN(v)) onChange(v);
      }}
      className="w-24 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-right text-sm text-zinc-100 outline-none focus:border-purple-400/60"
    />
  );
}

function NullableNum({
  value, onChange, min = 0, placeholder = "Kein Limit",
}: { value: number | null; onChange: (v: number | null) => void; min?: number; placeholder?: string }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number" value={value ?? ""} min={min} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? null : parseInt(e.target.value))}
        className="w-24 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-right text-sm text-zinc-100 outline-none focus:border-purple-400/60"
      />
      {value !== null && (
        <button type="button" onClick={() => onChange(null)} className="text-[10px] text-zinc-600 hover:text-red-400">✕</button>
      )}
    </div>
  );
}

function Section({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/10">
      <div className="border-b border-white/8 px-4 py-2.5">
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
          {icon}{label}
        </span>
      </div>
      <div className="flex flex-col gap-3 px-4 py-3">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-mode editor
// ─────────────────────────────────────────────────────────────────────────────

function ModeEditor<T extends SnakeModeConfig>({
  cfg, def, onChange, isGrind = false,
}: {
  cfg: T;
  def: T;
  onChange: (updated: T) => void;
  isGrind?: boolean;
}) {
  function set<K extends keyof T>(key: K, value: T[K]) {
    onChange({ ...cfg, [key]: value });
  }

  const grind = cfg as unknown as SnakeGrindConfig;

  return (
    <div className="flex flex-col gap-4">
      {/* Enable */}
      <Section label="Modus" icon={<Joystick className="h-3.5 w-3.5" />}>
        <Row label="Aktiviert" hint="Spieler können diesen Modus auswählen">
          <Toggle checked={cfg.enabled} onChange={(v) => set("enabled" as keyof T, v as T[keyof T])} />
        </Row>
        <Row label="Feldgröße" hint={`${isGrind ? "Start" : ""}-Spielfeld in Zellen`}>
          <Num value={cfg.boardSize} min={isGrind ? 16 : 10} max={isGrind ? 128 : 50} onChange={(v) => set("boardSize" as keyof T, v as T[keyof T])} />
        </Row>
        <Row label="Startlänge" hint="Schlangenlänge beim Start">
          <Num value={cfg.startLength} min={1} max={15} onChange={(v) => set("startLength" as keyof T, v as T[keyof T])} />
        </Row>
        <Row label="Wandkollision = Tod" hint={isGrind ? "Grind hat immer Wände (kein Wrap)" : "Aus = Schlange wrapt um Wände"}>
          {isGrind
            ? <span className="text-xs font-semibold text-zinc-500">Immer aktiv</span>
            : <Toggle checked={!cfg.wallWrap} onChange={(v) => set("wallWrap" as keyof T, !v as T[keyof T])} />
          }
        </Row>
      </Section>

      {/* Credits */}
      <Section label="Credits" icon={<Star className="h-3.5 w-3.5" />}>
        <Row label="CR pro Apfel">
          <Num value={cfg.creditsPerApple} min={1} max={10000} onChange={(v) => set("creditsPerApple" as keyof T, v as T[keyof T])} />
        </Row>
        <Row label="Tageslimit" hint="Max. CR pro Tag (leer = kein Limit)">
          <NullableNum value={cfg.dailyCrLimit} onChange={(v) => set("dailyCrLimit" as keyof T, v as T[keyof T])} />
        </Row>
        <Row label="Bestenliste Einträge">
          <Num value={cfg.leaderboardSize} min={5} max={100} onChange={(v) => set("leaderboardSize" as keyof T, v as T[keyof T])} />
        </Row>
      </Section>

      {/* Speed */}
      <Section label="Geschwindigkeit" icon={<Zap className="h-3.5 w-3.5" />}>
        <Row label="Startgeschwindigkeit (ms)" hint="Niedrigere Zahl = schneller">
          <Num value={cfg.initialSpeedMs} min={30} max={1000} onChange={(v) => set("initialSpeedMs" as keyof T, v as T[keyof T])} />
        </Row>
        <Row label="Beschleunigung/Apfel (ms)" hint="Um diesen Wert wird jede Runde schneller">
          <Num value={cfg.speedIncreasePerApple} min={0} max={20} step={0.5} onChange={(v) => set("speedIncreasePerApple" as keyof T, v as T[keyof T])} />
        </Row>
        <Row label="Maximale Geschwindigkeit (ms)" hint="Untere Grenze, schneller geht nicht">
          <Num value={cfg.minSpeedMs} min={20} max={500} onChange={(v) => set("minSpeedMs" as keyof T, v as T[keyof T])} />
        </Row>
      </Section>

      {/* Bonus system */}
      <Section label="Bonus-System" icon={<Gift className="h-3.5 w-3.5" />}>
        <Row label="Bonus alle N Äpfel" hint="0 = deaktiviert">
          <Num value={cfg.bonusEveryN} min={0} max={100} onChange={(v) => set("bonusEveryN" as keyof T, v as T[keyof T])} />
        </Row>
        <Row label="Bonus-CR (flach)">
          <Num value={cfg.bonusCrFlat} min={0} onChange={(v) => set("bonusCrFlat" as keyof T, v as T[keyof T])} />
        </Row>
        <Row label="2× Combo-Dauer (Äpfel)" hint="Nächste N Äpfel geben doppelt CR (0 = kein Combo)">
          <Num value={cfg.bonusMultiplierApples} min={0} max={50} onChange={(v) => set("bonusMultiplierApples" as keyof T, v as T[keyof T])} />
        </Row>
      </Section>

      {/* Golden apple */}
      <Section label="Goldener Apfel" icon={<span className="text-base">🍎</span>}>
        <Row label="Goldener Apfel aktiv">
          <Toggle checked={cfg.goldenAppleEnabled} onChange={(v) => set("goldenAppleEnabled" as keyof T, v as T[keyof T])} />
        </Row>
        <Row label="CR-Multiplikator" hint="x mal den normalen CR-Wert">
          <Num value={cfg.goldenAppleCrMultiplier} min={1} max={50} step={0.5} onChange={(v) => set("goldenAppleCrMultiplier" as keyof T, v as T[keyof T])} />
        </Row>
        <Row label="Haltbarkeit (Äpfel)" hint="Verschwindet nach N normalen Äpfeln ohne Essen">
          <Num value={cfg.goldenAppleLifeApples} min={1} max={100} onChange={(v) => set("goldenAppleLifeApples" as keyof T, v as T[keyof T])} />
        </Row>
      </Section>

      {/* Visuals */}
      <Section label="Visuals" icon={<Layers className="h-3.5 w-3.5" />}>
        <Row label="Partikeleffekte aktiv">
          <Toggle checked={cfg.particlesEnabled} onChange={(v) => set("particlesEnabled" as keyof T, v as T[keyof T])} />
        </Row>
      </Section>

      {/* Grind-specific */}
      {isGrind && (
        <Section label="Grind-Modus: Schließende Wände" icon={<Flame className="h-3.5 w-3.5 text-amber-400" />}>
          <Row label="Shrink alle N Äpfel" hint="Wände rücken nach jeweils N gegessenen Äpfeln um 1 Zelle vor">
            <Num value={grind.shrinkEveryN} min={1} max={100} onChange={(v) => onChange({ ...cfg, shrinkEveryN: v } as T)} />
          </Row>
          <Row label="Minimale Arena-Größe" hint="Unterhalb dieser Zellanzahl endet das Spiel">
            <Num value={grind.minBoardSize} min={4} max={32} onChange={(v) => onChange({ ...cfg, minBoardSize: v } as T)} />
          </Row>
          <Row label="Bonus-CR pro Shrink" hint="Wird beim erfolgreichen Shrink-Überleben vergeben">
            <Num value={grind.bonusCrPerShrink} min={0} onChange={(v) => onChange({ ...cfg, bonusCrPerShrink: v } as T)} />
          </Row>
        </Section>
      )}

      {/* Reset to defaults */}
      <button
        type="button"
        onClick={() => onChange(def as T)}
        className="flex items-center gap-1.5 self-start rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-500 hover:border-white/20 hover:text-zinc-300"
      >
        <RotateCcw className="h-3 w-3" /> Standard wiederherstellen
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main editor
// ─────────────────────────────────────────────────────────────────────────────

export function SnakeConfigEditor({ config }: { config: SnakeConfig }) {
  const [form, setForm] = useState<SnakeConfig>(config);
  const [tab, setTab] = useState<"shared" | "x1" | "x2" | "grind">("shared");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function save() {
    setSaving(true);
    const res = await updateSnakeConfig(form);
    setSaving(false);
    setMsg({ text: res.error ?? "Gespeichert!", ok: res.success });
    if (res.success) setTimeout(() => setMsg(null), 3000);
  }

  const tabs: { id: typeof tab; label: string; icon: React.ReactNode }[] = [
    { id: "shared", label: "Allgemein", icon: <Joystick className="h-3.5 w-3.5" /> },
    { id: "x1", label: "Classic x1", icon: <span className="text-sm">🌿</span> },
    { id: "x2", label: "Turbo x2", icon: <span className="text-sm">⚡</span> },
    { id: "grind", label: "Grind", icon: <span className="text-sm">🔥</span> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Joystick className="h-5 w-5 text-emerald-400" />
        <span className="text-base font-extrabold text-zinc-100">Snake Einstellungen</span>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${
          msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"
        }`}>
          {msg.ok ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {msg.text}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/8 bg-black/20 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
              tab === t.id
                ? t.id === "grind" ? "bg-amber-500/20 text-amber-300"
                : t.id === "x2" ? "bg-cyan-500/20 text-cyan-300"
                : t.id === "x1" ? "bg-emerald-500/20 text-emerald-300"
                : "bg-purple-500/20 text-purple-200"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Shared settings */}
      {tab === "shared" && (
        <div className="flex flex-col gap-4">
          <Section label="Snake Seite">
            <Row label="Snake aktiviert" hint="Deaktiviert die gesamte Snake-Seite">
              <Toggle checked={form.enabled} onChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
            </Row>
            <Row label="Seitenüberschrift">
              <input
                type="text" value={form.sectionTitle} maxLength={40}
                onChange={(e) => setForm((f) => ({ ...f, sectionTitle: e.target.value }))}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60 w-40"
              />
            </Row>
            <Row label="Untertitel">
              <input
                type="text" value={form.sectionSubtitle} maxLength={80}
                onChange={(e) => setForm((f) => ({ ...f, sectionSubtitle: e.target.value }))}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60 w-52"
              />
            </Row>
          </Section>
          <div className="rounded-xl border border-white/8 bg-white/[0.01] px-4 py-3">
            <p className="text-xs text-zinc-500">
              Klicke auf <span className="text-emerald-300 font-bold">Classic x1</span>, <span className="text-cyan-300 font-bold">Turbo x2</span> oder <span className="text-amber-300 font-bold">Grind</span>, um den jeweiligen Modus einzeln zu konfigurieren — jeder Modus hat eine vollständig getrennte Bestenliste und eigene Einstellungen.
            </p>
          </div>
        </div>
      )}

      {tab === "x1" && (
        <ModeEditor<SnakeModeConfig>
          cfg={form.x1}
          def={DEFAULT_X1_CONFIG}
          onChange={(updated) => setForm((f) => ({ ...f, x1: updated }))}
        />
      )}

      {tab === "x2" && (
        <ModeEditor<SnakeModeConfig>
          cfg={form.x2}
          def={DEFAULT_X2_CONFIG}
          onChange={(updated) => setForm((f) => ({ ...f, x2: updated }))}
        />
      )}

      {tab === "grind" && (
        <ModeEditor<SnakeGrindConfig>
          cfg={form.grind}
          def={DEFAULT_GRIND_CONFIG}
          onChange={(updated) => setForm((f) => ({ ...f, grind: updated }))}
          isGrind
        />
      )}

      {/* Save */}
      <div className="flex items-center gap-3 border-t border-white/8 pt-4">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2 text-sm font-bold text-white hover:bg-purple-500 disabled:opacity-50"
        >
          {saving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="h-4 w-4" />}
          Speichern
        </button>
        <button
          onClick={() => { setForm(DEFAULT_SNAKE_CONFIG); setMsg(null); }}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-300"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Alles zurücksetzen
        </button>
      </div>
    </div>
  );
}
