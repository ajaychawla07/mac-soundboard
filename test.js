const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('Running Soundboard automated verification tests...');

// 1. Check starter sounds
const soundsDir = path.join(__dirname, 'assets', 'sounds');
const expectedSounds = ['airhorn.wav', 'coin.wav', 'buzzer.wav', 'victory.wav', 'rimshot.wav', 'chime.wav', 'laser.wav', 'thud.wav'];

for (const s of expectedSounds) {
  const p = path.join(soundsDir, s);
  if (!fs.existsSync(p)) throw new Error(`Missing audio file: ${s}`);
  const buf = fs.readFileSync(p);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`Invalid WAV format for ${s}`);
  }
}
console.log(`✓ Starter audio verified: ${expectedSounds.length} files`);

// 2. Check preset library
const presetsDir = path.join(__dirname, 'assets', 'sounds', 'presets');
const catalogFile = path.join(presetsDir, 'catalog.json');
if (!fs.existsSync(catalogFile)) throw new Error('Missing preset catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
if (!Array.isArray(catalog) || catalog.length < 10) throw new Error('Preset catalog incomplete');

for (const item of catalog) {
  const itemPath = path.join(presetsDir, item.filename);
  if (!fs.existsSync(itemPath)) throw new Error(`Missing preset file: ${item.filename}`);
}
console.log(`✓ Preset library verified: ${catalog.length} presets`);

// 3. Check icons
const iconsDir = path.join(__dirname, 'assets', 'icons');
const expectedIcons = ['trayTemplate.png', 'trayTemplate@2x.png', 'icon.png', 'icon.icns'];
for (const ic of expectedIcons) {
  const p = path.join(iconsDir, ic);
  if (!fs.existsSync(p)) throw new Error(`Missing icon file: ${ic}`);
}
console.log(`✓ Icons verified: ${expectedIcons.length} icon files`);

// 4. Check JS syntax
const jsFiles = ['main.js', 'preload.js', 'src/renderer.js'];
for (const file of jsFiles) {
  const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
  new vm.Script(code);
  console.log(`✓ Syntax valid: ${file}`);
}

console.log('All automated file & syntax tests passed successfully!');
