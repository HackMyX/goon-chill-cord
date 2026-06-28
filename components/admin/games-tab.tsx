"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Box, Joystick, Pickaxe, Trophy, Coins, Dices, CircleDot,
  Loader2, Save, Check, LayoutList, ChevronUp, ChevronDown, Eye, EyeOff,
  ShieldOff, CheckCircle2, AlertTriangle, ImageIcon, Users,
} from "lucide-react";
import { adminResetAllWorldSessions } from "@/lib/actions/session";
import {
  getGameLeaderboardConfig,
  getHomepageAvatarMode,
  updateGameLeaderboardConfig,
  type GameLeaderboardItem,
  type HomepageAvatarMode,
} from "@/lib/actions/homepage-leaderboards";
import { AdminTooltip } from "@/components/admin/admin-tooltip";
import { WorldSessionConfigEditor } from "@/components/admin/world-session-config-editor";
import { WorldSpawnConfigEditor } from "@/components/admin/world-spawn-editor";
import { CharacterConfigEditor } from "@/components/admin/character-config-editor";
import { DonConfigEditor } from "@/components/admin/don-config-editor";
import { SnakeConfigEditor } from "@/components/admin/snake-config-editor";
import { MineConfigEditor } from "@/components/admin/mine-config-editor";
import { SnakeLeaderboardEditor } from "@/components/admin/snake-leaderboard-editor";
import { MineLeaderboardEditor } from "@/components/admin/mine-leaderboard-editor";
import { PlinkoConfigEditor } from "@/components/admin/plinko-config-editor";
import { PlinkoLeaderboardEditor } from "@/components/admin/plinko-leaderboard-editor";
import { DonLeaderboardEditor } from "@/components/admin/don-leaderboard-editor";
import { UserRowEditor } from "@/components/admin/user-row-editor";
import type { ProfileRow } from "@/components/admin/admin-shell";
import type { WorldSessionConfig } from "@/lib/world-session-config";
import type { CharacterConfig } from "@/lib/character-config";
import type { WorldSpawnConfig } from "@/lib/world-spawn-config";
import type { DonConfig } from "@/lib/don-config";
import type { SnakeConfig } from "@/lib/snake-config";
import type { MineConfig } from "@/lib/mine-config";
import type { PlinkoConfig } from "@/lib/actions/plinko";

interface GameDef {
  id: string;
  name: string;
  icon: typeof Box;
  status: "live" | "soon";
}

const GAMES: GameDef[] = [
  { id: "world",  name: "3D World",          icon: Box,       status: "live" },
  { id: "don",    name: "Double or Nothing",  icon: Dices,     status: "live" },
  { id: "snake",  name: "Snake",              icon: Joystick,  status: "live" },
  { id: "mine",   name: "Mine",               icon: Pickaxe,   status: "live" },
  { id: "plinko", name: "Plinko",             icon: CircleDot, status: "live" },
];

interface GamesTabProps {
  worldSessionConfig: WorldSessionConfig;
  characterConfig: CharacterConfig;
  worldSpawnConfig: WorldSpawnConfig;
  topProfiles: ProfileRow[];
  donConfig: DonConfig;
  snakeConfig: SnakeConfig;
  mineConfig: MineConfig;
  plinkoConfig: PlinkoConfig;
}

// ── Emergency: reset all in-world sessions ────────────────────────────────────

function WorldSessionResetButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleReset() {
    if (!confirm("Alle aktiven Farmwelt-Sitzungen in der DB zurücksetzen? Spieler werden nicht sofort rausgeworfen, können aber sofort neu beitreten.")) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await adminResetAllWorldSessions();
      setResult({ ok: true, msg: `${res.count} Sitzung(en) zurückgesetzt.` });
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : "Fehler" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.04] p-4">
      <div className="flex items-center gap-2.5">
        <ShieldOff className="h-5 w-5 text-red-400" />
        <div>
          <p className="text-sm font-bold text-zinc-100">Notfall: Farmwelt-Sitzungen zurücksetzen</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Setzt alle <code>in_world=true</code> Flags in der DB zurück. Nutzen wenn Spieler durch Ghost-Sessions ausgesperrt sind.
          </p>
        </div>
      </div>
      {result && (
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${result.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
          {result.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
          {result.msg}
        </div>
      )}
      <button
        type="button"
        onClick={handleReset}
        disabled={loading}
        className="flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-40"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
        {loading ? "Zurücksetzen…" : "Alle World-Sitzungen zurücksetzen"}
      </button>
    </div>
  );
}

// ── Homepage leaderboard config section ──────────────────────────────────────

const LIMIT_OPTIONS = [5, 10, 20] as const;

function HomepageLeaderboardsSection() {
  const [items, setItems] = useState<GameLeaderboardItem[]>([]);
  const [avatarMode, setAvatarMode] = useState<HomepageAvatarMode>("top3");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([getGameLeaderboardConfig(), getHomepageAvatarMode()]).then(
      ([cfg, mode]) => {
        setItems([...cfg].sort((a, b) => a.sort - b.sort));
        setAvatarMode(mode);
        setLoading(false);
      }
    );
  }, []);

  const move = useCallback((idx: number, dir: -1 | 1) => {
    setItems((prev) => {
      const next = [...prev];
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next.map((it, i) => ({ ...it, sort: i }));
    });
  }, []);

  const toggle = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, enabled: !it.enabled } : it))
    );
  }, []);

  const setLimit = useCallback((id: string, limit: number) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, limit } : it))
    );
  }, []);

  async function handleSave() {
    setSaving(true);
    await updateGameLeaderboardConfig(items, avatarMode);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] overflow-hidden">
      <div className="flex items-center justify-between border-b border-violet-500/15 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <LayoutList className="h-5 w-5 text-violet-400" />
          <div>
            <p className="text-sm font-bold text-zinc-100">Startseiten-Bestenlisten</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Reihenfolge, Sichtbarkeit &amp; Limit der Spielelisten auf der Startseite
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-xs font-bold text-violet-300 hover:bg-violet-500/20 transition-colors disabled:opacity-40"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : saved ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {saved ? "Gespeichert" : "Speichern"}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 gap-2 text-sm text-zinc-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Lade Konfiguration...
        </div>
      ) : (
        <>
        {/* ── Profilbild-Modus (gilt für ALLE Startseiten-Bestenlisten) ── */}
        <div className="flex flex-col gap-2.5 border-b border-white/[0.06] bg-black/20 px-5 py-4">
          <div className="flex items-center gap-1.5">
            <ImageIcon className="h-4 w-4 text-violet-400" />
            <span className="text-xs font-bold text-zinc-200">Profilbilder auf der Startseite</span>
            <AdminTooltip text="Legt fest, welche Plätze auf der STARTSEITE ein Profilbild bekommen — gilt für ALLE Bestenlisten dort (Credits, Streak und alle Spielelisten). 'Nur Top 3': Plätze 1–3 zeigen das Profilbild, ab Platz 4 erscheint stattdessen der neutrale Initial-Kreis (ohne Foto). 'Alle Plätze': jeder Rang bekommt sein Profilbild. Hinweis: Die Bestenlisten INNERHALB der Spiele zeigen grundsätzlich nie Profilbilder — diese Einstellung betrifft ausschließlich die Startseite. Änderung wird sofort live für alle Besucher übernommen (kein Reload)." />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAvatarMode("top3")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                avatarMode === "top3"
                  ? "border-violet-500/40 bg-violet-500/15 text-violet-200"
                  : "border-white/[0.08] bg-white/[0.02] text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Trophy className="h-3.5 w-3.5" />
              Nur Top 3
            </button>
            <button
              type="button"
              onClick={() => setAvatarMode("all")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                avatarMode === "all"
                  ? "border-violet-500/40 bg-violet-500/15 text-violet-200"
                  : "border-white/[0.08] bg-white/[0.02] text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Alle Plätze
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-600">
            {avatarMode === "top3"
              ? "Plätze 1–3 zeigen ein Profilbild, ab Platz 4 ohne (neutraler Initial-Kreis)."
              : "Jeder Platz zeigt sein Profilbild."}
          </p>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {items.map((item, idx) => (
            <div key={item.id} className="flex items-center gap-3 px-5 py-3.5">
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="flex h-5 w-5 items-center justify-center rounded text-zinc-600 hover:text-zinc-300 disabled:opacity-20 transition-colors"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === items.length - 1}
                  className="flex h-5 w-5 items-center justify-center rounded text-zinc-600 hover:text-zinc-300 disabled:opacity-20 transition-colors"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>

              <span className="w-5 text-center text-xs font-black text-zinc-700">{idx + 1}</span>

              <span className="flex-1 text-sm font-semibold text-zinc-200">{item.label}</span>

              <div className="flex items-center gap-1">
                {LIMIT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setLimit(item.id, n)}
                    className={`rounded px-2 py-0.5 text-xs font-bold transition-colors ${
                      item.limit === n
                        ? "bg-violet-500/20 text-violet-300 border border-violet-500/40"
                        : "text-zinc-600 hover:text-zinc-400 border border-transparent"
                    }`}
                  >
                    Top {n}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => toggle(item.id)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  item.enabled
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                    : "border-zinc-700/50 bg-zinc-800/50 text-zinc-600 hover:text-zinc-400"
                }`}
              >
                {item.enabled ? (
                  <Eye className="h-3 w-3" />
                ) : (
                  <EyeOff className="h-3 w-3" />
                )}
                {item.enabled ? "Aktiv" : "Aus"}
              </button>
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
}

// ── Main games tab ────────────────────────────────────────────────────────────

export function GamesTab({
  worldSessionConfig,
  characterConfig,
  worldSpawnConfig,
  topProfiles,
  donConfig,
  snakeConfig,
  mineConfig,
  plinkoConfig,
}: GamesTabProps) {
  const [openGame, setOpenGame] = useState<string>("");

  return (
    <div className="flex flex-col gap-3">
      <HomepageLeaderboardsSection />

      <p className="rounded-xl border border-purple-500/20 bg-purple-500/[0.04] px-4 py-3 text-xs text-zinc-400">
        Ein Admin-Tool pro Spiel: Einstellungen, Standard-Werte und die Bestenliste jedes Spiels an
        einem Ort. Spiele ohne eigene Seite (noch "Bald") sind als Platzhalter gelistet, damit sie
        spaeter ohne Umbau hier einsortiert werden koennen.
      </p>

      {GAMES.map((game) => {
        const isOpen = openGame === game.id;
        return (
          <div
            key={game.id}
            className="rounded-xl border border-white/10 bg-[#0c0b14] overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setOpenGame(isOpen ? "" : game.id)}
              className="flex w-full items-center justify-between px-5 py-4 text-left"
            >
              <span className="flex items-center gap-3">
                <game.icon className="h-5 w-5 text-purple-300" />
                <span className="text-base font-bold text-zinc-100">{game.name}</span>
                {game.status === "soon" && (
                  <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                    Bald
                  </span>
                )}
                {game.status === "live" && (
                  <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                    Live
                  </span>
                )}
              </span>
              <span className="text-xs text-zinc-500">
                {isOpen ? "Einklappen" : "Aufklappen"}
              </span>
            </button>

            {isOpen && game.status === "soon" && (
              <div className="border-t border-white/10 px-5 py-6 text-sm text-zinc-500">
                Dieses Spiel ist noch nicht implementiert - sobald es existiert, erscheinen hier
                seine Einstellungen, Standardwerte und seine Bestenliste, genau wie bei 3D World.
              </div>
            )}

            {isOpen && game.id === "don" && (
              <div className="flex flex-col gap-6 border-t border-white/10 px-5 py-5">
                <DonConfigEditor config={donConfig} />
                <div className="border-t border-white/8 pt-4">
                  <DonLeaderboardEditor />
                </div>
              </div>
            )}

            {isOpen && game.id === "snake" && (
              <div className="flex flex-col gap-6 border-t border-white/10 px-5 py-5">
                <SnakeConfigEditor config={snakeConfig} />
                <div className="border-t border-white/8 pt-4">
                  <SnakeLeaderboardEditor />
                </div>
              </div>
            )}

            {isOpen && game.id === "mine" && (
              <div className="flex flex-col gap-6 border-t border-white/10 px-5 py-5">
                <MineConfigEditor config={mineConfig} />
                <div className="border-t border-white/8 pt-4">
                  <MineLeaderboardEditor />
                </div>
              </div>
            )}

            {isOpen && game.id === "plinko" && (
              <div className="flex flex-col gap-6 border-t border-white/10 px-5 py-5">
                <PlinkoConfigEditor config={plinkoConfig} />
                <div className="border-t border-white/8 pt-4">
                  <PlinkoLeaderboardEditor />
                </div>
              </div>
            )}

            {isOpen && game.id === "world" && (
              <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-5">
                <WorldSessionResetButton />
                <WorldSessionConfigEditor config={worldSessionConfig} />
                <CharacterConfigEditor config={characterConfig} />
                <WorldSpawnConfigEditor config={worldSpawnConfig} />

                <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
                  <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-zinc-100">
                    <Trophy className="h-5 w-5 text-amber-400" />
                    Bestenliste (nach Credits)
                  </h3>
                  <p className="mb-4 text-xs text-zinc-500">
                    World-Belohnungen fliessen direkt in Credits - diese Liste ist die Bestenliste.
                    Werte direkt unten bearbeiten.
                  </p>
                  {topProfiles.length === 0 ? (
                    <p className="flex items-center gap-2 text-sm text-zinc-500">
                      <Coins className="h-4 w-4" />
                      Noch keine Spieler mit Credits.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {topProfiles.slice(0, 20).map((profile, i) => (
                        <div key={profile.id} className="flex items-center gap-3">
                          <span className="w-6 shrink-0 text-right text-sm font-bold text-zinc-500">
                            #{i + 1}
                          </span>
                          <div className="flex-1">
                            <UserRowEditor profile={profile} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
