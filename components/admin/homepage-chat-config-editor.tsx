"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { CollapsibleAdminRow } from "@/components/admin/collapsible-admin-row";
import { useSoundManager } from "@/lib/sound-manager";
import {
  getHomepageChatConfig,
  adminUpdateHomepageChatConfig,
  DEFAULT_HOMEPAGE_CHAT_CONFIG,
  type HomepageChatConfig,
} from "@/lib/actions/homepage-chat-config";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
      <span className="text-sm text-zinc-300">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          value ? "bg-purple-600" : "bg-zinc-700"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

function NumberInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm text-zinc-300">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
      />
    </label>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm text-zinc-300 shrink-0">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 max-w-[200px] rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-purple-400/60 placeholder:text-zinc-600"
      />
    </label>
  );
}

function SelectInput<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm text-zinc-300">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Editor
// ─────────────────────────────────────────────────────────────────────────────

export default function HomepageChatConfigEditor() {
  const sound = useSoundManager();
  const [cfg, setCfg] = useState<HomepageChatConfig>(DEFAULT_HOMEPAGE_CHAT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    getHomepageChatConfig().then((c) => {
      setCfg(c);
      setLoading(false);
    });
  }, []);

  function set<K extends keyof HomepageChatConfig>(
    key: K,
    value: HomepageChatConfig[K]
  ) {
    setCfg((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const res = await adminUpdateHomepageChatConfig(cfg);
    setSaving(false);
    if (res.success) {
      sound.save?.();
      setToast({ msg: "Einstellungen gespeichert.", ok: true });
    } else {
      sound.error();
      setToast({ msg: res.error ?? "Fehler beim Speichern.", ok: false });
    }
    setTimeout(() => setToast(null), 3000);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  const saveBtn = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        handleSave();
      }}
      disabled={saving}
      className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-bold text-purple-300 transition-colors hover:border-purple-400/60 hover:bg-purple-500/20 disabled:opacity-50"
    >
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Save className="h-3.5 w-3.5" />
      )}
      Speichern
    </button>
  );

  return (
    <div className="space-y-3">
      {/* Toast */}
      {toast && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-sm font-medium ${
            toast.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Allgemein */}
      <CollapsibleAdminRow
        header={
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-zinc-200">Allgemein</p>
              <p className="text-xs text-zinc-500">
                Chat-Sidebar aktivieren, Titel & Eingabe
              </p>
            </div>
            {saveBtn}
          </div>
        }
      >
        <div className="space-y-3">
          <Toggle
            label="Chat-Sidebar aktiviert"
            value={cfg.enabled}
            onChange={(v) => set("enabled", v)}
          />
          <Toggle
            label="Eingabefeld anzeigen"
            value={cfg.showInput}
            onChange={(v) => set("showInput", v)}
          />
          <Toggle
            label="Header anzeigen"
            value={cfg.headerVisible}
            onChange={(v) => set("headerVisible", v)}
          />
          <TextInput
            label="Tab-Titel"
            value={cfg.tabTitle}
            onChange={(v) => set("tabTitle", v)}
            placeholder="Community Chat"
          />
        </div>
      </CollapsibleAdminRow>

      {/* Standard-Zustand */}
      <CollapsibleAdminRow
        header={
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-zinc-200">Standard-Zustand</p>
              <p className="text-xs text-zinc-500">
                Standardmäßig offen oder geschlossen
              </p>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <Toggle
            label="Desktop: Standard offen"
            value={cfg.defaultOpenDesktop}
            onChange={(v) => set("defaultOpenDesktop", v)}
          />
          <Toggle
            label="Mobile: Standard offen"
            value={cfg.defaultOpenMobile}
            onChange={(v) => set("defaultOpenMobile", v)}
          />
        </div>
      </CollapsibleAdminRow>

      {/* Erscheinungsbild */}
      <CollapsibleAdminRow
        header={
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-zinc-200">Erscheinungsbild</p>
              <p className="text-xs text-zinc-500">
                Breite, Position, Glasmorphismus & Schrift
              </p>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <NumberInput
            label="Breite (px)"
            value={cfg.sidebarWidth}
            min={220}
            max={500}
            onChange={(v) => set("sidebarWidth", v)}
          />
          <SelectInput
            label="Position"
            value={cfg.sidebarPosition as "left" | "right"}
            options={[
              { value: "left", label: "Links" },
              { value: "right", label: "Rechts" },
            ]}
            onChange={(v) => set("sidebarPosition", v)}
          />
          <NumberInput
            label="Hintergrund-Opazität (%)"
            value={cfg.bgOpacity}
            min={0}
            max={90}
            onChange={(v) => set("bgOpacity", v)}
          />
          <SelectInput
            label="Blur-Intensität"
            value={cfg.blurIntensity as "none" | "sm" | "md" | "lg" | "xl" | "2xl"}
            options={[
              { value: "none", label: "Kein Blur" },
              { value: "sm", label: "Klein" },
              { value: "md", label: "Mittel" },
              { value: "lg", label: "Groß" },
              { value: "xl", label: "Sehr groß" },
              { value: "2xl", label: "Maximum" },
            ]}
            onChange={(v) => set("blurIntensity", v)}
          />
          <SelectInput
            label="Schriftgröße"
            value={cfg.fontSize as "xs" | "sm" | "md"}
            options={[
              { value: "xs", label: "Klein" },
              { value: "sm", label: "Mittel" },
              { value: "md", label: "Groß" },
            ]}
            onChange={(v) => set("fontSize", v)}
          />
          <Toggle
            label="Kompaktmodus"
            value={cfg.compactMode}
            onChange={(v) => set("compactMode", v)}
          />
        </div>
      </CollapsibleAdminRow>

      {/* Nachrichten */}
      <CollapsibleAdminRow
        header={
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-zinc-200">Nachrichten</p>
              <p className="text-xs text-zinc-500">
                Avatare, Badges, Zeitstempel & Animation
              </p>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <NumberInput
            label="Max. Nachrichten"
            value={cfg.maxMessages}
            min={10}
            max={200}
            onChange={(v) => set("maxMessages", v)}
          />
          <Toggle
            label="Avatare anzeigen"
            value={cfg.showAvatars}
            onChange={(v) => set("showAvatars", v)}
          />
          <Toggle
            label="Badges anzeigen"
            value={cfg.showBadges}
            onChange={(v) => set("showBadges", v)}
          />
          <NumberInput
            label="Max. Badges pro Nachricht"
            value={cfg.maxBadgeCount}
            min={1}
            max={10}
            onChange={(v) => set("maxBadgeCount", v)}
          />
          <Toggle
            label="Zeitstempel anzeigen"
            value={cfg.showTimestamps}
            onChange={(v) => set("showTimestamps", v)}
          />
          <Toggle
            label={'Relative Zeitangabe (z.B. „2m“)'}
            value={cfg.showTimestampsRelative}
            onChange={(v) => set("showTimestampsRelative", v)}
          />
          <Toggle
            label="Nachrichten-Animation"
            value={cfg.messageAnimation}
            onChange={(v) => set("messageAnimation", v)}
          />
          <Toggle
            label="Auto-Scrollen"
            value={cfg.autoScroll}
            onChange={(v) => set("autoScroll", v)}
          />
          <Toggle
            label="Online-Anzahl anzeigen"
            value={cfg.showOnlineCount}
            onChange={(v) => set("showOnlineCount", v)}
          />
        </div>
      </CollapsibleAdminRow>

      {/* Chat */}
      <CollapsibleAdminRow
        header={
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-zinc-200">Chat</p>
              <p className="text-xs text-zinc-500">
                Eingabe, Erwähnungen & Sounds
              </p>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <TextInput
            label="Eingabe-Platzhalter"
            value={cfg.inputPlaceholder}
            onChange={(v) => set("inputPlaceholder", v)}
            placeholder="Nachricht..."
          />
          <Toggle
            label="Erwähnungen hervorheben"
            value={cfg.highlightMentions}
            onChange={(v) => set("highlightMentions", v)}
          />
          <Toggle
            label="Sound bei Erwähnung"
            value={cfg.mentionSound}
            onChange={(v) => set("mentionSound", v)}
          />
        </div>
      </CollapsibleAdminRow>

      {/* Bottom save */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-600/20 px-5 py-2.5 text-sm font-bold text-purple-300 transition-colors hover:border-purple-400/60 hover:bg-purple-600/30 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Alle Einstellungen speichern
        </button>
      </div>
    </div>
  );
}
