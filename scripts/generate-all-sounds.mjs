/**
 * Generates ALL extended sound files for public/sounds/.
 * Run: node scripts/generate-all-sounds.mjs
 *
 * Uses the same procedural WAV synthesis as generate-sounds.mjs
 * (sine/triangle harmonics, sweep, echo, tanh soft-clip, fade-tail).
 * Every sound is distinct — different pitch range, duration, and character.
 */
import { writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "sounds");
const SR = 44100; // sample rate

// ─── Core Synthesis Primitives ───────────────────────────────────────────────

function envelope(i, attackSamples, decaySeconds) {
  if (i < attackSamples) return i / attackSamples;
  return Math.exp(-((i - attackSamples) / SR) / decaySeconds);
}

function note(freq, durationMs, opts = {}) {
  const {
    attack = 0.004, decay = 0.35, peak = 0.5, startMs = 0,
    harmonics = [[1, 1], [2, 0.35], [3, 0.12]],
    detuneCents = 0,
  } = opts;
  const samples = Math.round((durationMs / 1000) * SR);
  const attackSamples = Math.max(1, Math.round(attack * SR));
  const detune = Math.pow(2, detuneCents / 1200);
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / SR;
    const env = envelope(i, attackSamples, decay);
    let s = 0;
    for (const [m, a] of harmonics) s += Math.sin(2 * Math.PI * freq * m * detune * t) * a;
    out[i] = s * env * peak;
  }
  return { samples: out, startMs };
}

function sweep(freqStart, freqEnd, durationMs, { peak = 0.6, decay = 0.3, startMs = 0 } = {}) {
  const samples = Math.round((durationMs / 1000) * SR);
  const out = new Float32Array(samples);
  let phase = 0;
  for (let i = 0; i < samples; i++) {
    const p = i / samples;
    const freq = freqStart + (freqEnd - freqStart) * p;
    phase += (2 * Math.PI * freq) / SR;
    const env = Math.exp(-(i / SR) / decay) * (1 - Math.exp(-i / 200));
    out[i] = (Math.sin(phase) + Math.sin(phase * 2) * 0.25) * env * peak;
  }
  return { samples: out, startMs };
}

function noise(durationMs, { peak = 0.3, decay = 0.1, startMs = 0 } = {}) {
  const samples = Math.round((durationMs / 1000) * SR);
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const env = Math.exp(-(i / SR) / decay);
    out[i] = (Math.random() * 2 - 1) * env * peak;
  }
  return { samples: out, startMs };
}

function thump(durationMs, { peak = 0.7, startFreq = 160, endFreq = 45, startMs = 0 } = {}) {
  const samples = Math.round((durationMs / 1000) * SR);
  const out = new Float32Array(samples);
  let phase = 0;
  for (let i = 0; i < samples; i++) {
    const p = i / samples;
    const freq = startFreq + (endFreq - startFreq) * p;
    phase += (2 * Math.PI * freq) / SR;
    out[i] = Math.sin(phase) * Math.exp(-(i / SR) / 0.12) * peak;
  }
  return { samples: out, startMs };
}

function mixLayers(layers, totalDurationMs) {
  const total = Math.round((totalDurationMs / 1000) * SR);
  const out = new Float32Array(total);
  for (const layer of layers) {
    const offset = Math.round((layer.startMs / 1000) * SR);
    for (let i = 0; i < layer.samples.length; i++) {
      const idx = offset + i;
      if (idx >= 0 && idx < out.length) out[idx] += layer.samples[i];
    }
  }
  return out;
}

function applyEcho(samples, { delayMs = 70, decay = 0.35, repeats = 3 } = {}) {
  const ds = Math.round((delayMs / 1000) * SR);
  const out = new Float32Array(samples.length + ds * repeats);
  out.set(samples, 0);
  let amp = decay;
  for (let r = 1; r <= repeats; r++) {
    const offset = ds * r;
    for (let i = 0; i < samples.length; i++) out[i + offset] += samples[i] * amp;
    amp *= decay;
  }
  return out;
}

function fadeTail(samples, { maxMs = 35, minMs = 8, fraction = 0.18 } = {}) {
  const totalMs = (samples.length / SR) * 1000;
  const fadeMs = Math.min(maxMs, Math.max(minMs, totalMs * fraction));
  const fadeSamples = Math.min(samples.length, Math.round((fadeMs / 1000) * SR));
  const out = Float32Array.from(samples);
  const start = out.length - fadeSamples;
  for (let i = 0; i < fadeSamples; i++) {
    out[start + i] *= 0.5 * (1 + Math.cos(Math.PI * (i / fadeSamples)));
  }
  return out;
}

function finalize(floatSamples) {
  const out = new Float32Array(floatSamples.length);
  for (let i = 0; i < floatSamples.length; i++) out[i] = Math.tanh(floatSamples[i]);
  return out;
}

function writeWav(filename, floatSamples, { skip = false } = {}) {
  const path = join(OUT_DIR, filename);
  if (skip && existsSync(path)) {
    console.log(`skip   ${filename} (exists)`);
    return;
  }
  const ns = floatSamples.length;
  const buf = Buffer.alloc(44 + ns * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + ns * 2, 4);
  buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34); buf.write("data", 36);
  buf.writeUInt32LE(ns * 2, 40);
  for (let i = 0; i < ns; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, floatSamples[i])) * 32767), 44 + i * 2);
  }
  writeFileSync(path, buf);
  console.log(`wrote  ${filename.padEnd(28)} (${(buf.length / 1024).toFixed(1)} KB)`);
}

// ─── Sounds ──────────────────────────────────────────────────────────────────
// All 35 new files. Existing 9 files (click, error, flip, hit, hover, save,
// tick, ultra-win, win) are skipped with {skip:true} to avoid overwriting
// the carefully tuned originals.

// coin.wav — bright, light, high-pitched ping (coin clink)
writeWav("coin.wav", fadeTail(finalize(applyEcho(
  mixLayers([
    note(1567.98, 55, { decay: 0.06, peak: 0.38, harmonics: [[1,1],[2,0.5],[4,0.2]] }),
    note(2093.00, 45, { decay: 0.05, peak: 0.28, startMs: 30, harmonics: [[1,1],[2,0.4]] }),
  ], 120),
  { delayMs: 38, decay: 0.12, repeats: 2 }
))));

// ding.wav — clean single bell tone (shorter than chime)
writeWav("ding.wav", fadeTail(finalize(applyEcho(
  mixLayers([note(987.77, 220, { decay: 0.38, peak: 0.42, harmonics: [[1,1],[2,0.28],[3,0.1]] })], 270),
  { delayMs: 95, decay: 0.28, repeats: 2 }
))));

// swoosh.wav — upward air sweep (energy / launch feel)
writeWav("swoosh.wav", fadeTail(finalize(
  mixLayers([sweep(180, 2200, 180, { peak: 0.38, decay: 0.14 })], 200)
)));

// pop.wav — bubble-pop burst (brief, low-to-silence)
writeWav("pop.wav", fadeTail(finalize(
  mixLayers([sweep(340, 75, 55, { peak: 0.48, decay: 0.045 })], 65)
)));

// chime.wav — clear bright bell chime
writeWav("chime.wav", fadeTail(finalize(applyEcho(
  mixLayers([note(1318.51, 240, { decay: 0.44, peak: 0.42, harmonics: [[1,1],[2,0.3],[3,0.1]] })], 290),
  { delayMs: 108, decay: 0.26, repeats: 2 }
))));

// chime-low.wav — deeper warm bell chime
writeWav("chime-low.wav", fadeTail(finalize(applyEcho(
  mixLayers([note(659.25, 280, { decay: 0.48, peak: 0.40, harmonics: [[1,1],[2,0.26],[3,0.09]] })], 330),
  { delayMs: 115, decay: 0.28, repeats: 2 }
))));

// boom.wav — sub-bass impact (heavy kick)
writeWav("boom.wav", fadeTail(finalize(
  mixLayers([thump(260, { peak: 0.82, startFreq: 110, endFreq: 28 })], 290)
)));

// zap.wav — electric downward zap
writeWav("zap.wav", fadeTail(finalize(
  mixLayers([sweep(2400, 320, 75, { peak: 0.48, decay: 0.058 })], 95)
)));

// powerup.wav — ascending 4-note synth arpeggio
writeWav("powerup.wav", fadeTail(finalize(applyEcho(
  mixLayers([
    note(523.25, 90,  { decay: 0.12, peak: 0.34, startMs: 0   }),
    note(659.25, 90,  { decay: 0.13, peak: 0.36, startMs: 70  }),
    note(783.99, 90,  { decay: 0.14, peak: 0.38, startMs: 140 }),
    note(1046.5, 160, { decay: 0.22, peak: 0.44, startMs: 210 }),
  ], 395),
  { delayMs: 58, decay: 0.20, repeats: 2 }
))));

// select.wav — crisp selection tick
writeWav("select.wav", fadeTail(finalize(
  mixLayers([sweep(480, 760, 45, { peak: 0.28, decay: 0.075 })], 58)
)));

// notification.wav — two-tone chime ping
writeWav("notification.wav", fadeTail(finalize(applyEcho(
  mixLayers([
    note(880,     130, { decay: 0.18, peak: 0.36, startMs: 0,   harmonics: [[1,1],[2,0.28]] }),
    note(1174.66, 180, { decay: 0.28, peak: 0.40, startMs: 115, harmonics: [[1,1],[2,0.28]] }),
  ], 320),
  { delayMs: 88, decay: 0.20, repeats: 2 }
))));

// achievement.wav — fanfare with bass punch (short triumph)
writeWav("achievement.wav", fadeTail(finalize(applyEcho(
  mixLayers([
    thump(110, { peak: 0.44 }),
    note(659.25, 140, { decay: 0.18, peak: 0.36, startMs: 25  }),
    note(783.99, 140, { decay: 0.20, peak: 0.38, startMs: 115 }),
    note(1046.5, 200, { decay: 0.28, peak: 0.44, startMs: 215 }),
    note(1318.5, 300, { decay: 0.42, peak: 0.50, startMs: 335 }),
  ], 660),
  { delayMs: 98, decay: 0.28, repeats: 3 }
))));

// levelup-epic.wav — full epic ascent (5 notes + shimmer + thump)
writeWav("levelup-epic.wav", fadeTail(finalize(applyEcho(
  mixLayers([
    thump(170, { peak: 0.58 }),
    note(440,    140, { decay: 0.18, peak: 0.38, startMs: 0   }),
    note(523.25, 140, { decay: 0.20, peak: 0.40, startMs: 98  }),
    note(659.25, 140, { decay: 0.22, peak: 0.42, startMs: 196 }),
    note(880,    180, { decay: 0.26, peak: 0.46, startMs: 295 }),
    note(1046.5, 340, { decay: 0.44, peak: 0.53, startMs: 415 }),
    note(1318.5, 270, { decay: 0.38, peak: 0.32, startMs: 445, detuneCents: 14 }),
  ], 810),
  { delayMs: 118, decay: 0.30, repeats: 3 }
))));

// fanfare.wav — quick 3-note triumph
writeWav("fanfare.wav", fadeTail(finalize(applyEcho(
  mixLayers([
    note(783.99,  155, { decay: 0.20, peak: 0.40, startMs: 0   }),
    note(987.77,  155, { decay: 0.22, peak: 0.42, startMs: 118 }),
    note(1244.51, 270, { decay: 0.36, peak: 0.50, startMs: 235 }),
  ], 540),
  { delayMs: 88, decay: 0.24, repeats: 2 }
))));

// whoosh.wav — quick air whoosh (shorter than swoosh)
writeWav("whoosh.wav", fadeTail(finalize(
  mixLayers([sweep(700, 2600, 90, { peak: 0.32, decay: 0.07 })], 105)
)));

// glitch.wav — dissonant digital glitch
writeWav("glitch.wav", fadeTail(finalize(
  mixLayers([
    note(440, 48, { decay: 0.04, peak: 0.40, harmonics: [[1,1],[1.032,0.82],[1.071,0.55]] }),
    note(660, 48, { decay: 0.04, peak: 0.35, startMs: 44, harmonics: [[1,1],[1.028,0.75]] }),
    note(330, 58, { decay: 0.05, peak: 0.45, startMs: 88, harmonics: [[1,1],[1.055,0.68],[2.1,0.4]] }),
  ], 175)
)));

// laser.wav — sci-fi laser beam (high → low)
writeWav("laser.wav", fadeTail(finalize(
  mixLayers([sweep(1900, 280, 110, { peak: 0.44, decay: 0.085 })], 130)
)));

// punch.wav — melee punch impact
writeWav("punch.wav", fadeTail(finalize(
  mixLayers([
    thump(75, { peak: 0.68, startFreq: 190, endFreq: 52 }),
    note(720, 24, { decay: 0.024, peak: 0.38, startMs: 0, harmonics: [[1,1],[1.72,0.45]] }),
    noise(35, { peak: 0.18, decay: 0.028, startMs: 0 }),
  ], 98)
)));

// shield-block.wav — metallic shield clang
writeWav("shield-block.wav", fadeTail(finalize(applyEcho(
  mixLayers([
    note(440, 48, { decay: 0.058, peak: 0.50, harmonics: [[1,1],[2,0.62],[3,0.32],[4,0.18]] }),
    note(554, 58, { decay: 0.065, peak: 0.36, startMs: 14, harmonics: [[1,1],[2,0.52]] }),
    noise(40, { peak: 0.12, decay: 0.03, startMs: 0 }),
  ], 125),
  { delayMs: 38, decay: 0.14, repeats: 2 }
))));

// sword-swing.wav — blade whoosh with edge glint
writeWav("sword-swing.wav", fadeTail(finalize(
  mixLayers([
    sweep(180, 1500, 115, { peak: 0.38, decay: 0.09 }),
    note(920, 28, { decay: 0.028, peak: 0.22, startMs: 82, harmonics: [[1,1],[2,0.4]] }),
  ], 148)
)));

// coin-collect.wav — rapid coin trio ding
writeWav("coin-collect.wav", fadeTail(finalize(applyEcho(
  mixLayers([
    note(1046.5, 58,  { decay: 0.07, peak: 0.34, startMs: 0,  harmonics: [[1,1],[2,0.42]] }),
    note(1174.66, 58, { decay: 0.08, peak: 0.36, startMs: 48, harmonics: [[1,1],[2,0.42]] }),
    note(1318.51, 75, { decay: 0.11, peak: 0.40, startMs: 96, harmonics: [[1,1],[2,0.42]] }),
  ], 200),
  { delayMs: 48, decay: 0.14, repeats: 2 }
))));

// ui-open.wav — smooth panel slide open
writeWav("ui-open.wav", fadeTail(finalize(
  mixLayers([sweep(280, 960, 115, { peak: 0.28, decay: 0.13 })], 132)
)));

// ui-close.wav — smooth panel slide closed
writeWav("ui-close.wav", fadeTail(finalize(
  mixLayers([sweep(960, 280, 95, { peak: 0.24, decay: 0.11 })], 112)
)));

// success-soft.wav — gentle two-note success (subtle form confirm)
writeWav("success-soft.wav", fadeTail(finalize(applyEcho(
  mixLayers([
    note(784,    98,  { decay: 0.13, peak: 0.30, harmonics: [[1,1],[2,0.26]] }),
    note(987.77, 135, { decay: 0.19, peak: 0.36, startMs: 82, harmonics: [[1,1],[2,0.26]] }),
  ], 248),
  { delayMs: 78, decay: 0.19, repeats: 2 }
))));

// success-hard.wav — punchy three-note success fanfare
writeWav("success-hard.wav", fadeTail(finalize(applyEcho(
  mixLayers([
    note(659.25, 128, { decay: 0.16, peak: 0.40, startMs: 0   }),
    note(880,    128, { decay: 0.18, peak: 0.42, startMs: 98  }),
    note(1318.5, 255, { decay: 0.34, peak: 0.50, startMs: 196 }),
  ], 475),
  { delayMs: 82, decay: 0.20, repeats: 2 }
))));

// ─── 10 Additional New Sounds ─────────────────────────────────────────────

// blip.wav — tiny micro blip (smallest possible UI feedback)
writeWav("blip.wav", fadeTail(finalize(
  mixLayers([sweep(620, 940, 22, { peak: 0.22, decay: 0.042 })], 32)
)));

// crunch.wav — destructive impact crunch
writeWav("crunch.wav", fadeTail(finalize(
  mixLayers([
    thump(58, { peak: 0.62, startFreq: 260, endFreq: 75 }),
    note(318, 28, { decay: 0.028, peak: 0.42, harmonics: [[1,1],[1.28,0.82],[1.71,0.55],[2.3,0.32]] }),
    noise(50, { peak: 0.22, decay: 0.038, startMs: 0 }),
  ], 82)
)));

// magic.wav — sparkle magic trinket (rising triple ping)
writeWav("magic.wav", fadeTail(finalize(applyEcho(
  mixLayers([
    note(1568,    78,  { decay: 0.095, peak: 0.30, startMs: 0,   harmonics: [[1,1],[2,0.38]] }),
    note(1760,    78,  { decay: 0.100, peak: 0.32, startMs: 62,  harmonics: [[1,1],[2,0.38]] }),
    note(2093,    115, { decay: 0.150, peak: 0.38, startMs: 124, harmonics: [[1,1],[2,0.32]] }),
  ], 280),
  { delayMs: 44, decay: 0.18, repeats: 3 }
))));

// warp.wav — teleport warp (up then down sweep)
writeWav("warp.wav", fadeTail(finalize(applyEcho(
  mixLayers([
    sweep(180, 2200, 145, { peak: 0.38, decay: 0.11 }),
    { ...sweep(2200, 180, 145, { peak: 0.28, decay: 0.10 }), startMs: 95 },
  ], 280),
  { delayMs: 58, decay: 0.18, repeats: 2 }
))));

// unlock.wav — lock click + rising chime (unlock/achievement)
writeWav("unlock.wav", fadeTail(finalize(applyEcho(
  mixLayers([
    note(523.25, 78,  { decay: 0.09, peak: 0.36, harmonics: [[1,1],[2,0.42],[3,0.22]] }),
    note(783.99, 138, { decay: 0.17, peak: 0.44, startMs: 72, harmonics: [[1,1],[2,0.38],[3,0.16]] }),
  ], 238),
  { delayMs: 68, decay: 0.20, repeats: 2 }
))));

// alarm.wav — repeating triple alert blip
writeWav("alarm.wav", fadeTail(finalize(
  mixLayers([
    note(880,     98,  { decay: 0.075, peak: 0.44, startMs: 0,   harmonics: [[1,1],[1.020,0.72]] }),
    note(880,     98,  { decay: 0.075, peak: 0.44, startMs: 148, harmonics: [[1,1],[1.020,0.72]] }),
    note(1108.73, 118, { decay: 0.095, peak: 0.50, startMs: 296, harmonics: [[1,1],[1.020,0.72]] }),
  ], 448)
)));

// cheer.wav — celebratory multi-note cheer
writeWav("cheer.wav", fadeTail(finalize(applyEcho(
  mixLayers([
    note(523.25, 118, { decay: 0.15, peak: 0.34, startMs: 0   }),
    note(659.25, 118, { decay: 0.16, peak: 0.36, startMs: 78  }),
    note(880,    118, { decay: 0.16, peak: 0.38, startMs: 156 }),
    note(1046.5, 198, { decay: 0.26, peak: 0.44, startMs: 234 }),
    note(1318.5, 148, { decay: 0.19, peak: 0.34, startMs: 294 }),
  ], 478),
  { delayMs: 78, decay: 0.20, repeats: 2 }
))));

// drop.wav — item drop (descending quick sweep)
writeWav("drop.wav", fadeTail(finalize(
  mixLayers([sweep(620, 195, 75, { peak: 0.38, decay: 0.062 })], 88)
)));

// place.wav — soft place / set down
writeWav("place.wav", fadeTail(finalize(
  mixLayers([
    thump(48, { peak: 0.48, startFreq: 310, endFreq: 145 }),
    note(820, 28, { decay: 0.038, peak: 0.22, harmonics: [[1,1],[2,0.32]] }),
  ], 68)
)));

// reward.wav — reward jingle (distinct from win — slower, warmer)
writeWav("reward.wav", fadeTail(finalize(applyEcho(
  mixLayers([
    note(659.25, 108, { decay: 0.13, peak: 0.36, startMs: 0   }),
    note(880,    108, { decay: 0.14, peak: 0.38, startMs: 88  }),
    note(1046.5, 175, { decay: 0.22, peak: 0.44, startMs: 176 }),
  ], 378),
  { delayMs: 78, decay: 0.21, repeats: 2 }
))));

console.log("\nAll sounds generated successfully.");
