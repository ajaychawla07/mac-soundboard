const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('soundboard', {
  // Config & Sounds
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  
  // Audio playback controls
  playSound: (soundId) => ipcRenderer.invoke('play-sound', soundId),
  previewSound: (soundPath) => ipcRenderer.invoke('preview-sound', soundPath),
  getSoundDataUrl: (target) => ipcRenderer.invoke('get-sound-data-url', target),
  stopAllSounds: () => ipcRenderer.invoke('stop-all-sounds'),

  // Shortcuts
  registerShortcut: (soundId, shortcut) => ipcRenderer.invoke('register-shortcut', { soundId, shortcut }),
  unregisterShortcut: (soundId) => ipcRenderer.invoke('unregister-shortcut', { soundId }),

  // Custom Upload
  pickAudioFile: () => ipcRenderer.invoke('pick-audio-file'),
  saveCustomSound: (data) => ipcRenderer.invoke('save-custom-sound', data),

  // Downloading single sound
  downloadSound: (soundId) => ipcRenderer.invoke('download-sound', soundId),

  // Sharing: Sound Pack Export & Import (.soundboard)
  exportPack: () => ipcRenderer.invoke('export-pack'),
  importPack: (filePath) => ipcRenderer.invoke('import-pack', filePath),

  // Discover & Presets Catalog (Strategy 1: Audio Updates)
  getPresetsCatalog: () => ipcRenderer.invoke('get-presets-catalog'),
  installPreset: (data) => ipcRenderer.invoke('install-preset', data),
  syncCloudPresets: () => ipcRenderer.invoke('sync-cloud-presets'),
  onCloudSyncStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('cloud-sync-status', handler);
    return () => ipcRenderer.removeListener('cloud-sync-status', handler);
  },

  // Events from main process
  onSoundStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('sound-status', handler);
    return () => ipcRenderer.removeListener('sound-status', handler);
  },
  onStopAll: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('stop-all-sounds', handler);
    return () => ipcRenderer.removeListener('stop-all-sounds', handler);
  },

  // Window controls
  hideToTray: () => ipcRenderer.invoke('hide-to-tray')
});
