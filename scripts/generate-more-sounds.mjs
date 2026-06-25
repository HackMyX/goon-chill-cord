// Generates the extended set of UI/game sound effects as 16-bit PCM WAV files.
// Uses the same pure-Node synthesis approach as generate-sounds.mjs —
// no external codec needed, just math over samples written straight to bytes.
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "sounds");
const SAMPLE_RATE = 44100;

// ─── Core synthesis helpers (same as generate-sounds.mjs) ─────────────────────

function envelope(i, attackSamples, decaySeconds) {
  if (i < attackSamples) return i / attackSamples;
  return Math.exp(-((i - attackSamples) / SAMPLE_RATE) / decaySeconds);
}

function note(freq, durationMs, opts = {}) {
  const {
    attack = 0.004,
    decay = 0.35,
    peak = 0.5,
    startMs = 0,
    harmonics = [[1, 1], [2, 0.35], [3, 0.12]],
    detuneCents = 0,
  } = opts;
  const samples = Math.round((durationMs / 1000) * SAMPLE_RATE);
  const attackSamples = Math.max(1, Math.round(attack * SAMPLE_RATE));
  const detune = Math.pow(2, detuneCents / 1200);
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(i, attackSamples, decay);
    let s = 0;
    for (const [mult, amp] of harmonics) {
      s += Math.sin(2 * Math.PI * freq * mult * detune * t) * amp;
    }
    out[i] = s * env * peak;
  }
  return { samples: out, startMs };
}

function sweep(freqStart, freqEnd, durationMs, { peak = 0.6, decay = 0.3 } = {}) {
  const samples = Math.round((durationMs / 1000) * SAMPLE_RATE);
  const out = new Float32Array(samples);
  let phase = 0;
  for (let i = 0; i < samples; i++) {
    const progress = i / samples;
    const freq = freqStart + (freqEnd - freqStart) * progress;
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    const env = Math.exp(-(i / SAMPLE_RATE) / decay) * (1 - Math.exp(-i / 200));
    const harmonic2 = Math.sin(phase * 2) * 0.25;
    out[i] = (Math.sin(phase) + harmonic2) * env * peak;
  }
  return { samples: out, startMs: 0 };
}

function thump(durationMs, { peak = 0.7, startFreq = 160, endFreq = 45 } = {}) {
  const samples = Math.round((durationMs / 1000) * SAMPLE_RATE);
  const out = new Float32Array(samples);
  let phase = 0;
  for (let i = 0; i < samples; i++) {
    const progress = i / samples;
    const freq = startFreq + (endFreq - startFreq) * progress;
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    const env = Math.exp(-(i / SAMPLE_RATE) / 0.12);
    out[i] = Math.sin(phase) * env * peak;
  }
  return { samples: out, startMs: 0 };
}

// ─── New synthesis helpers ────────────────────────────────────────────────────

/** White noise burst with exponential decay. */
function noise(durationMs, { peak = 0.4, decay = 0.1, startMs = 0 } = {}) {
  const samples = Math.round((durationMs / 1000) * SAMPLE_RATE);
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const env = Math.exp(-(i / SAMPLE_RATE) / decay);
    out[i] = (Math.random() * 2 - 1) * env * peak;
  }
  return { samples: out, startMs };
}

/** Sawtooth wave sweep — electric/buzzy character. */
function sawtoothSweep(freqStart, freqEnd, durationMs, { peak = 0.4, decay = 0.12 } = {}) {
  const samples = Math.round((durationMs / 1000) * SAMPLE_RATE);
  const out = new Float32Array(samples);
  let phase = 0;
  for (let i = 0; i < samples; i++) {
    const progress = i / samples;
    const freq = freqStart + (freqEnd - freqStart) * progress;
    phase += freq / SAMPLE_RATE;
    if (phase > 1) phase -= 1;
    const env = Math.exp(-(i / SAMPLE_RATE) / decay);
    out[i] = (phase * 2 - 1) * env * peak; // sawtooth mapped to [-1, 1]
  }
  return { samples: out, startMs: 0 };
}

function mixLayers(layers, totalDurationMs) {
  const totalSamples = Math.round((totalDurationMs / 1000) * SAMPLE_RATE);
  const out = new Float32Array(totalSamples);
  for (const layer of layers) {
    const offset = Math.round((layer.startMs / 1000) * SAMPLE_RATE);
    for (let i = 0; i < layer.samples.length; i++) {
      const idx = offset + i;
      if (idx >= 0 && idx < out.length) out[idx] += layer.samples[i];
    }
  }
  return out;
}

function applyEcho(samples, { delayMs = 70, decay = 0.35, repeats = 3 } = {}) {
  const delaySamples = Math.round((delayMs / 1000) * SAMPLE_RATE);
  const out = new Float32Array(samples.length + delaySamples * repeats);
  out.set(samples, 0);
  let amp = decay;
  for (let r = 1; r <= repeats; r++) {
    const offset = delaySamples * r;
    for (let i = 0; i < samples.length; i++) {
      out[i + offset] += samples[i] * amp;
    }
    amp *= decay;
  }
  return out;
}

function finalize(floatSamples) {
  const out = new Float32Array(floatSamples.length);
  for (let i = 0; i < floatSamples.length; i++) out[i] = Math.tanh(floatSamples[i]);
  return out;
}

function fadeTail(samples, { maxMs = 35, minMs = 8, fraction = 0.18 } = {}) {
  const totalMs = (samples.length / SAMPLE_RATE) * 1000;
  const fadeMs = Math.min(maxMs, Math.max(minMs, totalMs * fraction));
  const fadeSamples = Math.min(samples.length, Math.round((fadeMs / 1000) * SAMPLE_RATE));
  const out = Float32Array.from(samples);
  const start = out.length - fadeSamples;
  for (let i = 0; i < fadeSamples; i++) {
    const t = i / fadeSamples;
    const gain = 0.5 * (1 + Math.cos(Math.PI * t));
    out[start + i] *= gain;
  }
  return out;
}

function writeWav(filename, floatSamples) {
  const numSamples = floatSamples.length;
  const byteRate = SAMPLE_RATE * 2;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, floatSamples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  writeFileSync(join(OUT_DIR, filename), buffer);
  console.log(`wrote ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

// ─── Sound definitions ────────────────────────────────────────────────────────

// coin.wav — short high-pitched clink
writeWav(
  "coin.wav",
  fadeTail(
    finalize(
      applyEcho(
        mixLayers([
          note(880, 90, { decay: 0.06, peak: 0.48, startMs: 0, harmonics: [[1, 1], [2, 0.4], [3, 0.15]] }),
          note(1320, 60, { decay: 0.04, peak: 0.20, startMs: 10, harmonics: [[1, 1], [2, 0.3]] }),
        ], 130),
        { delayMs: 40, decay: 0.18, repeats: 2 }
      )
    )
  )
);

// ding.wav — clean bell tone
writeWav(
  "ding.wav",
  fadeTail(
    finalize(
      applyEcho(
        mixLayers([
          note(660, 300, { decay: 0.5, peak: 0.45, startMs: 0, harmonics: [[1, 1], [2, 0.30], [4, 0.10]] }),
        ], 340),
        { delayMs: 90, decay: 0.22, repeats: 2 }
      )
    )
  )
);

// swoosh.wav — white noise burst with pitch sweep down
writeWav(
  "swoosh.wav",
  fadeTail(
    finalize(
      mixLayers([
        sweep(700, 120, 180, { peak: 0.35, decay: 0.18 }),
        noise(180, { peak: 0.18, decay: 0.12 }),
      ], 200)
    )
  )
);

// pop.wav — bubble pop (chirp 200→80 Hz, 80 ms)
writeWav(
  "pop.wav",
  fadeTail(
    finalize(
      mixLayers([sweep(200, 80, 80, { peak: 0.55, decay: 0.05 })], 90)
    )
  )
);

// chime.wav — light bell chord (523 + 659 + 784 Hz)
writeWav(
  "chime.wav",
  fadeTail(
    finalize(
      applyEcho(
        mixLayers([
          note(523.25, 220, { decay: 0.32, peak: 0.32, startMs: 0, harmonics: [[1, 1], [2, 0.25], [3, 0.08]] }),
          note(659.25, 220, { decay: 0.32, peak: 0.32, startMs: 0, harmonics: [[1, 1], [2, 0.25], [3, 0.08]] }),
          note(783.99, 220, { decay: 0.32, peak: 0.32, startMs: 0, harmonics: [[1, 1], [2, 0.25], [3, 0.08]] }),
        ], 280),
        { delayMs: 80, decay: 0.20, repeats: 2 }
      )
    )
  )
);

// chime-low.wav — deeper bell chord (261 + 329 + 392 Hz)
writeWav(
  "chime-low.wav",
  fadeTail(
    finalize(
      applyEcho(
        mixLayers([
          note(261.63, 260, { decay: 0.40, peak: 0.32, startMs: 0, harmonics: [[1, 1], [2, 0.28], [3, 0.10]] }),
          note(329.63, 260, { decay: 0.40, peak: 0.32, startMs: 0, harmonics: [[1, 1], [2, 0.28], [3, 0.10]] }),
          note(392.00, 260, { decay: 0.40, peak: 0.30, startMs: 0, harmonics: [[1, 1], [2, 0.28]] }),
        ], 320),
        { delayMs: 95, decay: 0.22, repeats: 2 }
      )
    )
  )
);

// boom.wav — low thump at 80 Hz with punch
writeWav(
  "boom.wav",
  fadeTail(
    finalize(
      mixLayers([
        thump(200, { peak: 0.75, startFreq: 120, endFreq: 40 }),
        note(80, 150, { decay: 0.18, peak: 0.35, startMs: 0, harmonics: [[1, 1], [2, 0.20]] }),
      ], 240)
    )
  )
);

// zap.wav — electric buzz, sawtooth 440→220 Hz, 120 ms
writeWav(
  "zap.wav",
  fadeTail(
    finalize(
      mixLayers([
        sawtoothSweep(440, 220, 120, { peak: 0.45, decay: 0.10 }),
        noise(80, { peak: 0.10, decay: 0.06 }),
      ], 140)
    )
  )
);

// powerup.wav — ascending arpeggio C→E→G→C5, each 60 ms
writeWav(
  "powerup.wav",
  fadeTail(
    finalize(
      applyEcho(
        mixLayers([
          note(261.63, 80,  { decay: 0.10, peak: 0.40, startMs: 0,   harmonics: [[1, 1], [2, 0.3]] }),
          note(329.63, 80,  { decay: 0.10, peak: 0.42, startMs: 60,  harmonics: [[1, 1], [2, 0.3]] }),
          note(392.00, 80,  { decay: 0.10, peak: 0.44, startMs: 120, harmonics: [[1, 1], [2, 0.3]] }),
          note(523.25, 120, { decay: 0.18, peak: 0.48, startMs: 180, harmonics: [[1, 1], [2, 0.32], [3, 0.10]] }),
        ], 320),
        { delayMs: 60, decay: 0.20, repeats: 2 }
      )
    )
  )
);

// select.wav — light click, 400 Hz, 40 ms
writeWav(
  "select.wav",
  fadeTail(
    finalize(
      mixLayers([
        note(400, 50, { decay: 0.03, peak: 0.40, startMs: 0, harmonics: [[1, 1], [2, 0.2]] }),
      ], 60)
    )
  )
);

// notification.wav — two-note ping 440→660 Hz
writeWav(
  "notification.wav",
  fadeTail(
    finalize(
      applyEcho(
        mixLayers([
          note(440, 110, { decay: 0.16, peak: 0.40, startMs: 0,  harmonics: [[1, 1], [2, 0.25]] }),
          note(660, 110, { decay: 0.16, peak: 0.42, startMs: 80, harmonics: [[1, 1], [2, 0.25]] }),
        ], 220),
        { delayMs: 70, decay: 0.18, repeats: 2 }
      )
    )
  )
);

// achievement.wav — triumphant arpeggio C→E→G→B, with echo tail
writeWav(
  "achievement.wav",
  fadeTail(
    finalize(
      applyEcho(
        mixLayers([
          note(261.63, 100, { decay: 0.12, peak: 0.38, startMs: 0,   harmonics: [[1, 1], [2, 0.30]] }),
          note(329.63, 100, { decay: 0.12, peak: 0.40, startMs: 80,  harmonics: [[1, 1], [2, 0.30]] }),
          note(392.00, 100, { decay: 0.14, peak: 0.42, startMs: 160, harmonics: [[1, 1], [2, 0.32]] }),
          note(493.88, 180, { decay: 0.30, peak: 0.48, startMs: 240, harmonics: [[1, 1], [2, 0.34], [3, 0.12]] }),
        ], 460),
        { delayMs: 90, decay: 0.28, repeats: 3 }
      )
    )
  )
);

// levelup-epic.wav — epic ascending scale C→E→G→C5 + harmony layer
writeWav(
  "levelup-epic.wav",
  fadeTail(
    finalize(
      applyEcho(
        mixLayers([
          note(261.63, 140, { decay: 0.18, peak: 0.38, startMs: 0,   harmonics: [[1, 1], [2, 0.32]] }),
          note(329.63, 140, { decay: 0.18, peak: 0.40, startMs: 100, harmonics: [[1, 1], [2, 0.32]] }),
          note(392.00, 140, { decay: 0.20, peak: 0.44, startMs: 200, harmonics: [[1, 1], [2, 0.34]] }),
          note(523.25, 240, { decay: 0.32, peak: 0.50, startMs: 300, harmonics: [[1, 1], [2, 0.36], [3, 0.12]] }),
          // harmony, detuned for richer chorus
          note(523.25, 240, { decay: 0.32, peak: 0.18, startMs: 300, detuneCents: 10 }),
          note(659.25, 300, { decay: 0.40, peak: 0.36, startMs: 400, harmonics: [[1, 1], [2, 0.30]] }),
        ], 740),
        { delayMs: 100, decay: 0.28, repeats: 3 }
      )
    )
  )
);

// fanfare.wav — short victory stab, C major chord held 400 ms
writeWav(
  "fanfare.wav",
  fadeTail(
    finalize(
      applyEcho(
        mixLayers([
          note(261.63, 380, { decay: 0.50, peak: 0.30, startMs: 0, harmonics: [[1, 1], [2, 0.28]] }),
          note(329.63, 380, { decay: 0.50, peak: 0.30, startMs: 0, harmonics: [[1, 1], [2, 0.28]] }),
          note(392.00, 380, { decay: 0.50, peak: 0.30, startMs: 0, harmonics: [[1, 1], [2, 0.28]] }),
          note(523.25, 380, { decay: 0.50, peak: 0.24, startMs: 0, harmonics: [[1, 1], [2, 0.22]] }),
        ], 420),
        { delayMs: 100, decay: 0.25, repeats: 2 }
      )
    )
  )
);

// whoosh.wav — filtered noise sweep, quick air-rush
writeWav(
  "whoosh.wav",
  fadeTail(
    finalize(
      mixLayers([
        sweep(500, 80, 200, { peak: 0.30, decay: 0.18 }),
        noise(200, { peak: 0.14, decay: 0.15 }),
      ], 220)
    )
  )
);

// glitch.wav — brief stuttering noise burst
writeWav(
  "glitch.wav",
  fadeTail(
    finalize(
      mixLayers([
        noise(30, { peak: 0.50, decay: 0.02, startMs: 0 }),
        noise(20, { peak: 0.40, decay: 0.02, startMs: 40 }),
        noise(25, { peak: 0.45, decay: 0.02, startMs: 70 }),
        sawtoothSweep(600, 200, 60, { peak: 0.22, decay: 0.04 }),
      ], 120)
    )
  )
);

// laser.wav — sci-fi laser, sine sweep 800→200 Hz, 150 ms
writeWav(
  "laser.wav",
  fadeTail(
    finalize(
      mixLayers([
        sweep(800, 200, 150, { peak: 0.50, decay: 0.12 }),
        sawtoothSweep(600, 150, 120, { peak: 0.15, decay: 0.08 }),
      ], 170)
    )
  )
);

// punch.wav — impact thud, noise burst + low sine, 100 ms
writeWav(
  "punch.wav",
  fadeTail(
    finalize(
      mixLayers([
        thump(100, { peak: 0.65, startFreq: 200, endFreq: 55 }),
        noise(60, { peak: 0.28, decay: 0.04, startMs: 0 }),
        note(900, 35, { decay: 0.03, peak: 0.22, startMs: 0, harmonics: [[1, 1], [1.9, 0.4]] }),
      ], 120)
    )
  )
);

// shield-block.wav — metallic clank, 80 ms
writeWav(
  "shield-block.wav",
  fadeTail(
    finalize(
      mixLayers([
        sawtoothSweep(900, 500, 80, { peak: 0.38, decay: 0.06 }),
        noise(60, { peak: 0.18, decay: 0.04 }),
        note(700, 50, { decay: 0.04, peak: 0.22, startMs: 0, harmonics: [[1, 1], [2.1, 0.5]] }),
      ], 100)
    )
  )
);

// sword-swing.wav — whoosh + clank combo
writeWav(
  "sword-swing.wav",
  fadeTail(
    finalize(
      mixLayers([
        sweep(200, 700, 120, { peak: 0.35, decay: 0.10 }),
        noise(80, { peak: 0.16, decay: 0.08 }),
        sawtoothSweep(800, 400, 60, { peak: 0.28, decay: 0.05 }),
        note(650, 40, { decay: 0.04, peak: 0.20, startMs: 100, harmonics: [[1, 1], [2, 0.45]] }),
      ], 200)
    )
  )
);

// coin-collect.wav — small ascending arpeggio (Mario-coin style)
writeWav(
  "coin-collect.wav",
  fadeTail(
    finalize(
      applyEcho(
        mixLayers([
          note(523.25, 70,  { decay: 0.08, peak: 0.40, startMs: 0,   harmonics: [[1, 1], [2, 0.30]] }),
          note(659.25, 70,  { decay: 0.08, peak: 0.40, startMs: 50,  harmonics: [[1, 1], [2, 0.30]] }),
          note(783.99, 70,  { decay: 0.08, peak: 0.42, startMs: 100, harmonics: [[1, 1], [2, 0.30]] }),
          note(1046.5, 90,  { decay: 0.12, peak: 0.44, startMs: 150, harmonics: [[1, 1], [2, 0.28]] }),
        ], 270),
        { delayMs: 50, decay: 0.16, repeats: 2 }
      )
    )
  )
);

// ui-open.wav — soft woosh upward
writeWav(
  "ui-open.wav",
  fadeTail(
    finalize(
      mixLayers([
        sweep(180, 620, 130, { peak: 0.26, decay: 0.14 }),
        note(400, 80, { decay: 0.10, peak: 0.14, startMs: 50, harmonics: [[1, 1], [2, 0.20]] }),
      ], 150)
    )
  )
);

// ui-close.wav — soft woosh downward
writeWav(
  "ui-close.wav",
  fadeTail(
    finalize(
      mixLayers([
        sweep(620, 180, 130, { peak: 0.26, decay: 0.14 }),
        note(280, 80, { decay: 0.10, peak: 0.12, startMs: 20, harmonics: [[1, 1], [2, 0.18]] }),
      ], 150)
    )
  )
);

// success-soft.wav — gentle two-note rise
writeWav(
  "success-soft.wav",
  fadeTail(
    finalize(
      applyEcho(
        mixLayers([
          note(523.25, 130, { decay: 0.22, peak: 0.30, startMs: 0,   harmonics: [[1, 1], [2, 0.22], [3, 0.08]] }),
          note(659.25, 160, { decay: 0.28, peak: 0.36, startMs: 105, harmonics: [[1, 1], [2, 0.24], [3, 0.08]] }),
        ], 290),
        { delayMs: 75, decay: 0.18, repeats: 2 }
      )
    )
  )
);

// success-hard.wav — strong two-note rise
writeWav(
  "success-hard.wav",
  fadeTail(
    finalize(
      applyEcho(
        mixLayers([
          note(523.25, 130, { decay: 0.24, peak: 0.46, startMs: 0,   harmonics: [[1, 1], [2, 0.36], [3, 0.12]] }),
          note(783.99, 170, { decay: 0.30, peak: 0.52, startMs: 105, harmonics: [[1, 1], [2, 0.40], [3, 0.14]] }),
        ], 310),
        { delayMs: 80, decay: 0.22, repeats: 2 }
      )
    )
  )
);

console.log("Done — generated all extended sound effects.");
