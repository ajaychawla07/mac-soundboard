const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');

const ICONS_DIR = path.join(__dirname, '..', 'assets', 'icons');
if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

function createPng(width, height, getRgbaPixel) {
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getRgbaPixel(x, y);
      const pixelOffset = rowOffset + 1 + x * 4;
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function makeChunk(type, data) {
    const length = data.length;
    const buf = Buffer.alloc(8 + length + 4);
    buf.writeUInt32BE(length, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const crc = crc32(buf.subarray(4, 8 + length));
    buf.writeUInt32BE(crc, 8 + length);
    return buf;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([signature, makeChunk('IHDR', ihdr), makeChunk('IDAT', compressedData), makeChunk('IEND', Buffer.alloc(0))]);
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// 512x512 App Icon
function drawAppIcon(size) {
  return createPng(size, size, (x, y) => {
    const pad = size * 0.1;
    const r = size * 0.18;
    const max = size - pad;

    const insideSquircle =
      x >= pad && x <= max && y >= pad && y <= max &&
      (x >= pad + r || y >= pad + r || Math.hypot(x - (pad + r), y - (pad + r)) <= r) &&
      (x <= max - r || y >= pad + r || Math.hypot(x - (max - r), y - (pad + r)) <= r) &&
      (x >= pad + r || y <= max - r || Math.hypot(x - (pad + r), y - (max - r)) <= r) &&
      (x <= max - r || y <= max - r || Math.hypot(x - (max - r), y - (max - r)) <= r);

    if (!insideSquircle) return [0, 0, 0, 0];

    // Scale coordinates into 0..1 range inside the icon
    const nx = (x - pad) / (max - pad);
    const ny = (y - pad) / (max - pad);

    // Speaker shape
    const sx = nx * 24;
    const sy = ny * 24;
    const isSpeakerBase = sx >= 4 && sx <= 9 && sy >= 8 && sy <= 16;
    const isSpeakerCone = sx >= 9 && sx <= 14 && Math.abs(sy - 12) <= (sx - 7) * 1.0;
    const d1 = Math.hypot(sx - 10, sy - 12);
    const isWave1 = d1 >= 5.5 && d1 <= 7.2 && sx >= 14 && Math.abs(sy - 12) <= 5.5;
    const d2 = Math.hypot(sx - 10, sy - 12);
    const isWave2 = d2 >= 9.5 && d2 <= 11.2 && sx >= 17 && Math.abs(sy - 12) <= 8.5;

    if (isSpeakerBase || isSpeakerCone || isWave1 || isWave2) {
      return [255, 255, 255, 255];
    }

    // Purple/Indigo gradient
    const t = (nx + ny) / 2;
    const rCol = Math.floor(99 + (168 - 99) * t);
    const gCol = Math.floor(102 + (85 - 102) * t);
    const bCol = Math.floor(241 + (247 - 241) * t);
    return [rCol, gCol, bCol, 255];
  });
}

// Generate 512x512
const png512 = drawAppIcon(512);
fs.writeFileSync(path.join(ICONS_DIR, 'icon.png'), png512);

// Generate iconset for macOS iconutil -> icon.icns
const iconsetDir = path.join(ICONS_DIR, 'icon.iconset');
if (!fs.existsSync(iconsetDir)) fs.mkdirSync(iconsetDir, { recursive: true });

const sizes = [16, 32, 64, 128, 256, 512];
for (const s of sizes) {
  const buf = drawAppIcon(s);
  fs.writeFileSync(path.join(iconsetDir, `icon_${s}x${s}.png`), buf);
  const buf2x = drawAppIcon(s * 2 <= 512 ? s * 2 : 512);
  fs.writeFileSync(path.join(iconsetDir, `icon_${s}x${s}@2x.png`), buf2x);
}

try {
  execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(ICONS_DIR, 'icon.icns')}"`);
  console.log('Generated icon.icns successfully!');
} catch (e) {
  console.warn('iconutil failed (optional):', e.message);
}

console.log('Icons updated successfully!');
