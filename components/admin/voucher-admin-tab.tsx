"use client";

import { useEffect, useState, useCallback } from "react";
import { Gift, Loader2, Plus, Trash2, Check, X, Ticket, Sparkles, Info } from "lucide-react";
import { useSoundManager } from "@/lib/sound-manager";
import {
  adminListRedemptionCodes, adminCreateRedemptionCode,
  adminToggleRedemptionCode, adminDeleteRedemptionCode,
} from "@/lib/actions/vouchers";
import { getAllAbilityDefinitions } from "@/lib/actions/abilities";
import { getBadgeDefinitions } from "@/lib/actions/badges";
import {
  VOUCHER_REWARD_LABELS, VOUCHER_REWARD_ICONS, voucherRewardShort,
  type RedemptionCode, type VoucherReward, type VoucherRewardType,
} from "@/lib/vouchers";

const REWARD_TYPES = Object.keys(VOUCHER_REWARD_LABELS) as VoucherRewardType[];

export function VoucherAdminTab() {
  const sound = useSoundManager();
  const [codes, setCodes] = useState<RedemptionCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [abilities, setAbilities] = useState<{ key: string; name: string }[]>([]);
  const [badges, setBadges] = useState<{ key: string; label: string }[]>([]);

  // Code-level settings
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState(0);
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // The reward BUNDLE being built + the draft reward being configured.
  const [rewards, setRewards] = useState<VoucherReward[]>([]);
  const [dType, setDType] = useState<VoucherRewardType>("ability");
  const [dAmount, setDAmount] = useState(500);
  const [dAbilityKey, setDAbilityKey] = useState("");
  const [dDuration, setDDuration] = useState(48);
  const [dBadgeKey, setDBadgeKey] = useState("");
  const [dStyleKey, setDStyleKey] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setCodes(await adminListRedemptionCodes());
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    getAllAbilityDefinitions().then((a) => setAbilities(a.map((x) => ({ key: x.key, name: x.name })))).catch(() => {});
    getBadgeDefinitions().then((b) => setBadges(b.map((x) => ({ key: x.key, label: x.label })))).catch(() => {});
  }, [reload]);

  function addReward() {
    let r: VoucherReward | null = null;
    if (dType === "credits") {
      if (dAmount <= 0) { flash("Credits-Betrag fehlt.", false); return; }
      r = { type: "credits", amount: dAmount };
    } else if (dType === "ability") {
      if (!dAbilityKey) { flash("Fähigkeit wählen.", false); return; }
      r = { type: "ability", abilityKey: dAbilityKey, durationHours: Math.max(0, dDuration) };
    } else if (dType === "badge") {
      if (!dBadgeKey) { flash("Badge wählen.", false); return; }
      r = { type: "badge", badgeKey: dBadgeKey };
    } else if (dType === "name_style") {
      if (!dStyleKey.trim()) { flash("Name-Style-Key fehlt.", false); return; }
      r = { type: "name_style", styleKey: dStyleKey.trim() };
    }
    if (r) { setRewards((prev) => [...prev, r as VoucherReward]); sound.click(); }
  }

  function removeReward(idx: number) {
    setRewards((prev) => prev.filter((_, i) => i !== idx));
    sound.click();
  }

  function flash(text: string, ok: boolean) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }

  async function handleCreate() {
    if (rewards.length === 0) { flash("Mindestens eine Belohnung hinzufügen.", false); return; }
    setCreating(true);
    setMsg(null);
    sound.click();
    const res = await adminCreateRedemptionCode({
      code, label: label.trim() || undefined, rewards, maxUses, expiresAt: expiresAt || null,
    });
    setCreating(false);
    if (res.success) {
      sound.save();
      flash("Code erstellt.", true);
      setCode(""); setLabel(""); setRewards([]);
    } else {
      sound.error();
      flash(res.error ?? "Fehler.", false);
    }
  }

  async function toggle(c: RedemptionCode) {
    sound.click();
    const res = await adminToggleRedemptionCode(c.code, !c.enabled);
    if (res.success) void reload(); else sound.error();
  }

  async function remove(c: RedemptionCode) {
    sound.click();
    const res = await adminDeleteRedemptionCode(c.code);
    if (res.success) { sound.save(); void reload(); } else sound.error();
  }

  const abilityName = (key?: string) => abilities.find((a) => a.key === key)?.name ?? key ?? "?";
  const badgeLabel = (key?: string) => badges.find((b) => b.key === key)?.label ?? key ?? "?";

  function rewardChipLabel(r: VoucherReward): string {
    if (r.type === "credits") return `${(r.amount ?? 0).toLocaleString("de-DE")} CR`;
    if (r.type === "ability") return `${abilityName(r.abilityKey)}${r.durationHours ? ` · ${r.durationHours}h` : " · perm"}`;
    if (r.type === "badge") return badgeLabel(r.badgeKey);
    return r.styleKey ?? "?";
  }

  const inputCls = "rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-purple-400/50";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Gift className="h-5 w-5 text-purple-400" />
        <h2 className="text-lg font-black text-zinc-100">Gutscheine / Codes</h2>
      </div>

      {/* Explainer */}
      <div className="flex items-start gap-2 rounded-xl border border-purple-400/20 bg-purple-500/[0.05] px-4 py-3 text-[12px] leading-relaxed text-purple-100/80">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-300" />
        <span>
          Ein Code kann ein <b className="text-purple-200">ganzes Bündel</b> an Belohnungen vergeben — z.B.{" "}
          <i>„48h Mining-Boost + Snake-Boost + XP-Boost"</i> in einem. Füge dafür unten mehrere{" "}
          <b className="text-purple-200">Belohnungen</b> hinzu. Fähigkeits-Boosts wirken <b className="text-purple-200">getimt</b>{" "}
          (Dauer in Stunden, 0 = permanent) — die Stärke (z.B. „+50% Mining") definierst du in der{" "}
          <b className="text-purple-200">Fähigkeiten</b>-Verwaltung.
        </span>
      </div>

      {/* Create */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
          <Plus className="h-3.5 w-3.5 text-purple-400" /> Code erstellen
        </h3>

        {/* Code-level */}
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Code (A–Z, 0–9, -)</span>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SUMMER2026"
              className={`${inputCls} w-44 font-bold uppercase tracking-wider`} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Notiz (optional)</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z.B. Discord-Aktion"
              className={`${inputCls} w-48`} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Max. Einlösungen (0=∞)</span>
            <input type="number" min={0} value={maxUses} onChange={(e) => setMaxUses(Math.max(0, parseInt(e.target.value) || 0))}
              className={`${inputCls} w-32`} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Läuft ab (optional)</span>
            <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* Bundle being built */}
        <div className="mt-4 rounded-xl border border-purple-400/15 bg-purple-500/[0.03] p-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-purple-300">
            <Sparkles className="h-3.5 w-3.5" /> Belohnungs-Bündel ({rewards.length})
          </p>
          {rewards.length === 0 ? (
            <p className="mb-3 text-xs text-zinc-600">Noch keine Belohnung — unten konfigurieren und „Hinzufügen".</p>
          ) : (
            <div className="mb-3 flex flex-wrap gap-2">
              {rewards.map((r, i) => (
                <span key={i} className="flex items-center gap-1.5 rounded-lg border border-purple-400/30 bg-purple-500/10 px-2.5 py-1 text-xs font-semibold text-purple-200">
                  <span>{VOUCHER_REWARD_ICONS[r.type]}</span>
                  {rewardChipLabel(r)}
                  <button onClick={() => removeReward(i)} className="ml-0.5 text-purple-300/60 hover:text-red-400"><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}

          {/* Draft reward */}
          <div className="flex flex-wrap items-end gap-3 border-t border-white/5 pt-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-zinc-400">Typ</span>
              <select value={dType} onChange={(e) => setDType(e.target.value as VoucherRewardType)} className={inputCls}>
                {REWARD_TYPES.map((t) => <option key={t} value={t}>{VOUCHER_REWARD_ICONS[t]} {VOUCHER_REWARD_LABELS[t]}</option>)}
              </select>
            </div>
            {dType === "credits" && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Credits</span>
                <input type="number" min={1} value={dAmount} onChange={(e) => setDAmount(Math.max(0, parseInt(e.target.value) || 0))} className={`${inputCls} w-28`} />
              </div>
            )}
            {dType === "ability" && (
              <>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-400">Fähigkeit</span>
                  <select value={dAbilityKey} onChange={(e) => setDAbilityKey(e.target.value)} className={inputCls}>
                    <option value="">wählen…</option>
                    {abilities.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-400">Dauer (Std., 0=perm.)</span>
                  <input type="number" min={0} value={dDuration} onChange={(e) => setDDuration(Math.max(0, parseInt(e.target.value) || 0))} className={`${inputCls} w-28`} />
                </div>
              </>
            )}
            {dType === "badge" && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Badge</span>
                <select value={dBadgeKey} onChange={(e) => setDBadgeKey(e.target.value)} className={inputCls}>
                  <option value="">wählen…</option>
                  {badges.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                </select>
              </div>
            )}
            {dType === "name_style" && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Name-Style-Key</span>
                <input value={dStyleKey} onChange={(e) => setDStyleKey(e.target.value)} placeholder="z.B. abyssal" className={`${inputCls} w-40`} />
              </div>
            )}
            <button onClick={addReward}
              className="flex items-center gap-1.5 rounded-lg border border-purple-400/40 bg-purple-500/15 px-3 py-1.5 text-xs font-bold text-purple-200 hover:bg-purple-500/25">
              <Plus className="h-3.5 w-3.5" /> Hinzufügen
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button onClick={handleCreate} disabled={creating || !code.trim() || rewards.length === 0}
            className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-purple-500 disabled:opacity-40">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Code erstellen
          </button>
          {msg && <p className={`text-sm font-semibold ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
          <Ticket className="h-3.5 w-3.5 text-purple-400" /> Aktive Codes
        </h3>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-600"><Loader2 className="h-4 w-4 animate-spin" /> Lade…</div>
        ) : codes.length === 0 ? (
          <p className="text-sm text-zinc-600">Noch keine Codes erstellt.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {codes.map((c) => {
              const expired = !!c.expiresAt && new Date(c.expiresAt) < new Date();
              const exhausted = c.maxUses > 0 && c.usedCount >= c.maxUses;
              return (
                <div key={c.code} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5">
                  <span className="font-mono text-sm font-bold tracking-wider text-purple-300">{c.code}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {c.rewards.map((r, i) => (
                      <span key={i} className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-zinc-400">
                        {VOUCHER_REWARD_ICONS[r.type]} {voucherRewardShort(r)}
                      </span>
                    ))}
                  </div>
                  {c.label && <span className="text-xs text-zinc-500">{c.label}</span>}
                  <span className="text-[11px] text-zinc-600">
                    {c.usedCount}{c.maxUses > 0 ? `/${c.maxUses}` : ""} eingelöst
                  </span>
                  {expired && <span className="text-[10px] font-bold text-red-400">abgelaufen</span>}
                  {exhausted && <span className="text-[10px] font-bold text-amber-400">aufgebraucht</span>}
                  <div className="ml-auto flex items-center gap-1.5">
                    <button onClick={() => toggle(c)} title={c.enabled ? "Deaktivieren" : "Aktivieren"}
                      className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors ${
                        c.enabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-zinc-600/40 text-zinc-500"
                      }`}>
                      {c.enabled ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      {c.enabled ? "Aktiv" : "Aus"}
                    </button>
                    <button onClick={() => remove(c)} title="Löschen"
                      className="rounded-lg border border-white/10 p-1.5 text-zinc-500 transition-colors hover:border-red-500/30 hover:text-red-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
