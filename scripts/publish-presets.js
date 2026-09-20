const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PRESETS_DIR = path.join(__dirname, '..', 'assets', 'sounds', 'presets');
const CATALOG_PATH = path.join(PRESETS_DIR, 'catalog.json');

const COLORS = [
  '#ef4444', // Crimson
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#eab308', // Yellow
  '#10b981', // Emerald
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Electric Blue
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#64748b'  // Slate
];

// Helper to clean up names nicely
function formatSoundName(filename) {
  const base = path.parse(filename).name;
  return base
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Categorize intelligently based on common keywords
function guessCategory(name) {
  const lower = name.toLowerCase();
  if (/meme|rizz|tuco|faaah|galaxy|skibidi|bruh|gigachad/i.test(lower)) return 'Memes';
  if (/effect|sfx|left|bell|boom|pipe|whistle|scratch/i.test(lower)) return 'Sound Effects';
  if (/song|music|guitar|piano|beat/i.test(lower)) return 'Music';
  if (/game|nemesis|hit|level|win|over/i.test(lower)) return 'Games';
  if (/movie|voice|dialogue|get out/i.test(lower)) return 'Reactions';
  return 'Memes';
}

function run() {
  if (!fs.existsSync(PRESETS_DIR)) {
    fs.mkdirSync(PRESETS_DIR, { recursive: true });
  }

  let catalog = [];
  if (fs.existsSync(CATALOG_PATH)) {
    try {
      catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    } catch (e) {
      console.error('Error reading catalog:', e);
    }
  }

  // Get input files: either passed as command line args or recent downloads
  let filesToProcess = process.argv.slice(2);

  if (filesToProcess.length === 0) {
    // If no args passed, auto-detect recently downloaded audio files in ~/Downloads/sounds
    const soundsDir = path.join(os.homedir(), 'Downloads', 'sounds');
    if (fs.existsSync(soundsDir)) {
      const allFiles = fs.readdirSync(soundsDir);
      const audioExts = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];
      const now = Date.now();

      const recentAudio = allFiles
        .filter(f => audioExts.includes(path.extname(f).toLowerCase()))
        .map(f => {
          const fullPath = path.join(soundsDir, f);
          const stat = fs.statSync(fullPath);
          return { name: f, fullPath, mtime: stat.mtimeMs };
        })
        // Files modified in the last 4 hours
        .filter(f => now - f.mtime < 4 * 60 * 60 * 1000)
        .sort((a, b) => b.mtime - a.mtime);

      filesToProcess = recentAudio.map(f => f.fullPath);
    }
  }

  if (filesToProcess.length === 0) {
    console.log('No audio files specified or found in ~/Downloads/sounds.');
    console.log('Usage: npm run publish-preset <path-to-sound-1.mp3> <path-to-sound-2.wav>');
    process.exit(1);
  }

  console.log(`Found ${filesToProcess.length} sound file(s) to publish:\n`);

  const addedSounds = [];
  let colorIdx = catalog.length % COLORS.length;

  for (const filePath of filesToProcess) {
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      continue;
    }

    const origFilename = path.basename(filePath);
    const ext = path.extname(origFilename).toLowerCase();
    const cleanBasename = path.parse(origFilename).name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const targetFilename = `${cleanBasename}${ext}`;
    const targetDest = path.join(PRESETS_DIR, targetFilename);

    // Copy audio file
    fs.copyFileSync(filePath, targetDest);

    const soundTitle = formatSoundName(origFilename);
    const soundId = `preset_${cleanBasename.replace(/-/g, '_')}`;
    const category = guessCategory(soundTitle);
    const color = COLORS[colorIdx % COLORS.length];
    colorIdx++;

    // Check if already in catalog
    const existingIdx = catalog.findIndex(c => c.filename === targetFilename || c.id === soundId);
    const entry = {
      id: soundId,
      name: soundTitle,
      category: category,
      filename: targetFilename,
      color: color
    };

    if (existingIdx !== -1) {
      catalog[existingIdx] = entry;
      console.log(`  ↻ Updated: ${soundTitle} (${targetFilename}) [${category}]`);
    } else {
      catalog.push(entry);
      console.log(`  + Added: ${soundTitle} (${targetFilename}) [${category}]`);
    }

    addedSounds.push(soundTitle);
  }

  // Save updated catalog
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
  console.log(`\nCatalog updated! Total presets now: ${catalog.length}`);

  // Git Add, Commit, and Push
  console.log('\nPublishing to GitHub...');
  try {
    execSync('git add assets/sounds/presets/', { stdio: 'inherit' });
    const commitMsg = addedSounds.length === 1
      ? `feat(presets): add ${addedSounds[0]} sound effect`
      : `feat(presets): add ${addedSounds.length} new sounds (${addedSounds.slice(0, 3).join(', ')}${addedSounds.length > 3 ? '...' : ''})`;

    execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });
    execSync('git push origin main', { stdio: 'inherit' });
    console.log('\n🚀 SUCCESS! All new sounds are now live on GitHub and available in everyone\'s app!');
  } catch (err) {
    console.error('Git push error:', err.message);
    process.exit(1);
  }
}

run();
