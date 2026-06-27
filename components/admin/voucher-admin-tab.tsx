"use client";

import { useEffect, useState, useCallback } from "react";
import { Gift, Loader2, Plus, Trash2, Check, X, Ticket } from "lucide-react";
import { useSoundManager } from "@/lib/sound-manager";
import {
  adminListRedemptionCodes, adminCreateRedemptionCode,
  adminToggleRedemptionCode, adminDeleteRedemptionCode,
} from "@/lib/actions/vouchers";
import { getAllAbilityDefinitions } from "@/lib/actions/abilities";
import { getBadgeDefinitions } from "@/lib/actions/badges";
import { VOUCHER_REWARD_LABELS, type RedemptionCode, type VoucherRewardType } from "@/lib/vouchers";

export function VoucherAdminTab() {
  const sound = useSoundManager();
  const [codes, setCodes] = useState<RedemptionCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [abilities, setAbilities] = useState<{ key: string; name: string }[]>([]);
  const [badges, setBadges] = useState<{ key: string; label: string }[]>([]);

  // Create form
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [rewardType, setRewardType] = useState<VoucherRewardType>("credits");
  const [amount, setAmount] = useState(500);
  const [abilityKey, setAbilityKey] = useState("");
  const [durationHours, setDurationHours] = useState(0);
  const [badgeKey, setBadgeKey] = useState("");
  const [styleKey, setStyleKey] = useState("");
  const [maxUses, setMaxUses] = useState(0);
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

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

  async function handleCreate() {
    setCreating(true);
    setMsg(null);
    sound.click();
    const rewardValue =
      rewardType === "credits" ? { amount } :
      rewardType === "ability" ? { abilityKey } :
      rewardType === "badge" ? { badgeKey } :
      { styleKey: styleKey.trim() };
    const res = await adminCreateRedemptionCode({
      code, label: label.trim() || undefined, rewardType, rewardValue,
      abilityDurationHours: rewardType === "ability" ? durationHours : 0,
      maxUses, expiresAt: expiresAt || null,
    });
    setCreating(false);
    if (res.success) {
      sound.save();
      setMsg({ text: "Code erstellt.", ok: true });
      setCode(""); setLabel("");
      void reload();
    } else {
      sound.error();
      setMsg({ text: res.error ?? "Fehler.", ok: false });
    }
    setTimeout(() => setMsg(null), 4000);
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Gift className="h-5 w-5 text-purple-400" />
        <h2 className="text-lg font-black text-zinc-100">Gutscheine / Codes</h2>
      </div>

      {/* Create */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
          <Plus className="h-3.5 w-3.5 text-purple-400" /> Code erstellen
        </h3>
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Code (A–Z, 0–9, -)</span>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SUMMER2026"
              className="w-44 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm font-bold uppercase tracking-wider text-zinc-200 outline-none" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Notiz (optional)</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z.B. Discord-Aktion"
              className="w-48 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Belohnung</span>
            <select value={rewardType} onChange={(e) => setRewardType(e.target.value as VoucherRewardType)}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none">
              {(Object.keys(VOUCHER_REWARD_LABELS) as VoucherRewardType[]).map((t) => (
                <option key={t} value={t}>{VOUCHER_REWARD_LABELS[t]}</option>
              ))}
            </select>
          </div>

          {/* Reward-specific */}
          {rewardType === "credits" && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-zinc-400">Credits</span>
              <input type="number" min={1} value={amount} onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-28 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none" />
            </div>
          )}
          {rewardType === "ability" && (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Fähigkeit</span>
                <select value={abilityKey} onChange={(e) => setAbilityKey(e.target.value)}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none">
                  <option value="">wählen…</option>
                  {abilities.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Dauer (Std., 0=perm.)</span>
                <input type="number" min={0} value={durationHours} onChange={(e) => setDurationHours(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-28 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none" />
              </div>
            </>
          )}
          {rewardType === "badge" && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-zinc-400">Badge</span>
              <select value={badgeKey} onChange={(e) => setBadgeKey(e.target.value)}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none">
                <option value="">wählen…</option>
                {badges.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </div>
          )}
          {rewardType === "name_style" && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-zinc-400">Name-Style-Key</span>
              <input value={styleKey} onChange={(e) => setStyleKey(e.target.value)} placeholder="z.B. abyssal"
                className="w-40 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none" />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Max. Einlösungen (0=∞)</span>
            <input type="number" min={0} value={maxUses} onChange={(e) => setMaxUses(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-32 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Läuft ab (optional)</span>
            <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          </div>

          <div className="flex items-end">
            <button onClick={handleCreate} disabled={creating || !code.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-purple-500 disabled:opacity-40">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Erstellen
            </button>
          </div>
        </div>
        {msg && <p className={`mt-3 text-sm font-semibold ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
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
                  <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-zinc-400">
                    {VOUCHER_REWARD_LABELS[c.rewardType]}
                    {c.rewardType === "credits" && c.rewardValue.amount ? ` ${c.rewardValue.amount}` : ""}
                    {c.rewardType === "ability" && c.abilityDurationHours > 0 ? ` · ${c.abilityDurationHours}h` : ""}
                  </span>
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
