"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { ArrowLeft, MousePointerClick, Swords, Heart, Zap, Coins, Flame, LogOut, ShieldHalf, Settings, RotateCcw, Maximize2 } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { Scene } from "@/components/world/scene";
import { DeathScreen } from "@/components/world/death-screen";
import { useCameraControls } from "@/components/world/use-camera-controls";
import type { PlayerStatsSnapshot } from "@/components/world/player";
import { useSoundManager } from "@/lib/sound-manager";
import { debugLog, debugWarn } from "@/lib/debug";
import { getEquippedDamage, formatDamage } from "@/lib/combat";
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
import type { CharacterConfig } from "@/lib/character-config";
import type { WorldSpawnConfig } from "@/lib/world-spawn-config";
import type { EquippedItem } from "@/lib/rarity-colors";
import { useRealtimeProfile } from "@/lib/use-realtime-profile";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import { WorldSettingsPanel } from "@/components/world/world-settings-panel";
import { loadWorldSettings, saveWorldSettings, type WorldSettings } from "@/lib/world-settings";
import { setActiveKeybinds } from "@/components/world/use-keyboard-controls";
import { MobileControls } from "@/components/world/mobile-controls";

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
  /** Admin Games tab setting (lib/world-session-config.ts) — was a bare
   * hardcoded `10` before; defaults to 10 here too only as a final
   * fallback in case a caller forgets to pass it. */
  disconnectCountdownSec?: number;
  /** Admin Games tab master switch — `false` makes attemptPvpHit (lib/
   * actions/pvp.ts) reject hits server-side regardless of what the client
   * does, so this prop alone is cosmetic-only (a cleaner UX than letting
   * the player swing at someone and have it just silently no-op
   * server-side); it doesn't need to be enforced client-side too. */
  pvpEnabled?: boolean;
  /** Admin-configured player/combat base stats (lib/character-config.ts)
   * — drives both the HUD's max-HP/Stamina bars here and Player.tsx's
   * actual physics/combat math, so both always agree on the same numbers. */
  characterConfig: CharacterConfig;
  /** Admin-configured monster spawn tuning (lib/world-spawn-config.ts). */
  spawnConfig: WorldSpawnConfig;
  isAdmin?: boolean;
  isModerator?: boolean;
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
      <div className="h-2.5 w-28 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10 sm:w-36">
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
  disconnectCountdownSec = 10,
  pvpEnabled = true,
  characterConfig,
  spawnConfig,
  isAdmin = false,
  isModerator = false,
}: WorldShellProps) {
  const [credits, setCredits] = useState(initialCredits);
  useRealtimeProfile((row) => {
    if (typeof row.credits === "number") setCredits(row.credits);
  });
  const { currencyName, damageLabel } = useSiteConfig();
  const [worldSettings, setWorldSettings] = useState<WorldSettings>(() => loadWorldSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [attackFlash, setAttackFlash] = useState<"hit" | "miss" | null>(null);
  const [hp, setHp] = useState(characterConfig.playerMaxHp);
  const [maxHp, setMaxHp] = useState(characterConfig.playerMaxHp);
  const [stamina, setStamina] = useState(characterConfig.playerMaxStamina);
  const [maxStamina, setMaxStamina] = useState(characterConfig.playerMaxStamina);
  const [shieldHp, setShieldHp] = useState(0);
  const [shieldMaxHp, setShieldMaxHp] = useState(0);
  const [shieldRegenCooldown, setShieldRegenCooldown] = useState(0);
  const [shieldRegenCooldownDuration, setShieldRegenCooldownDuration] = useState(0);
  const [rewardPopups, setRewardPopups] = useState<RewardPopup[]>([]);
  const [damageTakenPopups, setDamageTakenPopups] = useState<DamageTakenPopup[]>([]);
  const [hurtFlash, setHurtFlash] = useState(false);
  const prevHpRef = useRef(characterConfig.playerMaxHp);
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
  // Seconds left in the "leaving the World" countdown, or null while no
  // disconnect is pending (this alone is the single source of truth for
  // "is a disconnect in progress" — no separate boolean to keep in sync).
  // The player stays fully playable/attackable the entire time on purpose
  // — surviving the full countdown (not just clicking the button) is what
  // actually secures a pending kill-streak, see handleDisconnect's doc
  // comment below.
  const [disconnectCountdown, setDisconnectCountdown] = useState<number | null>(null);
  // Shown once the countdown actually completes and the streak is
  // committed — a deliberate info screen the player has to click through
  // (not a toast that fades on its own), so what was just secured is
  // actually seen, not missed in the instant before navigating away.
  const [disconnectSummary, setDisconnectSummary] = useState<{ securedCr: number; killCount: number } | null>(
    null
  );
  const disconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mobile detection — runs only on the client so SSR never reads window/navigator.
  const [isMobile, setIsMobile] = useState(false);
  const [showPortraitGate, setShowPortraitGate] = useState(false);
  useEffect(() => {
    const checkMobile = () => navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
    const checkPortrait = () => checkMobile() && window.matchMedia("(orientation: portrait)").matches;
    setIsMobile(checkMobile());
    setShowPortraitGate(checkPortrait());
    const onResize = () => setShowPortraitGate(checkPortrait());
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  // Track fullscreen state so the button hides once active
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Portal must only mount client-side (createPortal needs document.body)
  const [portalMounted, setPortalMounted] = useState(false);
  // iOS doesn't support requestFullscreen — dismiss after scroll-trick tap
  const [iosDismissed, setIosDismissed] = useState(false);
  useEffect(() => { setPortalMounted(true); }, []);
  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(
        !!document.fullscreenElement ||
        !!(document as unknown as Record<string, unknown>)["webkitFullscreenElement"]
      );
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  // Exit fullscreen when navigating away
  useEffect(() => {
    return () => {
      if (
        document.fullscreenElement ||
        (document as unknown as Record<string, unknown>)["webkitFullscreenElement"]
      ) {
        document.exitFullscreen?.().catch(() => {});
      }
    };
  }, []);

  // iOS Safari scroll-trick: scroll 1px so the URL bar retracts.
  // On iOS, requestFullscreen is blocked; scrolling is the only option.
  // On Android this is harmless — Chrome will use the fullscreen button.
  useEffect(() => {
    if (!isMobile || showPortraitGate) return;
    const html = document.documentElement;
    const prev = html.style.minHeight;
    html.style.minHeight = 'calc(100% + 56px)';
    const t = setTimeout(() => window.scrollTo(0, 1), 80);
    return () => {
      clearTimeout(t);
      html.style.minHeight = prev;
      window.scrollTo(0, 0);
    };
  }, [isMobile, showPortraitGate]);

  const cancelDisconnectCountdown = useCallback(() => {
    if (disconnectTimeoutRef.current) {
      clearTimeout(disconnectTimeoutRef.current);
      disconnectTimeoutRef.current = null;
    }
    setDisconnectCountdown(null);
  }, []);

  // "Latest value" refs, synced via their own effect (never written during
  // render itself — the React Compiler this project uses flags that
  // outright) — read inside the countdown effect further below *instead
  // of* depending on these values directly. This is the actual fix for
  // the "10s feels like 20s" bug: pendingStreakCr/streakKillCount
  // genuinely change mid-countdown (the player can still kill things
  // while it counts down, on purpose), and an earlier version listed them
  // as effect dependencies — so every kill during the countdown re-ran
  // the effect, which tore down and rescheduled that tick's setTimeout
  // from 0ms again, silently stretching out however long was actually
  // left. Reading these via ref means the countdown effect's dependency
  // array only ever needs `disconnectCountdown` itself, so one tick is
  // always exactly 1000ms, full stop, regardless of anything else
  // changing in this component while it's running.
  const cancelDisconnectCountdownRef = useRef(cancelDisconnectCountdown);
  const cameraControlsRef = useRef(cameraControls);
  const pendingStreakCrRef = useRef(pendingStreakCr);
  const streakKillCountRef = useRef(streakKillCount);
  useEffect(() => {
    cancelDisconnectCountdownRef.current = cancelDisconnectCountdown;
    cameraControlsRef.current = cameraControls;
    pendingStreakCrRef.current = pendingStreakCr;
    streakKillCountRef.current = streakKillCount;
  }, [cancelDisconnectCountdown, cameraControls, pendingStreakCr, streakKillCount]);

  const weapon = equippedByCategory.weapon_cosmetic;
  const weaponDamage = getEquippedDamage(weapon, characterConfig.fistDamage);
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
    (stats: PlayerStatsSnapshot) => {
      if (stats.hp < prevHpRef.current) {
        const lost = Math.round(prevHpRef.current - stats.hp);
        sound.error();
        setHurtFlash(true);
        setTimeout(() => setHurtFlash(false), 220);
        const id = ++damageTakenSeq;
        setDamageTakenPopups((curr) => [...curr, { id, amount: lost }]);
        setTimeout(() => setDamageTakenPopups((curr) => curr.filter((p) => p.id !== id)), 700);
      }
      prevHpRef.current = stats.hp;
      setHp(stats.hp);
      setMaxHp(stats.maxHp);
      setStamina(stats.stamina);
      setMaxStamina(stats.maxStamina);
      setShieldHp(stats.shieldHp);
      setShieldMaxHp(stats.shieldMaxHp);
      setShieldRegenCooldown(stats.shieldRegenCooldown);
      setShieldRegenCooldownDuration(stats.shieldRegenCooldownDuration);
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
    // Dying mid-countdown forfeits exactly like any other death — but a
    // disconnect that was already in flight must not *also* go on to
    // commit/redirect once the timer would've otherwise hit 0, which is
    // exactly what forfeitStreakOnDeath() below already just did to the
    // same pending CR this would try to commit a few seconds later.
    cancelDisconnectCountdown();
    // Release the pointer lock immediately — without this, the death
    // screen's buttons render but stay unclickable (cursor still hidden/
    // captured) until the player presses Escape themselves first, which
    // reads as "I died and now I'm just stuck looking at a frozen screen".
    cameraControls.releaseLock();
    forfeitStreakOnDeath().then((res) => {
      setDeathStats({ forfeitedCr: res.forfeitedCr ?? 0, forfeitedKillCount: res.forfeitedKillCount ?? 0 });
      setPendingStreakCr(0);
      setStreakKillCount(0);
    });
  }, [cancelDisconnectCountdown, cameraControls]);

  const handleRespawn = useCallback(() => {
    sound.click();
    setDeathStats(null);
    setRespawnSignal((s) => s + 1);
  }, [sound]);

  // The death screen's other option — leave straight from there instead
  // of having to respawn first just to reach the "Zurück" link. No
  // countdown needed here (unlike the Disconnect button): dying already
  // forfeited whatever streak was pending (handleDeath's
  // forfeitStreakOnDeath call), so there's nothing left to secure by
  // staying — leaving immediately costs nothing further.
  const handleLeaveAfterDeath = useCallback(() => {
    sound.click();
    router.push("/");
  }, [sound, router]);

  const handleConfirmDisconnectSummary = useCallback(() => {
    sound.click();
    router.push("/");
  }, [sound, router]);

  // The "Disconnect" button — the only sanctioned way to actually cash out
  // a pending kill-streak. Closing the tab or clicking the plain "Zurück"
  // link instead leaves it uncommitted, which the next enterWorld() call
  // (this page's own mount effect, on whichever session comes next) wipes
  // for free.
  //
  // Clicking it no longer commits/redirects immediately — it starts a
  // visible 10s countdown banner instead, while the World stays fully
  // playable (movement/combat keep working exactly as normal, nothing
  // here pauses or invulnerable-flags the player). Surviving the full 10s
  // is what actually triggers the real commitStreakCr()+redirect at the
  // bottom of the effect below; dying before then forfeits the streak the
  // normal way instead (handleDeath's cancelDisconnectCountdown call).
  // Clicking the button again while it's counting down cancels it (stay in
  // the World, nothing committed) — backing out doesn't shortcut the risk,
  // it just means never having taken it.
  const handleDisconnect = useCallback(() => {
    sound.click();
    if (disconnectCountdown !== null) {
      cancelDisconnectCountdown();
      return;
    }
    setDisconnectCountdown(disconnectCountdownSec);
  }, [sound, disconnectCountdown, cancelDisconnectCountdown, disconnectCountdownSec]);

  // Standard "one-shot setTimeout per tick" countdown: each render of this
  // effect (one per second, since the timeout's only job is to decrement
  // the state that this effect itself depends on) schedules exactly one
  // further tick and cleans up after itself — never an actual *repeating*
  // timer left running across ticks, so cancelDisconnectCountdown clearing
  // `disconnectTimeoutRef.current` always has at most one real timeout to
  // clear, never a stale one from an earlier tick.
  //
  // Dependency array is *only* `disconnectCountdown` — everything else
  // this effect needs is read through the `*Ref` mirrors declared above
  // instead of depending on the values directly, specifically so this
  // effect doesn't re-run (tearing down and rescheduling the in-flight
  // 1000ms timeout from 0 again) just because the player killed something
  // and `pendingStreakCr`/`streakKillCount` ticked up mid-countdown. That
  // was the actual "10s feels like 20s" bug: each such re-run silently
  // stretched out whatever time was actually left on the current tick.
  useEffect(() => {
    if (disconnectCountdown === null) return;
    if (disconnectCountdown <= 0) {
      commitStreakCr().then((res) => {
        if (!res.success) {
          debugWarn("World", "commitStreakCr failed", res.error);
          cancelDisconnectCountdownRef.current();
          return;
        }
        // Shows the summary popup instead of navigating immediately — see
        // its render block below for why this is an info screen the
        // player has to actively dismiss, not a toast that disappears on
        // its own. Captured before the reset below zeroes them. Same
        // "release the lock so the button is immediately clickable"
        // reasoning as handleDeath's cameraControls.releaseLock() call.
        cameraControlsRef.current.releaseLock();
        setDisconnectSummary({ securedCr: pendingStreakCrRef.current, killCount: streakKillCountRef.current });
        setDisconnectCountdown(null);
        setPendingStreakCr(0);
        setStreakKillCount(0);
      });
      return;
    }
    disconnectTimeoutRef.current = setTimeout(() => {
      setDisconnectCountdown((s) => (s === null ? null : s - 1));
    }, 1000);
    return () => {
      if (disconnectTimeoutRef.current) clearTimeout(disconnectTimeoutRef.current);
    };
  }, [disconnectCountdown]);

  const handleFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else {
      const webkit = (el as unknown as Record<string, unknown>)["webkitRequestFullscreen"];
      if (typeof webkit === "function") {
        (webkit as () => void).call(el);
      } else {
        // iOS Safari: scroll trick — extends page height so scrollTo(0,1) retracts URL bar
        el.style.minHeight = "calc(100% + 56px)";
        setTimeout(() => window.scrollTo(0, 1), 80);
      }
    }
    setIosDismissed(true);
  }, []);

  function handleSettingsChange(s: WorldSettings) {
    setWorldSettings(s);
    cameraControls.state.current.sensitivityXMult = s.sensitivityX;
    cameraControls.state.current.sensitivityYMult = s.sensitivityY;
    sound.setVolume(s.volume);
    setActiveKeybinds(s.keybinds);
    saveWorldSettings(s);
  }

  // Apply saved settings on first mount.
  useEffect(() => {
    cameraControls.state.current.sensitivityXMult = worldSettings.sensitivityX;
    cameraControls.state.current.sensitivityYMult = worldSettings.sensitivityY;
    sound.setVolume(worldSettings.volume);
    setActiveKeybinds(worldSettings.keybinds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tab toggles the settings panel without releasing / losing pointer lock
  // on close — pressing Tab again re-opens it. While the panel is open,
  // pointer lock is released so the sliders are clickable; re-engage by
  // closing the panel and clicking "Klicken zum Spielen".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      e.preventDefault();
      setSettingsOpen((prev) => {
        if (!prev) cameraControls.releaseLock();
        return !prev;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cameraControls]);

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
  // `h-dvh` on this component's own root sidesteps the whole ancestor
  // chain instead of trying to fix `min-h-0` at every level above it.
  // `dvh` (dynamic viewport height) correctly shrinks when the mobile browser
  // URL bar is visible, preventing overflow and the bar from sitting over the canvas.
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
    <div className={isMobile && !showPortraitGate ? "fixed inset-0 z-40 bg-black" : "flex h-dvh flex-col"}>
      {/* Portrait-mode gate — only shown on touch devices in portrait */}
      {showPortraitGate && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 bg-black/95 px-6 text-center backdrop-blur">
          <RotateCcw className="h-16 w-16 animate-spin text-purple-400" style={{ animationDuration: "3s" }} />
          <div>
            <h2 className="text-2xl font-extrabold text-white">Gerät drehen</h2>
            <p className="mt-2 text-sm text-zinc-400">Die 3D-Welt funktioniert nur im Querformat.</p>
          </div>
        </div>
      )}

      {/* TopBar — hidden on mobile landscape so the full screen is usable */}
      {(!isMobile || showPortraitGate) && (
        <TopBar
          credits={credits}
          streakDays={streakDays}
          inventoryCount={inventoryCount}
          onCreditsChange={setCredits}
          isAdmin={isAdmin}
          isModerator={isModerator}
        />
      )}

      <div
        ref={canvasWrapRef}
        className={isMobile && !showPortraitGate ? "absolute inset-0" : "relative min-h-0 flex-1"}
      >

        {/* Settings button — only visible in ESC/pause mode, not during active play */}
        {!cameraControls.locked && (
          <button
            onClick={() => setSettingsOpen(true)}
            title="Einstellungen (Tab)"
            className="absolute top-4 right-4 z-20 flex items-center gap-2 rounded-xl border border-white/20 bg-black/70 px-4 py-2.5 text-sm font-semibold text-zinc-200 backdrop-blur transition-all hover:border-purple-400/50 hover:bg-black/80 hover:text-white hover:shadow-[0_0_16px_rgba(147,51,234,0.35)]"
          >
            <Settings className="h-4 w-4 text-purple-400" />
            Einstellungen
          </button>
        )}

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
              enters the World (lib/actions/kill-streak.ts' enterWorld()).
              Never `disabled` during the countdown — clicking again while
              it's running is exactly how you cancel it (handleDisconnect's
              own doc comment), so it has to stay clickable the whole time. */}
          <button
            onMouseEnter={sound.hover}
            onClick={handleDisconnect}
            title={
              disconnectCountdown !== null
                ? "Abbrechen — im Spiel bleiben, nichts wird gesichert"
                : pendingStreakCr > 0
                  ? `Sichert ${pendingStreakCr.toLocaleString("de-DE")} ${currencyName} Kill-Streak-Guthaben`
                  : "Keine offene Kill-Streak"
            }
            className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold backdrop-blur transition-colors ${
              disconnectCountdown !== null
                ? "border-amber-400/40 bg-amber-500/15 text-amber-300 hover:border-amber-400/70"
                : "border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400/60"
            }`}
          >
            <LogOut className="h-4 w-4" />
            {disconnectCountdown !== null ? `Abbrechen (${disconnectCountdown}s)` : "Disconnect"}
          </button>
        </div>

        {/* Disconnect countdown banner — top-center, impossible to miss,
            since surviving the full countdown (not just having clicked the
            button) is what actually secures the pending streak. The World
            stays fully playable underneath this the entire time; nothing
            here pauses input or grants invulnerability. */}
        {disconnectCountdown !== null && (
          <div className="pointer-events-none absolute top-4 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1 rounded-xl border border-amber-400/50 bg-black/70 px-5 py-2.5 text-center backdrop-blur">
            <span className="text-sm font-bold text-amber-300">
              Welt wird in {disconnectCountdown}s verlassen
            </span>
            <span className="text-xs text-zinc-400">Überlebe, um die Kill-Streak zu sichern!</span>
          </div>
        )}

        {/* Disconnect summary — a real info screen the player has to
            click through (not a toast that fades on its own), shown once
            the countdown above actually completes and commitStreakCr()
            has succeeded server-side, right before the redirect away from
            /world. */}
        {disconnectSummary && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-black/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_40px_rgba(16,185,129,0.4)]">
                <LogOut className="h-8 w-8 text-emerald-400" />
              </span>
              <h2 className="glow-text text-3xl font-extrabold text-emerald-300">Welt verlassen</h2>
            </div>

            {disconnectSummary.killCount > 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] px-6 py-4">
                <p className="text-sm text-zinc-400">Gesicherte Kill-Streak</p>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 text-lg font-bold text-amber-300">
                    <Coins className="h-4 w-4" />+{disconnectSummary.securedCr.toLocaleString("de-DE")} {currencyName}
                  </span>
                  <span className="flex items-center gap-1.5 text-lg font-bold text-orange-300">
                    <Flame className="h-4 w-4" />
                    {disconnectSummary.killCount} Kills
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">Keine offene Kill-Streak gesichert.</p>
            )}

            <button
              onClick={handleConfirmDisconnectSummary}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-6 py-3 text-base font-bold text-white shadow-[0_0_20px_rgba(147,51,234,0.5)] transition-colors hover:bg-purple-500"
            >
              <ArrowLeft className="h-5 w-5" />
              Zurück zur Startseite
            </button>
          </div>
        )}

        {/* HP/Stamina HUD — top-left, under the back link. Stamina is
            intentionally only drained by sprinting (lib/combat.ts) — never
            by attacking, and jumping no longer costs stamina at all (just
            a flat per-jump cooldown instead, see JUMP_COOLDOWN_SEC). */}
        <div className="absolute top-16 left-4 z-10 flex flex-col gap-1.5 rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 backdrop-blur" style={{ maxWidth: "calc(45vw - 1rem)" }}>
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
          {/* Shield bar — only shown when a functioning shield_cosmetic is
              actually equipped (shieldMaxHp > 0). While it's broken
              (shieldHp <= 0 and the regen cooldown is still counting down),
              the bar itself swaps for a "charging back up" readout instead
              of just sitting empty with no explanation of when it returns. */}
          {shieldMaxHp > 0 &&
            (shieldHp > 0 || shieldRegenCooldown <= 0 ? (
              <StatBar
                icon={<ShieldHalf className="h-4 w-4 text-cyan-300" />}
                value={shieldHp}
                max={shieldMaxHp}
                colorClass="bg-gradient-to-r from-cyan-600 to-cyan-300"
                label="Schild"
              />
            ) : (
              <div className="flex items-center gap-2">
                <ShieldHalf className="h-4 w-4 animate-pulse text-cyan-300/50" />
                <div className="relative h-2.5 w-36 overflow-hidden rounded-full bg-black/50 ring-1 ring-cyan-400/20">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-900/60 to-cyan-500/60 transition-[width] duration-150"
                    style={{
                      width: `${
                        shieldRegenCooldownDuration > 0
                          ? 100 - (shieldRegenCooldown / shieldRegenCooldownDuration) * 100
                          : 0
                      }%`,
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-[9px] font-bold tracking-wide text-cyan-100/90">
                    SCHILD LÄDT {Math.max(0, Math.ceil(shieldRegenCooldown))}s
                  </div>
                </div>
              </div>
            ))}
          {streakKillCount > 0 && (
            <div className="flex items-center gap-1.5 border-t border-white/10 pt-1.5 text-xs">
              <Flame className="h-3.5 w-3.5 text-orange-400" />
              <span className="font-bold text-orange-300">{streakKillCount}er Streak</span>
              <span className="text-zinc-400">·</span>
              <Coins className="h-3.5 w-3.5 text-amber-400" />
              <span className="font-bold text-amber-300">{pendingStreakCr.toLocaleString("de-DE")} {currencyName}</span>
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

        {/* Bottom-center weapon chip — desktop only (hidden on mobile to avoid
            overlapping the joystick/action-button zone; in-world floating
            damage numbers give sufficient hit feedback there). */}
        {!isMobile && (
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
            <span className="font-bold text-emerald-300">{formatDamage(weaponDamage, damageLabel)}</span>
          </div>
        )}

        {/* Monster-kill reward toasts — top-center, separate from the
            weapon HUD so a kill reward is never confused with "what a
            punch deals". */}
        <div className="pointer-events-none absolute top-4 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1">
          {rewardPopups.map((p) => (
            <span
              key={p.id}
              className="animate-[float-up_1.3s_ease-out_forwards] flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-500/15 px-3 py-1 text-sm font-bold text-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.4)]"
            >
              <Coins className="h-3.5 w-3.5" />+{p.amount.toLocaleString("de-DE")} {currencyName}
            </span>
          ))}
        </div>

        {!cameraControls.locked && !isMobile && !deathStats && !disconnectSummary && (
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

        {/* Mobile on-screen controls — only rendered on touch devices when actively playing */}
        {isMobile && !deathStats && !disconnectSummary && (
          <MobileControls cameraState={cameraControls.state} />
        )}

        {deathStats && (
          <DeathScreen
            forfeitedCr={deathStats.forfeitedCr}
            forfeitedKillCount={deathStats.forfeitedKillCount}
            onRespawn={handleRespawn}
            onLeave={handleLeaveAfterDeath}
          />
        )}

        {settingsOpen && (
          <WorldSettingsPanel
            settings={worldSettings}
            onChange={handleSettingsChange}
            onClose={() => setSettingsOpen(false)}
            userId={userId}
            username={username}
          />
        )}

        <Canvas
          // r3f's bare `shadows` shorthand defaults to PCFSoftShadowMap —
          // this three.js version has deprecated that type outright (it
          // logs a WebGLShadowMap warning on every single shadow render
          // pass, not just once, hence the console getting spammed every
          // frame) and silently substitutes PCFShadowMap anyway. Setting
          // the type explicitly gets the exact same shadow renderer
          // without ever tripping the deprecation warning in the first
          // place.
          shadows={{ type: THREE.PCFShadowMap }}
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
              characterConfig={characterConfig}
              spawnConfig={spawnConfig}
              streakKillCount={streakKillCount}
              onAttack={handleAttack}
              onStatsChange={handleStatsChange}
              onMonsterKilled={handleMonsterKilled}
              onDeath={handleDeath}
              respawnSignal={respawnSignal}
              mobileMode={isMobile}
              pvpEnabled={pvpEnabled}
            />
          </Suspense>
        </Canvas>
      </div>

      {/* Fullscreen portal — lives in document.body, completely outside the canvas DOM tree.
          No canvas pointer-event handler, R3F listener, or MobileControls touch handler
          can ever intercept a tap on this element. */}
      {portalMounted && isMobile && !showPortraitGate && !isFullscreen && !iosDismissed &&
        createPortal(
          <div
            onClick={handleFullscreen}
            className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-black/50"
            style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent", cursor: "pointer" }}
          >
            <div className="pointer-events-none flex flex-col items-center gap-2">
              <div className="flex animate-pulse items-center gap-2 rounded-2xl border border-white/30 bg-black/80 px-6 py-3.5 text-[15px] font-bold text-white shadow-2xl backdrop-blur-sm">
                <Maximize2 className="h-5 w-5" />
                Vollbild aktivieren
              </div>
              <span className="text-[11px] text-white/40">Tippe irgendwo zum Fortfahren</span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setIosDismissed(true); }}
              className="absolute bottom-7 right-5 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs text-white/50"
              style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
            >
              Nicht jetzt
            </button>
          </div>,
          document.body
        )
      }
    </div>
  );
}
