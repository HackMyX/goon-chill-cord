"use client";

export type FxSound = "win" | "ultraWin" | "click" | "error" | "flip" | "save";
// "hit" is an interrupt channel, not a queued Fx one, on purpose — sustained
// melee (clicking as fast as ATTACK_COOLDOWN allows) needs every landed hit
// to play immediately, the same way tick/hover never queue. Routing it
// through the FIFO `fx` queue instead would make hit sounds visibly lag
// behind the swings during any fight longer than one punch.
export type InterruptSound = "tick" | "hover" | "hit";

const FX_SRC: Record<FxSound, string> = {
  win: "/sounds/win.wav",
  ultraWin: "/sounds/ultra-win.wav",
  click: "/sounds/click.wav",
  error: "/sounds/error.wav",
  flip: "/sounds/flip.wav",
  save: "/sounds/save.wav",
};

const INTERRUPT_SRC: Record<InterruptSound, string> = {
  tick: "/sounds/tick.wav",
  hover: "/sounds/hover.wav",
  hit: "/sounds/hit.wav",
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

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    for (const [name, audio] of this.interruptAudio) {
      const base = name === "hover" ? 0.16 : name === "hit" ? 0.45 : 0.3;
      audio.volume = base * this._volume;
    }
    for (const [name, audio] of this.fxPool) {
      const base = name === "click" ? 0.32 : name === "save" ? 0.4 : 0.55;
      audio.volume = base * this._volume;
    }
  }

  private getInterruptAudio(name: InterruptSound): HTMLAudioElement | null {
    if (typeof window === "undefined") return null;
    let audio = this.interruptAudio.get(name);
    if (!audio) {
      audio = new Audio(INTERRUPT_SRC[name]);
      // hover/tick fire constantly (mouse movement, reel spin) — kept quiet
      // so a session of moving the mouse around doesn't wear the ears down.
      audio.volume = (name === "hover" ? 0.16 : name === "hit" ? 0.45 : 0.3) * this._volume;
      this.interruptAudio.set(name, audio);
    }
    return audio;
  }

  private getFxAudio(name: FxSound): HTMLAudioElement | null {
    if (typeof window === "undefined") return null;
    let audio = this.fxPool.get(name);
    if (!audio) {
      audio = new Audio(FX_SRC[name]);
      audio.volume = (name === "click" ? 0.32 : name === "save" ? 0.4 : 0.55) * this._volume;
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
    setVolume: (v: number) => soundManager.setVolume(v),
  };
}
