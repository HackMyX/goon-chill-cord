"use client";

import { useState, useTransition } from "react";
import { Save, RefreshCw, AlertTriangle, CheckCircle2, TrendingUp, Zap, Star, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import type { XpConfig, LevelDefinition, XpSourceConfig, LevelReward } from "@/lib/level-system";
import { getXpConfig, updateXpConfig, adminGrantXp } from "@/lib/actions/level-system";

interface LevelConfigEditorProps {
  initialConfig: XpConfig;
  profiles: { id: string; username: string }[];
}

function NumInput({ label, value, onChange, min = 0, step = 1, unit = "" }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; step?: number; unit?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="number" value={value} min={min} step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {unit && <span className="shrink-0 text-xs text-zinc-500">{unit}</span>}
      </div>
    </label>
  );
}

export function LevelConfigEditor({ initialConfig, profiles }: LevelConfigEditorProps) {
  const [config, setConfig] = useState<XpConfig>(initialConfig);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [isPending, startTransition] = useTransition();

  // Grant XP form
  const [grantUserId, setGrantUserId] = useState("");
  const [grantAmount, setGrantAmount] = useState(100);
  const [grantReason, setGrantReason] = useState("");
  const [grantMsg, setGrantMsg] = useState("");

  function setSources(patch: Partial<XpSourceConfig>) {
    setConfig((c) => ({ ...c, sources: { ...c.sources, ...patch } }));
  }

  function setLevelField(level: number, patch: Partial<LevelDefinition>) {
    setConfig((c) => ({
      ...c,
      levels: c.levels.map((l) => l.level === level ? { ...l, ...patch } : l),
    }));
  }

  function toggleExpanded(level: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level); else next.add(level);
      return next;
    });
  }

  function addReward(level: number) {
    setLevelField(level, {
      rewards: [...(config.levels.find((l) => l.level === level)?.rewards ?? []), { type: "credits", amount: 1000 }],
    });
  }

  function removeReward(level: number, idx: number) {
    const lvl = config.levels.find((l) => l.level === level);
    if (!lvl) return;
    setLevelField(level, { rewards: lvl.rewards.filter((_, i) => i !== idx) });
  }

  function setReward(level: number, idx: number, patch: Partial<LevelReward>) {
    const lvl = config.levels.find((l) => l.level === level);
    if (!lvl) return;
    setLevelField(level, {
      rewards: lvl.rewards.map((r, i) => i === idx ? { ...r, ...patch } : r),
    });
  }

  async function handleSave() {
    setSaving(true); setSaveOk(false); setSaveErr("");
    const result = await updateXpConfig(config);
    setSaving(false);
    if (result.success) { setSaveOk(true); setTimeout(() => setSaveOk(false), 2500); }
    else setSaveErr(result.error ?? "Fehler");
  }

  async function handleGrantXp() {
    if (!grantUserId || grantAmount <= 0) return;
    setGrantMsg("Vergebe XP…");
    const res = await adminGrantXp(grantUserId, grantAmount, grantReason || undefined);
    if (res.success && res.result) {
      setGrantMsg(`✅ ${grantAmount} XP vergeben → Level ${res.result.newLevel}${res.result.leveledUp ? " 🎉 Level-Up!" : ""}`);
    } else {
      setGrantMsg(`❌ ${res.error}`);
    }
  }

  async function handleRefresh() {
    startTransition(async () => {
      const fresh = await getXpConfig();
      setConfig(fresh);
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-purple-400" />
          <h2 className="text-base font-bold text-zinc-100">Level & XP System</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:border-white/20 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
            Neu laden
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-purple-600/80 px-4 py-1.5 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Speichern
          </button>
        </div>
      </div>

      {saveErr && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {saveErr}
        </div>
      )}
      {saveOk && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> Gespeichert!
        </div>
      )}

      {/* Slot count */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
        <h3 className="mb-3 text-xs font-bold text-zinc-400 uppercase tracking-wider">Fähigkeiten-Slots</h3>
        <div className="max-w-xs">
          <NumInput
            label="Anzahl Fähigkeiten-Slots pro Spieler"
            value={config.abilitySlotCount}
            onChange={(v) => setConfig((c) => ({ ...c, abilitySlotCount: Math.max(1, Math.min(5, v)) }))}
            min={1}
          />
        </div>
      </div>

      {/* XP Sources */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">
          <Zap className="h-3.5 w-3.5 text-amber-400" />
          XP-Quellen
        </h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3">
          <NumInput label="Mine (XP pro 100 CR)" value={config.sources.mine_collect_per_100cr} onChange={(v) => setSources({ mine_collect_per_100cr: v })} step={0.1} />
          <NumInput label="Streak (XP pro Tag)" value={config.sources.streak_per_day} onChange={(v) => setSources({ streak_per_day: v })} step={1} />
          <NumInput label="Snake (XP pro Punkt)" value={config.sources.snake_per_score_point} onChange={(v) => setSources({ snake_per_score_point: v })} step={0.1} />
          <NumInput label="Plinko (XP pro Drop)" value={config.sources.plinko_per_drop} onChange={(v) => setSources({ plinko_per_drop: v })} />
          <NumInput label="DON (XP pro Gewinn)" value={config.sources.don_win} onChange={(v) => setSources({ don_win: v })} />
          <NumInput label="Case öffnen (XP)" value={config.sources.case_open} onChange={(v) => setSources({ case_open: v })} />
          <NumInput label="Welt-Kill (XP)" value={config.sources.world_kill} onChange={(v) => setSources({ world_kill: v })} />
          <NumInput label="PvP-Kill (XP)" value={config.sources.pvp_kill} onChange={(v) => setSources({ pvp_kill: v })} />
          <NumInput label="Battle Pass Tier (XP)" value={config.sources.bp_tier_claim} onChange={(v) => setSources({ bp_tier_claim: v })} />
        </div>
      </div>

      {/* Level Definitions */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">
          <Star className="h-3.5 w-3.5 text-amber-400" />
          Level-Definitionen ({config.levels.length} Level)
        </h3>
        <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
          {config.levels.map((lvl) => (
            <div key={lvl.level} className="rounded-xl border border-white/8 bg-black/20">
              <button
                onClick={() => toggleExpanded(lvl.level)}
                className="flex w-full items-center justify-between p-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="w-14 rounded-md bg-purple-500/20 px-2 py-0.5 text-center text-xs font-bold text-purple-300">
                    Lv. {lvl.level}
                  </span>
                  <span className="text-sm text-zinc-300">{lvl.title}</span>
                  <span className="text-xs text-zinc-500">{lvl.xpRequired.toLocaleString("de-DE")} XP</span>
                  {lvl.rewards.length > 0 && (
                    <span className="text-xs text-amber-400">{lvl.rewards.length} Belohnung{lvl.rewards.length !== 1 ? "en" : ""}</span>
                  )}
                </div>
                {expanded.has(lvl.level) ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
              </button>

              {expanded.has(lvl.level) && (
                <div className="border-t border-white/5 p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                    <NumInput label="XP benötigt" value={lvl.xpRequired} onChange={(v) => setLevelField(lvl.level, { xpRequired: v })} min={0} />
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-400">Titel</span>
                      <input
                        value={lvl.title}
                        onChange={(e) => setLevelField(lvl.level, { title: e.target.value })}
                        className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
                      />
                    </label>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-400">Belohnungen</span>
                      <button onClick={() => addReward(lvl.level)} className="flex items-center gap-1 rounded-lg bg-purple-600/60 px-2 py-1 text-xs text-white hover:bg-purple-500/80">
                        <Plus className="h-3 w-3" /> Hinzufügen
                      </button>
                    </div>
                    {lvl.rewards.length === 0 && (
                      <p className="text-xs text-zinc-600 italic">Keine Belohnungen</p>
                    )}
                    {lvl.rewards.map((r, idx) => (
                      <div key={idx} className="mb-2 flex items-center gap-2 rounded-lg border border-white/5 bg-black/20 p-2">
                        <select
                          value={r.type}
                          onChange={(e) => setReward(lvl.level, idx, { type: e.target.value as LevelReward["type"] })}
                          className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-200 outline-none"
                        >
                          <option value="credits">Credits</option>
                          <option value="ability">Fähigkeit</option>
                          <option value="badge">Badge</option>
                          <option value="name_style">Name-Style</option>
                        </select>
                        {r.type === "credits" && (
                          <input
                            type="number"
                            value={r.amount ?? 0}
                            onChange={(e) => setReward(lvl.level, idx, { amount: Number(e.target.value) })}
                            className="w-28 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-200 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="1000"
                          />
                        )}
                        {(r.type === "ability" || r.type === "badge" || r.type === "name_style") && (
                          <input
                            value={r.type === "ability" ? (r.abilityKey ?? "") : r.type === "badge" ? (r.badgeKey ?? "") : (r.nameStyleKey ?? "")}
                            onChange={(e) => {
                              if (r.type === "ability") setReward(lvl.level, idx, { abilityKey: e.target.value });
                              else if (r.type === "badge") setReward(lvl.level, idx, { badgeKey: e.target.value });
                              else setReward(lvl.level, idx, { nameStyleKey: e.target.value });
                            }}
                            placeholder={r.type === "ability" ? "ability_key" : r.type === "badge" ? "badge_key" : "style_key"}
                            className="flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-200 outline-none"
                          />
                        )}
                        <button onClick={() => removeReward(lvl.level, idx)} className="rounded-lg p-1 text-red-400 hover:bg-red-500/10">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Admin: Grant XP */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">
          <Zap className="h-3.5 w-3.5 text-purple-400" />
          XP manuell vergeben
        </h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Spieler</span>
            <select
              value={grantUserId}
              onChange={(e) => setGrantUserId(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none"
            >
              <option value="">Spieler wählen…</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.username}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">XP-Menge</span>
            <input
              type="number" value={grantAmount} min={1}
              onChange={(e) => setGrantAmount(Number(e.target.value))}
              className="w-24 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-zinc-400">Grund (optional)</span>
            <input
              value={grantReason}
              onChange={(e) => setGrantReason(e.target.value)}
              placeholder="z.B. Gewinn-Event"
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none"
            />
          </div>
          <button
            onClick={handleGrantXp}
            disabled={!grantUserId || grantAmount <= 0}
            className="rounded-xl bg-purple-600/80 px-4 py-1.5 text-sm font-bold text-white hover:bg-purple-500 disabled:opacity-50"
          >
            Vergeben
          </button>
        </div>
        {grantMsg && (
          <p className={`mt-2 text-xs ${grantMsg.startsWith("✅") ? "text-emerald-400" : grantMsg.startsWith("❌") ? "text-red-400" : "text-zinc-400"}`}>
            {grantMsg}
          </p>
        )}
      </div>
    </div>
  );
}
