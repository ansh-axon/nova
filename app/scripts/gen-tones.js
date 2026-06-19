// Generates NOVA's built-in notification/ringtone WAV files (no dependencies).
// Pure 16-bit PCM mono WAV synthesised from sine waves with soft envelopes so
// they sound like clean chimes rather than harsh beeps.
//
// Run:  node scripts/gen-tones.js
// Output: assets/tones/*.wav

const fs = require('fs');
const path = require('path');

const SR = 22050;          // sample rate (Hz) — plenty for chimes, keeps files small
const OUT = path.join(__dirname, '..', 'assets', 'tones');

// Musical note frequencies (Hz)
const N = {
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99,
  A5: 880.0, B5: 987.77, C6: 1046.5, E6: 1318.5, G6: 1568.0,
};

// Render a single note (sine + soft octave) with attack/exponential-decay
// envelope into the float buffer at the given start time.
function addNote(buf, startSec, durSec, freq, gain = 0.6) {
  const start = Math.floor(startSec * SR);
  const len = Math.floor(durSec * SR);
  const attack = Math.floor(0.006 * SR); // 6ms attack to avoid clicks
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    // Envelope: quick attack, then exponential decay.
    let env;
    if (i < attack) env = i / attack;
    else env = Math.exp(-3.2 * (i - attack) / len);
    const sample =
      Math.sin(2 * Math.PI * freq * t) * 0.8 +
      Math.sin(2 * Math.PI * freq * 2 * t) * 0.2; // subtle octave for shimmer
    const idx = start + i;
    if (idx < buf.length) buf[idx] += sample * env * gain;
  }
}

// Write a float[-1..1] buffer to a 16-bit PCM mono WAV file.
function writeWav(name, floatBuf) {
  const numSamples = floatBuf.length;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);        // PCM
  buffer.writeUInt16LE(1, 22);        // mono
  buffer.writeUInt32LE(SR, 24);
  buffer.writeUInt32LE(SR * 2, 28);   // byte rate
  buffer.writeUInt16LE(2, 32);        // block align
  buffer.writeUInt16LE(16, 34);       // bits per sample
  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i++) {
    let s = Math.max(-1, Math.min(1, floatBuf[i]));
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), buffer);
  console.log('wrote', name, (dataSize / 1024).toFixed(0) + 'KB');
}

function makeBuffer(seconds) {
  return new Float32Array(Math.floor(seconds * SR));
}

// ── Short notification tones ──

// Pulse: a single crisp two-layer blip.
(() => {
  const b = makeBuffer(0.4);
  addNote(b, 0.0, 0.35, N.A5, 0.7);
  addNote(b, 0.0, 0.35, N.E6, 0.25);
  writeWav('pulse.wav', b);
})();

// Chime: classic two-note "ding-dong".
(() => {
  const b = makeBuffer(0.9);
  addNote(b, 0.0, 0.45, N.E6, 0.6);
  addNote(b, 0.22, 0.6, N.C6, 0.6);
  writeWav('chime.wav', b);
})();

// Ripple: gentle ascending three-note sparkle.
(() => {
  const b = makeBuffer(0.8);
  addNote(b, 0.0, 0.3, N.C5, 0.55);
  addNote(b, 0.12, 0.3, N.E5, 0.55);
  addNote(b, 0.24, 0.45, N.G5, 0.6);
  writeWav('ripple.wav', b);
})();

// Glow: soft descending two-note for group messages.
(() => {
  const b = makeBuffer(0.9);
  addNote(b, 0.0, 0.4, N.G5, 0.6);
  addNote(b, 0.18, 0.6, N.D5, 0.55);
  writeWav('glow.wav', b);
})();

// ── Longer ringtones (for calls) ──

// Beacon: a repeating digital-style two-tone ring (~4s).
(() => {
  const b = makeBuffer(4.0);
  for (let r = 0; r < 4; r++) {
    const o = r * 1.0;
    addNote(b, o + 0.0, 0.28, N.A5, 0.6);
    addNote(b, o + 0.18, 0.28, N.E6, 0.55);
    addNote(b, o + 0.4, 0.28, N.A5, 0.55);
  }
  writeWav('beacon.wav', b);
})();

// Aurora: a melodic ascending arpeggio that repeats (~4s).
(() => {
  const b = makeBuffer(4.0);
  const pattern = [N.C5, N.E5, N.G5, N.C6, N.G5, N.E5];
  for (let r = 0; r < 4; r++) {
    const base = r * 1.0;
    pattern.forEach((f, i) => addNote(b, base + i * 0.15, 0.32, f, 0.5));
  }
  writeWav('aurora.wav', b);
})();

console.log('Done. Tones in', OUT);
