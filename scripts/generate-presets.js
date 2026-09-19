const fs = require('fs');
const path = require('path');

const PRESETS_DIR = path.join(__dirname, '..', 'assets', 'sounds', 'presets');
if (!fs.existsSync(PRESETS_DIR)) {
  fs.mkdirSync(PRESETS_DIR, { recursive: true });
}

function createWavBuffer(sampleRate, samples) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataLength = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataLength);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);

  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    let val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    buffer.writeInt16LE(Math.floor(val), 44 + i * 2);
  }
  return buffer;
}

const sr = 44100;

// 1. Vine Boom (deep distorted sub-bass impact)
function genVineBoom() {
  const dur = 1.2;
  const n = Math.floor(sr * dur);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const freq = 65 * Math.exp(-t * 3.5) + 30;
    const sub = Math.sin(2 * Math.PI * freq * t);
    const noise = (Math.random() * 2 - 1) * Math.exp(-t * 22) * 0.4;
    // Soft overdrive distortion
    let raw = (sub * 1.5 + noise);
    let dist = Math.tanh(raw * 2.2);
    s[i] = dist * Math.exp(-t * 2.8) * 0.95;
  }
  return createWavBuffer(sr, s);
}

// 2. Metal Pipe (high clattering harmonic resonance)
function genMetalPipe() {
  const dur = 0.9;
  const n = Math.floor(sr * dur);
  const s = new Float32Array(n);
  const freqs = [587, 880, 1174, 1760, 2349, 3136];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let val = 0;
    for (let j = 0; j < freqs.length; j++) {
      const f = freqs[j] * (1 + (Math.random() - 0.5) * 0.03);
      val += Math.sin(2 * Math.PI * f * t) * Math.exp(-t * (4 + j * 2.5));
    }
    const impact = (Math.random() * 2 - 1) * Math.exp(-t * 60) * 0.8;
    s[i] = (val * 0.25 + impact) * 0.85;
  }
  return createWavBuffer(sr, s);
}

// 3. Ka-Ching / Cash Register
function genKaChing() {
  const dur = 0.8;
  const n = Math.floor(sr * dur);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    // Bell chime at t > 0.15
    let bell = 0;
    if (t > 0.12) {
      const tb = t - 0.12;
      bell = (Math.sin(2 * Math.PI * 2093 * tb) * 0.6 +
              Math.sin(2 * Math.PI * 3135 * tb) * 0.4) * Math.exp(-tb * 5);
    }
    // Mechanical gear click / drawer slam at t < 0.2
    let mech = (Math.sin(2 * Math.PI * 180 * t) + (Math.random() * 2 - 1) * 0.8) * Math.exp(-t * 25);
    s[i] = (bell * 0.8 + mech * 0.4);
  }
  return createWavBuffer(sr, s);
}

// 4. Emotional Damage (dramatic brass hit)
function genEmotionalDamage() {
  const dur = 1.0;
  const n = Math.floor(sr * dur);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f1 = 220, f2 = 277.18, f3 = 329.63, f4 = 440; // A major triad
    let brass = Math.sin(2 * Math.PI * f1 * t) * 0.3 +
                Math.sin(2 * Math.PI * f2 * t) * 0.25 +
                Math.sin(2 * Math.PI * f3 * t) * 0.25 +
                Math.sin(2 * Math.PI * f4 * t) * 0.2;
    brass += Math.sin(4 * Math.PI * f1 * t) * 0.15;
    let env = t < 0.04 ? t / 0.04 : Math.exp(-(t - 0.04) * 3);
    s[i] = Math.tanh(brass * 1.8) * env * 0.85;
  }
  return createWavBuffer(sr, s);
}

// 5. Dun Dun Dun (classic dramatic suspense 3 hits)
function genDunDunDun() {
  const dur = 1.4;
  const n = Math.floor(sr * dur);
  const s = new Float32Array(n);
  const hits = [
    { start: 0.0, freq: 196, dur: 0.25 }, // G3
    { start: 0.35, freq: 185, dur: 0.25 }, // F#3
    { start: 0.70, freq: 130.81, dur: 0.65 } // C3 heavy hit
  ];

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let val = 0;
    for (const h of hits) {
      if (t >= h.start && t < h.start + h.dur) {
        const dt = t - h.start;
        const env = Math.exp(-dt * (h.dur > 0.4 ? 3 : 7));
        const wave = Math.sin(2 * Math.PI * h.freq * dt) * 0.7 +
                     Math.sin(4 * Math.PI * h.freq * dt) * 0.3;
        const thump = (Math.random() * 2 - 1) * Math.exp(-dt * 40) * 0.3;
        val += (wave + thump) * env;
      }
    }
    s[i] = Math.max(-1, Math.min(1, val * 0.85));
  }
  return createWavBuffer(sr, s);
}

// 6. Boing (cartoon spring)
function genBoing() {
  const dur = 0.65;
  const n = Math.floor(sr * dur);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const lfo = Math.sin(2 * Math.PI * 18 * t);
    const freq = 280 + lfo * 120 + t * 240;
    const env = Math.exp(-t * 4);
    s[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.85;
  }
  return createWavBuffer(sr, s);
}

// 7. Sad Violin (melancholic minor tone)
function genSadViolin() {
  const dur = 1.5;
  const n = Math.floor(sr * dur);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const vibrato = 1 + 0.025 * Math.sin(2 * Math.PI * 5.5 * t);
    const freq = 440 * vibrato; // A4 with vibrato
    // Bowed saw-like string harmonics
    let saw = 0;
    for (let k = 1; k <= 6; k++) {
      saw += (Math.sin(2 * Math.PI * freq * k * t) / k) * (1 / 2.5);
    }
    let env = t < 0.2 ? t / 0.2 : Math.exp(-(t - 0.2) * 1.5);
    s[i] = saw * env * 0.8;
  }
  return createWavBuffer(sr, s);
}

// 8. Level Up (8-bit arcade arpeggio)
function genLevelUp() {
  const dur = 0.6;
  const n = Math.floor(sr * dur);
  const s = new Float32Array(n);
  const notes = [
    { f: 440, d: 0.08 },
    { f: 554.37, d: 0.08 },
    { f: 659.25, d: 0.08 },
    { f: 880, d: 0.36 }
  ];
  let cur = 0;
  for (const note of notes) {
    const noteSamples = Math.floor(sr * note.d);
    for (let i = 0; i < noteSamples; i++) {
      const t = i / sr;
      const pulse = (Math.sin(2 * Math.PI * note.f * t) > 0 ? 0.6 : -0.6);
      const env = Math.exp(-t * 4);
      s[cur + i] = pulse * env;
    }
    cur += noteSamples;
  }
  return createWavBuffer(sr, s);
}

// 9. Record Scratch
function genRecordScratch() {
  const dur = 0.45;
  const n = Math.floor(sr * dur);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const sweep = (t < 0.2 ? (1 - t / 0.2) : (t - 0.2) / 0.25);
    const freq = 300 + sweep * 1800;
    const noise = (Math.random() * 2 - 1) * 0.5;
    const tone = Math.sin(2 * Math.PI * freq * t) * 0.5;
    const env = Math.exp(-t * 6);
    s[i] = (noise + tone) * env * 0.8;
  }
  return createWavBuffer(sr, s);
}

// 10. Gavel (double wood strike)
function genGavel() {
  const dur = 0.65;
  const n = Math.floor(sr * dur);
  const s = new Float32Array(n);
  const strikes = [0.0, 0.22];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let val = 0;
    for (const st of strikes) {
      if (t >= st) {
        const dt = t - st;
        const wood = Math.sin(2 * Math.PI * 220 * dt) * Math.exp(-dt * 30);
        const thud = Math.sin(2 * Math.PI * 90 * dt) * Math.exp(-dt * 20);
        const snap = (Math.random() * 2 - 1) * Math.exp(-dt * 70) * 0.4;
        val += (wood + thud + snap);
      }
    }
    s[i] = Math.max(-1, Math.min(1, val * 0.8));
  }
  return createWavBuffer(sr, s);
}

// 11. Whistle (sports referee)
function genWhistle() {
  const dur = 0.7;
  const n = Math.floor(sr * dur);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const warble = 1 + 0.08 * Math.sin(2 * Math.PI * 32 * t);
    const f1 = 2600 * warble;
    const f2 = 2850 * warble;
    const air = (Math.random() * 2 - 1) * 0.2;
    const sound = (Math.sin(2 * Math.PI * f1 * t) * 0.4 + Math.sin(2 * Math.PI * f2 * t) * 0.4 + air);
    const env = t < 0.05 ? t / 0.05 : t > 0.55 ? (1 - (t - 0.55) / 0.15) : 1;
    s[i] = sound * env * 0.75;
  }
  return createWavBuffer(sr, s);
}

// 12. Oof / Hit
function genOof() {
  const dur = 0.35;
  const n = Math.floor(sr * dur);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const freq = 180 * Math.exp(-t * 12) + 60;
    const punch = (Math.random() * 2 - 1) * Math.exp(-t * 30) * 0.5;
    const body = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 10);
    s[i] = (punch + body) * 0.85;
  }
  return createWavBuffer(sr, s);
}

const presets = [
  { name: 'vine-boom.wav', title: 'Vine Boom', category: 'Memes', color: '#dc2626', gen: genVineBoom },
  { name: 'metal-pipe.wav', title: 'Metal Pipe Falling', category: 'Memes', color: '#eab308', gen: genMetalPipe },
  { name: 'ka-ching.wav', title: 'Cash Register (Ka-Ching)', category: 'Sound Effects', color: '#10b981', gen: genKaChing },
  { name: 'emotional-damage.wav', title: 'Emotional Damage', category: 'Memes', color: '#f97316', gen: genEmotionalDamage },
  { name: 'dun-dun-dun.wav', title: 'Dun Dun Dun (Dramatic)', category: 'Reactions', color: '#8b5cf6', gen: genDunDunDun },
  { name: 'boing.wav', title: 'Cartoon Boing', category: 'Sound Effects', color: '#ec4899', gen: genBoing },
  { name: 'sad-violin.wav', title: 'Sad Violin', category: 'Music', color: '#06b6d4', gen: genSadViolin },
  { name: 'level-up.wav', title: 'Level Up', category: 'Games', color: '#3b82f6', gen: genLevelUp },
  { name: 'record-scratch.wav', title: 'Record Scratch', category: 'Sound Effects', color: '#64748b', gen: genRecordScratch },
  { name: 'gavel.wav', title: 'Judge Gavel Slam', category: 'Sound Effects', color: '#78716c', gen: genGavel },
  { name: 'whistle.wav', title: 'Referee Whistle', category: 'Sound Effects', color: '#14b8a6', gen: genWhistle },
  { name: 'oof.wav', title: 'Classic Oof', category: 'Games', color: '#f43f5e', gen: genOof }
];

console.log('Generating MyInstants preset sounds...');
const presetCatalog = [];
for (const p of presets) {
  const filePath = path.join(PRESETS_DIR, p.name);
  fs.writeFileSync(filePath, p.gen());
  presetCatalog.push({
    id: 'preset_' + p.name.replace('.wav', ''),
    name: p.title,
    category: p.category,
    filename: p.name,
    color: p.color
  });
  console.log(`Generated preset: ${p.title}`);
}

fs.writeFileSync(path.join(PRESETS_DIR, 'catalog.json'), JSON.stringify(presetCatalog, null, 2));
console.log('Preset library generated successfully!');
