"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Sparkles, TrendingUp, Clock, Link2, Gift, Info, Calendar } from "lucide-react";
import { useSoundManager } from "@/lib/sound-manager";
import { adminGetSynergyConfig, adminUpdateSynergyConfig } from "@/lib/actions/economy-synergy";
import { DEFAULT_SYNERGY_CONFIG, computeSynergyMultipliers, type EconomySynergyConfig } from "@/lib/economy-synergy";

const DAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const INPUT = "w-28 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-purple-400/50";

function Section({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
      <div className="mb-1 flex items-center gap-2 text-sm font-black text-zinc-100">{icon}{title}</div>
      {hint && <p className="mb-3 text-xs text-zinc-500">{hint}</p>}
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </div>
  );
}

function NumRow({ label, value, onChange, hint, step = 1, min = 0, suffix }: {
  label: string; value: number; onChange: (n: number) => void; hint?: string; step?: number; min?: number; suffix?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-[240px] flex-1">
        <span className="text-sm text-zinc-300">{label}</span>
        {hint && <p className="text-[11px] text-zinc-600">{hint}</p>}
      </div>
      <input type="number" step={step} min={min} value={value} onChange={(e) => onChange(Number(e.target.value))} className={INPUT} />
      {suffix && <span className="text-xs text-zinc-500">{suffix}</span>}
    </div>
  );
}

export function EconomySynergyEditor() {
  const sound = useSoundManager();
  const [cfg, setCfg] = useState<EconomySynergyConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [previewLevel, setPreviewLevel] = useState(50);

  useEffect(() => { adminGetSynergyConfig().then(setCfg).catch(() => setCfg(DEFAULT_SYNERGY_CONFIG)); }, []);

  function set<K extends keyof EconomySynergyConfig>(key: K, val: EconomySynergyConfig[K]) {
    setCfg((c) => (c ? { ...c, [key]: val } : c));
  }

  async function save() {
    if (!cfg) return;
    setSaving(true); setMsg(null); sound.click();
    const res = await adminUpdateSynergyConfig(cfg);
    setSaving(false);
    if (res.success) { sound.save(); setMsg({ text: "Gespeichert. Wirkt sofort auf die ganze Seite.", ok: true }); }
    else { sound.error(); setMsg({ text: res.error ?? "Fehler.", ok: false }); }
    setTimeout(() => setMsg(null), 5000);
  }

  if (!cfg) return <div className="flex items-center gap-2 text-sm text-zinc-600"><Loader2 className="h-4 w-4 animate-spin" /> Lade…</div>;

  const preview = computeSynergyMultipliers(cfg, previewLevel, new Date());

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-fuchsia-400" />
        <h2 className="text-lg font-black text-zinc-100">Synergie &amp; Boosts</h2>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/[0.05] px-4 py-3 text-[12px] leading-relaxed text-fuchsia-100/80">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-fuchsia-300" />
        <span>
          Diese eine Schicht verbindet <b className="text-fuchsia-200">Level ↔ Battle Pass ↔ Daily Quests ↔ die gesamte Wirtschaft</b>.
          Sie greift an den zwei zentralen Stellen, durch die jede Belohnung fließt — also wirken Änderungen <b>sofort überall</b>
          (Mining, Snake, Plinko, DON, Welt, Cases, Quests …). Höheres Level = mehr; jeder XP-Gewinn füllt automatisch den Battle Pass;
          Wochenend- &amp; Happy-Hour-Boosts gelten global.
        </span>
      </div>

      {/* Master + preview */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={cfg.enabled} onChange={(e) => set("enabled", e.target.checked)} className="h-4 w-4" />
          <span className="text-sm font-bold text-zinc-100">Synergie-System aktiv</span>
        </label>
        <div className="ml-auto flex items-center gap-3 rounded-xl border border-white/8 bg-black/20 px-4 py-2">
          <span className="text-xs text-zinc-500">Vorschau bei Level</span>
          <input type="number" min={1} value={previewLevel} onChange={(e) => setPreviewLevel(Math.max(1, Number(e.target.value)))} className="w-20 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-zinc-200 outline-none" />
          <span className="text-sm font-bold text-emerald-300">×{preview.creditMult.toFixed(2)} CR</span>
          <span className="text-sm font-bold text-sky-300">×{preview.xpMult.toFixed(2)} XP</span>
          <span className="text-sm font-bold text-fuchsia-300">+{preview.bpXpFromLevelXpPercent}% → BP</span>
          {preview.timeBoostActive && <span className="rounded-md border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">Zeit-Boost LIVE</span>}
        </div>
      </div>

      <Section icon={<TrendingUp className="h-4 w-4 text-emerald-400" />} title="Level-Staffelung" hint="Höheres Spieler-Level = mehr Belohnung. Pro Level ein Bonus, gedeckelt.">
        <NumRow label="Credits-Bonus pro Level" hint="z.B. 0,4 → Level 50 = +20% Credits (bis Cap)" value={cfg.levelCreditBonusPercentPerLevel} step={0.1} onChange={(n) => set("levelCreditBonusPercentPerLevel", n)} suffix="% / Level" />
        <NumRow label="Cap Credits-Bonus" value={cfg.levelCreditBonusCapPercent} onChange={(n) => set("levelCreditBonusCapPercent", n)} suffix="% max" />
        <NumRow label="XP-Bonus pro Level ⚠️" hint="Vorsicht: schneller Snowball — klein halten oder 0" value={cfg.levelXpBonusPercentPerLevel} step={0.1} onChange={(n) => set("levelXpBonusPercentPerLevel", n)} suffix="% / Level" />
        <NumRow label="Cap XP-Bonus" value={cfg.levelXpBonusCapPercent} onChange={(n) => set("levelXpBonusCapPercent", n)} suffix="% max" />
      </Section>

      <Section icon={<Link2 className="h-4 w-4 text-fuchsia-400" />} title="XP-Querfluss → Battle Pass" hint="Jeder Level-XP-Gewinn auf der ganzen Seite füllt anteilig auch den aktiven Battle Pass.">
        <NumRow label="Anteil Level-XP → BP-XP" hint="z.B. 30 → 30% jedes XP-Gewinns landet auch im Battle Pass" value={cfg.bpXpFromLevelXpPercent} onChange={(n) => set("bpXpFromLevelXpPercent", n)} suffix="%" />
      </Section>

      <Section icon={<Clock className="h-4 w-4 text-amber-400" />} title="Zeit-Boosts (Serverzeit)" hint="Globale Multiplikatoren für XP und Credits zu bestimmten Zeiten — gelten für alle Spieler.">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-[240px] flex-1 text-sm text-zinc-300 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Wochenend-Tage</span>
          <div className="flex flex-wrap gap-1">
            {DAYS.map((d, i) => {
              const on = cfg.weekendDays.includes(i);
              return (
                <button key={i} onClick={() => set("weekendDays", on ? cfg.weekendDays.filter((x) => x !== i) : [...cfg.weekendDays, i])}
                  className={`rounded-md border px-2 py-1 text-[11px] font-bold transition-colors ${on ? "border-amber-400/50 bg-amber-500/15 text-amber-200" : "border-white/10 text-zinc-500"}`}>{d}</button>
              );
            })}
          </div>
        </div>
        <NumRow label="Wochenend-Multiplikator XP" value={cfg.weekendXpMultiplier} step={0.05} min={0} onChange={(n) => set("weekendXpMultiplier", n)} suffix="× (1 = aus)" />
        <NumRow label="Wochenend-Multiplikator Credits" value={cfg.weekendCreditMultiplier} step={0.05} min={0} onChange={(n) => set("weekendCreditMultiplier", n)} suffix="× (1 = aus)" />
        <label className="flex cursor-pointer items-center gap-2 pt-1">
          <input type="checkbox" checked={cfg.happyHourEnabled} onChange={(e) => set("happyHourEnabled", e.target.checked)} className="h-4 w-4" />
          <span className="text-sm font-semibold text-zinc-200">Happy Hour aktiv</span>
        </label>
        <div className={cfg.happyHourEnabled ? "flex flex-col gap-3" : "pointer-events-none flex flex-col gap-3 opacity-40"}>
          <NumRow label="Happy-Hour Startstunde" hint="0–23 Uhr (Serverzeit)" value={cfg.happyHourStartHour} min={0} onChange={(n) => set("happyHourStartHour", Math.max(0, Math.min(23, Math.floor(n))))} suffix="Uhr" />
          <NumRow label="Happy-Hour Dauer" value={cfg.happyHourDurationHours} min={0} onChange={(n) => set("happyHourDurationHours", n)} suffix="Std." />
          <NumRow label="Happy-Hour Multiplikator XP" value={cfg.happyHourXpMultiplier} step={0.05} min={0} onChange={(n) => set("happyHourXpMultiplier", n)} suffix="×" />
          <NumRow label="Happy-Hour Multiplikator Credits" value={cfg.happyHourCreditMultiplier} step={0.05} min={0} onChange={(n) => set("happyHourCreditMultiplier", n)} suffix="×" />
        </div>
      </Section>

      <Section icon={<Gift className="h-4 w-4 text-purple-400" />} title="Daily-Quest-Synergie" hint="Daily-Quest-Credits skalieren mit dem Level (XP + BP-XP laufen bereits über die zentrale XP-Schicht — Dailies füllen automatisch den Battle Pass).">
        <NumRow label="Credits-Bonus pro Level" value={cfg.dailyQuestRewardPercentPerLevel} step={0.1} onChange={(n) => set("dailyQuestRewardPercentPerLevel", n)} suffix="% / Level" />
        <NumRow label="Cap" value={cfg.dailyQuestRewardCapPercent} onChange={(n) => set("dailyQuestRewardCapPercent", n)} suffix="% max" />
      </Section>

      <Section icon={<Sparkles className="h-4 w-4 text-amber-400" />} title="Event-Banner">
        <div className="flex flex-wrap items-center gap-3">
          <span className="min-w-[240px] flex-1 text-sm text-zinc-300">Text bei aktivem Zeit-Boost</span>
          <input value={cfg.eventLabel} onChange={(e) => set("eventLabel", e.target.value)} className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none" placeholder="z.B. Happy Hour!" />
        </div>
      </Section>

      <div className="sticky bottom-3 flex items-center gap-3">
        <button onClick={save} disabled={saving} className="flex items-center gap-1.5 rounded-xl bg-fuchsia-600 px-5 py-2 text-sm font-bold text-white hover:bg-fuchsia-500 disabled:opacity-40">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Speichern
        </button>
        {msg && <p className={`text-sm font-semibold ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
