// Procedurally synthesizes every UI sound effect as a plain 16-bit PCM WAV
// file — no external codec/library needed, just layered sine waves
// (fundamental + harmonics, for a richer "bell"/"synth" timbre instead of a
// flat single-tone beep) plus a small manual echo/delay post-process for a
// sense of depth and polish, written straight to bytes.
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "sounds");
const SAMPLE_RATE = 44100;

function envelope(i, attackSamples, decaySeconds) {
  if (i < attackSamples) return i / attackSamples;
  return Math.exp(-((i - attackSamples) / SAMPLE_RATE) / decaySeconds);
}

/** A single tone with 2-3 stacked harmonics at decreasing amplitude — this
 * is what makes it sound like a real synth/bell instead of a flat 8-bit
 * beep. `harmonics` is a list of [multiplier, relativeAmplitude] pairs
 * layered on top of the fundamental. */
function note(freq, durationMs, opts = {}) {
  const {
    attack = 0.004,
    decay = 0.35,
    peak = 0.5,
    startMs = 0,
    harmonics = [
      [1, 1],
      [2, 0.35],
      [3, 0.12],
    ],
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

/** A short low "thump" — sub-bass impact for weight at the start of big
 * celebratory sounds (ultra-win), like a kick drum. */
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

/** Manual delay/echo: mixes in decaying, delayed copies of the signal so
 * short synth blips read as having actual space/depth instead of feeling
 * flat and dry. */
function applyEcho(samples, { delayMs = 70, decay = 0.35, repeats = 3 } = {}) {
  const delaySamples = Math.round((delayMs / 1000) * SAMPLE_RATE);
  // Extend the buffer so the decaying echo tail actually has room to ring
  // out instead of being cut off at the original signal's length.
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
  // soft clip (tanh) to avoid harsh digital clipping once layers/echoes stack
  const out = new Float32Array(floatSamples.length);
  for (let i = 0; i < floatSamples.length; i++) out[i] = Math.tanh(floatSamples[i]);
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

// --- the actual sound effects ---
//
// Round 2: every tone moved down 1-2 octaves and the bright upper harmonics
// were dialed back in favor of the fundamental + a sub layer. `hover` in
// particular used to peak at 1600Hz and fires constantly on mouse movement —
// exactly the frequency range that turns into ear fatigue over a session.
// The goal is a duller, "thock"/"thud" character instead of a thin "beep".

writeWav(
  "hover.wav",
  finalize(
    mixLayers(
      [note(340, 35, { attack: 0.002, decay: 0.045, peak: 0.22, harmonics: [[1, 1], [0.5, 0.3]] })],
      45
    )
  )
);

writeWav(
  "click.wav",
  finalize(
    applyEcho(
      mixLayers(
        [
          note(260, 55, { attack: 0.002, decay: 0.06, peak: 0.42, harmonics: [[1, 1], [0.5, 0.4], [2, 0.1]] }),
          note(130, 60, { attack: 0.002, decay: 0.07, peak: 0.22, harmonics: [[1, 1]] }),
        ],
        80
      ),
      { delayMs: 55, decay: 0.15, repeats: 2 }
    )
  )
);

writeWav(
  "tick.wav",
  finalize(
    mixLayers(
      [note(220, 28, { attack: 0.001, decay: 0.028, peak: 0.36, harmonics: [[1, 1], [0.5, 0.25]] })],
      38
    )
  )
);

writeWav(
  "win.wav",
  finalize(
    applyEcho(
      mixLayers(
        [
          note(349.23, 180, { decay: 0.24, peak: 0.4, startMs: 0, harmonics: [[1, 1], [2, 0.18]] }),
          note(440.0, 180, { decay: 0.24, peak: 0.42, startMs: 100, harmonics: [[1, 1], [2, 0.18]] }),
          note(523.25, 250, { decay: 0.3, peak: 0.48, startMs: 200, harmonics: [[1, 1], [2, 0.2]] }),
          note(698.46, 210, { decay: 0.32, peak: 0.2, startMs: 200, harmonics: [[1, 1], [2, 0.15]] }),
        ],
        460
      ),
      { delayMs: 95, decay: 0.22, repeats: 2 }
    )
  )
);

writeWav(
  "ultra-win.wav",
  finalize(
    applyEcho(
      mixLayers(
        [
          thump(190, { peak: 0.6 }),
          note(261.6, 170, { decay: 0.27, peak: 0.4, startMs: 60, harmonics: [[1, 1], [2, 0.2]] }),
          note(349.23, 170, { decay: 0.27, peak: 0.42, startMs: 150, harmonics: [[1, 1], [2, 0.2]] }),
          note(440.0, 170, { decay: 0.27, peak: 0.44, startMs: 240, harmonics: [[1, 1], [2, 0.2]] }),
          note(523.25, 200, { decay: 0.3, peak: 0.48, startMs: 330, harmonics: [[1, 1], [2, 0.22]] }),
          note(698.46, 400, { decay: 0.48, peak: 0.5, startMs: 430, harmonics: [[1, 1], [2, 0.25]] }),
          // shimmer layer, slightly detuned for a richer fanfare/chorus feel —
          // kept an octave lower than before so it reads as warm, not shrill.
          note(698.46, 400, { decay: 0.48, peak: 0.2, startMs: 430, detuneCents: 12 }),
          note(880.0, 360, { decay: 0.45, peak: 0.26, startMs: 460, harmonics: [[1, 1], [2, 0.2]] }),
        ],
        870
      ),
      { delayMs: 120, decay: 0.3, repeats: 3 }
    )
  )
);

writeWav(
  "error.wav",
  finalize(
    mixLayers(
      [
        note(220, 140, { decay: 0.16, peak: 0.4, startMs: 0, harmonics: [[1, 1], [1.03, 0.5]] }),
        note(140, 190, { decay: 0.2, peak: 0.42, startMs: 130, harmonics: [[1, 1], [1.03, 0.5]] }),
      ],
      340
    )
  )
);

writeWav(
  "flip.wav",
  finalize(applyEcho(mixLayers([sweep(220, 620, 170, { peak: 0.44, decay: 0.22 })], 190), { delayMs: 65, decay: 0.18, repeats: 2 }))
);

console.log("Done.");
