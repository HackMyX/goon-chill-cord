"use client";

import type { SoundConfig } from "@/lib/sound-config";

export type FxSound = "win" | "ultraWin" | "click" | "error" | "flip" | "save" | "levelUp" | "xpGain" | "abilityEquip";
// "hit" is an interrupt channel, not a queued Fx one, on purpose — sustained
// melee (clicking as fast as ATTACK_COOLDOWN allows) needs every landed hit
// to play immediately, the same way tick/hover never queue. Routing it
// through the FIFO `fx` queue instead would make hit sounds visibly lag
// behind the swings during any fight longer than one punch.
export type InterruptSound = "tick" | "hover" | "hit";

const DEFAULT_FX_SRC: Record<FxSound, string> = {
  win: "/sounds/win.wav",
  ultraWin: "/sounds/ultra-win.wav",
  click: "/sounds/click.wav",
  error: "/sounds/error.wav",
  flip: "/sounds/flip.wav",
  save: "/sounds/save.wav",
  levelUp: "/sounds/win.wav",
  xpGain: "/sounds/tick.wav",
  abilityEquip: "/sounds/save.wav",
};

const DEFAULT_INTERRUPT_SRC: Record<InterruptSound, string> = {
  tick: "/sounds/tick.wav",
  hover: "/sounds/hover.wav",
  hit: "/sounds/hit.wav",
};

const DEFAULT_FX_VOL: Record<FxSound, number> = {
  win: 0.35, ultraWin: 0.35, click: 0.18, error: 0.35, flip: 0.35, save: 0.20,
  levelUp: 0.40, xpGain: 0.15, abilityEquip: 0.25,
};

const DEFAULT_INTERRUPT_VOL: Record<InterruptSound, number> = {
  tick: 0.18, hover: 0.10, hit: 0.28,
};

const HOVER_THROTTLE_MS = 70;

/**
 * App-wide audio singleton.
 *
 * - `tick`/`hover` are "interrupt" channels: each gets a single reusable
 *   <audio> element that restarts on every call. They must NEVER queue —
 *   queuing would desync `tick` from the reel animation it follows
 *   frame-for-frame, and `hover` fires far too rapidly (mouse movement
 *   across many elements) to ever sit in a FIFO queue without becoming a
 *   delayed, garbled mess. `hover` is additionally throttled so fast mouse
 *   movement doesn't fire a sound burst.
 * - Everything else goes through a real FIFO queue on the `fx` channel so
 *   two effects (e.g. a win sound and a click) never overlap each other.
 *
 * Missing/unplayable files (dummy paths before real assets are dropped in)
 * fail silently — sound is cosmetic and must never break the UI.
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

  loadConfig(config: SoundConfig): void {
    this._config = config;
    // Clear cached audio elements so new files/volumes take effect
    this.interruptAudio.clear();
    this.fxPool.clear();
    // Rebuild disabled set
    this._disabledEvents.clear();
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
      audio = new Audio(src);
      const vol = this._config?.[name]?.volume ?? DEFAULT_INTERRUPT_VOL[name];
      // hover/tick fire constantly (mouse movement, reel spin) — kept quiet
      // so a session of moving the mouse around doesn't wear the ears down.
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
      audio = new Audio(src);
      const vol = this._config?.[name]?.volume ?? DEFAULT_FX_VOL[name];
      audio.volume = vol * this._volume;
      this.fxPool.set(name, audio);
    }
    return audio;
  }

  tick(): void {
    this.playInterrupt("tick");
  }

  hover(): void {
    const now = Date.now();
    if (now - this.lastHoverAt < HOVER_THROTTLE_MS) return;
    this.lastHoverAt = now;
    this.playInterrupt("hover");
  }

  hit(): void {
    this.playInterrupt("hit");
  }

  private playInterrupt(name: InterruptSound): void {
    if (this._disabledEvents.has(name)) return;
    try {
      const audio = this.getInterruptAudio(name);
      if (!audio) return;
      audio.currentTime = 0;
      void audio.play().catch(() => {});
    } catch {
      // Web Audio unavailable/blocked — ignore, purely cosmetic.
    }
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
          audio.removeEventListener("error", done);
          resolve();
        };

        audio.currentTime = 0;
        audio.addEventListener("ended", done);
        audio.addEventListener("error", done);

        audio.play().catch(() => resolve());

        // Safety net in case `ended` never fires (blocked autoplay, etc.).
        setTimeout(done, 4000);
      } catch {
        resolve();
      }
    });
  }
}

const soundManager = new SoundManager();

export function useSoundManager() {
  return {
    tick: () => soundManager.tick(),
    hover: () => soundManager.hover(),
    hit: () => soundManager.hit(),
    win: () => soundManager.play("win"),
    ultraWin: () => soundManager.play("ultraWin"),
    click: () => soundManager.play("click"),
    error: () => soundManager.play("error"),
    flip: () => soundManager.play("flip"),
    save: () => soundManager.play("save"),
    levelUp: () => soundManager.play("levelUp"),
    xpGain: () => soundManager.play("xpGain"),
    abilityEquip: () => soundManager.play("abilityEquip"),
    setVolume: (v: number) => soundManager.setVolume(v),
    loadConfig: (cfg: SoundConfig) => soundManager.loadConfig(cfg),
  };
}
