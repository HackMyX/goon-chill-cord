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

/**
 * Every sound used to just stop dead at the end of its buffer — the
 * exponential decay envelopes in `note()`/`sweep()` are nowhere near zero
 * by the time the fixed `durationMs` runs out (e.g. hover's old envelope
 * was still at ~48% amplitude at cutoff), which is an audible click/thud
 * every single time. This forces a smooth cosine ease-out over the last
 * stretch of *every* generated sound regardless of its own envelope, so
 * nothing ever ends on a hard edge — this is what "abrupt"/"kacke" sounding
 * endings actually were, independent of pitch or timbre.
 */
function fadeTail(samples, { maxMs = 35, minMs = 8, fraction = 0.18 } = {}) {
  const totalMs = (samples.length / SAMPLE_RATE) * 1000;
  const fadeMs = Math.min(maxMs, Math.max(minMs, totalMs * fraction));
  const fadeSamples = Math.min(samples.length, Math.round((fadeMs / 1000) * SAMPLE_RATE));
  const out = Float32Array.from(samples);
  const start = out.length - fadeSamples;
  for (let i = 0; i < fadeSamples; i++) {
    const t = i / fadeSamples;
    const gain = 0.5 * (1 + Math.cos(Math.PI * t)); // 1 -> 0, smooth (no kink at either end)
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

// --- the actual sound effects ---
//
// Round 4: "soft jump" register for the interaction sounds (hover/click/
// tick/flip) — a quick upward pitch *sweep* instead of a flat tone, the
// same shape as a mobile-game jump/hop blip (Stumble Guys etc.): rises,
// peaks, and is gone before it can read as a "beep". hover/click/tick all
// share this family now (same sweep shape, just different range/duration)
// instead of each being an unrelated flat note. win/ultra-win are still
// the ascending major-arpeggio "jackpot" fanfare — a different job
// (reward, not UI feedback) — and error stays deliberately low/dissonant,
// since a "happy jump" sound would undercut it being negative feedback.
// Every sound still ends through `fadeTail()` so nothing clicks/cuts off.

writeWav(
  "hover.wav",
  fadeTail(finalize(mixLayers([sweep(420, 680, 60, { peak: 0.2, decay: 0.12 })], 70)))
);

writeWav(
  "click.wav",
  fadeTail(
    finalize(
      mixLayers([sweep(360, 720, 90, { peak: 0.4, decay: 0.16 })], 100)
    )
  )
);

writeWav(
  "tick.wav",
  fadeTail(finalize(mixLayers([sweep(340, 540, 32, { peak: 0.3, decay: 0.08 })], 40)))
);

writeWav(
  "win.wav",
  fadeTail(
    finalize(
      applyEcho(
        mixLayers(
          [
            note(523.25, 170, { decay: 0.24, peak: 0.4, startMs: 0, harmonics: [[1, 1], [2, 0.35], [3, 0.1]] }),
            note(659.25, 170, { decay: 0.24, peak: 0.42, startMs: 95, harmonics: [[1, 1], [2, 0.35], [3, 0.1]] }),
            note(783.99, 230, { decay: 0.3, peak: 0.48, startMs: 190, harmonics: [[1, 1], [2, 0.38], [3, 0.12]] }),
            note(1046.5, 260, { decay: 0.34, peak: 0.32, startMs: 190, harmonics: [[1, 1], [2, 0.3]] }),
          ],
          460
        ),
        { delayMs: 90, decay: 0.24, repeats: 2 }
      )
    )
  )
);

writeWav(
  "ultra-win.wav",
  fadeTail(
    finalize(
      applyEcho(
        mixLayers(
          [
            thump(190, { peak: 0.55 }),
            note(523.25, 160, { decay: 0.26, peak: 0.4, startMs: 60, harmonics: [[1, 1], [2, 0.32]] }),
            note(659.25, 160, { decay: 0.26, peak: 0.42, startMs: 150, harmonics: [[1, 1], [2, 0.32]] }),
            note(783.99, 160, { decay: 0.26, peak: 0.44, startMs: 240, harmonics: [[1, 1], [2, 0.34]] }),
            note(1046.5, 200, { decay: 0.3, peak: 0.5, startMs: 330, harmonics: [[1, 1], [2, 0.36]] }),
            note(1318.5, 420, { decay: 0.5, peak: 0.5, startMs: 430, harmonics: [[1, 1], [2, 0.3]] }),
            // shimmer layer, slightly detuned for a richer fanfare/chorus feel
            note(1318.5, 420, { decay: 0.5, peak: 0.2, startMs: 430, detuneCents: 12 }),
            note(1568.0, 380, { decay: 0.46, peak: 0.26, startMs: 460, harmonics: [[1, 1], [2, 0.28]] }),
          ],
          880
        ),
        { delayMs: 110, decay: 0.32, repeats: 3 }
      )
    )
  )
);

writeWav(
  "error.wav",
  fadeTail(
    finalize(
      mixLayers(
        [
          note(220, 140, { decay: 0.16, peak: 0.4, startMs: 0, harmonics: [[1, 1], [1.03, 0.5]] }),
          note(140, 190, { decay: 0.2, peak: 0.42, startMs: 130, harmonics: [[1, 1], [1.03, 0.5]] }),
        ],
        340
      )
    )
  )
);

writeWav(
  "flip.wav",
  fadeTail(
    finalize(
      applyEcho(mixLayers([sweep(380, 820, 170, { peak: 0.44, decay: 0.22 })], 190), {
        delayMs: 65,
        decay: 0.18,
        repeats: 2,
      })
    )
  )
);

// Confirmation chime for "saved" feedback across admin/account forms — a
// quick two-note rising "ding-ding", lighter/shorter than the win fanfare
// (which signals a reward, not a settings save) but more substantial than
// the generic click so a save genuinely reads as confirmed.
writeWav(
  "save.wav",
  fadeTail(
    finalize(
      applyEcho(
        mixLayers(
          [
            note(784, 110, { decay: 0.16, peak: 0.42, startMs: 0, harmonics: [[1, 1], [2, 0.3], [3, 0.08]] }),
            note(1046.5, 150, { decay: 0.22, peak: 0.46, startMs: 90, harmonics: [[1, 1], [2, 0.32], [3, 0.1]] }),
          ],
          260
        ),
        { delayMs: 80, decay: 0.2, repeats: 2 }
      )
    )
  )
);

// Melee impact: a short sub-bass thump (reusing the ultra-win kick-drum
// shape, just much shorter/punchier) layered with a brief high "crack" —
// the thump alone reads as a dull bump, the crack on top of it is what
// makes it read as a hit landing rather than a soft thud.
writeWav(
  "hit.wav",
  fadeTail(
    finalize(
      mixLayers(
        [
          thump(90, { peak: 0.65, startFreq: 220, endFreq: 60 }),
          note(950, 35, { decay: 0.035, peak: 0.32, startMs: 0, harmonics: [[1, 1], [1.8, 0.4]] }),
        ],
        110
      )
    )
  )
);

console.log("Done.");
