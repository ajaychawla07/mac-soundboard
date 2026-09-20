const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, dialog, protocol, net, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const { spawn, execFile } = require('child_process');
const { pathToFileURL } = require('url');

// Allow audio autoplay without user gesture requirements in background
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Cloud Presets Sync Helpers (Strategy 1: Audio Updates via GitHub)
function fetchJsonFromUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'MacSoundboard-App' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJsonFromUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

function downloadFileFromUrl(url, destPath) {
  return new Promise((resolve, reject) => {
    try {
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (dirErr) {
      return reject(dirErr);
    }

    const req = https.get(url, { headers: { 'User-Agent': 'MacSoundboard-App' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFileFromUrl(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve(destPath);
      });
      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });
    req.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
    req.setTimeout(15000, () => {
      req.destroy();
      fs.unlink(destPath, () => {});
      reject(new Error('Download timed out'));
    });
  });
}

// Register custom protocol scheme before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'soundboard-audio',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true
    }
  }
]);

let mainWindow = null;
let tray = null;
let isQuitting = false;

const USER_DATA_PATH = app.getPath('userData');
const USER_SOUNDS_DIR = path.join(USER_DATA_PATH, 'custom_sounds');
const CONFIG_FILE = path.join(USER_DATA_PATH, 'soundboard-config.json');

// Ensure directories exist
if (!fs.existsSync(USER_SOUNDS_DIR)) {
  fs.mkdirSync(USER_SOUNDS_DIR, { recursive: true });
}

// Resolve assets directory whether running from source or packaged asar
function getAssetsDir() {
  const base = path.join(__dirname, 'assets');
  const unpacked = base.replace('app.asar', 'app.asar.unpacked');
  return fs.existsSync(unpacked) ? unpacked : base;
}

// Ensure audio file is accessible on real filesystem for macOS /usr/bin/afplay
function ensureUnpackedFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return filePath;
  // If path is inside an asar archive, afplay cannot read it directly.
  if (filePath.includes('.asar/') || filePath.includes('.asar\\') || filePath.includes('.asar')) {
    try {
      const unpackedCandidate = filePath.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1');
      if (fs.existsSync(unpackedCandidate)) {
        return unpackedCandidate;
      }
      const cacheDir = path.join(USER_DATA_PATH, 'asar_extracted');
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      const hashName = crypto.createHash('md5').update(filePath).digest('hex').slice(0, 10) + '_' + path.basename(filePath);
      const cachedDest = path.join(cacheDir, hashName);
      if (!fs.existsSync(cachedDest) || fs.statSync(cachedDest).size === 0) {
        const data = fs.readFileSync(filePath);
        fs.writeFileSync(cachedDest, data);
      }
      return cachedDest;
    } catch (err) {
      console.error('Failed to unpack file from asar:', err);
    }
  }
  return filePath;
}

// Default sounds packaged with the app
function getDefaultSounds() {
  const assetsSoundsDir = path.join(getAssetsDir(), 'sounds');
  return [
    {
      id: 'sound_airhorn',
      name: 'Airhorn',
      category: 'Memes',
      path: path.join(assetsSoundsDir, 'airhorn.wav'),
      shortcut: 'Alt+1',
      volume: 0.85,
      color: '#ef4444' // Crimson Red
    },
    {
      id: 'sound_victory',
      name: 'Victory Fanfare',
      category: 'Games',
      path: path.join(assetsSoundsDir, 'victory.wav'),
      shortcut: 'Alt+2',
      volume: 0.85,
      color: '#f59e0b' // Amber
    },
    {
      id: 'sound_rimshot',
      name: 'Rimshot (Ba-dum-tss)',
      category: 'Reactions',
      path: path.join(assetsSoundsDir, 'rimshot.wav'),
      shortcut: 'Alt+3',
      volume: 0.85,
      color: '#10b981' // Emerald
    },
    {
      id: 'sound_buzzer',
      name: 'Wrong Buzzer',
      category: 'Games',
      path: path.join(assetsSoundsDir, 'buzzer.wav'),
      shortcut: 'Alt+4',
      volume: 0.80,
      color: '#ec4899' // Pink
    },
    {
      id: 'sound_coin',
      name: 'Retro Coin',
      category: 'Games',
      path: path.join(assetsSoundsDir, 'coin.wav'),
      shortcut: 'Alt+5',
      volume: 0.85,
      color: '#eab308' // Yellow
    },
    {
      id: 'sound_chime',
      name: 'Notification Chime',
      category: 'Sound Effects',
      path: path.join(assetsSoundsDir, 'chime.wav'),
      shortcut: 'Alt+6',
      volume: 0.90,
      color: '#06b6d4' // Cyan
    },
    {
      id: 'sound_laser',
      name: 'Laser Pew',
      category: 'Sound Effects',
      path: path.join(assetsSoundsDir, 'laser.wav'),
      shortcut: 'Alt+7',
      volume: 0.80,
      color: '#8b5cf6' // Violet
    },
    {
      id: 'sound_thud',
      name: 'Dramatic Thud',
      category: 'Reactions',
      path: path.join(assetsSoundsDir, 'thud.wav'),
      shortcut: 'Alt+8',
      volume: 0.90,
      color: '#64748b' // Slate
    }
  ];
}

let cachedConfig = null;

function loadConfig() {
  if (cachedConfig) return cachedConfig;
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.sounds)) {
        let modified = false;
        const defaultList = getDefaultSounds();
        for (const s of data.sounds) {
          if (!fs.existsSync(s.path)) {
            const defMatch = defaultList.find(d => d.id === s.id);
            if (defMatch && fs.existsSync(defMatch.path)) {
              s.path = defMatch.path;
              modified = true;
            }
          }
        }
        if (modified) {
          saveConfig(data);
        }
        cachedConfig = data;
        return data;
      }
    }
  } catch (err) {
    console.error('Error reading config file:', err);
  }

  const initialConfig = {
    masterVolume: 1.0,
    panicShortcut: 'Alt+0',
    sounds: getDefaultSounds()
  };
  saveConfig(initialConfig);
  cachedConfig = initialConfig;
  return initialConfig;
}

function saveConfig(config) {
  try {
    cachedConfig = config;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving config:', err);
    return false;
  }
}

// Active child audio processes (afplay)
const activeAudioProcesses = new Set();

function playSoundNative(soundId, customFilePath = null) {
  let targetPath = customFilePath;
  let soundVol = 0.85;

  if (!targetPath) {
    const config = loadConfig();
    const sound = config.sounds.find(s => s.id === soundId);
    if (!sound) {
      // Fallback: check if soundId is a preset ID
      const presets = getLocalPresets();
      const presetMatch = presets.find(p => p.id === soundId || p.filename === soundId);
      if (presetMatch && presetMatch.path) {
        targetPath = presetMatch.path;
        soundVol = 0.85;
      } else {
        console.error(`Sound not found for id: ${soundId}`);
        return false;
      }
    } else {
      targetPath = sound.path;
      soundVol = sound.volume !== undefined ? sound.volume : 0.85;
    }
  }

  if (!targetPath) return false;

  targetPath = path.resolve(__dirname, ensureUnpackedFile(targetPath));

  if (!fs.existsSync(targetPath)) {
    console.error(`Audio file missing at path: ${targetPath}`);
    return false;
  }

  const config = loadConfig();
  const masterVol = config.masterVolume !== undefined ? config.masterVolume : 1.0;
  const finalVol = Math.max(0, Math.min(2.0, masterVol * soundVol));

  if (finalVol <= 0) return true;

  try {
    const proc = spawn('/usr/bin/afplay', ['-v', String(finalVol), targetPath]);
    activeAudioProcesses.add(proc);

    proc.stderr.on('data', (data) => {
      console.error(`afplay error for ${soundId}:`, data.toString());
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sound-status', { soundId, status: 'playing' });
    }

    proc.on('exit', (code) => {
      activeAudioProcesses.delete(proc);
      if (code !== 0 && code !== null) {
        console.warn(`afplay process exited with code ${code} for ${soundId}`);
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sound-status', { soundId, status: 'ended' });
      }
    });

    proc.on('error', (err) => {
      console.error('afplay spawn error:', err);
      activeAudioProcesses.delete(proc);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sound-status', { soundId, status: 'ended' });
      }
    });

    return true;
  } catch (e) {
    console.error('Failed to spawn afplay process:', e);
    return false;
  }
}

function stopAllSounds() {
  for (const proc of activeAudioProcesses) {
    try {
      proc.kill('SIGKILL');
    } catch (e) {}
  }
  activeAudioProcesses.clear();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('stop-all-sounds');
  }
}

// Active shortcut registry
const registeredAccelerators = new Map();

function registerGlobalShortcuts(config) {
  globalShortcut.unregisterAll();
  registeredAccelerators.clear();

  if (config.panicShortcut) {
    try {
      const ok = globalShortcut.register(config.panicShortcut, () => {
        stopAllSounds();
      });
      if (ok) {
        registeredAccelerators.set(config.panicShortcut, '__panic__');
      }
    } catch (e) {
      console.error(`Invalid panic shortcut format: ${config.panicShortcut}`, e);
    }
  }

  if (Array.isArray(config.sounds)) {
    for (const sound of config.sounds) {
      if (sound.shortcut && sound.shortcut.trim()) {
        const sc = sound.shortcut.trim();
        try {
          const ok = globalShortcut.register(sc, () => {
            playSoundNative(sound.id);
          });
          if (ok) {
            registeredAccelerators.set(sc, sound.id);
          }
        } catch (e) {
          console.error(`Error registering shortcut [${sc}]:`, e.message);
        }
      }
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 840,
    minHeight: 560,
    title: 'Mac Soundboard',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0b0f19',
    show: false,
    icon: path.join(getAssetsDir(), 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const trayIconPath = path.join(getAssetsDir(), 'icons', 'trayTemplate.png');
  tray = new Tray(trayIconPath);
  tray.setToolTip('Mac Soundboard (Active in background)');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Soundboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Stop All Sounds (Panic)',
      accelerator: 'Alt+0',
      click: () => {
        stopAllSounds();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Soundboard',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

app.whenReady().then(() => {
  protocol.handle('soundboard-audio', (request) => {
    try {
      const url = new URL(request.url);
      let filePath = decodeURIComponent(url.pathname);
      if (process.platform === 'win32' && filePath.startsWith('/')) {
        filePath = filePath.substring(1);
      }
      const unpacked = ensureUnpackedFile(filePath);
      if (fs.existsSync(unpacked)) {
        return net.fetch(pathToFileURL(unpacked).toString());
      }
      return new Response('Audio not found', { status: 404 });
    } catch (err) {
      return new Response('Audio not found', { status: 404 });
    }
  });

  const config = loadConfig();
  createWindow();
  createTray();
  registerGlobalShortcuts(config);

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show();
    } else {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  stopAllSounds();
  globalShortcut.unregisterAll();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// IPC Handlers
ipcMain.handle('load-config', () => {
  return loadConfig();
});

ipcMain.handle('save-config', (_event, config) => {
  const ok = saveConfig(config);
  if (ok) {
    registerGlobalShortcuts(config);
  }
  return ok;
});

ipcMain.handle('play-sound', (_event, soundId) => {
  return playSoundNative(soundId);
});

async function resolveAudioTarget(target) {
  if (!target) return { path: null, id: 'preview', url: null };

  let resolvedPath = null;
  let finalSoundId = 'preview';
  let remoteUrl = null;

  // 1. If HTTP URL
  if (typeof target === 'string' && (target.startsWith('http://') || target.startsWith('https://'))) {
    remoteUrl = target;
    try {
      const filename = path.basename(new URL(target).pathname) || 'preview.wav';
      const tempPreviewPath = path.join(USER_DATA_PATH, 'temp_preview_' + filename);
      if (fs.existsSync(tempPreviewPath)) {
        resolvedPath = tempPreviewPath;
      }
    } catch (_) {}
    return { path: resolvedPath, id: finalSoundId, url: remoteUrl };
  }

  // 2. If it is a preset ID, filename, or matches an entry in the preset catalog
  const presetId = typeof target === 'object' ? (target.presetId || target.id) : target;
  const catalog = await getCombinedCatalog();
  const preset = catalog.find(p => p.id === presetId || p.filename === presetId || p.name === presetId || p.path === presetId);
  if (preset) {
    finalSoundId = preset.id;
    const candidates = [
      preset.path,
      path.join(getAssetsDir(), 'sounds', 'presets', preset.filename),
      path.join(__dirname, 'assets', 'sounds', 'presets', preset.filename),
      path.join(USER_DATA_PATH, 'temp_preview_' + preset.filename)
    ].filter(Boolean);

    for (const cand of candidates) {
      const absCand = path.resolve(__dirname, cand);
      if (fs.existsSync(absCand)) {
        resolvedPath = absCand;
        break;
      }
    }

    if (!resolvedPath) {
      const config = loadConfig();
      const repo = config.cloudRepo || 'ajaychawla07/mac-soundboard';
      remoteUrl = preset.audioUrl || `https://raw.githubusercontent.com/${repo}/main/assets/sounds/presets/${encodeURIComponent(preset.filename)}`;
    }
  }

  // 3. If direct local path on disk
  if (!resolvedPath && typeof target === 'string') {
    const absTarget = path.resolve(__dirname, target);
    if (fs.existsSync(absTarget)) {
      resolvedPath = absTarget;
    }
  }

  return { path: resolvedPath, id: finalSoundId, url: remoteUrl };
}

ipcMain.handle('get-sound-data-url', async (_event, target) => {
  try {
    const { path: resolvedPath, id, url } = await resolveAudioTarget(target);
    if (resolvedPath) {
      const finalAbsPath = path.resolve(__dirname, ensureUnpackedFile(resolvedPath));
      if (fs.existsSync(finalAbsPath)) {
        const ext = path.extname(finalAbsPath).toLowerCase();
        let mime = 'audio/wav';
        if (ext === '.mp3') mime = 'audio/mpeg';
        else if (ext === '.ogg') mime = 'audio/ogg';
        else if (ext === '.m4a') mime = 'audio/mp4';
        else if (ext === '.aac') mime = 'audio/aac';

        const buf = await fs.promises.readFile(finalAbsPath);
        const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
        return { success: true, dataUrl, soundId: id };
      }
    }
    if (url) {
      return { success: true, audioUrl: url, soundId: id };
    }
    return { success: false, error: 'Audio file not found' };
  } catch (err) {
    console.error('get-sound-data-url error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('preview-sound', async (_event, target) => {
  if (!target) return false;

  let { path: resolvedPath, id, url } = await resolveAudioTarget(target);

  if (!resolvedPath && url) {
    try {
      const filename = path.basename(new URL(url).pathname) || 'preview.wav';
      const tempPreviewPath = path.join(USER_DATA_PATH, 'temp_preview_' + filename);
      if (!fs.existsSync(tempPreviewPath)) {
        await downloadFileFromUrl(url, tempPreviewPath);
      }
      resolvedPath = tempPreviewPath;
    } catch (err) {
      console.error('Failed to download preview sound from URL:', err);
      return false;
    }
  }

  if (resolvedPath) {
    const finalAbsPath = path.resolve(__dirname, ensureUnpackedFile(resolvedPath));
    return playSoundNative(id, finalAbsPath);
  }

  console.error('Could not resolve preview sound for target:', target);
  return false;
});

ipcMain.handle('stop-all-sounds', () => {
  stopAllSounds();
  return true;
});

ipcMain.handle('register-shortcut', (_event, { soundId, shortcut }) => {
  if (!shortcut || !shortcut.trim()) return { success: true };
  const sc = shortcut.trim();
  try {
    if (registeredAccelerators.has(sc) && registeredAccelerators.get(sc) !== soundId) {
      return { success: false, error: 'Shortcut already assigned to another sound or action' };
    }
    const ok = globalShortcut.register(sc, () => {
      playSoundNative(soundId);
    });
    if (ok) {
      registeredAccelerators.set(sc, soundId);
      return { success: true };
    } else {
      return { success: false, error: 'Could not register shortcut. System or another app might be using it.' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('unregister-shortcut', (_event, { soundId }) => {
  for (const [sc, id] of registeredAccelerators.entries()) {
    if (id === soundId) {
      globalShortcut.unregister(sc);
      registeredAccelerators.delete(sc);
      break;
    }
  }
  return { success: true };
});

// Pick audio file dialog
ipcMain.handle('pick-audio-file', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Sound File',
    properties: ['openFile'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] }
    ]
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) return null;
  const origPath = result.filePaths[0];
  const filename = path.basename(origPath);
  return {
    path: origPath,
    name: path.parse(filename).name.replace(/[-_]/g, ' ')
  };
});

// Save custom uploaded sound into app storage
ipcMain.handle('save-custom-sound', async (_event, { origPath, name, category, color, shortcut }) => {
  if (!fs.existsSync(origPath)) return null;
  const filename = path.basename(origPath);
  const destPath = path.join(USER_SOUNDS_DIR, `${Date.now()}_${filename}`);
  try {
    fs.copyFileSync(origPath, destPath);
    return {
      id: 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: name || path.parse(filename).name.replace(/[-_]/g, ' '),
      category: category || 'Custom',
      path: destPath,
      shortcut: shortcut || '',
      volume: 0.85,
      color: color || '#6366f1'
    };
  } catch (e) {
    console.error('Failed to copy sound file:', e);
    return null;
  }
});

// Download/Export single sound file to user's computer
ipcMain.handle('download-sound', async (_event, soundId) => {
  const config = loadConfig();
  const sound = config.sounds.find(s => s.id === soundId);
  if (!sound || !fs.existsSync(sound.path)) {
    return { success: false, error: 'Sound file not found' };
  }

  const ext = path.extname(sound.path) || '.wav';
  const safeTitle = sound.name.replace(/[^a-zA-Z0-9_\- ]/g, '');
  const defaultFilename = `${safeTitle}${ext}`;

  const soundsDir = path.join(app.getPath('downloads'), 'sounds');
  if (!fs.existsSync(soundsDir)) {
    try {
      fs.mkdirSync(soundsDir, { recursive: true });
    } catch (e) {
      console.error('Error creating sounds folder in Downloads:', e);
    }
  }
  const defaultFolder = fs.existsSync(soundsDir) ? soundsDir : app.getPath('downloads');

  const saveRes = await dialog.showSaveDialog(mainWindow, {
    title: `Download Sound: ${sound.name}`,
    defaultPath: path.join(defaultFolder, defaultFilename),
    filters: [{ name: 'Audio File', extensions: [ext.replace('.', '')] }]
  });

  if (saveRes.canceled || !saveRes.filePath) {
    return { success: false, canceled: true };
  }

  try {
    fs.copyFileSync(sound.path, saveRes.filePath);
    return { success: true, savedPath: saveRes.filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

const CLOUD_CACHE_FILE = path.join(USER_DATA_PATH, 'cached_cloud_presets.json');

function getLocalPresets() {
  const catalogCandidates = [
    path.join(getAssetsDir(), 'sounds', 'presets', 'catalog.json'),
    path.join(__dirname, 'assets', 'sounds', 'presets', 'catalog.json')
  ];
  let catalogPath = null;
  for (const c of catalogCandidates) {
    if (fs.existsSync(c)) {
      catalogPath = c;
      break;
    }
  }

  if (catalogPath) {
    try {
      const data = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      const config = loadConfig();
      const repo = config.cloudRepo || 'ajaychawla07/mac-soundboard';
      const presetsDir = path.dirname(catalogPath);
      return data.map(p => ({
        ...p,
        path: path.join(presetsDir, p.filename),
        audioUrl: `https://raw.githubusercontent.com/${repo}/main/assets/sounds/presets/${encodeURIComponent(p.filename)}`,
        isLocal: true
      }));
    } catch (e) {
      console.error('Error reading local presets catalog:', e);
    }
  }
  return [];
}

function getCachedCloudPresets() {
  if (fs.existsSync(CLOUD_CACHE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CLOUD_CACHE_FILE, 'utf8'));
    } catch (e) {
      // ignore
    }
  }
  return [];
}

async function syncRemotePresets(force = false) {
  const config = loadConfig();
  const repo = config.cloudRepo || 'ajaychawla07/mac-soundboard';
  const remoteUrl = `https://raw.githubusercontent.com/${repo}/main/assets/sounds/presets/catalog.json`;

  try {
    const remoteList = await fetchJsonFromUrl(remoteUrl);
    if (Array.isArray(remoteList)) {
      const localPresets = getLocalPresets();
      const localIds = new Set(localPresets.map(p => p.id));
      const localFiles = new Set(localPresets.map(p => p.filename));

      const processedRemote = remoteList.map(item => {
        const isLocallyBundled = localIds.has(item.id) || localFiles.has(item.filename);
        const localPath = path.join(getAssetsDir(), 'sounds', 'presets', item.filename);
        return {
          ...item,
          isLocal: isLocallyBundled && fs.existsSync(localPath),
          isRemote: !isLocallyBundled,
          audioUrl: `https://raw.githubusercontent.com/${repo}/main/assets/sounds/presets/${encodeURIComponent(item.filename)}`,
          path: (isLocallyBundled && fs.existsSync(localPath)) ? localPath : null
        };
      });

      fs.writeFileSync(CLOUD_CACHE_FILE, JSON.stringify(processedRemote, null, 2), 'utf8');
      return { success: true, count: processedRemote.length, remoteCount: remoteList.length };
    }
  } catch (err) {
    // Offline or repo not public yet - gracefully silent
    return { success: false, error: err.message };
  }
  return { success: false };
}

async function getCombinedCatalog() {
  const localList = getLocalPresets();
  const cachedRemote = getCachedCloudPresets();
  const combinedMap = new Map();

  for (const item of localList) {
    combinedMap.set(item.id, item);
  }
  for (const item of cachedRemote) {
    if (!combinedMap.has(item.id)) {
      combinedMap.set(item.id, item);
    }
  }
  return Array.from(combinedMap.values());
}

// Discover / Preset Library Catalog
ipcMain.handle('get-presets-catalog', async () => {
  const combined = await getCombinedCatalog();

  // Background non-blocking check for new sounds
  syncRemotePresets().then(res => {
    if (res.success && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('cloud-sync-status', res);
    }
  }).catch(() => {});

  return combined;
});

// Sync cloud presets on user request
ipcMain.handle('sync-cloud-presets', async () => {
  const res = await syncRemotePresets(true);
  const combined = await getCombinedCatalog();
  return { ...res, catalog: combined };
});

// Install preset to soundboard (handles local, unpacked asar, and cloud audio)
ipcMain.handle('install-preset', async (_event, { presetId, shortcut }) => {
  try {
    const catalog = await getCombinedCatalog();
    const item = catalog.find(p => p.id === presetId);
    if (!item) {
      return { success: false, error: 'Preset not found in catalog' };
    }

    if (!fs.existsSync(USER_SOUNDS_DIR)) {
      fs.mkdirSync(USER_SOUNDS_DIR, { recursive: true });
    }

    const ext = path.extname(item.filename) || '.wav';
    const destPath = path.join(USER_SOUNDS_DIR, `${Date.now()}_${item.filename}`);

    let copied = false;

    // Check potential local paths
    const localCandidates = [
      item.path,
      path.join(getAssetsDir(), 'sounds', 'presets', item.filename),
      path.join(__dirname, 'assets', 'sounds', 'presets', item.filename),
      path.join(USER_DATA_PATH, 'temp_preview_' + item.filename)
    ].filter(Boolean);

    for (const cand of localCandidates) {
      if (fs.existsSync(cand)) {
        try {
          const fileData = fs.readFileSync(cand);
          fs.writeFileSync(destPath, fileData);
          copied = true;
          break;
        } catch (copyErr) {
          console.error('Error copying local preset file:', cand, copyErr);
        }
      }
    }

    // Fallback: download from cloud
    if (!copied) {
      const config = loadConfig();
      const repo = config.cloudRepo || 'ajaychawla07/mac-soundboard';
      const audioUrl = item.audioUrl || `https://raw.githubusercontent.com/${repo}/main/assets/sounds/presets/${encodeURIComponent(item.filename)}`;
      try {
        await downloadFileFromUrl(audioUrl, destPath);
        copied = true;
      } catch (err) {
        console.error('Failed to download cloud audio:', err);
        return { success: false, error: `Failed to download audio: ${err.message}` };
      }
    }

    if (!copied || !fs.existsSync(destPath)) {
      return { success: false, error: 'Could not obtain audio file for preset' };
    }

    const newSound = {
      id: 'sound_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: item.name,
      category: item.category,
      path: destPath,
      shortcut: shortcut || '',
      volume: 0.85,
      color: item.color
    };

    const config = loadConfig();
    config.sounds.push(newSound);
    saveConfig(config);
    registerGlobalShortcuts(config);
    return { success: true, sound: newSound };
  } catch (err) {
    console.error('install-preset fatal error:', err);
    return { success: false, error: err.message };
  }
});

// EXPORT SOUNDBOARD PACK (.soundboard)
ipcMain.handle('export-pack', async () => {
  const config = loadConfig();
  if (!config.sounds || config.sounds.length === 0) {
    return { success: false, error: 'No sounds to export' };
  }

  const saveRes = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Soundboard Pack',
    defaultPath: path.join(app.getPath('downloads'), 'MySoundboard.soundboard'),
    filters: [
      { name: 'Soundboard Pack', extensions: ['soundboard', 'zip'] }
    ]
  });

  if (saveRes.canceled || !saveRes.filePath) {
    return { success: false, canceled: true };
  }

  const outZipPath = saveRes.filePath;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soundboard_export_'));
  const audioDir = path.join(tempDir, 'audio');
  fs.mkdirSync(audioDir, { recursive: true });

  try {
    const packSounds = [];
    for (let i = 0; i < config.sounds.length; i++) {
      const s = config.sounds[i];
      if (fs.existsSync(s.path)) {
        const ext = path.extname(s.path) || '.wav';
        const safeName = `sound_${i}${ext}`;
        const destFile = path.join(audioDir, safeName);
        fs.copyFileSync(s.path, destFile);
        packSounds.push({
          id: s.id,
          name: s.name,
          category: s.category,
          relativeAudioPath: `audio/${safeName}`,
          shortcut: s.shortcut || '',
          volume: s.volume || 0.85,
          color: s.color || '#6366f1'
        });
      }
    }

    const packManifest = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      sounds: packSounds
    };
    fs.writeFileSync(path.join(tempDir, 'soundboard-pack.json'), JSON.stringify(packManifest, null, 2), 'utf8');

    // Run macOS zip utility
    await new Promise((resolve, reject) => {
      execFile('/usr/bin/zip', ['-q', '-r', outZipPath, '.'], { cwd: tempDir }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve();
      });
    });

    // Cleanup temp
    fs.rmSync(tempDir, { recursive: true, force: true });
    return { success: true, count: packSounds.length, filePath: outZipPath };
  } catch (err) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.error('Export pack error:', err);
    return { success: false, error: err.message };
  }
});

// IMPORT SOUNDBOARD PACK (.soundboard or .zip)
ipcMain.handle('import-pack', async (_event, specificPath = null) => {
  let packPath = specificPath;
  if (!packPath) {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Soundboard Pack to Import',
      properties: ['openFile'],
      filters: [
        { name: 'Soundboard Pack', extensions: ['soundboard', 'zip'] }
      ]
    });
    if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    packPath = res.filePaths[0];
  }

  if (!fs.existsSync(packPath)) {
    return { success: false, error: 'Pack file does not exist' };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soundboard_import_'));

  try {
    // Unzip via macOS /usr/bin/unzip
    await new Promise((resolve, reject) => {
      execFile('/usr/bin/unzip', ['-q', '-o', packPath, '-d', tempDir], (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve();
      });
    });

    const manifestPath = path.join(tempDir, 'soundboard-pack.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('Invalid pack: missing soundboard-pack.json');
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!Array.isArray(manifest.sounds)) {
      throw new Error('Invalid pack format');
    }

    const config = loadConfig();
    const importedSounds = [];

    for (const item of manifest.sounds) {
      const srcAudio = path.join(tempDir, item.relativeAudioPath);
      if (fs.existsSync(srcAudio)) {
        const ext = path.extname(srcAudio);
        const destAudio = path.join(USER_SOUNDS_DIR, `${Date.now()}_${Math.random().toString(36).substr(2, 6)}${ext}`);
        fs.copyFileSync(srcAudio, destAudio);

        const newSound = {
          id: 'imported_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          name: item.name || 'Imported Sound',
          category: item.category || 'Imported',
          path: destAudio,
          shortcut: item.shortcut || '',
          volume: item.volume !== undefined ? item.volume : 0.85,
          color: item.color || '#3b82f6'
        };
        importedSounds.push(newSound);
        config.sounds.push(newSound);
      }
    }

    saveConfig(config);
    registerGlobalShortcuts(config);
    fs.rmSync(tempDir, { recursive: true, force: true });
    return { success: true, importedCount: importedSounds.length, sounds: importedSounds };
  } catch (err) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.error('Import pack error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('hide-to-tray', () => {
  if (mainWindow) mainWindow.hide();
  return true;
});
