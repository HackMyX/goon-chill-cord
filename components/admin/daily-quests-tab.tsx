"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, RefreshCw, ListChecks, BarChart3, Star, Settings, Users, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { CollapsibleAdminRow } from "@/components/admin/collapsible-admin-row";
import { RewardSpecEditor } from "@/components/admin/reward-spec-editor";
import { useSoundManager } from "@/lib/sound-manager";
import {
  getDailyQuestTemplates,
  getDailyQuestConfig,
  updateDailyQuestConfig,
  adminUpsertQuestTemplate,
  adminDeleteQuestTemplate,
  adminGetDailyQuestStats,
  adminResetAllQuests,
  type DailyQuestStats,
} from "@/lib/actions/daily-quests";
import {
  DEFAULT_DAILY_QUEST_CONFIG,
  DIFFICULTY_LABELS,
  DIFFICULTY_COLORS,
  DIFFICULTY_BG,
  REWARD_TYPE_LABELS,
  type DailyQuestTemplate,
  type DailyQuestConfig,
  type QuestDifficulty,
  type QuestRewardType,
} from "@/lib/daily-quests";

// ── Hover tooltip helper ──────────────────────────────────────────────────────

function Tip({ text }: { text: string }) {
  return (
    <div className="group/tip relative inline-block ml-1">
      <span className="cursor-help text-[10px] text-zinc-600 hover:text-zinc-400">ⓘ</span>
      <div className="pointer-events-none absolute bottom-full left-0 z-50 mb-1.5 w-52 rounded-lg bg-zinc-950 border border-white/[0.08] p-2 text-[10px] text-zinc-400 opacity-0 group-hover/tip:opacity-100 transition-opacity shadow-xl">
        {text}
      </div>
    </div>
  );
}

// ── Stats card ────────────────────────────────────────────────────────────────

function StatsCard({ stats, currencyName, onReset }: { stats: DailyQuestStats; currencyName: string; onReset: () => void }) {
  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    if (!confirm("Alle heutigen Quest-Fortschritte ALLER Nutzer zurücksetzen? (Neue Quests werden beim nächsten Aufruf generiert)")) return;
    setResetting(true);
    const res = await adminResetAllQuests();
    setResetting(false);
    if (res.success) alert(`${res.deleted ?? 0} Quest-Einträge gelöscht.`);
    else alert("Fehler: " + res.error);
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-zinc-900/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-bold text-zinc-200">Heutige Quest-Statistik</span>
        </div>
        <button onClick={handleReset} disabled={resetting} className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${resetting ? "animate-spin" : ""}`} />
          Reset
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Nutzer mit Quests", value: stats.totalUsersWithQuests, color: "text-zinc-100" },
          { label: "Abgeschlossen", value: stats.completedToday, color: "text-emerald-400" },
          { label: "Eingelöst", value: stats.claimedToday, color: "text-violet-400" },
          { label: `CR verteilt`, value: stats.totalCrDistributed.toLocaleString("de-DE"), color: "text-amber-400" },
        ].map(s => (
          <div key={s.label} className="rounded-lg bg-white/[0.03] border border-white/[0.04] p-3 text-center">
            <p className={`text-lg font-black ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Template completion rates */}
      {stats.templateCompletionRates.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">Template-Abschlussraten (heute)</p>
          <div className="flex flex-col gap-1.5">
            {stats.templateCompletionRates.slice(0, 8).map(t => {
              const pct = t.total > 0 ? Math.round((t.completions / t.total) * 100) : 0;
              return (
                <div key={t.key} className="flex items-center gap-2">
                  <span className="w-28 truncate text-[10px] text-zinc-500">{t.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                    <div className="h-full rounded-full bg-violet-600/60" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-right text-[10px] font-bold text-zinc-500">{pct}%</span>
                  <span className="text-[9px] text-zinc-700">{t.completions}/{t.total}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Config editor ─────────────────────────────────────────────────────────────

function ConfigEditor({ initialConfig, templates }: { initialConfig: DailyQuestConfig; templates: DailyQuestTemplate[] }) {
  const [cfg, setCfg] = useState<DailyQuestConfig>({ ...initialConfig });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const sound = useSoundManager();

  async function save() {
    setSaving(true);
    const res = await updateDailyQuestConfig(cfg);
    setSaving(false);
    if (res.success) { sound.save?.(); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    else { sound.error?.(); alert("Fehler: " + res.error); }
  }

  function setField<K extends keyof DailyQuestConfig>(k: K, v: DailyQuestConfig[K]) {
    setCfg(prev => ({ ...prev, [k]: v }));
  }

  const manualKey = (keys: string[]) => setCfg(prev => ({ ...prev, manualTemplateKeys: keys }));

  return (
    <div className="rounded-xl border border-white/[0.06] bg-zinc-900/50 p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2 mb-1">
        <Settings className="h-4 w-4 text-zinc-500" />
        <span className="text-sm font-bold text-zinc-200">Quest-Konfiguration</span>
      </div>

      {/* Enabled toggle */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-zinc-300">System aktiviert</span>
          <Tip text="Wenn deaktiviert, sehen Nutzer keine Quests mehr." />
        </div>
        <button onClick={() => setField("enabled", !cfg.enabled)} className={`relative h-6 w-11 rounded-full border transition-colors overflow-hidden ${cfg.enabled ? "bg-violet-600 border-violet-500" : "bg-zinc-800 border-zinc-700"}`}>
          <div className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${cfg.enabled ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>

      {/* Quests per day */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-zinc-300">Quests pro Tag</span>
          <Tip text="Wie viele Quests werden täglich pro Nutzer generiert (1–6)." />
        </div>
        <input
          type="number" min={1} max={6} value={cfg.questsPerDay}
          onChange={e => setField("questsPerDay", Math.min(6, Math.max(1, parseInt(e.target.value) || 3)))}
          className="w-16 rounded-lg border border-white/[0.08] bg-zinc-800 px-2 py-1 text-center text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
        />
      </div>

      {/* Refresh hour */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-zinc-300">Reset-Stunde (UTC)</span>
          <Tip text="UTC-Stunde des täglichen Resets (0=Mitternacht, 6=6 Uhr UTC)." />
        </div>
        <input
          type="number" min={0} max={23} value={cfg.refreshHourUtc}
          onChange={e => setField("refreshHourUtc", Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
          className="w-16 rounded-lg border border-white/[0.08] bg-zinc-800 px-2 py-1 text-center text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
        />
      </div>

      {/* Auto-generate toggle */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-zinc-300">Automatischer Modus</span>
          <Tip text="System wählt Quests basierend auf Spieler-Level und Schwierigkeitsverteilung. Deaktivieren für manuelle Auswahl." />
        </div>
        <button onClick={() => setField("autoGenerate", !cfg.autoGenerate)} className={`relative h-6 w-11 rounded-full border transition-colors overflow-hidden ${cfg.autoGenerate ? "bg-violet-600 border-violet-500" : "bg-zinc-800 border-zinc-700"}`}>
          <div className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${cfg.autoGenerate ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>

      {/* Manual template selection */}
      {!cfg.autoGenerate && (
        <div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-600 block mb-2">Manuelle Quest-Auswahl</span>
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
            {templates.filter(t => t.enabled).map(t => {
              const checked = cfg.manualTemplateKeys.includes(t.key);
              return (
                <label key={t.key} className="flex items-center gap-2.5 cursor-pointer rounded-lg border border-white/[0.04] bg-zinc-800/50 px-3 py-2 hover:border-violet-500/30 transition-colors">
                  <input
                    type="checkbox" checked={checked}
                    onChange={e => {
                      if (e.target.checked) manualKey([...cfg.manualTemplateKeys, t.key]);
                      else manualKey(cfg.manualTemplateKeys.filter(k => k !== t.key));
                    }}
                    className="accent-violet-500"
                  />
                  <span className="text-xs font-semibold text-zinc-300 flex-1">{t.label}</span>
                  <span className={`text-[9px] font-bold ${DIFFICULTY_COLORS[t.difficulty]}`}>{DIFFICULTY_LABELS[t.difficulty]}</span>
                </label>
              );
            })}
          </div>
          <p className="text-[10px] text-zinc-600 mt-1">{cfg.manualTemplateKeys.length} Quests ausgewählt (max. {cfg.questsPerDay} werden täglich angezeigt)</p>
        </div>
      )}

      {/* Level scaling */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-400">Level-Ziele skalieren
            <Tip text="Zielwerte steigen mit dem Spieler-Level." />
          </span>
          <button onClick={() => setField("levelScaleTargets", !cfg.levelScaleTargets)} className={`relative h-5 w-9 rounded-full border transition-colors overflow-hidden ${cfg.levelScaleTargets ? "bg-violet-600 border-violet-500" : "bg-zinc-800 border-zinc-700"}`}>
            <div className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${cfg.levelScaleTargets ? "translate-x-4" : "translate-x-0"}`} />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-400">Level-Belohnungen skalieren
            <Tip text="Belohnungen steigen mit dem Spieler-Level." />
          </span>
          <button onClick={() => setField("levelScaleRewards", !cfg.levelScaleRewards)} className={`relative h-5 w-9 rounded-full border transition-colors overflow-hidden ${cfg.levelScaleRewards ? "bg-violet-600 border-violet-500" : "bg-zinc-800 border-zinc-700"}`}>
            <div className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${cfg.levelScaleRewards ? "translate-x-4" : "translate-x-0"}`} />
          </button>
        </div>
      </div>

      {/* Reward multipliers */}
      <div>
        <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-600 block mb-2">Belohnungs-Multiplikatoren</span>
        <div className="grid grid-cols-3 gap-2">
          {([
            ["Credits", "creditsRewardMultiplier", "text-amber-400"],
            ["XP", "xpRewardMultiplier", "text-sky-400"],
            ["BP-XP", "bpXpRewardMultiplier", "text-violet-400"],
          ] as [string, keyof DailyQuestConfig, string][]).map(([label, key, color]) => (
            <div key={key} className="flex flex-col gap-1">
              <span className={`text-[10px] font-semibold ${color}`}>{label}</span>
              <input
                type="number" step={0.1} min={0.1} max={10} value={cfg[key] as number}
                onChange={e => setField(key, Math.max(0.1, parseFloat(e.target.value) || 1.0))}
                className="w-full rounded-lg border border-white/[0.08] bg-zinc-800 px-2 py-1 text-center text-xs text-zinc-100 focus:outline-none focus:border-violet-500"
              />
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={save} disabled={saving}
        className="mt-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
      >
        {saving ? "Speichere…" : saved ? "✓ Gespeichert" : "Speichern"}
      </button>
    </div>
  );
}

// ── Template editor modal ─────────────────────────────────────────────────────

const EMPTY_TEMPLATE: DailyQuestTemplate = {
  key: "", label: "", description: "", targetAction: "snake_game", baseTarget: 1,
  difficulty: "easy", minLevel: 1, maxLevel: 999, rewardType: "credits",
  baseRewardCredits: 500, baseRewardXp: 0, baseRewardBpXp: 0, rewardItemRarity: null,
  rewardExtra: [],
  icon: "Star", category: "allgemein", enabled: true, sortOrder: 0,
};

const ACTION_OPTIONS = [
  "daily_login", "snake_game", "snake_score", "plinko_play", "case_open",
  "mine_collect", "credits_collected", "monster_kill", "pvp_hit",
];

function TemplateModal({ template, onSave, onClose }: {
  template: DailyQuestTemplate | null;
  onSave: (t: DailyQuestTemplate) => Promise<void>;
  onClose: () => void;
}) {
  const [t, setT] = useState<DailyQuestTemplate>(template ?? { ...EMPTY_TEMPLATE });
  const [saving, setSaving] = useState(false);

  const isNew = !template;

  function set<K extends keyof DailyQuestTemplate>(k: K, v: DailyQuestTemplate[K]) {
    setT(prev => ({ ...prev, [k]: v }));
  }

  async function save() {
    if (!t.key.trim() || !t.label.trim()) { alert("Key und Label sind Pflichtfelder."); return; }
    setSaving(true);
    await onSave(t);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur">
      <div className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-zinc-950 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <h3 className="text-sm font-black text-zinc-100">{isNew ? "Neue Quest-Vorlage" : `Vorlage bearbeiten — ${t.label}`}</h3>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Key (einmalig)<Tip text="Eindeutiger Bezeichner — darf nach Erstellung nicht geändert werden." /></label>
              <input value={t.key} onChange={e => set("key", e.target.value.toLowerCase().replace(/\s+/g, "_"))} disabled={!isNew} placeholder="z.B. snake_5_games" className="w-full rounded-lg border border-white/[0.08] bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500 disabled:opacity-40" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Icon (Lucide-Name)</label>
              <input value={t.icon} onChange={e => set("icon", e.target.value)} placeholder="Star" className="w-full rounded-lg border border-white/[0.08] bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Anzeigename</label>
            <input value={t.label} onChange={e => set("label", e.target.value)} placeholder="Quest-Name" className="w-full rounded-lg border border-white/[0.08] bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500" />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Beschreibung<Tip text="Erklärt dem Spieler, wie die Quest abgeschlossen wird." /></label>
            <textarea value={t.description} onChange={e => set("description", e.target.value)} rows={2} className="w-full rounded-lg border border-white/[0.08] bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500 resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Ziel-Aktion<Tip text="Welche Spielaktion löst Fortschritt aus." /></label>
              <select value={t.targetAction} onChange={e => set("targetAction", e.target.value)} className="w-full rounded-lg border border-white/[0.08] bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500">
                {ACTION_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                <option value="">-- Benutzerdefiniert --</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Basis-Zielwert<Tip text="Standard-Anzahl zum Abschließen (wird ggf. level-skaliert)." /></label>
              <input type="number" min={1} value={t.baseTarget} onChange={e => set("baseTarget", Math.max(1, parseInt(e.target.value) || 1))} className="w-full rounded-lg border border-white/[0.08] bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Schwierigkeit</label>
              <select value={t.difficulty} onChange={e => set("difficulty", e.target.value as QuestDifficulty)} className="w-full rounded-lg border border-white/[0.08] bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500">
                {Object.entries(DIFFICULTY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Kategorie</label>
              <input value={t.category} onChange={e => set("category", e.target.value)} placeholder="spiele / farmwelt / wirtschaft" className="w-full rounded-lg border border-white/[0.08] bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Min. Level<Tip text="Quest erscheint erst ab diesem Spieler-Level." /></label>
              <input type="number" min={1} max={999} value={t.minLevel} onChange={e => set("minLevel", Math.max(1, parseInt(e.target.value) || 1))} className="w-full rounded-lg border border-white/[0.08] bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Max. Level<Tip text="Quest erscheint nur für Spieler unter diesem Level (999=kein Limit)." /></label>
              <input type="number" min={1} max={999} value={t.maxLevel} onChange={e => set("maxLevel", Math.max(1, parseInt(e.target.value) || 999))} className="w-full rounded-lg border border-white/[0.08] bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Belohnungstyp</label>
            <select value={t.rewardType} onChange={e => set("rewardType", e.target.value as QuestRewardType)} className="w-full rounded-lg border border-white/[0.08] bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500">
              {Object.entries(REWARD_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-amber-400 mb-1">Credits<Tip text="Credits-Belohnung (wird level-skaliert)." /></label>
              <input type="number" min={0} value={t.baseRewardCredits} onChange={e => set("baseRewardCredits", Math.max(0, parseInt(e.target.value) || 0))} className="w-full rounded-lg border border-white/[0.08] bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-amber-500 text-center" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-sky-400 mb-1">XP<Tip text="XP-Belohnung (wird level-skaliert)." /></label>
              <input type="number" min={0} value={t.baseRewardXp} onChange={e => set("baseRewardXp", Math.max(0, parseInt(e.target.value) || 0))} className="w-full rounded-lg border border-white/[0.08] bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-sky-500 text-center" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-violet-400 mb-1">BP-XP<Tip text="Battle-Pass-XP-Belohnung." /></label>
              <input type="number" min={0} value={t.baseRewardBpXp} onChange={e => set("baseRewardBpXp", Math.max(0, parseInt(e.target.value) || 0))} className="w-full rounded-lg border border-white/[0.08] bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-violet-500 text-center" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Item-Belohnung (Rarität)<Tip text="Leer lassen wenn kein Item-Drop. Sonst: normal / selten / mythisch / ultra" /></label>
            <input value={t.rewardItemRarity ?? ""} onChange={e => set("rewardItemRarity", e.target.value || null)} placeholder="leer = kein Item" className="w-full rounded-lg border border-white/[0.08] bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-fuchsia-500" />
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
            <RewardSpecEditor
              value={t.rewardExtra ?? []}
              onChange={v => set("rewardExtra", v)}
              label="Zusätzliche Belohnungen (Givables)"
            />
            <p className="text-[10px] text-zinc-600 mt-1.5">Werden ZUSÄTZLICH zu den obigen Belohnungen beim Einlösen vergeben (Fähigkeit, Name-Style, Badge, Case-Gutschein, Spiel-Bonus, Item, XP, Credits).</p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-zinc-300">Aktiviert</span>
            <button onClick={() => set("enabled", !t.enabled)} className={`relative h-6 w-11 rounded-full border transition-colors overflow-hidden ${t.enabled ? "bg-violet-600 border-violet-500" : "bg-zinc-800 border-zinc-700"}`}>
              <div className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${t.enabled ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
        </div>

        <div className="flex gap-2 border-t border-white/[0.06] px-5 py-4">
          <button onClick={onClose} className="flex-1 rounded-xl border border-white/[0.08] bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-700 transition-colors">Abbrechen</button>
          <button onClick={save} disabled={saving} className="flex-1 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 transition-colors disabled:opacity-50">
            {saving ? "Speichere…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Template list ─────────────────────────────────────────────────────────────

function TemplateList({ templates, onEdit, onDelete }: {
  templates: DailyQuestTemplate[];
  onEdit: (t: DailyQuestTemplate) => void;
  onDelete: (key: string) => void;
}) {
  const groups = templates.reduce((acc, t) => {
    if (!acc[t.difficulty]) acc[t.difficulty] = [];
    acc[t.difficulty].push(t);
    return acc;
  }, {} as Record<string, DailyQuestTemplate[]>);

  const ORDER: QuestDifficulty[] = ["easy", "medium", "hard", "legendary"];

  return (
    <div className="flex flex-col gap-4">
      {ORDER.filter(d => groups[d]?.length > 0).map(diff => (
        <div key={diff}>
          <div className={`mb-2 flex items-center gap-2 rounded-lg border px-3 py-1.5 ${DIFFICULTY_BG[diff]} ${DIFFICULTY_COLORS[diff]}`}>
            <span className="text-[11px] font-black uppercase tracking-widest">{DIFFICULTY_LABELS[diff]}</span>
            <span className="text-[10px] opacity-60">({groups[diff].length})</span>
          </div>
          <div className="flex flex-col gap-2">
            {groups[diff].map(t => (
              <CollapsibleAdminRow
                key={t.key}
                header={
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="font-semibold text-zinc-200 text-sm">{t.label}</span>
                    <span className="text-[10px] text-zinc-600 font-mono">{t.key}</span>
                    {!t.enabled && <span className="rounded-full bg-red-500/15 border border-red-500/25 px-1.5 py-0.5 text-[9px] font-bold text-red-400">DEAKTIVIERT</span>}
                    <span className="ml-auto text-[10px] text-zinc-600">{REWARD_TYPE_LABELS[t.rewardType]}</span>
                    <div className="flex gap-1.5 ml-2">
                      <button onClick={(e) => { e.stopPropagation(); onEdit(t); }} className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-1.5 text-violet-400 hover:bg-violet-500/20">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); if (confirm(`Vorlage "${t.label}" löschen?`)) onDelete(t.key); }} className="rounded-lg border border-red-500/30 bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                }
              >
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-zinc-500 pt-1">
                  <span>Aktion: <b className="text-zinc-300">{t.targetAction}</b></span>
                  <span>Zielwert: <b className="text-zinc-300">{t.baseTarget}</b></span>
                  <span>Level: <b className="text-zinc-300">{t.minLevel}–{t.maxLevel}</b></span>
                  <span>Kategorie: <b className="text-zinc-300">{t.category}</b></span>
                  {t.baseRewardCredits > 0 && <span>Credits: <b className="text-amber-400">{t.baseRewardCredits.toLocaleString("de-DE")}</b></span>}
                  {t.baseRewardXp > 0 && <span>XP: <b className="text-sky-400">{t.baseRewardXp}</b></span>}
                  {t.baseRewardBpXp > 0 && <span>BP-XP: <b className="text-violet-400">{t.baseRewardBpXp}</b></span>}
                  {t.rewardItemRarity && <span>Item: <b className="text-fuchsia-400">{t.rewardItemRarity}</b></span>}
                  <span className="col-span-2 text-zinc-600 italic">{t.description}</span>
                </div>
              </CollapsibleAdminRow>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

interface DailyQuestsTabProps {
  currencyName?: string;
}

export function DailyQuestsTab({ currencyName = "CR" }: DailyQuestsTabProps) {
  const [templates, setTemplates] = useState<DailyQuestTemplate[]>([]);
  const [config, setConfig] = useState<DailyQuestConfig>(DEFAULT_DAILY_QUEST_CONFIG);
  const [stats, setStats] = useState<DailyQuestStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<DailyQuestTemplate | null | undefined>(undefined);
  const [activeSection, setActiveSection] = useState<"stats" | "config" | "templates">("stats");
  const sound = useSoundManager();

  async function load() {
    setLoading(true);
    const [t, c, s] = await Promise.all([
      getDailyQuestTemplates(),
      getDailyQuestConfig(),
      adminGetDailyQuestStats(),
    ]);
    setTemplates(t);
    setConfig(c);
    setStats(s);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function handleSaveTemplate(t: DailyQuestTemplate) {
    const res = await adminUpsertQuestTemplate(t);
    if (res.success) {
      sound.save?.();
      setEditingTemplate(undefined);
      await load();
    } else {
      sound.error?.();
      alert("Fehler: " + res.error);
    }
  }

  async function handleDeleteTemplate(key: string) {
    const res = await adminDeleteQuestTemplate(key);
    if (res.success) { sound.save?.(); await load(); }
    else { sound.error?.(); alert("Fehler: " + res.error); }
  }

  const SECTIONS = [
    { id: "stats", label: "Statistik", icon: BarChart3 },
    { id: "config", label: "Konfiguration", icon: Settings },
    { id: "templates", label: "Vorlagen", icon: ListChecks },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/10">
            <ListChecks className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h2 className="text-base font-black text-zinc-100">Daily Quest System</h2>
            <p className="text-xs text-zinc-500">Tägliche Quests für alle Spieler</p>
          </div>
        </div>
        <button onClick={load} className="rounded-full p-2 text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06]">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1.5 rounded-xl border border-white/[0.06] bg-zinc-900/50 p-1">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id as typeof activeSection)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
              activeSection === s.id ? "bg-violet-600/20 text-violet-300 border border-violet-500/30" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <s.icon className="h-3.5 w-3.5" />
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
        </div>
      ) : (
        <>
          {activeSection === "stats" && stats && (
            <StatsCard stats={stats} currencyName={currencyName} onReset={load} />
          )}

          {activeSection === "config" && (
            <ConfigEditor initialConfig={config} templates={templates} />
          )}

          {activeSection === "templates" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500">{templates.length} Vorlagen · {templates.filter(t => t.enabled).length} aktiv</p>
                <button
                  onClick={() => setEditingTemplate(null)}
                  className="flex items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs font-bold text-violet-400 hover:bg-violet-500/20 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Neue Vorlage
                </button>
              </div>
              <TemplateList templates={templates} onEdit={setEditingTemplate} onDelete={handleDeleteTemplate} />
            </div>
          )}
        </>
      )}

      {/* Template modal */}
      {editingTemplate !== undefined && (
        <TemplateModal
          template={editingTemplate}
          onSave={handleSaveTemplate}
          onClose={() => setEditingTemplate(undefined)}
        />
      )}
    </div>
  );
}
