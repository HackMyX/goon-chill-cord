"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Gift, Loader2, Plus, Trash2, Check, X, Ticket, Sparkles, Info, Pencil, Save,
  Send, Users, Calendar, RotateCcw, ChevronDown, Search, Layers, Target, Clock, UserCheck,
} from "lucide-react";
import { useSoundManager } from "@/lib/sound-manager";
import {
  adminListRedemptionCodes, adminCreateRedemptionCode, adminUpdateRedemptionCode,
  adminToggleRedemptionCode, adminDeleteRedemptionCode, adminGrantVoucherToUsers,
  adminGetCodeClaims, adminResetUserClaim, adminBulkCreateCodes, type VoucherClaimRow,
} from "@/lib/actions/vouchers";
import { getAllAbilityDefinitions } from "@/lib/actions/abilities";
import { getBadgeDefinitions } from "@/lib/actions/badges";
import {
  VOUCHER_REWARD_LABELS, VOUCHER_REWARD_ICONS, voucherRewardShort,
  VOUCHER_BONUS_GAME_LABELS, VOUCHER_RARITY_LABELS,
  type RedemptionCode, type VoucherReward, type VoucherRewardType,
  type VoucherBonusGame, type VoucherRarity,
} from "@/lib/vouchers";
import { getOpenableCases, type OpenableCaseView } from "@/lib/actions/rewards";

type Profile = { id: string; username: string };
type Lookup = { abilities: { key: string; name: string }[]; badges: { key: string; label: string }[] };

// Case-Gutscheine + Spiel-Boni werden bewusst NICHT per Code/Direktvergabe verteilt —
// sie gehören in Battle Pass, Cases & Co. (als 3D-Givable). Hier nur die klassischen Typen.
const REWARD_TYPES = (Object.keys(VOUCHER_REWARD_LABELS) as VoucherRewardType[])
  .filter((t) => t !== "case_voucher" && t !== "game_bonus");
const INPUT = "rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-purple-400/50";

/** ISO (UTC) → local value for <input type="datetime-local"> */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// ─── Reusable reward-bundle editor ────────────────────────────────────────────
function BundleEditor({ rewards, setRewards, look, accent = "purple" }: {
  rewards: VoucherReward[];
  setRewards: (fn: (prev: VoucherReward[]) => VoucherReward[]) => void;
  look: Lookup;
  accent?: "purple" | "emerald";
}) {
  const sound = useSoundManager();
  const [type, setType] = useState<VoucherRewardType>("ability");
  const [amount, setAmount] = useState(500);
  const [abilityKey, setAbilityKey] = useState("");
  const [duration, setDuration] = useState(48);
  const [badgeKey, setBadgeKey] = useState("");
  const [styleKey, setStyleKey] = useState("");
  const [caseMode, setCaseMode] = useState<"tier" | "rarity">("tier");
  const [caseTierId, setCaseTierId] = useState("");
  const [caseRarityFloor, setCaseRarityFloor] = useState<VoucherRarity>("selten");
  const [game, setGame] = useState<VoucherBonusGame>("don");
  const [cases, setCases] = useState<OpenableCaseView[]>([]);
  useEffect(() => { getOpenableCases().then(setCases).catch(() => undefined); }, []);

  const abilityName = (k?: string) => look.abilities.find((a) => a.key === k)?.name ?? k ?? "?";
  const badgeLabel = (k?: string) => look.badges.find((b) => b.key === k)?.label ?? k ?? "?";
  const caseLabel = (id?: string) => cases.find((c) => c.tierId === id)?.label ?? id ?? "?";

  function chip(r: VoucherReward): string {
    if (r.type === "credits") return `${(r.amount ?? 0).toLocaleString("de-DE")} CR`;
    if (r.type === "ability") return `${abilityName(r.abilityKey)}${r.durationHours ? ` · ${r.durationHours}h` : " · perm"}`;
    if (r.type === "badge") return badgeLabel(r.badgeKey);
    if (r.type === "name_style") return r.styleKey ?? "?";
    if (r.type === "case_voucher") {
      const what = r.caseMode === "rarity" ? `Case ≥${VOUCHER_RARITY_LABELS[r.caseRarityFloor ?? "normal"]}` : caseLabel(r.caseTierId);
      return `${what}${r.durationHours ? ` · ${r.durationHours}h` : ""}`;
    }
    return `+${r.amount ?? 0} ${r.game ? VOUCHER_BONUS_GAME_LABELS[r.game] : ""}${r.durationHours ? ` · ${r.durationHours}h` : ""}`;
  }

  function add() {
    let r: VoucherReward | null = null;
    if (type === "credits") { if (amount <= 0) return; r = { type: "credits", amount }; }
    else if (type === "ability") { if (!abilityKey) return; r = { type: "ability", abilityKey, durationHours: Math.max(0, duration) }; }
    else if (type === "badge") { if (!badgeKey) return; r = { type: "badge", badgeKey }; }
    else if (type === "name_style") { if (!styleKey.trim()) return; r = { type: "name_style", styleKey: styleKey.trim() }; }
    else if (type === "case_voucher") {
      if (caseMode === "tier") { if (!caseTierId) return; r = { type: "case_voucher", caseMode: "tier", caseTierId, durationHours: Math.max(0, duration) }; }
      else { r = { type: "case_voucher", caseMode: "rarity", caseRarityFloor, durationHours: Math.max(0, duration) }; }
    }
    else if (type === "game_bonus") { if (amount <= 0) return; r = { type: "game_bonus", game, amount, durationHours: Math.max(0, duration) }; }
    if (r) { setRewards((p) => [...p, r as VoucherReward]); sound.click(); }
  }

  const ring = accent === "emerald" ? "border-emerald-400/15 bg-emerald-500/[0.03]" : "border-purple-400/15 bg-purple-500/[0.03]";
  const chipCls = accent === "emerald" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-purple-400/30 bg-purple-500/10 text-purple-200";

  return (
    <div className={`rounded-xl border ${ring} p-4`}>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-300">
        <Sparkles className="h-3.5 w-3.5" /> Belohnungs-Bündel ({rewards.length})
      </p>
      {rewards.length === 0 ? (
        <p className="mb-3 text-xs text-zinc-600">Noch keine Belohnung — unten konfigurieren und „Hinzufügen".</p>
      ) : (
        <div className="mb-3 flex flex-wrap gap-2">
          {rewards.map((r, i) => (
            <span key={i} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${chipCls}`}>
              <span>{VOUCHER_REWARD_ICONS[r.type]}</span>{chip(r)}
              <button onClick={() => { setRewards((p) => p.filter((_, j) => j !== i)); sound.click(); }} className="ml-0.5 opacity-60 hover:text-red-400"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3 border-t border-white/5 pt-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Typ</span>
          <select value={type} onChange={(e) => setType(e.target.value as VoucherRewardType)} className={INPUT}>
            {REWARD_TYPES.map((t) => <option key={t} value={t}>{VOUCHER_REWARD_ICONS[t]} {VOUCHER_REWARD_LABELS[t]}</option>)}
          </select>
        </div>
        {type === "credits" && (
          <div className="flex flex-col gap-1"><span className="text-xs text-zinc-400">Credits</span>
            <input type="number" min={1} value={amount} onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value) || 0))} className={`${INPUT} w-28`} /></div>
        )}
        {type === "ability" && (
          <>
            <div className="flex flex-col gap-1"><span className="text-xs text-zinc-400">Fähigkeit</span>
              <select value={abilityKey} onChange={(e) => setAbilityKey(e.target.value)} className={INPUT}>
                <option value="">wählen…</option>
                {look.abilities.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
              </select></div>
            <div className="flex flex-col gap-1"><span className="text-xs text-zinc-400">Dauer (Std., 0=perm.)</span>
              <input type="number" min={0} value={duration} onChange={(e) => setDuration(Math.max(0, parseInt(e.target.value) || 0))} className={`${INPUT} w-28`} /></div>
          </>
        )}
        {type === "badge" && (
          <div className="flex flex-col gap-1"><span className="text-xs text-zinc-400">Badge</span>
            <select value={badgeKey} onChange={(e) => setBadgeKey(e.target.value)} className={INPUT}>
              <option value="">wählen…</option>
              {look.badges.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select></div>
        )}
        {type === "name_style" && (
          <div className="flex flex-col gap-1"><span className="text-xs text-zinc-400">Name-Style-Key</span>
            <input value={styleKey} onChange={(e) => setStyleKey(e.target.value)} placeholder="z.B. abyssal" className={`${INPUT} w-40`} /></div>
        )}
        {type === "case_voucher" && (
          <>
            <div className="flex flex-col gap-1"><span className="text-xs text-zinc-400">Modus</span>
              <select value={caseMode} onChange={(e) => setCaseMode(e.target.value as "tier" | "rarity")} className={INPUT}>
                <option value="tier">Konkretes Case</option>
                <option value="rarity">Nach Seltenheit (alle Cases)</option>
              </select></div>
            {caseMode === "tier" ? (
              <div className="flex flex-col gap-1"><span className="text-xs text-zinc-400">Case</span>
                <select value={caseTierId} onChange={(e) => setCaseTierId(e.target.value)} className={INPUT}>
                  <option value="">wählen…</option>
                  {cases.map((c) => <option key={c.tierId} value={c.tierId}>{c.groupTitle} · {c.label}</option>)}
                </select></div>
            ) : (
              <div className="flex flex-col gap-1"><span className="text-xs text-zinc-400">Mind. Seltenheit</span>
                <select value={caseRarityFloor} onChange={(e) => setCaseRarityFloor(e.target.value as VoucherRarity)} className={INPUT}>
                  {(Object.keys(VOUCHER_RARITY_LABELS) as VoucherRarity[]).map((k) => <option key={k} value={k}>{VOUCHER_RARITY_LABELS[k]}</option>)}
                </select></div>
            )}
            <div className="flex flex-col gap-1"><span className="text-xs text-zinc-400">Ablauf (Std., 0=nie)</span>
              <input type="number" min={0} value={duration} onChange={(e) => setDuration(Math.max(0, parseInt(e.target.value) || 0))} className={`${INPUT} w-28`} /></div>
          </>
        )}
        {type === "game_bonus" && (
          <>
            <div className="flex flex-col gap-1"><span className="text-xs text-zinc-400">Spiel</span>
              <select value={game} onChange={(e) => setGame(e.target.value as VoucherBonusGame)} className={INPUT}>
                {(Object.keys(VOUCHER_BONUS_GAME_LABELS) as VoucherBonusGame[]).map((k) => <option key={k} value={k}>{VOUCHER_BONUS_GAME_LABELS[k]}</option>)}
              </select></div>
            <div className="flex flex-col gap-1"><span className="text-xs text-zinc-400">Anzahl extra</span>
              <input type="number" min={1} value={amount} onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value) || 0))} className={`${INPUT} w-24`} /></div>
            <div className="flex flex-col gap-1"><span className="text-xs text-zinc-400">Ablauf (Std., 0=nie)</span>
              <input type="number" min={0} value={duration} onChange={(e) => setDuration(Math.max(0, parseInt(e.target.value) || 0))} className={`${INPUT} w-28`} /></div>
          </>
        )}
        <button onClick={add} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold ${chipCls} hover:brightness-125`}>
          <Plus className="h-3.5 w-3.5" /> Hinzufügen
        </button>
      </div>
    </div>
  );
}

// ─── Reusable searchable multi-select for players ─────────────────────────────
function UserMultiSelect({ profiles, selected, onChange }: {
  profiles: Profile[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = profiles
    .filter((p) => p.username.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.username.localeCompare(b.username, "de"))
    .slice(0, 60);
  const sel = new Set(selected);
  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.username ?? id;
  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <span key={id} className="flex items-center gap-1 rounded-md border border-blue-400/30 bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-200">
              {nameOf(id)}
              <button onClick={() => onChange(selected.filter((x) => x !== id))} className="opacity-60 hover:text-red-400"><X className="h-3 w-3" /></button>
            </span>
          ))}
          <button onClick={() => onChange([])} className="text-[11px] text-zinc-500 hover:text-zinc-300">alle entfernen</button>
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Spieler suchen…" className={`${INPUT} w-full pl-8`} />
      </div>
      <div className="max-h-40 overflow-y-auto rounded-lg border border-white/8 bg-black/20">
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-xs text-zinc-600">Keine Treffer.</p>
        ) : filtered.map((p) => {
          const on = sel.has(p.id);
          return (
            <button key={p.id} onClick={() => onChange(on ? selected.filter((x) => x !== p.id) : [...selected, p.id])}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${on ? "bg-blue-500/10 text-blue-200" : "text-zinc-300 hover:bg-white/[0.03]"}`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? "border-blue-400 bg-blue-500/30" : "border-white/15"}`}>
                {on && <Check className="h-3 w-3" />}
              </span>
              {p.username}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function statusOf(c: RedemptionCode): { label: string; cls: string } {
  const now = Date.now();
  if (!c.enabled) return { label: "Aus", cls: "border-zinc-600/40 text-zinc-500" };
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return { label: "Geplant", cls: "border-blue-500/30 bg-blue-500/10 text-blue-300" };
  if (c.expiresAt && new Date(c.expiresAt).getTime() < now) return { label: "Abgelaufen", cls: "border-red-500/30 bg-red-500/10 text-red-300" };
  if (c.maxUses > 0 && c.usedCount >= c.maxUses) return { label: "Aufgebraucht", cls: "border-amber-500/30 bg-amber-500/10 text-amber-300" };
  return { label: "Aktiv", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" };
}

export function VoucherAdminTab({ profiles }: { profiles: Profile[] }) {
  const sound = useSoundManager();
  const [look, setLook] = useState<Lookup>({ abilities: [], badges: [] });
  const [codes, setCodes] = useState<RedemptionCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Direct-grant panel
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantIds, setGrantIds] = useState<string[]>([]);
  const [grantNote, setGrantNote] = useState("");
  const [grantRewards, setGrantRewards] = useState<VoucherReward[]>([]);
  const [granting, setGranting] = useState(false);

  // Code form
  const [editing, setEditing] = useState<RedemptionCode | null>(null);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState(0);
  const [perUserLimit, setPerUserLimit] = useState(1);
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [targeted, setTargeted] = useState(false);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [rewards, setRewards] = useState<VoucherReward[]>([]);
  const [saving, setSaving] = useState(false);
  // Bulk mode
  const [bulk, setBulk] = useState(false);
  const [bulkCount, setBulkCount] = useState(10);
  const [bulkResult, setBulkResult] = useState<string[] | null>(null);

  // List
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [claims, setClaims] = useState<Record<string, VoucherClaimRow[]>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    setCodes(await adminListRedemptionCodes());
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    getAllAbilityDefinitions().then((a) => setLook((l) => ({ ...l, abilities: a.map((x) => ({ key: x.key, name: x.name })) }))).catch(() => {});
    getBadgeDefinitions().then((b) => setLook((l) => ({ ...l, badges: b.map((x) => ({ key: x.key, label: x.label })) }))).catch(() => {});
  }, [reload]);

  function flash(text: string, ok: boolean) { setMsg({ text, ok }); setTimeout(() => setMsg(null), 5000); }

  function resetForm() {
    setEditing(null); setCode(""); setLabel(""); setMaxUses(0); setPerUserLimit(1);
    setStartsAt(""); setExpiresAt(""); setTargeted(false); setTargetIds([]); setRewards([]);
    setBulk(false); setBulkResult(null);
  }

  function startEdit(c: RedemptionCode) {
    setEditing(c); setBulk(false); setBulkResult(null);
    setCode(c.code); setLabel(c.label ?? ""); setMaxUses(c.maxUses); setPerUserLimit(c.perUserLimit);
    setStartsAt(toLocalInput(c.startsAt)); setExpiresAt(toLocalInput(c.expiresAt));
    setTargeted(!!c.targetUserIds); setTargetIds(c.targetUserIds ?? []); setRewards(c.rewards);
    setMsg(null); sound.click();
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const settings = () => ({
    label: label.trim() || undefined, maxUses, perUserLimit,
    targetUserIds: targeted ? targetIds : null,
    startsAt: startsAt || null, expiresAt: expiresAt || null,
  });

  async function handleSave() {
    if (rewards.length === 0) { flash("Mindestens eine Belohnung hinzufügen.", false); return; }
    if (targeted && targetIds.length === 0) { flash("Gezielter Code braucht mindestens einen Spieler.", false); return; }
    setSaving(true); setMsg(null); setBulkResult(null); sound.click();
    let res: { success: boolean; error?: string; codes?: string[] };
    if (editing) {
      res = await adminUpdateRedemptionCode({ code: editing.code, rewards, enabled: editing.enabled, ...settings() });
    } else if (bulk) {
      res = await adminBulkCreateCodes({ prefix: code, count: bulkCount, rewards, ...settings() });
    } else {
      res = await adminCreateRedemptionCode({ code, rewards, ...settings() });
    }
    setSaving(false);
    if (res.success) {
      sound.save();
      if (bulk && res.codes) { setBulkResult(res.codes); flash(`${res.codes.length} Codes erstellt.`, true); setCode(""); }
      else { flash(editing ? "Code gespeichert." : "Code erstellt.", true); resetForm(); }
      void reload();
    } else { sound.error(); flash(res.error ?? "Fehler.", false); }
  }

  async function handleGrant() {
    if (grantIds.length === 0) { flash("Keine Spieler ausgewählt.", false); return; }
    if (grantRewards.length === 0) { flash("Mindestens eine Belohnung hinzufügen.", false); return; }
    setGranting(true); setMsg(null); sound.click();
    const res = await adminGrantVoucherToUsers({ userIds: grantIds, rewards: grantRewards, note: grantNote.trim() || undefined });
    setGranting(false);
    if (res.success) { sound.save(); flash(`An ${res.granted} Spieler vergeben.`, true); setGrantIds([]); setGrantNote(""); setGrantRewards([]); }
    else { sound.error(); flash(res.error ?? "Fehler.", false); }
  }

  async function toggle(c: RedemptionCode) { sound.click(); const r = await adminToggleRedemptionCode(c.code, !c.enabled); if (r.success) void reload(); else sound.error(); }
  async function remove(c: RedemptionCode) { sound.click(); const r = await adminDeleteRedemptionCode(c.code); if (r.success) { sound.save(); void reload(); } else sound.error(); }

  async function toggleClaims(c: RedemptionCode) {
    if (expanded === c.code) { setExpanded(null); return; }
    setExpanded(c.code); sound.click();
    if (!claims[c.code]) {
      const rows = await adminGetCodeClaims(c.code);
      setClaims((p) => ({ ...p, [c.code]: rows }));
    }
  }
  async function resetClaim(code: string, userId: string) {
    sound.click();
    const r = await adminResetUserClaim(code, userId);
    if (r.success) { sound.save(); setClaims((p) => ({ ...p, [code]: (p[code] ?? []).filter((x) => x.userId !== userId) })); void reload(); }
    else sound.error();
  }

  const visible = codes.filter((c) =>
    !search || c.code.toLowerCase().includes(search.toLowerCase()) || (c.label ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Gift className="h-5 w-5 text-purple-400" />
        <h2 className="text-lg font-black text-zinc-100">Gutscheine / Codes</h2>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-purple-400/20 bg-purple-500/[0.05] px-4 py-3 text-[12px] leading-relaxed text-purple-100/80">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-300" />
        <span>
          Vergib Belohnungs-<b className="text-purple-200">Bündel</b> als <b>öffentliche</b> oder <b>gezielte</b> Codes (nur für bestimmte Spieler),
          plane sie (<b>Startzeit</b>/Ablauf), begrenze sie (<b>gesamt</b> &amp; <b>pro Spieler</b>), erzeuge <b>Bulk-Codes</b> für Gewinnspiele
          oder vergib alles <b>direkt</b> an Spieler — ganz ohne Code. Fähigkeits-Boosts wirken getimt; die Stärke definierst du unter <b className="text-purple-200">Fähigkeiten</b>.
        </span>
      </div>

      {/* DIRECT GRANT */}
      <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.02] p-5">
        <button onClick={() => setGrantOpen((v) => !v)} className="flex w-full items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
          <Send className="h-3.5 w-3.5" /> Direkt an Spieler vergeben
          <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${grantOpen ? "rotate-180" : ""}`} />
        </button>
        {grantOpen && (
          <div className="mt-4 flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400 flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Empfänger ({grantIds.length})</span>
                <UserMultiSelect profiles={profiles} selected={grantIds} onChange={setGrantIds} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Notiz (optional, erscheint in der Nachricht)</span>
                <input value={grantNote} onChange={(e) => setGrantNote(e.target.value)} placeholder="z.B. Entschuldigung für den Ausfall" className={INPUT} />
              </div>
            </div>
            <BundleEditor rewards={grantRewards} setRewards={setGrantRewards} look={look} accent="emerald" />
            <button onClick={handleGrant} disabled={granting || grantIds.length === 0 || grantRewards.length === 0}
              className="flex w-fit items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-40">
              {granting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} An {grantIds.length} Spieler vergeben
            </button>
          </div>
        )}
      </div>

      {/* CREATE / EDIT */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
            {editing ? <Pencil className="h-3.5 w-3.5 text-amber-400" /> : <Plus className="h-3.5 w-3.5 text-purple-400" />}
            {editing ? <>Code bearbeiten: <span className="font-mono text-amber-300">{editing.code}</span></> : bulk ? "Bulk-Codes erzeugen" : "Code erstellen"}
          </h3>
          {!editing && (
            <button onClick={() => { setBulk((v) => !v); setBulkResult(null); }}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors ${bulk ? "border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-200" : "border-white/10 text-zinc-400 hover:text-zinc-200"}`}>
              <Layers className="h-3.5 w-3.5" /> Bulk-Modus
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">{bulk ? "Präfix" : "Code"} (A–Z, 0–9, -){editing ? " — fest" : ""}</span>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={bulk ? "GIFT" : "SUMMER2026"} readOnly={!!editing}
              className={`${INPUT} w-44 font-bold uppercase tracking-wider ${editing ? "cursor-not-allowed opacity-60" : ""}`} />
          </div>
          {bulk && !editing && (
            <div className="flex flex-col gap-1"><span className="text-xs text-zinc-400">Anzahl (max. 200)</span>
              <input type="number" min={1} max={200} value={bulkCount} onChange={(e) => setBulkCount(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))} className={`${INPUT} w-28`} /></div>
          )}
          <div className="flex flex-col gap-1"><span className="text-xs text-zinc-400">Notiz (optional)</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z.B. Discord-Aktion" className={`${INPUT} w-48`} /></div>
          <div className="flex flex-col gap-1"><span className="text-xs text-zinc-400">Max. gesamt (0=∞)</span>
            <input type="number" min={0} value={maxUses} onChange={(e) => setMaxUses(Math.max(0, parseInt(e.target.value) || 0))} className={`${INPUT} w-28`} /></div>
          <div className="flex flex-col gap-1"><span className="text-xs text-zinc-400">Pro Spieler</span>
            <input type="number" min={1} value={perUserLimit} onChange={(e) => setPerUserLimit(Math.max(1, parseInt(e.target.value) || 1))} className={`${INPUT} w-24`} /></div>
          <div className="flex flex-col gap-1"><span className="text-xs text-zinc-400 flex items-center gap-1"><Clock className="h-3 w-3" /> Start (optional)</span>
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={INPUT} /></div>
          <div className="flex flex-col gap-1"><span className="text-xs text-zinc-400 flex items-center gap-1"><Calendar className="h-3 w-3" /> Ablauf (optional)</span>
            <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={INPUT} /></div>
        </div>

        {/* Targeting */}
        <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-3">
          <div className="flex items-center gap-4 text-xs">
            <span className="font-bold text-zinc-400 flex items-center gap-1"><Target className="h-3.5 w-3.5" /> Sichtbarkeit:</span>
            <label className="flex cursor-pointer items-center gap-1.5 text-zinc-300"><input type="radio" checked={!targeted} onChange={() => setTargeted(false)} /> Öffentlich</label>
            <label className="flex cursor-pointer items-center gap-1.5 text-zinc-300"><input type="radio" checked={targeted} onChange={() => setTargeted(true)} /> Nur bestimmte Spieler</label>
          </div>
          {targeted && <div className="mt-3"><UserMultiSelect profiles={profiles} selected={targetIds} onChange={setTargetIds} /></div>}
        </div>

        <div className="mt-4"><BundleEditor rewards={rewards} setRewards={setRewards} look={look} /></div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={handleSave} disabled={saving || !code.trim() || rewards.length === 0}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40 ${editing ? "bg-amber-600 hover:bg-amber-500" : bulk ? "bg-fuchsia-600 hover:bg-fuchsia-500" : "bg-purple-600 hover:bg-purple-500"}`}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editing ? "Änderungen speichern" : bulk ? `${bulkCount} Codes erzeugen` : "Code erstellen"}
          </button>
          {editing && <button onClick={() => { resetForm(); sound.click(); }} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-4 py-1.5 text-sm font-bold text-zinc-400 hover:text-zinc-200"><X className="h-4 w-4" /> Abbrechen</button>}
          {msg && <p className={`text-sm font-semibold ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
        </div>

        {bulkResult && (
          <div className="mt-3 rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/[0.05] p-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-fuchsia-300">{bulkResult.length} Codes erzeugt — zum Kopieren:</p>
            <textarea readOnly value={bulkResult.join("\n")} rows={Math.min(8, bulkResult.length)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-fuchsia-200 outline-none" />
          </div>
        )}
      </div>

      {/* LIST */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <Ticket className="h-3.5 w-3.5 text-purple-400" /> Codes ({codes.length})
          </h3>
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Code/Notiz suchen…" className={`${INPUT} w-56 pl-8`} />
          </div>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-600"><Loader2 className="h-4 w-4 animate-spin" /> Lade…</div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-zinc-600">{codes.length === 0 ? "Noch keine Codes erstellt." : "Keine Treffer."}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {visible.map((c) => {
              const st = statusOf(c);
              const pct = c.maxUses > 0 ? Math.min(100, Math.round((c.usedCount / c.maxUses) * 100)) : 0;
              const isOpen = expanded === c.code;
              return (
                <div key={c.code} className="rounded-xl border border-white/10 bg-black/20">
                  <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <span className="font-mono text-sm font-bold tracking-wider text-purple-300">{c.code}</span>
                    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.label}</span>
                    {c.targetUserIds && <span className="flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-300"><UserCheck className="h-3 w-3" /> {c.targetUserIds.length} gezielt</span>}
                    {c.perUserLimit > 1 && <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">{c.perUserLimit}×/Spieler</span>}
                    <div className="flex flex-wrap gap-1.5">
                      {c.rewards.map((r, i) => (
                        <span key={i} className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-zinc-400">{VOUCHER_REWARD_ICONS[r.type]} {voucherRewardShort(r)}</span>
                      ))}
                    </div>
                    {c.label && <span className="text-xs text-zinc-500">{c.label}</span>}
                    <div className="ml-auto flex items-center gap-1.5">
                      <button onClick={() => toggleClaims(c)} title="Einlösungen" className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200">
                        {c.usedCount}{c.maxUses > 0 ? `/${c.maxUses}` : ""} <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                      <button onClick={() => startEdit(c)} title="Bearbeiten" className="rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:border-amber-500/40 hover:text-amber-300"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => toggle(c)} title={c.enabled ? "Deaktivieren" : "Aktivieren"}
                        className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold ${c.enabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-zinc-600/40 text-zinc-500"}`}>
                        {c.enabled ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}{c.enabled ? "Aktiv" : "Aus"}
                      </button>
                      <button onClick={() => remove(c)} title="Löschen" className="rounded-lg border border-white/10 p-1.5 text-zinc-500 hover:border-red-500/30 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  {c.maxUses > 0 && (
                    <div className="px-4 pb-1"><div className="h-1 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-400" style={{ width: `${pct}%` }} /></div></div>
                  )}
                  {isOpen && (
                    <div className="border-t border-white/8 px-4 py-3">
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Einlösungen ({c.uniqueUsers ?? 0} Spieler)</p>
                      {!claims[c.code] ? (
                        <div className="flex items-center gap-2 text-xs text-zinc-600"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Lade…</div>
                      ) : claims[c.code].length === 0 ? (
                        <p className="text-xs text-zinc-600">Noch keine Einlösungen.</p>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {claims[c.code].map((cl) => (
                            <div key={cl.id} className="flex items-center gap-3 rounded-lg bg-white/[0.02] px-3 py-1.5 text-xs">
                              <span className="font-semibold text-zinc-200">{cl.username}</span>
                              <span className="text-zinc-600">{new Date(cl.claimedAt).toLocaleString("de-DE")}</span>
                              {cl.rewardSummary && <span className="truncate text-zinc-500">{cl.rewardSummary}</span>}
                              <button onClick={() => resetClaim(c.code, cl.userId)} title="Einlösung zurücksetzen (kann erneut einlösen)"
                                className="ml-auto flex items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-zinc-500 hover:border-amber-500/30 hover:text-amber-300">
                                <RotateCcw className="h-3 w-3" /> Reset
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
