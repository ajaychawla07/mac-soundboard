const fs = require('fs');
const path = require('path');

const SOUNDS_DIR = path.join(__dirname, '..', 'assets', 'sounds');
if (!fs.existsSync(SOUNDS_DIR)) {
  fs.mkdirSync(SOUNDS_DIR, { recursive: true });
}

// Helper to write a 16-bit mono PCM WAV buffer
function createWavBuffer(sampleRate, samples) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataLength = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataLength);

  // RIFF identifier
  buffer.write('RIFF', 0);
  // file length minus 8
  buffer.writeUInt32LE(36 + dataLength, 4);
  // RIFF type
  buffer.write('WAVE', 8);
  // format chunk identifier
  buffer.write('fmt ', 12);
  // format chunk length
  buffer.writeUInt32LE(16, 16);
  // sample format (1 is PCM)
  buffer.writeUInt16LE(1, 20);
  // channels
  buffer.writeUInt16LE(numChannels, 22);
  // sample rate
  buffer.writeUInt32LE(sampleRate, 24);
  // byte rate
  buffer.writeUInt32LE(byteRate, 28);
  // block align
  buffer.writeUInt16LE(blockAlign, 32);
  // bits per sample
  buffer.writeUInt16LE(bitsPerSample, 34);
  // data chunk identifier
  buffer.write('data', 36);
  // data length
  buffer.writeUInt32LE(dataLength, 40);

  // Write samples
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    let val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    buffer.writeInt16LE(Math.floor(val), 44 + i * 2);
  }

  return buffer;
}

const sampleRate = 44100;

// 1. Coin / Ding sound (high frequency chime like Mario coin)
function generateCoinSound() {
  const duration = 0.45;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);
  
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let freq = t < 0.08 ? 987.77 : 1318.51; // B5 then E6
    let env = Math.exp(-t * 9);
    samples[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.7;
    // Add a bit of second harmonic sparkle
    samples[i] += Math.sin(4 * Math.PI * freq * t) * env * 0.2;
  }
  return createWavBuffer(sampleRate, samples);
}

// 2. Airhorn (iconic DJ brass sound with detuned saws)
function generateAirhornSound() {
  const duration = 0.65;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  // Classic airhorn rhythm blast
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Pitch envelope: slight pitch drop at start
    const baseFreq = 466.16 * (1 + 0.08 * Math.exp(-t * 20)); // Bb4
    
    // Polyphonic detuned saw waves for thick brass sound
    let val = 0;
    const freqs = [baseFreq * 0.5, baseFreq, baseFreq * 1.008, baseFreq * 1.5, baseFreq * 2.01];
    for (let f of freqs) {
      let phase = (t * f) % 1;
      val += (phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4) * 0.2; // triangle/saw hybrid
    }
    
    // Amplitude envelope: fast attack, steady hold, quick fade
    let env = t < 0.03 ? t / 0.03 : t > 0.5 ? Math.max(0, 1 - (t - 0.5) / 0.15) : 1.0;
    samples[i] = val * env * 0.65;
  }
  return createWavBuffer(sampleRate, samples);
}

// 3. Buzzer / Wrong (dissonant low frequency saw)
function generateBuzzerSound() {
  const duration = 0.5;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Dissonant low frequencies (130Hz and 138Hz)
    let s1 = (Math.sin(2 * Math.PI * 130 * t) > 0 ? 1 : -1) * 0.4;
    let s2 = (Math.sin(2 * Math.PI * 138.5 * t) > 0 ? 1 : -1) * 0.4;
    let env = Math.exp(-t * 2.5);
    samples[i] = (s1 + s2) * env * 0.7;
  }
  return createWavBuffer(sampleRate, samples);
}

// 4. Victory Fanfare (triad arpeggio: C4, E4, G4, C5)
function generateVictorySound() {
  const notes = [
    { f: 523.25, d: 0.12 }, // C5
    { f: 659.25, d: 0.12 }, // E5
    { f: 783.99, d: 0.12 }, // G5
    { f: 1046.50, d: 0.45 } // C6
  ];
  const totalDuration = notes.reduce((acc, n) => acc + n.d, 0);
  const numSamples = Math.floor(sampleRate * totalDuration);
  const samples = new Float32Array(numSamples);

  let currentSample = 0;
  for (const note of notes) {
    const noteSamples = Math.floor(sampleRate * note.d);
    for (let i = 0; i < noteSamples; i++) {
      const t = i / sampleRate;
      let env = Math.exp(-t * (note.d > 0.3 ? 3 : 6));
      let val = Math.sin(2 * Math.PI * note.f * t) * 0.6 +
                Math.sin(4 * Math.PI * note.f * t) * 0.25;
      samples[currentSample + i] = val * env;
    }
    currentSample += noteSamples;
  }
  return createWavBuffer(sampleRate, samples);
}

// 5. Rimshot (kick, snare pop, and hi-hat sizzle)
function generateRimshotSound() {
  const duration = 0.4;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Sharp stick crack + noise burst
    let stickCrack = Math.sin(2 * Math.PI * (800 * Math.exp(-t * 60)) * t) * Math.exp(-t * 40);
    let noise = (Math.random() * 2 - 1) * Math.exp(-t * 25);
    let shellResonance = Math.sin(2 * Math.PI * 330 * t) * Math.exp(-t * 15) * 0.5;
    samples[i] = (stickCrack * 0.6 + noise * 0.4 + shellResonance * 0.3);
  }
  return createWavBuffer(sampleRate, samples);
}

// 6. Notification Chime (Gentle two-tone chime)
function generateNotificationSound() {
  const duration = 0.6;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let tone1 = Math.sin(2 * Math.PI * 880 * t) * Math.exp(-t * 8);
    let tone2 = (t > 0.12) ? Math.sin(2 * Math.PI * 1320 * (t - 0.12)) * Math.exp(-(t - 0.12) * 6) : 0;
    samples[i] = (tone1 * 0.5 + tone2 * 0.6) * 0.8;
  }
  return createWavBuffer(sampleRate, samples);
}

// 7. Laser / Pew (sci-fi laser beam)
function generateLaserSound() {
  const duration = 0.3;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let freq = 1800 * Math.exp(-t * 18) + 120;
    let env = Math.exp(-t * 8);
    samples[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.7;
  }
  return createWavBuffer(sampleRate, samples);
}

// 8. Dramatic Drum / Thud
function generateDrumSound() {
  const duration = 0.7;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let pitch = 140 * Math.exp(-t * 12) + 45;
    let kick = Math.sin(2 * Math.PI * pitch * t) * Math.exp(-t * 5);
    let punch = (Math.random() * 2 - 1) * Math.exp(-t * 35) * 0.3;
    samples[i] = (kick * 0.8 + punch) * 0.9;
  }
  return createWavBuffer(sampleRate, samples);
}

const sounds = [
  { name: 'airhorn.wav', gen: generateAirhornSound },
  { name: 'coin.wav', gen: generateCoinSound },
  { name: 'buzzer.wav', gen: generateBuzzerSound },
  { name: 'victory.wav', gen: generateVictorySound },
  { name: 'rimshot.wav', gen: generateRimshotSound },
  { name: 'chime.wav', gen: generateNotificationSound },
  { name: 'laser.wav', gen: generateLaserSound },
  { name: 'thud.wav', gen: generateDrumSound },
];

console.log('Generating built-in starter sounds...');
for (const s of sounds) {
  const filePath = path.join(SOUNDS_DIR, s.name);
  fs.writeFileSync(filePath, s.gen());
  console.log(`Generated: ${s.name}`);
}
console.log('All sounds generated successfully!');
