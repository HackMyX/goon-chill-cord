/**
 * Procedural music synthesizer using the Web Audio API.
 * Generates looping background music for each vibe — no audio files needed.
 *
 * Track URL format: "synth://<vibe>/<variant>"
 * e.g. "synth://arcade/1", "synth://chill/3"
 */

// ── Frequency helpers ────────────────────────────────────────────────────────

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Build a frequency lookup from a root MIDI note + scale intervals
function buildScale(rootMidi: number, intervals: number[], octaves = 3): number[] {
  const freqs: number[] = [];
  for (let oct = -1; oct < octaves; oct++) {
    for (const iv of intervals) {
      freqs.push(midiToFreq(rootMidi + iv + oct * 12));
    }
  }
  return freqs;
}

// ── Synthesis helpers ─────────────────────────────────────────────────────────

function makeOscNote(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  time: number,
  dur: number,
  vol: number,
  type: OscillatorType,
  detune = 0,
  filterFreq?: number
) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  if (detune) osc.detune.value = detune;

  const atk = Math.min(0.02, dur * 0.1);
  const rel = Math.min(0.08, dur * 0.3);
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(vol, time + atk);
  env.gain.setValueAtTime(vol, time + dur - rel);
  env.gain.linearRampToValueAtTime(0, time + dur);

  if (filterFreq) {
    const flt = ctx.createBiquadFilter();
    flt.type = "lowpass";
    flt.frequency.value = filterFreq;
    flt.Q.value = 1;
    osc.connect(flt);
    flt.connect(env);
  } else {
    osc.connect(env);
  }
  env.connect(dest);
  osc.start(time);
  osc.stop(time + dur + 0.05);
}

function makeNoise(
  ctx: AudioContext,
  dest: AudioNode,
  time: number,
  dur: number,
  vol: number,
  filterType: BiquadFilterType,
  filterFreq: number
) {
  const bufSize = Math.ceil(ctx.sampleRate * Math.max(dur, 0.05));
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) ch[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(vol, time + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

  const flt = ctx.createBiquadFilter();
  flt.type = filterType;
  flt.frequency.value = filterFreq;

  src.connect(flt);
  flt.connect(env);
  env.connect(dest);
  src.start(time);
  src.stop(time + dur + 0.05);
}

// ── Pattern definitions ───────────────────────────────────────────────────────

interface TrackPattern {
  bpm: number;
  bars: number;          // total bars before loop
  rootMidi: number;      // root note
  scaleIntervals: number[];
  // melody: array of [scaleIdx, durationInBeats] per 16th-note step (null = rest)
  melody: Array<[number, number] | null>;
  melodyOct: number;     // octave offset for melody (added to scale lookup)
  melodyType: OscillatorType;
  melodyVol: number;
  // bass: same format
  bass: Array<[number, number] | null>;
  bassOct: number;
  bassType: OscillatorType;
  bassVol: number;
  // percussion: step indices that trigger kick/snare/hihat
  kick: number[];
  snare: number[];
  hihat: number[];
  kickVol?: number;
  snareVol?: number;
  hihatVol?: number;
  // chord pads (optional)
  pads?: Array<{ steps: number[]; notes: number[]; dur: number; vol: number; type: OscillatorType }>;
}

// Scales
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PENTA_MAJ = [0, 2, 4, 7, 9];
const PENTA_MIN = [0, 3, 5, 7, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];

// Helper to convert 16-step bar arrays into total steps for N bars
function extendPattern<T>(bar: T[], bars: number): T[] {
  const result: T[] = [];
  for (let i = 0; i < bars; i++) result.push(...bar);
  return result;
}

// ── Vibe Patterns ─────────────────────────────────────────────────────────────

// ARCADE ──────────────────────────────────────────────────────────────────────
const ARCADE_BASE_MELODY: Array<[number, number] | null> = [
  [4,1],[2,1],[0,1],[2,1],[4,1],[4,1],[4,2],null,
  [3,1],[3,1],[2,1],[2,1],[0,1],[null as unknown as number,1] as unknown as [number,number],null,null,
];
const ARCADE_BASE_BASS: Array<[number, number] | null> = [
  [0,2],null,[4,2],null,[0,2],null,[3,2],null,
  [0,2],null,[2,2],null,[4,2],null,[0,2],null,
];

function makeArcadePattern(rootMidi: number, bpm: number, variant: number): TrackPattern {
  const melodyVariants: Array<Array<[number,number]|null>> = [
    ARCADE_BASE_MELODY,
    [[4,1],[4,1],[2,1],[0,2],null,[4,1],[2,1],[0,1],[4,2],[4,1],[2,1],[0,1],[4,1],[3,1],[2,2],null],
    [[0,1],[2,1],[4,1],[2,1],[0,2],[4,1],[2,1],[0,1],[0,1],[4,1],[4,1],[2,1],[0,2],null,null,null],
    [[4,2],[2,1],[0,1],[4,1],[2,1],[0,2],null,[4,1],[4,1],[3,1],[2,2],[0,1],[4,2],null,null,null],
    [[2,1],[4,1],[0,1],[4,2],[2,1],[4,1],[2,1],[0,2],null,[4,1],[2,1],[4,1],[0,1],[2,2],null,null],
  ];
  return {
    bpm, bars: 2, rootMidi, scaleIntervals: PENTA_MAJ,
    melody: extendPattern(melodyVariants[(variant - 1) % melodyVariants.length], 2),
    melodyOct: 1, melodyType: "square", melodyVol: 0.18,
    bass: extendPattern(ARCADE_BASE_BASS, 2),
    bassOct: -1, bassType: "square", bassVol: 0.22,
    kick: [0, 4, 8, 12, 16, 20, 24, 28], snare: [4, 12, 20, 28], hihat: [0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30],
    kickVol: 0.55, snareVol: 0.28, hihatVol: 0.07,
  };
}

// CHILL ────────────────────────────────────────────────────────────────────────
const CHILL_BASE_MELODY: Array<[number,number]|null> = [
  [0,2],null,null,null,[2,1],null,[1,2],null,
  null,null,[4,2],null,null,[2,1],[0,3],null,
];
function makeChillPattern(rootMidi: number, bpm: number, variant: number): TrackPattern {
  const melodyVariants: Array<Array<[number,number]|null>> = [
    CHILL_BASE_MELODY,
    [[0,2],null,[4,2],null,[2,2],null,[0,3],null,null,null,[1,1],null,[2,2],null,[4,2],null],
    [[4,3],null,null,null,[2,2],null,[0,1],[1,1],[2,2],null,[4,2],null,null,[2,1],[0,3],null],
    [[2,2],null,[0,1],[2,1],[4,3],null,null,[2,1],[1,2],null,[0,3],null,null,null,[4,2],null],
    [[0,3],null,null,[2,1],[4,2],null,[2,2],null,[1,1],[0,2],null,null,[4,3],null,null,null],
  ];
  return {
    bpm, bars: 4, rootMidi, scaleIntervals: DORIAN,
    melody: extendPattern(melodyVariants[(variant-1) % melodyVariants.length], 4),
    melodyOct: 1, melodyType: "sine", melodyVol: 0.14,
    bass: extendPattern([
      [0,4],null,null,null,[0,4],null,null,null,
      [3,4],null,null,null,[1,4],null,null,null,
    ] as Array<[number,number]|null>, 4),
    bassOct: -1, bassType: "sine", bassVol: 0.16,
    kick: [0,24], snare: [8,24], hihat: [0,8,16,24],
    kickVol: 0.3, snareVol: 0.18, hihatVol: 0.05,
    pads: [{
      steps: [0, 16], notes: [rootMidi, rootMidi+3, rootMidi+7],
      dur: 4, vol: 0.06, type: "sine",
    }],
  };
}

// ELECTRONIC ──────────────────────────────────────────────────────────────────
const ELEC_BASE_MELODY: Array<[number,number]|null> = [
  [0,1],[0,1],null,[3,1],[0,1],[0,1],null,[5,1],
  [0,1],[0,1],null,[3,1],[4,1],null,[3,1],null,
];
function makeElectronicPattern(rootMidi: number, bpm: number, variant: number): TrackPattern {
  const mVars: Array<Array<[number,number]|null>> = [
    ELEC_BASE_MELODY,
    [[0,1],[3,1],null,[0,1],[5,1],[3,1],null,[0,1],[0,1],null,[4,1],[3,1],null,[0,2],null,null],
    [[3,1],null,[0,1],[0,1],[3,1],null,[5,1],[3,1],[0,1],[0,1],null,[4,1],[3,1],[0,2],null,null],
    [[0,2],[3,1],null,[5,1],[4,1],null,[3,2],null,[0,1],[0,1],[3,1],null,[4,1],[3,1],[0,2],null],
    [[5,1],[3,1],[0,1],null,[0,1],[3,1],[5,1],null,[4,1],[3,1],[0,2],null,[3,1],[4,1],[0,2],null],
  ];
  return {
    bpm, bars: 2, rootMidi, scaleIntervals: MINOR,
    melody: extendPattern(mVars[(variant-1) % mVars.length], 2),
    melodyOct: 1, melodyType: "sawtooth", melodyVol: 0.13,
    bass: extendPattern([
      [0,1],[0,1],null,[0,1],[0,1],[0,1],null,[3,1],
      [0,1],[0,1],null,[0,1],[4,1],[3,1],null,[0,1],
    ] as Array<[number,number]|null>, 2),
    bassOct: -1, bassType: "sawtooth", bassVol: 0.2,
    kick: [0,4,8,12,16,20,24,28], snare: [4,12,20,28], hihat: [0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30],
    kickVol: 0.6, snareVol: 0.3, hihatVol: 0.06,
  };
}

// ADVENTURE ───────────────────────────────────────────────────────────────────
const ADV_BASE_MELODY: Array<[number,number]|null> = [
  [0,2],[1,1],[2,1],[4,3],null,[2,1],[1,2],[0,2],
  [2,2],[4,1],[5,1],[4,3],null,[2,1],[0,3],null,
];
function makeAdventurePattern(rootMidi: number, bpm: number, variant: number): TrackPattern {
  const mVars: Array<Array<[number,number]|null>> = [
    ADV_BASE_MELODY,
    [[4,2],[2,1],[1,1],[0,3],null,[4,1],[5,2],[4,2],[2,1],[0,1],[4,2],[2,2],[0,2],[4,3],null,null],
    [[0,3],null,[2,1],[4,2],[5,1],[4,1],[2,3],null,[4,1],[2,1],[0,2],[2,2],[4,3],null,null,null],
    [[2,2],[4,2],[5,1],[4,1],[2,2],[0,2],[4,3],null,[2,1],[0,1],[4,2],[2,2],[1,1],[0,3],null,null],
    [[0,2],[4,2],[2,1],[1,1],[0,2],[2,2],[4,3],null,[0,1],[2,1],[4,2],[5,2],[4,3],null,null,null],
  ];
  return {
    bpm, bars: 2, rootMidi, scaleIntervals: MAJOR,
    melody: extendPattern(mVars[(variant-1) % mVars.length], 2),
    melodyOct: 1, melodyType: "sawtooth", melodyVol: 0.12,
    bass: extendPattern([
      [0,4],null,null,null,[4,2],null,[0,2],null,
      [3,4],null,null,null,[0,2],null,[2,2],null,
    ] as Array<[number,number]|null>, 2),
    bassOct: -1, bassType: "sawtooth", bassVol: 0.18,
    kick: [0,8,16,24], snare: [4,12,20,28], hihat: [0,4,8,12,16,20,24,28],
    kickVol: 0.45, snareVol: 0.25, hihatVol: 0.04,
  };
}

// RETRO ────────────────────────────────────────────────────────────────────────
const RETRO_BASE_MELODY: Array<[number,number]|null> = [
  [0,1],[2,1],[4,1],[0,1],[4,1],[2,1],[0,2],null,
  [4,1],[3,1],[2,1],[4,1],[0,2],null,[4,1],[2,1],
];
function makeRetroPattern(rootMidi: number, bpm: number, variant: number): TrackPattern {
  const mVars: Array<Array<[number,number]|null>> = [
    RETRO_BASE_MELODY,
    [[4,1],[2,1],[0,1],[4,1],[2,1],[0,1],[4,2],null,[0,1],[4,1],[2,1],[0,1],[4,1],[2,2],null,null],
    [[0,1],[0,1],[4,1],[4,1],[2,1],[2,1],[0,2],null,[4,1],[3,1],[2,1],[0,1],[4,2],[0,1],[2,2],null],
    [[2,1],[4,1],[2,1],[0,1],[4,1],[2,1],[4,2],null,[0,1],[2,1],[4,1],[2,1],[0,2],null,[4,2],null],
    [[4,1],[4,1],[2,1],[0,1],[4,1],[0,1],[2,2],null,[4,1],[2,1],[0,1],[2,1],[4,2],[2,1],[0,2],null],
  ];
  return {
    bpm, bars: 2, rootMidi, scaleIntervals: PENTA_MAJ,
    melody: extendPattern(mVars[(variant-1) % mVars.length], 2),
    melodyOct: 1, melodyType: "square", melodyVol: 0.2,
    bass: extendPattern([
      [0,2],null,[4,1],[0,1],[0,2],null,[3,2],null,
      [0,2],null,[2,1],[0,1],[4,2],null,[0,2],null,
    ] as Array<[number,number]|null>, 2),
    bassOct: -2, bassType: "square", bassVol: 0.25,
    kick: [0,8,12,16,24,28], snare: [4,12,20,28], hihat: [0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30],
    kickVol: 0.5, snareVol: 0.28, hihatVol: 0.07,
  };
}

// AMBIENT ──────────────────────────────────────────────────────────────────────
const AMBIENT_BASE_MELODY: Array<[number,number]|null> = [
  [0,4],null,null,null,null,null,[2,4],null,
  null,null,null,null,[4,4],null,null,null,
  null,null,null,null,[2,4],null,null,null,
  null,null,[0,5],null,null,null,null,null,
];
function makeAmbientPattern(rootMidi: number, bpm: number, variant: number): TrackPattern {
  const mVars: Array<Array<[number,number]|null>> = [
    AMBIENT_BASE_MELODY,
    [[4,6],null,null,null,null,null,null,null,[2,6],null,null,null,null,null,null,null,[0,6],null,null,null,null,null,null,null,[4,5],null,null,null,null,null,null,null],
    [[2,5],null,null,null,null,[4,5],null,null,null,null,null,[0,5],null,null,null,null,null,[4,6],null,null,null,null,null,null,null,null,[2,4],null,null,null,null,null],
    [[0,8],null,null,null,null,null,null,null,null,null,null,null,[4,8],null,null,null,null,null,null,null,null,null,null,null,[2,6],null,null,null,null,null,[0,4],null],
    [[4,4],null,null,null,[2,4],null,null,null,[0,4],null,null,null,[4,5],null,null,null,null,null,[2,5],null,null,null,null,null,[0,7],null,null,null,null,null,null,null],
  ];
  return {
    bpm, bars: 4, rootMidi, scaleIntervals: MAJOR,
    melody: extendPattern(mVars[(variant-1) % mVars.length], 1),
    melodyOct: 1, melodyType: "sine", melodyVol: 0.12,
    bass: extendPattern([[0,8],null,null,null,null,null,null,null,[4,8],null,null,null,null,null,null,null] as Array<[number,number]|null>, 4),
    bassOct: -2, bassType: "sine", bassVol: 0.1,
    kick: [], snare: [], hihat: [],
    pads: [
      { steps: [0], notes: [rootMidi, rootMidi+4, rootMidi+7], dur: 8, vol: 0.05, type: "sine" },
      { steps: [16], notes: [rootMidi+4, rootMidi+7, rootMidi+11], dur: 8, vol: 0.05, type: "sine" },
    ],
  };
}

// EPIC ────────────────────────────────────────────────────────────────────────
const EPIC_BASE_MELODY: Array<[number,number]|null> = [
  [0,2],[1,1],[2,2],null,[5,1],[4,2],[2,2],[0,2],
  [3,2],[2,1],[1,2],null,[2,1],[3,2],[4,3],null,
];
function makeEpicPattern(rootMidi: number, bpm: number, variant: number): TrackPattern {
  const mVars: Array<Array<[number,number]|null>> = [
    EPIC_BASE_MELODY,
    [[5,2],[4,1],[2,2],null,[0,1],[2,2],[4,2],[5,2],[4,1],[2,2],null,[3,1],[5,2],[4,3],null,null],
    [[2,2],[0,1],[2,1],[5,3],null,[4,1],[2,2],[0,2],[3,2],[2,1],[4,3],null,[2,1],[0,2],[4,3],null],
    [[0,2],[3,2],[4,1],[2,2],null,[5,2],[4,2],[2,2],[3,2],[1,1],[0,2],[2,2],[5,3],null,null,null],
    [[4,2],[2,1],[0,2],null,[3,1],[5,2],[4,2],[0,2],[2,2],[4,1],[5,2],[4,2],[0,3],null,null,null],
  ];
  return {
    bpm, bars: 2, rootMidi, scaleIntervals: MINOR,
    melody: extendPattern(mVars[(variant-1) % mVars.length], 2),
    melodyOct: 1, melodyType: "sawtooth", melodyVol: 0.14,
    bass: extendPattern([
      [0,4],null,null,null,[0,4],null,null,null,
      [3,4],null,null,null,[1,2],null,[0,2],null,
    ] as Array<[number,number]|null>, 2),
    bassOct: -2, bassType: "sawtooth", bassVol: 0.2,
    kick: [0,4,8,12,16,20,24,28], snare: [4,12,20,28], hihat: [0,4,8,12,16,20,24,28],
    kickVol: 0.55, snareVol: 0.28, hihatVol: 0.05,
    pads: [
      { steps: [0,16], notes: [rootMidi, rootMidi+3, rootMidi+7, rootMidi+10], dur: 4, vol: 0.07, type: "sawtooth" },
    ],
  };
}

// ── Pattern registry ──────────────────────────────────────────────────────────

type VibeKey = "arcade" | "chill" | "adventure" | "electronic" | "retro" | "ambient" | "epic";

const ROOTS_BY_VIBE: Record<VibeKey, number[]> = {
  arcade:     [60, 67, 62, 69, 65],   // C G D A F
  chill:      [62, 69, 65, 64, 71],   // D A F E B
  adventure:  [67, 60, 64, 55, 62],   // G C E G D
  electronic: [57, 64, 60, 55, 62],   // A E C G D
  retro:      [60, 67, 65, 62, 69],   // C G F D A
  ambient:    [65, 60, 62, 67, 57],   // F C D G A
  epic:       [62, 55, 57, 60, 65],   // D G A C F
};

const BPMS_BY_VIBE: Record<VibeKey, number[]> = {
  arcade:     [150, 155, 145, 148, 152],
  chill:      [82,  88,  76,  80,  85 ],
  adventure:  [100, 105, 96,  102, 98 ],
  electronic: [128, 132, 124, 130, 126],
  retro:      [120, 125, 115, 118, 122],
  ambient:    [60,  64,  58,  62,  56 ],
  epic:       [88,  84,  90,  86,  92 ],
};

function getPattern(vibe: VibeKey, variant: number): TrackPattern {
  const idx = Math.max(0, variant - 1) % ROOTS_BY_VIBE[vibe].length;
  const root = ROOTS_BY_VIBE[vibe][idx];
  const bpm  = BPMS_BY_VIBE[vibe][idx];
  switch (vibe) {
    case "arcade":     return makeArcadePattern(root, bpm, variant);
    case "chill":      return makeChillPattern(root, bpm, variant);
    case "adventure":  return makeAdventurePattern(root, bpm, variant);
    case "electronic": return makeElectronicPattern(root, bpm, variant);
    case "retro":      return makeRetroPattern(root, bpm, variant);
    case "ambient":    return makeAmbientPattern(root, bpm, variant);
    case "epic":       return makeEpicPattern(root, bpm, variant);
  }
}

// ── Synthesizer class ─────────────────────────────────────────────────────────

export class MusicSynth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isRunning = false;
  private currentVibe: VibeKey | null = null;
  private currentVariant = 1;
  private patternStartTime = 0;
  private patternDuration = 0; // seconds
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  // Dynamic tempo multiplier (1 = normal). Applied to each newly-scheduled bar,
  // so changes take effect at the next loop boundary — smooth, never a glitch.
  private tempoMult = 1;

  get playing() { return this.isRunning; }

  /** Scale playback tempo (e.g. 1.3 = 30% faster). Clamped to a musical range. */
  setTempo(mult: number) {
    this.tempoMult = Math.max(0.5, Math.min(2, Number.isFinite(mult) ? mult : 1));
  }

  /** Parse a synth:// URL into vibe and variant */
  static parseSynthUrl(url: string): { vibe: VibeKey; variant: number } | null {
    if (!url.startsWith("synth://")) return null;
    const parts = url.slice("synth://".length).split("/");
    const vibe = parts[0] as VibeKey;
    const variant = parseInt(parts[1] ?? "1", 10) || 1;
    const validVibes: VibeKey[] = ["arcade","chill","adventure","electronic","retro","ambient","epic"];
    if (!validVibes.includes(vibe)) return null;
    return { vibe, variant };
  }

  private getCtx(): AudioContext {
    if (!this.ctx || this.ctx.state === "closed") {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private schedulePattern(ctx: AudioContext, pattern: TrackPattern, startTime: number) {
    // Tempo multiplier folds into the bar's effective BPM, so the whole bar
    // (melody/bass/pads/percussion + the loop delay derived from its duration)
    // scales together and stays in time.
    const secPerBeat = 60 / (pattern.bpm * this.tempoMult);
    const secPer16th = secPerBeat / 4;
    const totalSteps = pattern.melody.length;
    const scale = buildScale(pattern.rootMidi, pattern.scaleIntervals, 4);

    const melodyScale = buildScale(pattern.rootMidi + pattern.melodyOct * 12, pattern.scaleIntervals, 4);
    const bassScale   = buildScale(pattern.rootMidi + (pattern.bassOct + 1) * 12, pattern.scaleIntervals, 4);

    const dest = this.masterGain!;

    // Melody
    for (let step = 0; step < totalSteps; step++) {
      const entry = pattern.melody[step];
      if (!entry) continue;
      const [idx, dur] = entry;
      const freq = melodyScale[Math.max(0, Math.min(idx, melodyScale.length - 1))];
      const t = startTime + step * secPer16th;
      const d = dur * secPer16th * 0.88;
      makeOscNote(ctx, dest, freq, t, d, pattern.melodyVol, pattern.melodyType, 0, 2200);
    }

    // Bass
    for (let step = 0; step < totalSteps; step++) {
      const entry = pattern.bass[step];
      if (!entry) continue;
      const [idx, dur] = entry;
      const freq = bassScale[Math.max(0, Math.min(idx, bassScale.length - 1))];
      const t = startTime + step * secPer16th;
      const d = dur * secPer16th * 0.82;
      makeOscNote(ctx, dest, freq, t, d, pattern.bassVol, pattern.bassType, 0, 800);
    }

    // Pads
    if (pattern.pads) {
      for (const pad of pattern.pads) {
        for (const step of pad.steps) {
          const t = startTime + step * secPer16th;
          for (const midi of pad.notes) {
            makeOscNote(ctx, dest, midiToFreq(midi), t, pad.dur * secPer16th * 0.95, pad.vol, pad.type, 0, 600);
          }
        }
      }
    }

    // Percussion
    const stepsInPattern = Math.max(totalSteps, (pattern.bars * 16));
    for (let step = 0; step < stepsInPattern; step++) {
      const t = startTime + step * secPer16th;
      if (pattern.kick.includes(step)) {
        makeOscNote(ctx, dest, midiToFreq(36), t, 0.08, (pattern.kickVol ?? 0.5) * 1.0, "sine");
        makeNoise(ctx, dest, t, 0.05, (pattern.kickVol ?? 0.5) * 0.25, "lowpass", 180);
      }
      if (pattern.snare.includes(step)) {
        makeNoise(ctx, dest, t, 0.12, pattern.snareVol ?? 0.3, "bandpass", 1200);
        makeOscNote(ctx, dest, midiToFreq(50), t, 0.05, (pattern.snareVol ?? 0.3) * 0.4, "triangle");
      }
      if (pattern.hihat.includes(step)) {
        makeNoise(ctx, dest, t, 0.04, pattern.hihatVol ?? 0.08, "highpass", 8000);
      }
    }

    return totalSteps * secPer16th;
  }

  async start(synthUrl: string, volume: number, fadeInMs = 1200) {
    const parsed = MusicSynth.parseSynthUrl(synthUrl);
    if (!parsed) return;

    this.stop();
    this.isRunning = true;
    this.currentVibe = parsed.vibe;
    this.currentVariant = parsed.variant;

    const ctx = this.getCtx();
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => {});
    }

    const gain = this.masterGain!;
    // Wipe any leftover automation (e.g. a still-running fade-out ramp from
    // the track we're switching away from) before starting the new fade-in,
    // so transitions are deterministic instead of two competing ramps
    // fighting over the same param — the "unsaubere Übergänge" symptom.
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    // fadeInMs = 0 → instant (no fade), used when the admin disables fades.
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + Math.max(0, fadeInMs) / 1000);

    const pattern = getPattern(parsed.vibe, parsed.variant);
    this.patternStartTime = ctx.currentTime + 0.1;
    const dur = this.schedulePattern(ctx, pattern, this.patternStartTime);
    this.patternDuration = dur;

    this.scheduleLoop(dur);
  }

  private scheduleLoop(dur: number) {
    if (!this.isRunning) return;
    // Schedule next loop 0.3s before current one ends
    const delayMs = Math.max(100, (dur - 0.3) * 1000);
    this.loopTimer = setTimeout(() => {
      if (!this.isRunning || !this.ctx || !this.currentVibe) return;
      const ctx = this.ctx;
      const pattern = getPattern(this.currentVibe, this.currentVariant);

      // Reconcile the hand-advanced audio-clock pointer against the real
      // audio clock before scheduling the next bar. `setTimeout` is
      // wall-clock and only ever fires *late* (it's throttled hard when the
      // tab is backgrounded, and the AudioContext can auto-suspend), so
      // `patternStartTime` — which we advance by a fixed `patternDuration`
      // each loop regardless of how much real time actually passed — drifts
      // out of step with `ctx.currentTime`. Left unchecked it eventually
      // lands in the *past*, and Web Audio fires an entire pattern's worth
      // of notes simultaneously the instant they're scheduled: the
      // crackling/clipping "music crashes after a while" symptom, getting
      // worse the longer the page stays open. Snapping back whenever it has
      // drifted outside a tight window around `now` keeps every note
      // scheduled slightly in the future (clean playback) and caps recovery
      // at a single seam instead of an ever-growing pile-up.
      let nextStart = this.patternStartTime + this.patternDuration;
      const minStart = ctx.currentTime + 0.05;
      const maxStart = ctx.currentTime + this.patternDuration + 1;
      if (nextStart < minStart || nextStart > maxStart) {
        nextStart = minStart;
      }
      this.patternStartTime = nextStart;
      const nextDur = this.schedulePattern(ctx, pattern, this.patternStartTime);
      this.patternDuration = nextDur;
      this.scheduleLoop(nextDur);
    }, delayMs);
  }

  stop() {
    this.isRunning = false;
    if (this.loopTimer) { clearTimeout(this.loopTimer); this.loopTimer = null; }
    if (this.masterGain) {
      const now = this.ctx?.currentTime ?? 0;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(0, now + 0.4);
    }
  }

  async fadeIn(volume: number, durationMs: number) {
    if (!this.masterGain || !this.ctx) return;
    const now = this.ctx.currentTime;
    const dur = durationMs / 1000;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(0, now);
    this.masterGain.gain.linearRampToValueAtTime(volume, now + dur);
  }

  fadeOut(durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      if (!this.masterGain || !this.ctx) { resolve(); return; }
      const now = this.ctx.currentTime;
      const dur = durationMs / 1000;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(0, now + dur);
      setTimeout(() => { this.stop(); resolve(); }, durationMs + 50);
    });
  }

  setVolume(volume: number) {
    if (!this.masterGain || !this.ctx) return;
    // Clear any in-flight fade so a live volume change snaps cleanly to the
    // new level instead of being overridden a frame later by a leftover ramp.
    this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.masterGain.gain.setValueAtTime(volume, this.ctx.currentTime);
  }

  /** Resume suspended AudioContext (needed for iOS after user gesture) */
  async resume() {
    if (this.ctx?.state === "suspended") {
      await this.ctx.resume().catch(() => {});
    }
  }
}
