"use client";

import { useState } from "react";
import {
  MessageSquare, Save, Loader2, Info, Plus, X, Trash2,
  Shield, Zap, Clock, Hash, AlertTriangle, Megaphone,
} from "lucide-react";
import { useSoundManager } from "@/lib/sound-manager";
import { updateChatConfig } from "@/lib/actions/global-chat";
import type { ChatConfig } from "@/lib/mod";
import { AdminTooltip } from "@/components/admin/admin-tooltip";

interface Props {
  initialConfig: ChatConfig;
}

function Toggle({
  label, description, value, onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5">
      <div>
        <p className="text-sm font-semibold text-zinc-200">{label}</p>
        {description && <p className="mt-0.5 text-[11px] text-zinc-500">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
      >
        <span className={`relative block h-6 w-11 overflow-hidden rounded-full transition-colors duration-200 ${value ? "bg-purple-600" : "bg-zinc-700"}`}>
          <span className={`absolute left-0 top-[2px] h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${value ? "translate-x-[22px]" : "translate-x-[2px]"}`} />
        </span>
      </button>
    </div>
  );
}

export function ChatConfigEditor({ initialConfig }: Props) {
  const [config, setConfig] = useState<ChatConfig>(initialConfig);
  const [newWord, setNewWord] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const sound = useSoundManager();

  function set<K extends keyof ChatConfig>(key: K, value: ChatConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function addBannedWord() {
    const w = newWord.trim().toLowerCase();
    if (!w || config.bannedWords.includes(w)) return;
    set("bannedWords", [...config.bannedWords, w]);
    setNewWord("");
  }

  function removeBannedWord(word: string) {
    set("bannedWords", config.bannedWords.filter((w) => w !== word));
  }

  async function handleSave() {
    setSaving(true);
    sound.click();
    const res = await updateChatConfig(config);
    setSaving(false);
    if (res.success) {
      sound.save();
      setMessage({ text: "Gespeichert.", ok: true });
    } else {
      sound.error();
      setMessage({ text: res.error ?? "Fehler.", ok: false });
    }
    setTimeout(() => setMessage(null), 3000);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-2 rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-xs text-sky-300">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>
          Chat-Einstellungen gelten für alle Nutzer sofort. Moderatoren und Admins unterliegen nicht dem Cooldown oder der Deaktivierung.
        </span>
      </div>

      {/* General settings */}
      <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-zinc-100">
          <MessageSquare className="h-5 w-5 text-purple-400" />
          Allgemein
          <AdminTooltip text="Grundlegende Chat-Einstellungen. Der globale Chat ist für alle eingeloggten Nutzer sichtbar. Admins und Mods können unabhängig von diesen Einstellungen immer schreiben und moderieren." />
        </h3>
        <div className="flex flex-col gap-2">
          <Toggle
            label="Chat aktiviert"
            description="Wenn deaktiviert, können nur Admins und Mods noch schreiben"
            value={config.enabled}
            onChange={(v) => set("enabled", v)}
          />
          <Toggle
            label="Mods dürfen Chat leeren"
            description="Admins können immer löschen. Deaktivieren, um Mods diese Funktion zu entziehen."
            value={config.modsCanClear}
            onChange={(v) => set("modsCanClear", v)}
          />
        </div>
      </div>

      {/* Broadcasts */}
      <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-zinc-100">
          <Megaphone className="h-5 w-5 text-fuchsia-400" />
          Broadcasts (Gewinne im Chat)
          <AdminTooltip text="Steuert, ob und ab welcher Seltenheit Case-/Item-Gewinne automatisch als schicker System-Banner im globalen Chat angekündigt werden. So entscheidest du, was 'broadcastet' wird." />
        </h3>
        <div className="flex flex-col gap-3">
          <Toggle
            label="Gewinne broadcasten"
            description="Postet bei seltenen Ziehungen einen seltenheits-gefärbten Banner in den Chat (z. B. … hat 'Legendärer Ring' (Mythisch) gezogen)."
            value={config.broadcastWins}
            onChange={(v) => set("broadcastWins", v)}
          />
          <label className={`flex flex-col gap-1.5 ${config.broadcastWins ? "" : "pointer-events-none opacity-40"}`}>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
              Ab Seltenheit broadcasten
              <AdminTooltip text="Nur Gewinne ab dieser Seltenheit werden angekündigt — alles darunter bleibt still. Beispiel: 'Mythisch' = nur Mythisch & Ultra werden gepostet." />
            </span>
            <select
              value={config.broadcastMinRarity}
              onChange={(e) => set("broadcastMinRarity", e.target.value as ChatConfig["broadcastMinRarity"])}
              className="w-48 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-fuchsia-400/50"
            >
              <option value="selten" className="bg-zinc-900">Selten &amp; höher</option>
              <option value="episch" className="bg-zinc-900">Episch &amp; höher</option>
              <option value="mythisch" className="bg-zinc-900">Mythisch &amp; höher</option>
              <option value="ultra" className="bg-zinc-900">Nur Ultra</option>
            </select>
          </label>
        </div>
      </div>

      {/* Rate limits */}
      <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-zinc-100">
          <Clock className="h-5 w-5 text-sky-400" />
          Rate Limits
          <AdminTooltip text="Schutzmechanismen gegen Spam und Flooding. Alle Limits gelten pro Nutzer. Admins und Mods sind davon ausgenommen." />
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Nachrichten-Cooldown (Sekunden)
              <AdminTooltip text="Mindestwartezeit in Sekunden zwischen zwei Nachrichten desselben Nutzers. 0 = kein Cooldown. Empfehlung: 2–5 Sekunden. Verhindert Spam-Fluten und ist serverseitig erzwungen." />
            </span>
            <input
              type="number"
              min={0}
              max={60}
              value={config.messageCooldownSec}
              onChange={(e) => set("messageCooldownSec", Math.max(0, Math.min(60, Number(e.target.value))))}
              className="w-28 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            />
            <p className="text-[10px] text-zinc-600">Minimale Wartezeit zwischen zwei Nachrichten</p>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
              <Hash className="h-3 w-3" />
              Maximale Nachrichtenlänge (Zeichen)
              <AdminTooltip text="Maximale Zeichenanzahl pro Nachricht. Nachrichten die länger sind werden am Zeichenlimit abgeschnitten, bevor sie gespeichert werden. Min: 50, Max: 2000. Empfehlung: 300–500 für angenehme Lesbarkeit." />
            </span>
            <input
              type="number"
              min={50}
              max={2000}
              value={config.maxMessageLength}
              onChange={(e) => set("maxMessageLength", Math.max(50, Math.min(2000, Number(e.target.value))))}
              className="w-28 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            />
            <p className="text-[10px] text-zinc-600">Nachrichten werden am Limit abgeschnitten</p>
          </label>
        </div>
      </div>

      {/* Auto moderation */}
      <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-zinc-100">
          <Zap className="h-5 w-5 text-amber-400" />
          Automatische Moderation
          <AdminTooltip text="Automatische Inhaltsfilterung, die ohne manuelle Eingriffe im Hintergrund läuft. Ergänzt die manuelle Wortliste um KI-gestützte Muster-Erkennung." />
        </h3>
        <div className="flex flex-col gap-3">
          <Toggle
            label="Auto-Filter aktiviert"
            description="Erkennt automatisch Beleidigungen, Slurs und Spam-Muster ohne Custom-Wortliste"
            value={config.autoFilter}
            onChange={(v) => set("autoFilter", v)}
          />
          {config.autoFilter && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-300 flex items-start gap-2">
              <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Der Auto-Filter prüft auf häufige Beleidigungen und Evasion-Techniken (Leetspeak, Zeichenersetzung).
                Nachrichten mit erkannten Inhalten werden blockiert, nicht zensiert.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Custom banned words */}
      <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-zinc-100">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          Verbotene Wörter
          <AdminTooltip text="Benutzerdefinierte Liste gesperrter Wörter und Phrasen. Jede Nachricht wird auf exakte Substring-Übereinstimmung geprüft (Groß/Kleinschreibung wird ignoriert). Nachrichten mit einem verbotenen Wort werden serverseitig blockiert und dem Nutzer zurückgegeben." />
          <span className="ml-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-normal text-zinc-500">
            {config.bannedWords.length}
          </span>
        </h3>
        <p className="mb-3 text-[11px] text-zinc-500">
          Nachrichten die eines dieser Wörter enthalten werden blockiert (Groß/Kleinschreibung egal, Substring-Match).
        </p>

        {/* Add word */}
        <div className="mb-4 flex gap-2">
          <input
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addBannedWord())}
            placeholder="Wort hinzufügen…"
            maxLength={50}
            className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-red-400/40 placeholder:text-zinc-600"
          />
          <button
            onClick={addBannedWord}
            disabled={!newWord.trim()}
            className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Hinzufügen
          </button>
        </div>

        {/* Word list */}
        {config.bannedWords.length === 0 ? (
          <p className="rounded-lg border border-white/5 bg-white/[0.02] py-5 text-center text-[11px] text-zinc-600">
            Noch keine verbotenen Wörter konfiguriert.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {config.bannedWords.map((word) => (
              <span
                key={word}
                className="flex items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-[11px] font-mono text-red-300"
              >
                {word}
                <button
                  onClick={() => removeBannedWord(word)}
                  className="ml-1 rounded-full text-red-500 hover:text-red-300 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {config.bannedWords.length > 0 && (
          <button
            onClick={() => { sound.click(); set("bannedWords", []); }}
            className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-600 hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-3 w-3" />
            Alle löschen
          </button>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-500 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Einstellungen speichern
        </button>
        {message && (
          <span className={`text-sm ${message.ok ? "text-emerald-400" : "text-red-400"}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
