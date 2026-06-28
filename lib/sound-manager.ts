"use client";

import type { SoundConfig } from "@/lib/sound-config";
import { reportAudioIssue } from "@/lib/actions/audio-log";

export type FxSound =
  // UI
  | "win" | "ultraWin" | "click" | "error" | "flip" | "save"
  | "modalOpen" | "modalClose" | "tabSwitch" | "toggleOn" | "toggleOff"
  // Level & XP
  | "levelUp" | "xpGain" | "abilityEquip" | "achievementUnlock"
  // Battle Pass
  | "questComplete" | "bpTierClaim" | "bpUnlock" | "bpEliteUnlock"
  // World / Combat
  | "monsterKill" | "pvpHit" | "pvpKill"
  | "playerDeath" | "playerRespawn" | "mineCollect" | "shieldBlock" | "itemPickup"
  // Shop & Economy
  | "purchaseSuccess" | "purchaseFail" | "shopPurchase" | "upgradeSuccess"
  | "itemEquip" | "itemUnequip" | "auctionBid" | "auctionWin"
  // Games
  | "streakClaim" | "notificationPing"
  | "caseOpen" | "caseReveal"
  | "plinkoLand" | "snakeEat" | "snakeDie" | "donFlip"
  // Chat
  | "messageReceive" | "messageSend" | "mentionReceive" | "chatPing"
  // System
  | "ticketOpen" | "badgeEarned";

// "hit" is an interrupt channel, not a queued Fx one, on purpose — sustained
// melee (clicking as fast as ATTACK_COOLDOWN allows) needs every landed hit
// to play immediately, the same way tick/hover never queue. Routing it
// through the FIFO `fx` queue instead would make hit sounds visibly lag
// behind the swings during any fight longer than one punch.
export type InterruptSound = "tick" | "hover" | "hit";

const DEFAULT_FX_SRC: Record<FxSound, string> = {
  // UI
  win:              "/sounds/win.wav",
  ultraWin:         "/sounds/ultra-win.wav",
  click:            "/sounds/click.wav",
  error:            "/sounds/error.wav",
  flip:             "/sounds/flip.wav",
  save:             "/sounds/save.wav",
  modalOpen:        "/sounds/click.wav",
  modalClose:       "/sounds/click.wav",
  tabSwitch:        "/sounds/hover.wav",
  toggleOn:         "/sounds/save.wav",
  toggleOff:        "/sounds/hover.wav",
  // Level & XP
  levelUp:          "/sounds/win.wav",
  xpGain:           "/sounds/tick.wav",
  abilityEquip:     "/sounds/save.wav",
  achievementUnlock:"/sounds/win.wav",
  // Battle Pass
  questComplete:    "/sounds/win.wav",
  bpTierClaim:      "/sounds/save.wav",
  bpUnlock:         "/sounds/ultra-win.wav",
  bpEliteUnlock:    "/sounds/ultra-win.wav",
  // World
  monsterKill:      "/sounds/hit.wav",
  pvpHit:           "/sounds/hit.wav",
  pvpKill:          "/sounds/win.wav",
  playerDeath:      "/sounds/error.wav",
  playerRespawn:    "/sounds/save.wav",
  mineCollect:      "/sounds/tick.wav",
  shieldBlock:      "/sounds/hit.wav",
  itemPickup:       "/sounds/save.wav",
  // Shop
  purchaseSuccess:  "/sounds/save.wav",
  purchaseFail:     "/sounds/error.wav",
  shopPurchase:     "/sounds/save.wav",
  upgradeSuccess:   "/sounds/win.wav",
  itemEquip:        "/sounds/save.wav",
  itemUnequip:      "/sounds/hover.wav",
  auctionBid:       "/sounds/flip.wav",
  auctionWin:       "/sounds/win.wav",
  // Games
  streakClaim:      "/sounds/win.wav",
  notificationPing: "/sounds/tick.wav",
  caseOpen:         "/sounds/flip.wav",
  caseReveal:       "/sounds/ultra-win.wav",
  plinkoLand:       "/sounds/hit.wav",
  snakeEat:         "/sounds/tick.wav",
  snakeDie:         "/sounds/error.wav",
  donFlip:          "/sounds/flip.wav",
  // Chat
  messageReceive:   "/sounds/hover.wav",
  messageSend:      "/sounds/click.wav",
  mentionReceive:   "/sounds/win.wav",
  chatPing:         "/sounds/hover.wav",
  // System
  ticketOpen:       "/sounds/save.wav",
  badgeEarned:      "/sounds/win.wav",
};

const DEFAULT_INTERRUPT_SRC: Record<InterruptSound, string> = {
  tick: "/sounds/tick.wav",
  hover: "/sounds/hover.wav",
  hit: "/sounds/hit.wav",
};

const DEFAULT_FX_VOL: Record<FxSound, number> = {
  // UI
  win: 0.35, ultraWin: 0.35, click: 0.18, error: 0.35, flip: 0.35, save: 0.20,
  modalOpen: 0.12, modalClose: 0.10, tabSwitch: 0.12, toggleOn: 0.14, toggleOff: 0.10,
  // Level & XP
  levelUp: 0.40, xpGain: 0.15, abilityEquip: 0.25, achievementUnlock: 0.42,
  // Battle Pass
  questComplete: 0.38, bpTierClaim: 0.32, bpUnlock: 0.38, bpEliteUnlock: 0.42,
  // World
  monsterKill: 0.22, pvpHit: 0.30, pvpKill: 0.35,
  playerDeath: 0.35, playerRespawn: 0.22, mineCollect: 0.18, shieldBlock: 0.25, itemPickup: 0.20,
  // Shop
  purchaseSuccess: 0.28, purchaseFail: 0.30, shopPurchase: 0.28, upgradeSuccess: 0.35,
  itemEquip: 0.25, itemUnequip: 0.15, auctionBid: 0.28, auctionWin: 0.40,
  // Games
  streakClaim: 0.38, notificationPing: 0.18,
  caseOpen: 0.25, caseReveal: 0.40,
  plinkoLand: 0.22, snakeEat: 0.20, snakeDie: 0.28, donFlip: 0.32,
  // Chat
  messageReceive: 0.12, messageSend: 0.15, mentionReceive: 0.30, chatPing: 0.20,
  // System
  ticketOpen: 0.18, badgeEarned: 0.38,
};

const DEFAULT_INTERRUPT_VOL: Record<InterruptSound, number> = {
  tick: 0.18, hover: 0.10, hit: 0.28,
};

const HOVER_THROTTLE_MS = 70;

/**
 * App-wide audio singleton.
 *
 * - `tick`/`hover`/`hit` are "interrupt" channels: each gets a single reusable
 *   <audio> element that restarts on every call. They must NEVER queue.
 * - Everything else goes through a real FIFO queue on the `fx` channel so
 *   two effects never overlap each other.
 *
 * Missing/unplayable files fail silently — sound is cosmetic and must never
 * break the UI.
 */
class SoundManager {
  private interruptAudio = new Map<InterruptSound, HTMLAudioElement>();
  private fxPool = new Map<FxSound, HTMLAudioElement>();
  private queue: FxSound[] = [];
  private playing = false;
  private lastHoverAt = 0;
  private _volume = 1;
  private _config: SoundConfig | null = null;
  private _disabledEvents = new Set<string>();
  // Event keys we've already reported as broken, so a missing/unplayable sound
  // is logged to the admin Debug Log exactly ONCE instead of on every trigger.
  private _reportedIssues = new Set<string>();

  /** Log a missing/unplayable sound once per event key (best-effort, never throws). */
  private reportIssue(key: string, src: string, reason: string): void {
    if (this._reportedIssues.has(key)) return;
    this._reportedIssues.add(key);
    try {
      void reportAudioIssue({
        scope: "audio:sfx",
        message: `Sound „${key}" konnte nicht abgespielt werden (${reason}).`,
        detail: `Datei: ${src}`,
        context: { event: key, src, reason },
      });
    } catch { /* logging must never break audio */ }
  }

  loadConfig(config: SoundConfig): void {
    this._config = config;
    this.interruptAudio.clear();
    this.fxPool.clear();
    this._disabledEvents.clear();
    // New config may point at fixed files → allow issues to be re-reported.
    this._reportedIssues.clear();
    for (const [key, val] of Object.entries(config)) {
      if (!val.enabled) this._disabledEvents.add(key);
    }
  }

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    for (const [name, audio] of this.interruptAudio) {
      const base = this._config?.[name as InterruptSound]?.volume ?? DEFAULT_INTERRUPT_VOL[name as InterruptSound] ?? 0.18;
      audio.volume = base * this._volume;
    }
    for (const [name, audio] of this.fxPool) {
      const base = this._config?.[name as FxSound]?.volume ?? DEFAULT_FX_VOL[name as FxSound] ?? 0.35;
      audio.volume = base * this._volume;
    }
  }

  private getInterruptAudio(name: InterruptSound): HTMLAudioElement | null {
    if (typeof window === "undefined") return null;
    let audio = this.interruptAudio.get(name);
    if (!audio) {
      const src = this._config?.[name]?.file ?? DEFAULT_INTERRUPT_SRC[name];
      if (src === "/sounds/none" || src === "none") return null;
      audio = new Audio(src);
      const vol = this._config?.[name]?.volume ?? DEFAULT_INTERRUPT_VOL[name];
      audio.volume = vol * this._volume;
      this.interruptAudio.set(name, audio);
    }
    return audio;
  }

  private getFxAudio(name: FxSound): HTMLAudioElement | null {
    if (typeof window === "undefined") return null;
    let audio = this.fxPool.get(name);
    if (!audio) {
      const src = this._config?.[name]?.file ?? DEFAULT_FX_SRC[name];
      if (src === "/sounds/none" || src === "none") return null;
      audio = new Audio(src);
      const vol = this._config?.[name]?.volume ?? DEFAULT_FX_VOL[name];
      audio.volume = vol * this._volume;
      this.fxPool.set(name, audio);
    }
    return audio;
  }

  tick(): void { this.playInterrupt("tick"); }
  hover(): void {
    const now = Date.now();
    if (now - this.lastHoverAt < HOVER_THROTTLE_MS) return;
    this.lastHoverAt = now;
    this.playInterrupt("hover");
  }
  hit(): void { this.playInterrupt("hit"); }

  private playInterrupt(name: InterruptSound): void {
    if (this._disabledEvents.has(name)) return;
    try {
      const audio = this.getInterruptAudio(name);
      if (!audio) return;
      audio.currentTime = 0;
      void audio.play().catch((err: unknown) => {
        // Autoplay-gesture rejections are normal (NotAllowedError) and not a
        // broken file — only report genuine load/decode failures.
        const reason = err instanceof Error ? err.name : "unknown";
        if (reason !== "NotAllowedError" && reason !== "AbortError") {
          const src = this._config?.[name]?.file ?? DEFAULT_INTERRUPT_SRC[name];
          this.reportIssue(name, src, reason);
        }
      });
    } catch { /* Web Audio unavailable/blocked — purely cosmetic */ }
  }

  play(name: FxSound): void {
    if (this._disabledEvents.has(name)) return;
    this.queue.push(name);
    if (!this.playing) void this.drainQueue();
  }

  private async drainQueue(): Promise<void> {
    this.playing = true;
    while (this.queue.length > 0) {
      const name = this.queue.shift()!;
      await this.playOne(name);
    }
    this.playing = false;
  }

  private playOne(name: FxSound): Promise<void> {
    return new Promise((resolve) => {
      try {
        const audio = this.getFxAudio(name);
        if (!audio) return resolve();
        const done = () => {
          audio.removeEventListener("ended", done);
          audio.removeEventListener("error", onError);
          resolve();
        };
        const onError = () => {
          const src = this._config?.[name]?.file ?? DEFAULT_FX_SRC[name];
          this.reportIssue(name, src, "load/decode error");
          done();
        };
        audio.currentTime = 0;
        audio.addEventListener("ended", done);
        audio.addEventListener("error", onError);
        audio.play().catch((err: unknown) => {
          const reason = err instanceof Error ? err.name : "unknown";
          if (reason !== "NotAllowedError" && reason !== "AbortError") {
            const src = this._config?.[name]?.file ?? DEFAULT_FX_SRC[name];
            this.reportIssue(name, src, reason);
          }
          resolve();
        });
        setTimeout(done, 4000);
      } catch { resolve(); }
    });
  }
}

const soundManager = new SoundManager();

export function useSoundManager() {
  return {
    // Interrupt channels
    tick: () => soundManager.tick(),
    hover: () => soundManager.hover(),
    hit: () => soundManager.hit(),
    // UI
    win:              () => soundManager.play("win"),
    ultraWin:         () => soundManager.play("ultraWin"),
    click:            () => soundManager.play("click"),
    error:            () => soundManager.play("error"),
    flip:             () => soundManager.play("flip"),
    save:             () => soundManager.play("save"),
    modalOpen:        () => soundManager.play("modalOpen"),
    modalClose:       () => soundManager.play("modalClose"),
    tabSwitch:        () => soundManager.play("tabSwitch"),
    toggleOn:         () => soundManager.play("toggleOn"),
    toggleOff:        () => soundManager.play("toggleOff"),
    // Level & XP
    levelUp:          () => soundManager.play("levelUp"),
    xpGain:           () => soundManager.play("xpGain"),
    abilityEquip:     () => soundManager.play("abilityEquip"),
    achievementUnlock:() => soundManager.play("achievementUnlock"),
    // Battle Pass
    questComplete:    () => soundManager.play("questComplete"),
    bpTierClaim:      () => soundManager.play("bpTierClaim"),
    bpUnlock:         () => soundManager.play("bpUnlock"),
    bpEliteUnlock:    () => soundManager.play("bpEliteUnlock"),
    // World
    monsterKill:      () => soundManager.play("monsterKill"),
    pvpHit:           () => soundManager.play("pvpHit"),
    pvpKill:          () => soundManager.play("pvpKill"),
    playerDeath:      () => soundManager.play("playerDeath"),
    playerRespawn:    () => soundManager.play("playerRespawn"),
    mineCollect:      () => soundManager.play("mineCollect"),
    shieldBlock:      () => soundManager.play("shieldBlock"),
    itemPickup:       () => soundManager.play("itemPickup"),
    // Shop & Economy
    purchaseSuccess:  () => soundManager.play("purchaseSuccess"),
    purchaseFail:     () => soundManager.play("purchaseFail"),
    shopPurchase:     () => soundManager.play("shopPurchase"),
    upgradeSuccess:   () => soundManager.play("upgradeSuccess"),
    itemEquip:        () => soundManager.play("itemEquip"),
    itemUnequip:      () => soundManager.play("itemUnequip"),
    auctionBid:       () => soundManager.play("auctionBid"),
    auctionWin:       () => soundManager.play("auctionWin"),
    // Games
    streakClaim:      () => soundManager.play("streakClaim"),
    notificationPing: () => soundManager.play("notificationPing"),
    caseOpen:         () => soundManager.play("caseOpen"),
    caseReveal:       () => soundManager.play("caseReveal"),
    plinkoLand:       () => soundManager.play("plinkoLand"),
    snakeEat:         () => soundManager.play("snakeEat"),
    snakeDie:         () => soundManager.play("snakeDie"),
    donFlip:          () => soundManager.play("donFlip"),
    // Chat
    messageReceive:   () => soundManager.play("messageReceive"),
    messageSend:      () => soundManager.play("messageSend"),
    mentionReceive:   () => soundManager.play("mentionReceive"),
    chatPing:         () => soundManager.play("chatPing"),
    // System
    ticketOpen:       () => soundManager.play("ticketOpen"),
    badgeEarned:      () => soundManager.play("badgeEarned"),
    // Config
    setVolume: (v: number) => soundManager.setVolume(v),
    loadConfig: (cfg: SoundConfig) => soundManager.loadConfig(cfg),
  };
}
