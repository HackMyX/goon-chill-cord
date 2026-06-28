"use client";

import { useState } from "react";
import { Gift, Loader2, Check, X, Send, Users, Info, Search } from "lucide-react";
import { useSoundManager } from "@/lib/sound-manager";
import { adminGrantVoucherToUsers } from "@/lib/actions/vouchers";
import { RewardSpecEditor } from "@/components/admin/reward-spec-editor";
import type { RewardSpec } from "@/lib/rewards-grant";

type Profile = { id: string; username: string };

const INPUT = "rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-purple-400/50";

// Kurze Erklärung am Reward-Editor: hier kann JEDER Belohnungstyp vergeben werden.
function RewardEditorHint() {
  return (
    <p className="mb-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-zinc-500">
      <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-purple-300/70" />
      <span>
        Hier ist <b className="text-zinc-300">jeder</b> Belohnungstyp wählbar — Credits, XP, Items, Fähigkeiten,
        Name-Styles, Badges, Case-Gutscheine und <b className="text-zinc-300">Spiel-Bonus</b>.{" "}
        <b className="text-zinc-300">Spiel-Bonus</b> = X extra Züge/Spins für DON/Plinko/Snake, die <i>on top</i> aufs
        Tageslimit kommen. Dauer 0 = unbegrenzt gültig.
      </span>
    </p>
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

export function VoucherAdminTab({ profiles }: { profiles: Profile[] }) {
  const sound = useSoundManager();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Direct-grant panel — der einzige Weg, Gutscheine zu verteilen.
  const [grantIds, setGrantIds] = useState<string[]>([]);
  const [grantNote, setGrantNote] = useState("");
  const [grantRewards, setGrantRewards] = useState<RewardSpec[]>([]);
  const [granting, setGranting] = useState(false);

  function flash(text: string, ok: boolean) { setMsg({ text, ok }); setTimeout(() => setMsg(null), 5000); }

  async function handleGrant() {
    if (grantIds.length === 0) { flash("Keine Spieler ausgewählt.", false); return; }
    if (grantRewards.length === 0) { flash("Mindestens eine Belohnung hinzufügen.", false); return; }
    setGranting(true); setMsg(null); sound.click();
    const res = await adminGrantVoucherToUsers({ userIds: grantIds, rewards: grantRewards, note: grantNote.trim() || undefined });
    setGranting(false);
    if (res.success) { sound.save(); flash(`An ${res.granted} Spieler vergeben.`, true); setGrantIds([]); setGrantNote(""); setGrantRewards([]); }
    else { sound.error(); flash(res.error ?? "Fehler.", false); }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Gift className="h-5 w-5 text-purple-400" />
        <h2 className="text-lg font-black text-zinc-100">Gutscheine verteilen</h2>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-purple-400/20 bg-purple-500/[0.05] px-4 py-3 text-[12px] leading-relaxed text-purple-100/80">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-300" />
        <span>
          Vergib Belohnungs-<b className="text-purple-200">Bündel</b> <b>direkt</b> an ausgewählte Spieler — sie landen
          sofort auf den Konten, ganz ohne Code. Automatische Vergaben (Battle Pass, Level, Quests, Shop) laufen unverändert weiter.
          Fähigkeits-Boosts wirken getimt; die Stärke definierst du unter <b className="text-purple-200">Fähigkeiten</b>.
        </span>
      </div>

      {/* DIRECT GRANT */}
      <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.02] p-5">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
          <Send className="h-3.5 w-3.5" /> Direkt an Spieler vergeben
        </h3>
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
          <div className="rounded-xl border border-emerald-400/15 bg-emerald-500/[0.03] p-4">
            <RewardEditorHint />
            <RewardSpecEditor value={grantRewards} onChange={setGrantRewards} label={`Belohnungs-Bündel (${grantRewards.length})`} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={handleGrant} disabled={granting || grantIds.length === 0 || grantRewards.length === 0}
              className="flex w-fit items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-40">
              {granting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} An {grantIds.length} Spieler vergeben
            </button>
            {msg && <p className={`text-sm font-semibold ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
