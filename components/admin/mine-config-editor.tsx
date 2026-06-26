"use client";

import { useState } from "react";
import { RotateCcw, Save, CheckCircle, XCircle, Pickaxe, Plus, Trash2 } from "lucide-react";
import { updateMineConfig } from "@/lib/actions/mine";
import { DEFAULT_MINE_CONFIG, type MineConfig, type MineLevel } from "@/lib/mine-config";
import { useSoundManager } from "@/lib/sound-manager";
import { AdminTooltip } from "@/components/admin/admin-tooltip";

interface MineConfigEditorProps {
  config: MineConfig;
}

export function MineConfigEditor({ config }: MineConfigEditorProps) {
  const [form, setForm] = useState<MineConfig>(config);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const sound = useSoundManager();

  function setEnabled(v: boolean) { setForm((f) => ({ ...f, enabled: v })); }
  function setTitle(v: string) { setForm((f) => ({ ...f, sectionTitle: v })); }
  function setSubtitle(v: string) { setForm((f) => ({ ...f, sectionSubtitle: v })); }

  function updateLevel(idx: number, patch: Partial<MineLevel>) {
    setForm((f) => ({
      ...f,
      levels: f.levels.map((l, i) => i === idx ? { ...l, ...patch } : l),
    }));
  }

  function addLevel() {
    const last = form.levels[form.levels.length - 1];
    const newLevel: MineLevel = {
      level: (last?.level ?? 0) + 1,
      crPerHour: Math.round((last?.crPerHour ?? 100) * 1.32),
      maxStorageHours: last?.maxStorageHours ?? 24,
      upgradeCost: null,
    };
    setForm((f) => ({ ...f, levels: [...f.levels, newLevel] }));
  }

  function removeLevel(idx: number) {
    setForm((f) => ({
      ...f,
      levels: f.levels.filter((_, i) => i !== idx).map((l, i) => ({ ...l, level: i + 1 })),
    }));
  }

  async function save() {
    setSaving(true);
    sound.click();
    const res = await updateMineConfig(form);
    setSaving(false);
    if (res.success) sound.save();
    else sound.error();
    setMsg({ text: res.error ?? "Gespeichert!", ok: res.success });
    if (res.success) setTimeout(() => setMsg(null), 3000);
  }

  function reset() {
    setForm(DEFAULT_MINE_CONFIG);
    setMsg(null);
  }

  return (
    <div className="flex flex-col gap-5">
      {msg && (
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${
          msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"
        }`}>
          {msg.ok ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {msg.text}
        </div>
      )}

      {/* Enable */}
      <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <div>
            <p className="text-sm font-bold text-zinc-200">Mine aktiviert</p>
            <p className="text-xs text-zinc-500">Wenn deaktiviert, können Spieler nicht sammeln oder upgraden</p>
          </div>
          <AdminTooltip text="Master-Schalter für das passive Credit-Abbau-System. Wenn deaktiviert, ist die Mine-Seite gesperrt und Spieler können weder Credits einsammeln noch ihre Mine upgraden. Bereits angesammelte Credits bleiben erhalten." />
        </div>
        <button
          onClick={() => setEnabled(!form.enabled)}
          className={`relative h-6 w-11 rounded-full transition-colors ${form.enabled ? "bg-emerald-500" : "bg-white/10"}`}
        >
          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${form.enabled ? "left-6" : "left-1"}`} />
        </button>
      </div>

      {/* Texts */}
      <div className="rounded-xl border border-white/8 bg-black/10 p-4">
        <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
          <Pickaxe className="h-3.5 w-3.5" /> Anzeige-Texte
        </h4>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
              Titel
              <AdminTooltip text="Überschrift die im Mine-Bereich auf der Nutzer-Seite angezeigt wird. Maximal 40 Zeichen. Beispiel: '⛏️ Deine Mine'." />
            </span>
            <input type="text" maxLength={40} value={form.sectionTitle}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
              Untertitel
              <AdminTooltip text="Kurze Beschreibung unter dem Titel (max. 80 Zeichen). Erklärt dem Nutzer, was er mit der Mine machen kann." />
            </span>
            <input type="text" maxLength={80} value={form.sectionSubtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60" />
          </label>
        </div>
      </div>

      {/* Level editor */}
      <div className="rounded-xl border border-white/8 bg-black/10 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Level-Konfiguration</h4>
          <button onClick={addLevel}
            className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300 hover:bg-amber-500/20">
            <Plus className="h-3 w-3" /> Level
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {/* Header row */}
          <div className="grid grid-cols-[40px_1fr_1fr_1fr_32px] gap-2 px-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
            <span>Lvl</span>
            <span className="flex items-center gap-1">CR/h <AdminTooltip text="Credits pro Stunde, die diese Mine-Stufe passiv generiert. Nutzer müssen manuell einsammeln; Credits bis zur Lagerkapazität." /></span>
            <span className="flex items-center gap-1">Max-Lager (h) <AdminTooltip text="Maximale Stunden, die diese Mine-Stufe speichern kann bevor sie voll ist. Voll = keine weiteren Credits werden generiert bis eingesammelt wird." /></span>
            <span className="flex items-center gap-1">Upgrade-Kosten <AdminTooltip text="Credits die der Nutzer bezahlen muss, um auf die nächste Stufe aufzusteigen. Leer lassen = diese Stufe ist das Maximum (kein weiteres Upgrade möglich)." /></span>
            <span></span>
          </div>

          {form.levels.map((lvl, idx) => (
            <div key={idx} className="grid grid-cols-[40px_1fr_1fr_1fr_32px] gap-2 rounded-lg border border-white/5 bg-black/20 p-2">
              <div className="flex items-center justify-center rounded-lg border border-white/10 bg-black/30 text-sm font-extrabold text-zinc-400">
                {lvl.level}
              </div>
              <input type="number" min={1} value={lvl.crPerHour}
                onChange={(e) => updateLevel(idx, { crPerHour: Math.max(1, parseInt(e.target.value) || 1) })}
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60" />
              <input type="number" min={1} max={168} value={lvl.maxStorageHours}
                onChange={(e) => updateLevel(idx, { maxStorageHours: Math.max(1, parseInt(e.target.value) || 24) })}
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60" />
              <input type="number" min={0} value={lvl.upgradeCost ?? ""}
                placeholder="Max-Level"
                onChange={(e) => updateLevel(idx, { upgradeCost: e.target.value === "" ? null : Math.max(1, parseInt(e.target.value) || 1) })}
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60" />
              <button onClick={() => removeLevel(idx)}
                className="flex items-center justify-center rounded-lg border border-red-500/20 text-red-500/50 hover:border-red-500/40 hover:text-red-400 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-zinc-600">Upgrade-Kosten leer lassen = maximales Level (kein weiteres Upgrade möglich)</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-bold text-black shadow-[0_0_12px_rgba(217,119,6,0.3)] hover:bg-amber-500 disabled:opacity-50">
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
