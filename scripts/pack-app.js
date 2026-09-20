const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const resourceDirs = [
  path.join(rootDir, 'dist', 'Mac Soundboard.app', 'Contents', 'Resources'),
  path.join(rootDir, 'dist', 'mac-arm64', 'Mac Soundboard.app', 'Contents', 'Resources')
].filter(d => fs.existsSync(d));

if (resourceDirs.length === 0) {
  console.log('No app bundle Resources found, skipping asar update.');
  process.exit(0);
}

const stagingDir = path.join(rootDir, 'dist', 'staging-app');
if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(stagingDir, { recursive: true });

// Copy essential files
fs.copyFileSync(path.join(rootDir, 'package.json'), path.join(stagingDir, 'package.json'));
fs.copyFileSync(path.join(rootDir, 'main.js'), path.join(stagingDir, 'main.js'));
fs.copyFileSync(path.join(rootDir, 'preload.js'), path.join(stagingDir, 'preload.js'));
fs.cpSync(path.join(rootDir, 'src'), path.join(stagingDir, 'src'), { recursive: true });
fs.cpSync(path.join(rootDir, 'assets'), path.join(stagingDir, 'assets'), { recursive: true });

for (const resDir of resourceDirs) {
  const targetAsar = path.join(resDir, 'app.asar');
  console.log(`Packing app into ${targetAsar}...`);
  execSync(`npx asar pack "${stagingDir}" "${targetAsar}" --unpack "**/assets/sounds/**"`, { cwd: rootDir });
}

// Clean staging
fs.rmSync(stagingDir, { recursive: true, force: true });
console.log('Successfully updated Mac Soundboard.app bundle with latest code & presets!');
