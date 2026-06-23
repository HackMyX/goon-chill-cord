"use client";

import { useState } from "react";
import { Box, Joystick, Pickaxe, Trophy, Coins, Dices } from "lucide-react";
import { WorldSessionConfigEditor } from "@/components/admin/world-session-config-editor";
import { WorldSpawnConfigEditor } from "@/components/admin/world-spawn-editor";
import { KillStreakConfigEditor } from "@/components/admin/kill-streak-config-editor";
import { CharacterConfigEditor } from "@/components/admin/character-config-editor";
import { DonConfigEditor } from "@/components/admin/don-config-editor";
import { UserRowEditor } from "@/components/admin/user-row-editor";
import type { ProfileRow } from "@/components/admin/admin-shell";
import type { WorldSessionConfig } from "@/lib/world-session-config";
import type { KillStreakConfig } from "@/lib/kill-streak";
import type { CharacterConfig } from "@/lib/character-config";
import type { WorldSpawnConfig } from "@/lib/world-spawn-config";
import type { DonConfig } from "@/lib/don-config";

interface GameDef {
  id: string;
  name: string;
  icon: typeof Box;
  status: "live" | "soon";
}

/** Registry of every game the site has (or will have) an admin presence
 * for — Snake/Mine are real placeholder entries in components/layout/
 * games-menu.tsx ("Bald"/Coming Soon, no route yet), listed here too so
 * the framework already has a slot ready for them: once either one
 * actually ships, it just needs its own settings-editor component (the
 * same triad pattern as WorldSessionConfigEditor — see lib/world-session-
 * config.ts's doc comment) slotted into the `live` branch below, nothing
 * about this registry itself has to change. */
const GAMES: GameDef[] = [
  { id: "world", name: "3D World", icon: Box, status: "live" },
  { id: "don", name: "Double or Nothing", icon: Dices, status: "live" },
  { id: "snake", name: "Snake", icon: Joystick, status: "soon" },
  { id: "mine", name: "Mine", icon: Pickaxe, status: "soon" },
];

interface GamesTabProps {
  worldSessionConfig: WorldSessionConfig;
  killStreakConfig: KillStreakConfig;
  characterConfig: CharacterConfig;
  worldSpawnConfig: WorldSpawnConfig;
  topProfiles: ProfileRow[];
  donConfig: DonConfig;
}

/**
 * Per-game admin hub — one card per game (components/layout/games-menu.tsx
 * is the player-facing equivalent of this list), each expandable into its
 * own settings/stats/leaderboard panel. Currently only "3D World" has
 * anything real behind it; Snake/Mine render as inert "Bald" placeholders
 * so the tab's shape doesn't have to change again once they exist.
 */
export function GamesTab({ worldSessionConfig, killStreakConfig, characterConfig, worldSpawnConfig, topProfiles, donConfig }: GamesTabProps) {
  const [openGame, setOpenGame] = useState<string>("");

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-xl border border-purple-500/20 bg-purple-500/[0.04] px-4 py-3 text-xs text-zinc-400">
        Ein Admin-Tool pro Spiel: Einstellungen, Standard-Werte und die Bestenliste jedes Spiels an
        einem Ort. Spiele ohne eigene Seite (noch „Bald“) sind als Platzhalter gelistet, damit sie
        später ohne Umbau hier einsortiert werden können.
      </p>

      {GAMES.map((game) => {
        const isOpen = openGame === game.id;
        return (
          <div key={game.id} className="rounded-xl border border-white/10 bg-[#0c0b14] overflow-hidden">
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
              <span className="text-xs text-zinc-500">{isOpen ? "Einklappen" : "Aufklappen"}</span>
            </button>

            {isOpen && game.status === "soon" && (
              <div className="border-t border-white/10 px-5 py-6 text-sm text-zinc-500">
                Dieses Spiel ist noch nicht implementiert — sobald es existiert, erscheinen hier
                seine Einstellungen, Standardwerte und seine Bestenliste, genau wie bei 3D World.
              </div>
            )}

            {isOpen && game.id === "don" && (
              <div className="border-t border-white/10 px-5 py-5">
                <DonConfigEditor config={donConfig} />
              </div>
            )}

            {isOpen && game.id === "world" && (
              <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-5">
                <WorldSessionConfigEditor config={worldSessionConfig} />
                <CharacterConfigEditor config={characterConfig} />
                <WorldSpawnConfigEditor config={worldSpawnConfig} />
                <KillStreakConfigEditor config={killStreakConfig} />

                <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
                  <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-zinc-100">
                    <Trophy className="h-5 w-5 text-amber-400" />
                    Bestenliste (nach Credits)
                  </h3>
                  <p className="mb-4 text-xs text-zinc-500">
                    World-Belohnungen fließen direkt in Credits — diese Liste ist die Bestenliste.
                    Werte direkt unten bearbeiten (gleiche Bearbeitung wie im Tab „User-Management“).
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
