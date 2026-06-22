"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Canvas } from "@react-three/fiber";
import { ArrowLeft, Keyboard, MousePointerClick, Swords, Heart, Zap, Coins, Flame, LogOut } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { Scene } from "@/components/world/scene";
import { DeathScreen } from "@/components/world/death-screen";
import { useCameraControls } from "@/components/world/use-camera-controls";
import { useSoundManager } from "@/lib/sound-manager";
import { debugLog, debugWarn } from "@/lib/debug";
import { getEquippedDamage, formatDamage, PLAYER_MAX_HP, PLAYER_MAX_STAMINA } from "@/lib/combat";
import {
  enterWorld,
  registerStreakKill,
  commitStreakCr,
  forfeitStreakOnDeath,
} from "@/lib/actions/kill-streak";
import { joinWorldRoom } from "@/lib/world-realtime";
import type { MonsterTypeConfig } from "@/lib/monsters";
import type { PetTypeConfig } from "@/lib/pets";
import type { KillStreakConfig } from "@/lib/kill-streak";
import type { EquippedItem } from "@/lib/rarity-colors";

interface WorldShellProps {
  userId: string;
  credits: number;
  streakDays: number;
  inventoryCount: number;
  equippedByCategory: Record<string, EquippedItem | undefined>;
  gender: "m" | "w";
  username: string;
  monsterTypes: MonsterTypeConfig[];
  petTypes: PetTypeConfig[];
  killStreakConfig: KillStreakConfig;
}

interface RewardPopup {
  id: number;
  amount: number;
}

interface DamageTakenPopup {
  id: number;
  amount: number;
}

let rewardPopupSeq = 0;
let damageTakenSeq = 0;

function StatBar({
  icon,
  value,
  max,
  colorClass,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  max: number;
  colorClass: string;
  label: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div className="h-2.5 w-36 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10">
        <div
          className={`h-full rounded-full transition-[width] duration-150 ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function WorldShell({
  userId,
  credits: initialCredits,
  streakDays,
  inventoryCount,
  equippedByCategory,
  gender,
  username,
  monsterTypes,
  petTypes,
  killStreakConfig,
}: WorldShellProps) {
  const [credits, setCredits] = useState(initialCredits);
  const [showHint, setShowHint] = useState(true);
  const [attackFlash, setAttackFlash] = useState<"hit" | "miss" | null>(null);
  const [hp, setHp] = useState(PLAYER_MAX_HP);
  const [maxHp, setMaxHp] = useState(PLAYER_MAX_HP);
  const [stamina, setStamina] = useState(PLAYER_MAX_STAMINA);
  const [maxStamina, setMaxStamina] = useState(PLAYER_MAX_STAMINA);
  const [rewardPopups, setRewardPopups] = useState<RewardPopup[]>([]);
  const [damageTakenPopups, setDamageTakenPopups] = useState<DamageTakenPopup[]>([]);
  const [hurtFlash, setHurtFlash] = useState(false);
  const prevHpRef = useRef(PLAYER_MAX_HP);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const cameraControls = useCameraControls(canvasWrapRef);
  const sound = useSoundManager();
  const router = useRouter();

  // Pending kill-streak CR/kill-count — never written to `credits`
  // directly (lib/actions/kill-streak.ts' registerStreakKill adds to
  // `profiles.pending_streak_cr` instead). Only commitStreakCr (the
  // Disconnect button) or a normal day-to-day login ever turns this into
  // real credits; closing the tab or dying forfeits it.
  const [pendingStreakCr, setPendingStreakCr] = useState(0);
  const [streakKillCount, setStreakKillCount] = useState(0);
  const [respawnSignal, setRespawnSignal] = useState(0);
  const [deathStats, setDeathStats] = useState<{ forfeitedCr: number; forfeitedKillCount: number } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const weapon = equippedByCategory.weapon_cosmetic;
  const weaponDamage = getEquippedDamage(weapon);
  const weaponName = weapon?.name ?? "Fäuste";

  const handleAttack = useCallback(
    (_damage: number, hit: boolean) => {
      setAttackFlash(hit ? "hit" : "miss");
      if (hit) sound.hit();
      setTimeout(() => setAttackFlash(null), 140);
    },
    [sound]
  );

  const handleStatsChange = useCallback(
    (nextHp: number, nextMaxHp: number, nextStamina: number, nextMaxStamina: number) => {
      if (nextHp < prevHpRef.current) {
        const lost = Math.round(prevHpRef.current - nextHp);
        sound.error();
        setHurtFlash(true);
        setTimeout(() => setHurtFlash(false), 220);
        const id = ++damageTakenSeq;
        setDamageTakenPopups((curr) => [...curr, { id, amount: lost }]);
        setTimeout(() => setDamageTakenPopups((curr) => curr.filter((p) => p.id !== id)), 700);
      }
      prevHpRef.current = nextHp;
      setHp(nextHp);
      setMaxHp(nextMaxHp);
      setStamina(nextStamina);
      setMaxStamina(nextMaxStamina);
    },
    [sound]
  );

  const handleMonsterKilled = useCallback(
    (typeId: string) => {
      registerStreakKill(typeId).then((res) => {
        if (!res.success || res.reward === undefined) {
          if (!res.success) debugWarn("World", "registerStreakKill failed", res.error);
          return;
        }
        sound.win();
        if (res.newPendingStreakCr !== undefined) setPendingStreakCr(res.newPendingStreakCr);
        if (res.newStreakKillCount !== undefined) setStreakKillCount(res.newStreakKillCount);
        const id = ++rewardPopupSeq;
        setRewardPopups((curr) => [...curr, { id, amount: res.reward! }]);
        setTimeout(() => setRewardPopups((curr) => curr.filter((p) => p.id !== id)), 1400);
      });
    },
    [sound]
  );

  // Fired once (player.tsx's onDeath, edge-triggered) the instant hp hits
  // 0 — forfeits whatever streak was pending server-side first (so the
  // death screen can show exactly what was lost) and only then shows the
  // overlay; `credits`/inventory are never touched here.
  const handleDeath = useCallback(() => {
    forfeitStreakOnDeath().then((res) => {
      setDeathStats({ forfeitedCr: res.forfeitedCr ?? 0, forfeitedKillCount: res.forfeitedKillCount ?? 0 });
      setPendingStreakCr(0);
      setStreakKillCount(0);
    });
  }, []);

  const handleRespawn = useCallback(() => {
    sound.click();
    setDeathStats(null);
    setRespawnSignal((s) => s + 1);
  }, [sound]);

  // The "Disconnect" button — the only sanctioned way to actually cash out
  // a pending kill-streak. Closing the tab or clicking the plain "Zurück"
  // link instead leaves it uncommitted, which the next enterWorld() call
  // (this page's own mount effect, on whichever session comes next) wipes
  // for free.
  const handleDisconnect = useCallback(() => {
    setDisconnecting(true);
    sound.click();
    commitStreakCr().then((res) => {
      if (!res.success) {
        setDisconnecting(false);
        debugWarn("World", "commitStreakCr failed", res.error);
        return;
      }
      setPendingStreakCr(0);
      setStreakKillCount(0);
      router.push("/");
    });
  }, [sound, router]);

  function engageLock() {
    sound.click();
    cameraControls.requestLock();
  }

  useEffect(() => {
    debugLog("World", "mounted with equipped items", { username, gender, equippedByCategory });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only log once on mount
  }, []);

  // Resets the kill-streak's pending CR/count for this fresh session —
  // see lib/actions/kill-streak.ts' enterWorld() doc comment for why this
  // single call is the entire "ungraceful disconnect" handling story.
  useEffect(() => {
    enterWorld();
  }, []);

  // Joins the shared World room's presence roster for the lifetime of this
  // page — leaving /world (navigation or unmount) untracks, which is what
  // makes this player's avatar disappear from every other open tab.
  useEffect(() => joinWorldRoom(userId), [userId]);

  // The whole reason the canvas previously rendered tiny: this component
  // was nested inside several `flex flex-1` ancestors with no `min-h-0`
  // anywhere in the chain. A flex item with `flex: 1 1 0%` but no
  // `min-height: 0` can collapse to its content's *intrinsic* size instead
  // of actually stretching — and an R3F <Canvas> sized at 100% of a
  // collapsed (effectively auto-height) parent resolves to ~0px. Forcing
  // `h-screen` on this component's own root sidesteps the whole ancestor
  // chain instead of trying to fix `min-h-0` at every level above it.
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    debugLog("World", "canvas wrapper mounted", {
      width: el.clientWidth,
      height: el.clientHeight,
    });
    const observer = new ResizeObserver(([entry]) => {
      debugLog("World", "canvas wrapper resized", {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <TopBar credits={credits} streakDays={streakDays} inventoryCount={inventoryCount} onCreditsChange={setCredits} />

      <div ref={canvasWrapRef} className="relative min-h-0 flex-1">
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
          <Link
            href="/"
            onMouseEnter={sound.hover}
            onClick={sound.click}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/50 px-3 py-1.5 text-sm text-zinc-300 backdrop-blur transition-colors hover:border-white/30"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück
          </Link>
          {/* The only sanctioned way to actually cash out a pending
              kill-streak — "Zurück" above (or just closing the tab) leaves
              it uncommitted, forfeited for free the next time this player
              enters the World (lib/actions/kill-streak.ts' enterWorld()). */}
          <button
            onMouseEnter={sound.hover}
            onClick={handleDisconnect}
            disabled={disconnecting}
            title={
              pendingStreakCr > 0
                ? `Sichert ${pendingStreakCr.toLocaleString("de-DE")} CR Kill-Streak-Guthaben`
                : "Keine offene Kill-Streak"
            }
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-300 backdrop-blur transition-colors hover:border-emerald-400/60 disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            Disconnect
          </button>
        </div>

        {/* HP/Stamina HUD — top-left, under the back link. Stamina is
            intentionally only drained by sprinting/jumping (lib/combat.ts),
            never by attacking. */}
        <div className="absolute top-16 left-4 z-10 flex flex-col gap-1.5 rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 backdrop-blur">
          <StatBar
            icon={<Heart className="h-4 w-4 text-red-400" />}
            value={hp}
            max={maxHp}
            colorClass="bg-gradient-to-r from-red-600 to-red-400"
            label="Leben"
          />
          <StatBar
            icon={<Zap className="h-4 w-4 text-yellow-400" />}
            value={stamina}
            max={maxStamina}
            colorClass="bg-gradient-to-r from-yellow-600 to-yellow-300"
            label="Ausdauer"
          />
          {streakKillCount > 0 && (
            <div className="flex items-center gap-1.5 border-t border-white/10 pt-1.5 text-xs">
              <Flame className="h-3.5 w-3.5 text-orange-400" />
              <span className="font-bold text-orange-300">{streakKillCount}er Streak</span>
              <span className="text-zinc-400">·</span>
              <Coins className="h-3.5 w-3.5 text-amber-400" />
              <span className="font-bold text-amber-300">{pendingStreakCr.toLocaleString("de-DE")} CR</span>
            </div>
          )}
          {damageTakenPopups.map((p) => (
            <span
              key={p.id}
              className="animate-[float-up_0.65s_ease-out_forwards] self-start text-sm font-extrabold text-red-400 drop-shadow-[0_0_6px_rgba(239,68,68,0.8)]"
            >
              -{p.amount}
            </span>
          ))}
        </div>

        {/* Red screen-edge flash on taking damage — the HP bar above
            already shows the new value, this is purely the "you just got
            hit" reflex cue games conventionally give regardless of how
            small the hit was. */}
        <div
          className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-200 ${
            hurtFlash ? "opacity-100" : "opacity-0"
          }`}
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 55%, rgba(239,68,68,0.35) 100%)",
          }}
        />

        {showHint && (
          <button
            onMouseEnter={sound.hover}
            onClick={(e) => {
              e.stopPropagation();
              sound.click();
              setShowHint(false);
            }}
            className="absolute top-4 right-4 z-20 flex items-center gap-2 rounded-lg border border-purple-400/40 bg-purple-500/10 px-3 py-1.5 text-sm font-semibold text-purple-200 shadow-[0_0_16px_rgba(168,85,247,0.3)] backdrop-blur"
          >
            <Keyboard className="h-4 w-4" />
            WASD laufen · Maus schauen/zielen · Shift sprinten · Leertaste springen · Linksklick schlagen ·
            Scrollen = Zoom
          </button>
        )}

        {/* Bottom-center HUD: always shows what a punch/swing right now
            would deal. Flashes green on a landed hit, red on a swing that
            found nothing in range — the actual damage numbers + monster
            health bars live in-world, above whatever just got hit (see
            components/world/monster.tsx), not here. */}
        <div
          className={`pointer-events-none absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 text-sm backdrop-blur transition-colors ${
            attackFlash === "hit"
              ? "border-emerald-400/70 bg-emerald-500/20"
              : attackFlash === "miss"
                ? "border-red-400/50 bg-red-500/10"
                : "border-white/10 bg-black/50"
          }`}
        >
          <Swords className="h-4 w-4 text-emerald-400" />
          <span className="font-semibold text-zinc-200">{weaponName}</span>
          <span className="font-bold text-emerald-300">{formatDamage(weaponDamage)}</span>
        </div>

        {/* Monster-kill reward toasts — top-center, separate from the
            weapon HUD so a kill reward is never confused with "what a
            punch deals". */}
        <div className="pointer-events-none absolute top-4 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1">
          {rewardPopups.map((p) => (
            <span
              key={p.id}
              className="animate-[float-up_1.3s_ease-out_forwards] flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-500/15 px-3 py-1 text-sm font-bold text-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.4)]"
            >
              <Coins className="h-3.5 w-3.5" />+{p.amount.toLocaleString("de-DE")} CR
            </span>
          ))}
        </div>

        {!cameraControls.locked && !deathStats && (
          <button
            onClick={engageLock}
            className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-3 bg-black/40 text-center backdrop-blur-[2px]"
          >
            <span className="flex items-center gap-2 rounded-full border border-purple-400/50 bg-purple-500/20 px-5 py-2.5 text-base font-bold text-purple-100 shadow-[0_0_24px_rgba(168,85,247,0.4)]">
              <MousePointerClick className="h-5 w-5" />
              Klicken zum Spielen
            </span>
            <span className="text-xs text-zinc-400">Maus steuert die Blickrichtung · Esc zum Pausieren</span>
          </button>
        )}

        {deathStats && (
          <DeathScreen
            forfeitedCr={deathStats.forfeitedCr}
            forfeitedKillCount={deathStats.forfeitedKillCount}
            onRespawn={handleRespawn}
          />
        )}

        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [0, 2.6, 6], fov: 55 }}
          className="absolute inset-0"
          onCreated={({ gl, size }) => {
            debugLog("World", "canvas created", { size, pixelRatio: gl.getPixelRatio() });
          }}
        >
          <Suspense fallback={null}>
            <Scene
              userId={userId}
              equippedByCategory={equippedByCategory}
              gender={gender}
              username={username}
              cameraControls={cameraControls}
              canvasRef={canvasWrapRef}
              monsterTypes={monsterTypes}
              petTypes={petTypes}
              killStreakConfig={killStreakConfig}
              streakKillCount={streakKillCount}
              onAttack={handleAttack}
              onStatsChange={handleStatsChange}
              onMonsterKilled={handleMonsterKilled}
              onDeath={handleDeath}
              respawnSignal={respawnSignal}
            />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}
