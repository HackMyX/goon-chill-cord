"use client";

import { useState, useTransition, useCallback } from "react";
import {
  Settings2,
  Save,
  RotateCcw,
  Globe,
  MessageSquare,
  Zap,
  Users,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import { AdminTooltip } from "@/components/admin/admin-tooltip";
import { type FineConfig, DEFAULT_FINE_CONFIG } from "@/lib/fine-config-types";
import { updateFineConfig } from "@/lib/actions/fine-config";

// ──────────────────────────────────────────────────────────────────────────────
// Reusable controls
// ──────────────────────────────────────────────────────────────────────────────

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const pct = Math.round(((value - min) / (max - min)) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-semibold text-zinc-300">{label}</label>
          {hint && <AdminTooltip text={hint} />}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
            }}
            className="w-20 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-right text-xs font-mono font-semibold text-zinc-200 focus:border-purple-500/40 focus:outline-none"
          />
          {unit && <span className="text-xs text-zinc-600">{unit}</span>}
        </div>
      </div>
      <div className="relative h-1.5 w-full rounded-full bg-white/[0.06]">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      <div className="flex justify-between text-[10px] text-zinc-700">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

function IntSlider(props: Omit<Parameters<typeof Slider>[0], "step"> & { step?: number }) {
  return <Slider {...props} step={props.step ?? 1} onChange={(v) => props.onChange(Math.round(v))} />;
}

function SectionSaveBar({
  isPending,
  saved,
  error,
  onSave,
  onReset,
}: {
  isPending: boolean;
  saved: boolean;
  error: string | null;
  onSave: () => void;
  onReset: () => void;
}) {
  return (
    <div className="mt-4 flex items-center gap-2 border-t border-white/[0.06] pt-4">
      <button
        onClick={onReset}
        disabled={isPending}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-zinc-500 transition-colors hover:bg-white/[0.07] hover:text-zinc-300 disabled:opacity-40"
      >
        <RotateCcw className="h-3 w-3" />
        Zurücksetzen
      </button>
      <button
        onClick={onSave}
        disabled={isPending}
        className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/15 px-4 py-1.5 text-xs font-black text-purple-200 transition-colors hover:bg-purple-500/25 disabled:opacity-40"
      >
        {isPending ? (
          <RefreshCw className="h-3 w-3 animate-spin" />
        ) : (
          <Save className="h-3 w-3" />
        )}
        {isPending ? "Speichern…" : "Abschnitt speichern"}
      </button>
      {saved && <span className="text-xs font-semibold text-emerald-400">Gespeichert!</span>}
      {error && <span className="text-xs font-semibold text-red-400">{error}</span>}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  badge,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05]">
          <Icon className="h-3.5 w-3.5 text-purple-300" />
        </span>
        <span className="flex-1 text-sm font-black text-zinc-100">{title}</span>
        {badge && (
          <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-zinc-500">
            {badge}
          </span>
        )}
        {open ? (
          <ChevronUp className="h-4 w-4 text-zinc-600" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zinc-600" />
        )}
      </button>
      {open && <div className="border-t border-white/[0.06] px-5 pb-5 pt-4 space-y-4">{children}</div>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────────

export function FineConfigEditor({ initial }: { initial: FineConfig }) {
  // Each section has its own local state slice + save button so admins can
  // edit one section without accidentally overwriting another section's changes.

  // — Nametag —
  const [nametag, setNametag] = useState({
    nametagDistanceFactor: initial.nametagDistanceFactor,
    nametagHeightOffset: initial.nametagHeightOffset,
  });
  const [nametagDefault] = useState(nametag);
  const [nametagPending, startNametagTransition] = useTransition();
  const [nametagSaved, setNametagSaved] = useState(false);
  const [nametagError, setNametagError] = useState<string | null>(null);

  // — Multiplayer Sync —
  const [mpSync, setMpSync] = useState({
    mpPositionLerpRate: initial.mpPositionLerpRate,
    mpHeadingTurnRate: initial.mpHeadingTurnRate,
    mpDeadReckoningLookahead: initial.mpDeadReckoningLookahead,
    mpAttackSwingDuration: initial.mpAttackSwingDuration,
  });
  const [mpSyncDefault] = useState(mpSync);
  const [mpSyncPending, startMpSyncTransition] = useTransition();
  const [mpSyncSaved, setMpSyncSaved] = useState(false);
  const [mpSyncError, setMpSyncError] = useState<string | null>(null);

  // — Hit Effects —
  const [hitFx, setHitFx] = useState({
    bloodBurstParticleCount: initial.bloodBurstParticleCount,
    bloodBurstLifetimeMs: initial.bloodBurstLifetimeMs,
    slashLifetimeMs: initial.slashLifetimeMs,
  });
  const [hitFxDefault] = useState(hitFx);
  const [hitFxPending, startHitFxTransition] = useTransition();
  const [hitFxSaved, setHitFxSaved] = useState(false);
  const [hitFxError, setHitFxError] = useState<string | null>(null);

  // — Chat —
  const [chat, setChat] = useState({
    chatMaxHistory: initial.chatMaxHistory,
    chatMaxMessageLength: initial.chatMaxMessageLength,
    chatPollIntervalMs: initial.chatPollIntervalMs,
  });
  const [chatDefault] = useState(chat);
  const [chatPending, startChatTransition] = useTransition();
  const [chatSaved, setChatSaved] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // — Community —
  const [community, setCommunity] = useState({
    communityMaxBadgesShown: initial.communityMaxBadgesShown,
  });
  const [communityDefault] = useState(community);
  const [communityPending, startCommunityTransition] = useTransition();
  const [communitySaved, setCommunitySaved] = useState(false);
  const [communityError, setCommunityError] = useState<string | null>(null);

  const flashSaved = useCallback((setSaved: (v: boolean) => void) => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }, []);

  const saveSection = useCallback(
    <T extends Partial<Omit<FineConfig, "id" | "updatedAt">>>(
      data: T,
      startTransition: (fn: () => void) => void,
      setSaved: (v: boolean) => void,
      setError: (v: string | null) => void
    ) => {
      setError(null);
      startTransition(() => {
        updateFineConfig(data).then((res) => {
          if ("error" in res) {
            setError(res.error);
          } else {
            flashSaved(setSaved);
          }
        });
      });
    },
    [flashSaved]
  );

  const updatedAt = initial.updatedAt
    ? new Date(initial.updatedAt).toLocaleString("de-DE")
    : "noch nie";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-zinc-100">
            <Settings2 className="h-5 w-5 text-purple-400" />
            Feintuning
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Alle feingranularen Werte — vorher hartcodiert, jetzt per Datenbank steuerbar.
          </p>
        </div>
        <span className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-600">
          Zuletzt aktualisiert: {updatedAt}
        </span>
      </div>

      {/* Defaults notice */}
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p className="text-xs text-amber-300/80">
          Alle Standardwerte entsprechen den bisherigen hartcodierten Werten — nichts ändert sich, bis du aktiv anpasst und speicherst.
          Multiplayer-Sync-Werte werden erst nach einem Seiten-Reload wirksam.
        </p>
      </div>

      {/* ── 3D-Welt: Nametag ─────────────────────────────────────────────── */}
      <Section icon={Globe} title="3D-Welt — Nametag" badge="Sofort wirksam">
        <Slider
          label="Größen-Faktor (distanceFactor)"
          hint="Wie groß das Nametag erscheint in Abhängigkeit zur Kamera-Entfernung"
          value={nametag.nametagDistanceFactor}
          min={3}
          max={20}
          step={0.25}
          onChange={(v) => setNametag((p) => ({ ...p, nametagDistanceFactor: v }))}
        />
        <Slider
          label="Höhe über Spieler"
          hint="Y-Offset des Nametags über der Spieler-Kapsel (in World-Units)"
          value={nametag.nametagHeightOffset}
          min={1.5}
          max={5.0}
          step={0.05}
          unit=" u"
          onChange={(v) => setNametag((p) => ({ ...p, nametagHeightOffset: v }))}
        />
        <SectionSaveBar
          isPending={nametagPending}
          saved={nametagSaved}
          error={nametagError}
          onSave={() =>
            saveSection(nametag, startNametagTransition, setNametagSaved, setNametagError)
          }
          onReset={() => setNametag(nametagDefault)}
        />
      </Section>

      {/* ── 3D-Welt: Multiplayer Sync ──────────────────────────────────────── */}
      <Section icon={RefreshCw} title="3D-Welt — Multiplayer Sync" badge="Nach Seiten-Reload">
        <Slider
          label="Position Lerp Rate"
          hint="Wie schnell entfernte Spieler zu ihrer Zielposition interpolieren (Hz-ähnlich)"
          value={mpSync.mpPositionLerpRate}
          min={5}
          max={40}
          step={0.5}
          onChange={(v) => setMpSync((p) => ({ ...p, mpPositionLerpRate: v }))}
        />
        <Slider
          label="Dreh-Rate (Heading)"
          hint="Wie schnell entfernte Spieler ihren Blickwinkel angleichen"
          value={mpSync.mpHeadingTurnRate}
          min={5}
          max={35}
          step={0.5}
          onChange={(v) => setMpSync((p) => ({ ...p, mpHeadingTurnRate: v }))}
        />
        <Slider
          label="Dead-Reckoning Lookahead"
          hint="Wie weit in die Zukunft der Bewegungs-Predictor extrapoliert (Sekunden)"
          value={mpSync.mpDeadReckoningLookahead}
          min={0.02}
          max={0.5}
          step={0.01}
          unit=" s"
          onChange={(v) => setMpSync((p) => ({ ...p, mpDeadReckoningLookahead: v }))}
        />
        <Slider
          label="Angriff-Animation Dauer"
          hint="Dauer der Angriffs-Swing-Animation auf Client-Seite (Sekunden)"
          value={mpSync.mpAttackSwingDuration}
          min={0.1}
          max={1.0}
          step={0.01}
          unit=" s"
          onChange={(v) => setMpSync((p) => ({ ...p, mpAttackSwingDuration: v }))}
        />
        <SectionSaveBar
          isPending={mpSyncPending}
          saved={mpSyncSaved}
          error={mpSyncError}
          onSave={() =>
            saveSection(mpSync, startMpSyncTransition, setMpSyncSaved, setMpSyncError)
          }
          onReset={() => setMpSync(mpSyncDefault)}
        />
      </Section>

      {/* ── Treffer-Effekte ────────────────────────────────────────────────── */}
      <Section icon={Zap} title="Treffer-Effekte" badge="Nach Seiten-Reload">
        <IntSlider
          label="Blutspritzer — Partikelanzahl"
          hint="Anzahl der Partikel pro Blut-Burst-Effekt"
          value={hitFx.bloodBurstParticleCount}
          min={1}
          max={30}
          onChange={(v) => setHitFx((p) => ({ ...p, bloodBurstParticleCount: v }))}
        />
        <IntSlider
          label="Blutspritzer — Lebensdauer"
          hint="Wie lange die Blut-Partikel sichtbar bleiben"
          value={hitFx.bloodBurstLifetimeMs}
          min={100}
          max={2000}
          step={50}
          unit=" ms"
          onChange={(v) => setHitFx((p) => ({ ...p, bloodBurstLifetimeMs: v }))}
        />
        <IntSlider
          label="Slash-Effekt — Lebensdauer"
          hint="Wie lange der weiße Slash-Arc sichtbar bleibt"
          value={hitFx.slashLifetimeMs}
          min={50}
          max={800}
          step={10}
          unit=" ms"
          onChange={(v) => setHitFx((p) => ({ ...p, slashLifetimeMs: v }))}
        />
        <SectionSaveBar
          isPending={hitFxPending}
          saved={hitFxSaved}
          error={hitFxError}
          onSave={() =>
            saveSection(hitFx, startHitFxTransition, setHitFxSaved, setHitFxError)
          }
          onReset={() => setHitFx(hitFxDefault)}
        />
      </Section>

      {/* ── Chat ──────────────────────────────────────────────────────────── */}
      <Section icon={MessageSquare} title="Global Chat" badge="Sofort wirksam">
        <IntSlider
          label="Max. Nachrichten im Verlauf"
          hint="Wie viele Nachrichten der Client im Speicher hält (ältere werden verworfen)"
          value={chat.chatMaxHistory}
          min={10}
          max={300}
          step={5}
          onChange={(v) => setChat((p) => ({ ...p, chatMaxHistory: v }))}
        />
        <IntSlider
          label="Max. Nachrichtenlänge"
          hint="Maximale Zeichenanzahl pro Chat-Nachricht"
          value={chat.chatMaxMessageLength}
          min={50}
          max={2000}
          step={50}
          unit=" Zeichen"
          onChange={(v) => setChat((p) => ({ ...p, chatMaxMessageLength: v }))}
        />
        <IntSlider
          label="Polling-Intervall"
          hint="Wie oft der Client neue Nachrichten abruft (niedrigere Werte = mehr Last)"
          value={chat.chatPollIntervalMs}
          min={2000}
          max={30000}
          step={500}
          unit=" ms"
          onChange={(v) => setChat((p) => ({ ...p, chatPollIntervalMs: v }))}
        />
        <SectionSaveBar
          isPending={chatPending}
          saved={chatSaved}
          error={chatError}
          onSave={() =>
            saveSection(chat, startChatTransition, setChatSaved, setChatError)
          }
          onReset={() => setChat(chatDefault)}
        />
      </Section>

      {/* ── Community ─────────────────────────────────────────────────────── */}
      <Section icon={Users} title="Community" badge="Sofort wirksam">
        <IntSlider
          label="Max. Badges pro Spieler (Community-Ansicht)"
          hint="Wie viele Badges in der Community-Karte und in Spielerprofilen angezeigt werden"
          value={community.communityMaxBadgesShown}
          min={1}
          max={12}
          onChange={(v) =>
            setCommunity((p) => ({ ...p, communityMaxBadgesShown: v }))
          }
        />
        <SectionSaveBar
          isPending={communityPending}
          saved={communitySaved}
          error={communityError}
          onSave={() =>
            saveSection(
              community,
              startCommunityTransition,
              setCommunitySaved,
              setCommunityError
            )
          }
          onReset={() => setCommunity(communityDefault)}
        />
      </Section>

      {/* Quick-reset all to defaults */}
      <div className="flex justify-end">
        <button
          onClick={() => {
            setNametag({
              nametagDistanceFactor: DEFAULT_FINE_CONFIG.nametagDistanceFactor,
              nametagHeightOffset: DEFAULT_FINE_CONFIG.nametagHeightOffset,
            });
            setMpSync({
              mpPositionLerpRate: DEFAULT_FINE_CONFIG.mpPositionLerpRate,
              mpHeadingTurnRate: DEFAULT_FINE_CONFIG.mpHeadingTurnRate,
              mpDeadReckoningLookahead: DEFAULT_FINE_CONFIG.mpDeadReckoningLookahead,
              mpAttackSwingDuration: DEFAULT_FINE_CONFIG.mpAttackSwingDuration,
            });
            setHitFx({
              bloodBurstParticleCount: DEFAULT_FINE_CONFIG.bloodBurstParticleCount,
              bloodBurstLifetimeMs: DEFAULT_FINE_CONFIG.bloodBurstLifetimeMs,
              slashLifetimeMs: DEFAULT_FINE_CONFIG.slashLifetimeMs,
            });
            setChat({
              chatMaxHistory: DEFAULT_FINE_CONFIG.chatMaxHistory,
              chatMaxMessageLength: DEFAULT_FINE_CONFIG.chatMaxMessageLength,
              chatPollIntervalMs: DEFAULT_FINE_CONFIG.chatPollIntervalMs,
            });
            setCommunity({
              communityMaxBadgesShown: DEFAULT_FINE_CONFIG.communityMaxBadgesShown,
            });
          }}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:bg-white/[0.06] hover:text-zinc-400"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Alle auf Standardwerte zurücksetzen (UI)
        </button>
      </div>
    </div>
  );
}
