// MyInstants-Style Soundboard Renderer & UI Controller

// Application State
let appConfig = {
  masterVolume: 1.0,
  panicShortcut: 'Alt+0',
  sounds: []
};
let presetsCatalog = [];
let currentFilterCat = 'all';
let searchQuery = '';
let currentView = 'my-sounds'; // 'my-sounds' | 'discover'
const playingCards = new Map(); // soundId -> count
let isMuted = false;
let previousVolume = 1.0;

// DOM Elements
const viewMySounds = document.getElementById('view-my-sounds');
const viewDiscover = document.getElementById('view-discover');
const navMySounds = document.getElementById('nav-my-sounds');
const navDiscover = document.getElementById('nav-discover');

const soundGrid = document.getElementById('sound-grid');
const presetGrid = document.getElementById('preset-grid');
const emptyState = document.getElementById('empty-state');
const soundCountEl = document.getElementById('sound-count');
const searchInput = document.getElementById('search-input');
const categoryTabs = document.getElementById('category-tabs');

const masterVolumeSlider = document.getElementById('master-volume');
const masterVolumeLabel = document.getElementById('master-volume-label');
const btnMute = document.getElementById('btn-mute');
const btnPanic = document.getElementById('btn-panic');
const btnMinimizeTray = document.getElementById('btn-minimize-tray');
const btnExportPack = document.getElementById('btn-export-pack');
const btnImportPack = document.getElementById('btn-import-pack');
const dropOverlay = document.getElementById('drop-overlay');
const toastEl = document.getElementById('toast');

// Cloud Sync & Settings Elements
const btnSyncCloud = document.getElementById('btn-sync-cloud');
const syncBtnText = document.getElementById('sync-btn-text');
const btnOpenSettings = document.getElementById('btn-open-settings');
const settingsModal = document.getElementById('settings-modal');
const settingsModalClose = document.getElementById('settings-modal-close');
const settingsRepoInput = document.getElementById('settings-repo-input');
const settingsSyncNowBtn = document.getElementById('settings-sync-now-btn');
const settingsSaveBtn = document.getElementById('settings-save-btn');

// Upload Modal Elements
const btnOpenUpload = document.getElementById('btn-open-upload');
const uploadModal = document.getElementById('upload-modal');
const uploadModalClose = document.getElementById('upload-modal-close');
const uploadCancelBtn = document.getElementById('upload-cancel-btn');
const uploadSubmitBtn = document.getElementById('upload-submit-btn');

const uploadDropzone = document.getElementById('upload-file-dropzone');
const fileUnselectedView = document.getElementById('file-unselected-view');
const fileSelectedView = document.getElementById('file-selected-view');
const uploadFileName = document.getElementById('upload-file-name');
const uploadPreviewBtn = document.getElementById('upload-preview-btn');
const uploadChangeFileBtn = document.getElementById('upload-change-file-btn');

const uploadTitleInput = document.getElementById('upload-title-input');
const uploadCategorySelect = document.getElementById('upload-category-select');
const colorPalette = document.getElementById('color-palette');
const uploadShortcutBox = document.getElementById('upload-shortcut-box');
const uploadShortcutText = document.getElementById('upload-shortcut-text');
const uploadClearShortcut = document.getElementById('upload-clear-shortcut');

let uploadSelectedFilePath = null;
let uploadSelectedColor = '#ef4444';
let uploadSelectedShortcut = '';
let isRecordingUploadShortcut = false;

// Shortcut Edit Modal Elements
const keyRecordModal = document.getElementById('key-record-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalClearBtn = document.getElementById('modal-clear-btn');
const modalSaveBtn = document.getElementById('modal-save-btn');
const modalSoundTitle = document.getElementById('modal-sound-title');
const keyDisplayBox = document.getElementById('key-display-box');
const keyDisplayText = document.getElementById('key-display-text');
const keyErrorMsg = document.getElementById('key-error-msg');

let editingSoundId = null;
let pendingShortcut = null;
let pendingDisplay = '';

// Toast Notification
let toastTimer = null;
function showToast(message) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  toastTimer = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 3200);
}

// Play sound by ID via native macOS CoreAudio engine
async function playSound(soundId) {
  await window.soundboard.playSound(soundId);
}

// Stop all playing audio
async function stopAllSounds() {
  await window.soundboard.stopAllSounds();
  playingCards.clear();
  document.querySelectorAll('.sound-card.is-playing, .preset-card.is-playing').forEach(el => {
    el.classList.remove('is-playing');
  });
}

function incrementPlayingState(soundId) {
  const current = playingCards.get(soundId) || 0;
  playingCards.set(soundId, current + 1);
  const card = document.querySelector(`.sound-card[data-id="${soundId}"], .preset-card[data-id="${soundId}"]`);
  if (card) {
    card.classList.add('is-playing');
  }
}

function decrementPlayingState(soundId) {
  const current = (playingCards.get(soundId) || 1) - 1;
  if (current <= 0) {
    playingCards.delete(soundId);
    const card = document.querySelector(`.sound-card[data-id="${soundId}"], .preset-card[data-id="${soundId}"]`);
    if (card) {
      card.classList.remove('is-playing');
    }
  } else {
    playingCards.set(soundId, current);
  }
}

// Format shortcut for macOS display (e.g. "Alt+1" -> "⌥1", "CommandOrControl+Shift+A" -> "⌘⇧A")
function formatShortcutForDisplay(sc) {
  if (!sc) return '';
  return sc
    .replace(/CommandOrControl/g, '⌘')
    .replace(/Cmd/g, '⌘')
    .replace(/Command/g, '⌘')
    .replace(/Alt/g, '⌥')
    .replace(/Option/g, '⌥')
    .replace(/Control/g, '⌃')
    .replace(/Ctrl/g, '⌃')
    .replace(/Shift/g, '⇧')
    .replace(/\+/g, ' ');
}

// Render My Sounds Grid with MyInstants 3D Buttons
function renderSounds() {
  const filtered = appConfig.sounds.filter(sound => {
    const matchesCat = currentFilterCat === 'all' || sound.category === currentFilterCat;
    const matchesSearch = !searchQuery || sound.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  soundCountEl.textContent = `${appConfig.sounds.length} sound${appConfig.sounds.length === 1 ? '' : 's'}`;

  if (filtered.length === 0) {
    soundGrid.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  soundGrid.innerHTML = filtered.map(sound => {
    const isPlaying = (playingCards.get(sound.id) || 0) > 0;
    const displayShortcut = formatShortcutForDisplay(sound.shortcut);
    const color = sound.color || '#ef4444';

    return `
      <div class="sound-card ${isPlaying ? 'is-playing' : ''}" data-id="${sound.id}" style="--btn-color: ${color}">
        <div class="card-header">
          <div class="sound-meta">
            <span class="sound-title" title="${escapeHtml(sound.name)}">${escapeHtml(sound.name)}</span>
            <span class="sound-category-tag">${escapeHtml(sound.category || 'Sound')}</span>
          </div>
          <div class="card-actions">
            <button class="btn-card-icon download" title="Download Audio File" data-action="download" data-id="${sound.id}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </button>
            <button class="btn-card-icon delete" title="Delete sound" data-action="delete" data-id="${sound.id}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>

        <div class="instant-button-wrap" data-action="play" data-id="${sound.id}" title="Click to Play">
          <div class="instant-button-3d">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <div class="equalizer-wave">
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
            </div>
          </div>
        </div>

        <div class="card-footer">
          <button class="shortcut-badge ${displayShortcut ? '' : 'empty'}" data-action="shortcut" data-id="${sound.id}" title="Click to assign shortcut">
            ${displayShortcut ? `<kbd>${displayShortcut}</kbd>` : '+ Shortcut'}
          </button>
          
          <div class="card-volume" title="Volume">
            <input type="range" min="0" max="1" step="0.05" value="${sound.volume !== undefined ? sound.volume : 0.85}" data-action="volume" data-id="${sound.id}" />
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Render Discover / Preset Library Grid
function renderPresets() {
  const filtered = presetsCatalog.filter(preset => {
    const matchesCat = currentFilterCat === 'all' || preset.category === currentFilterCat;
    const matchesSearch = !searchQuery || preset.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  presetGrid.innerHTML = filtered.map(preset => {
    const isPlaying = (playingCards.get(preset.id) || 0) > 0;
    const color = preset.color || '#ef4444';
    const isAlreadyInstalled = appConfig.sounds.some(s => s.name.toLowerCase() === preset.name.toLowerCase());
    const previewSrc = preset.path || preset.audioUrl;
    const isRemote = preset.isRemote;

    return `
      <div class="preset-card ${isPlaying ? 'is-playing' : ''}" data-id="${preset.id}" style="--btn-color: ${color}">
        <div class="instant-button-wrap" data-action="preview-preset" data-id="${preset.id}" data-path="${escapeHtml(previewSrc)}" title="Click to Preview">
          <div class="instant-button-3d">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <div class="equalizer-wave">
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
            </div>
          </div>
        </div>

        <div class="preset-card-meta">
          <span class="preset-title">${escapeHtml(preset.name)}</span>
          <div style="display: flex; align-items: center; justify-content: center; gap: 5px; margin-top: 2px;">
            <span class="preset-category">${escapeHtml(preset.category)}</span>
            ${isRemote ? '<span class="badge-bg" style="font-size: 8.5px; padding: 1px 5px; color: #38bdf8; border-color: rgba(56,189,248,0.3); background: rgba(56,189,248,0.15);">Cloud</span>' : ''}
          </div>
        </div>

        <button class="btn-add-preset" data-action="install-preset" data-id="${preset.id}" ${isAlreadyInstalled ? 'disabled' : ''}>
          ${isAlreadyInstalled ? '✓ Added' : '+ Add to Soundboard'}
        </button>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

// Navigation Switcher (My Sounds vs Discover)
navMySounds.addEventListener('click', () => {
  currentView = 'my-sounds';
  navMySounds.classList.add('active');
  navDiscover.classList.remove('active');
  viewMySounds.classList.remove('hidden');
  viewDiscover.classList.add('hidden');
});

navDiscover.addEventListener('click', () => {
  currentView = 'discover';
  navDiscover.classList.add('active');
  navMySounds.classList.remove('active');
  viewDiscover.classList.remove('hidden');
  viewMySounds.classList.add('hidden');
  renderPresets();
});

// Event Delegation for Sound Grid
soundGrid.addEventListener('click', async (e) => {
  const playTarget = e.target.closest('[data-action="play"]');
  if (playTarget) {
    const id = playTarget.getAttribute('data-id');
    playSound(id);
    return;
  }

  const shortcutTarget = e.target.closest('[data-action="shortcut"]');
  if (shortcutTarget) {
    const id = shortcutTarget.getAttribute('data-id');
    openShortcutModal(id);
    return;
  }

  const downloadTarget = e.target.closest('[data-action="download"]');
  if (downloadTarget) {
    const id = downloadTarget.getAttribute('data-id');
    const res = await window.soundboard.downloadSound(id);
    if (res.success) {
      showToast('Sound downloaded successfully! 📥');
    } else if (!res.canceled) {
      showToast(`Download failed: ${res.error}`);
    }
    return;
  }

  const deleteTarget = e.target.closest('[data-action="delete"]');
  if (deleteTarget) {
    const id = deleteTarget.getAttribute('data-id');
    deleteSound(id);
    return;
  }
});

// Sound Volume Slider
soundGrid.addEventListener('input', (e) => {
  if (e.target.dataset.action === 'volume') {
    const id = e.target.dataset.id;
    const vol = parseFloat(e.target.value);
    const sound = appConfig.sounds.find(s => s.id === id);
    if (sound) {
      sound.volume = vol;
      saveConfigDebounced();
    }
  }
});

// Event Delegation for Presets Grid
presetGrid.addEventListener('click', async (e) => {
  const previewTarget = e.target.closest('[data-action="preview-preset"]');
  if (previewTarget) {
    const path = previewTarget.getAttribute('data-path');
    const id = previewTarget.getAttribute('data-id');
    incrementPlayingState(id);
    await window.soundboard.previewSound(path);
    setTimeout(() => decrementPlayingState(id), 1200);
    return;
  }

  const installTarget = e.target.closest('[data-action="install-preset"]');
  if (installTarget) {
    const id = installTarget.getAttribute('data-id');
    const newSound = await window.soundboard.installPreset({ presetId: id });
    if (newSound) {
      appConfig = await window.soundboard.loadConfig();
      renderSounds();
      renderPresets();
      showToast(`Added "${newSound.name}" to your Soundboard! 🎉`);
    }
    return;
  }
});

// Delete sound
async function deleteSound(soundId) {
  const idx = appConfig.sounds.findIndex(s => s.id === soundId);
  if (idx === -1) return;

  const sound = appConfig.sounds[idx];
  if (sound.shortcut) {
    await window.soundboard.unregisterShortcut(soundId);
  }
  appConfig.sounds.splice(idx, 1);
  renderSounds();
  await window.soundboard.saveConfig(appConfig);
  showToast(`Deleted "${sound.name}"`);
}

// Debounced Config Saver
let saveTimeout = null;
function saveConfigDebounced() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    window.soundboard.saveConfig(appConfig);
  }, 250);
}

// UPLOAD MODAL LOGIC
btnOpenUpload.addEventListener('click', () => {
  resetUploadForm();
  uploadModal.classList.remove('hidden');
});

uploadModalClose.addEventListener('click', () => {
  uploadModal.classList.add('hidden');
});

uploadCancelBtn.addEventListener('click', () => {
  uploadModal.classList.add('hidden');
});

function resetUploadForm() {
  uploadSelectedFilePath = null;
  uploadSelectedColor = '#ef4444';
  uploadSelectedShortcut = '';
  isRecordingUploadShortcut = false;

  fileUnselectedView.classList.remove('hidden');
  fileSelectedView.classList.add('hidden');
  uploadTitleInput.value = '';
  uploadCategorySelect.value = 'Custom';
  uploadShortcutText.textContent = 'Click to set key combo (e.g. ⌥9)...';
  uploadClearShortcut.classList.add('hidden');
  uploadShortcutBox.classList.remove('is-recording');
  uploadSubmitBtn.disabled = true;

  document.querySelectorAll('.color-chip').forEach(c => c.classList.remove('active'));
  document.querySelector('.color-chip[data-color="#ef4444"]').classList.add('active');
}

// Pick file in upload form
async function pickFileForUpload() {
  const picked = await window.soundboard.pickAudioFile();
  if (picked) {
    uploadSelectedFilePath = picked.path;
    uploadFileName.textContent = pathBasename(picked.path);
    if (!uploadTitleInput.value.trim()) {
      uploadTitleInput.value = picked.name;
    }
    fileUnselectedView.classList.add('hidden');
    fileSelectedView.classList.remove('hidden');
    uploadSubmitBtn.disabled = false;
  }
}

function pathBasename(p) {
  return p.split(/[\\/]/).pop();
}

uploadDropzone.addEventListener('click', (e) => {
  if (e.target.id === 'upload-preview-btn' || e.target.id === 'upload-change-file-btn') return;
  pickFileForUpload();
});

uploadChangeFileBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  pickFileForUpload();
});

uploadPreviewBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (uploadSelectedFilePath) {
    await window.soundboard.previewSound(uploadSelectedFilePath);
  }
});

// Color picker selection
colorPalette.addEventListener('click', (e) => {
  const chip = e.target.closest('.color-chip');
  if (chip) {
    document.querySelectorAll('.color-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    uploadSelectedColor = chip.dataset.color;
  }
});

// Shortcut recording inside upload form
uploadShortcutBox.addEventListener('click', () => {
  isRecordingUploadShortcut = true;
  uploadShortcutBox.classList.add('is-recording');
  uploadShortcutText.textContent = 'Press any key combination...';
  window.addEventListener('keydown', handleUploadShortcutCapture, true);
});

uploadClearShortcut.addEventListener('click', (e) => {
  e.stopPropagation();
  uploadSelectedShortcut = '';
  uploadShortcutText.textContent = 'Click to set key combo (e.g. ⌥9)...';
  uploadClearShortcut.classList.add('hidden');
});

function handleUploadShortcutCapture(e) {
  if (!isRecordingUploadShortcut) return;
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') {
    isRecordingUploadShortcut = false;
    uploadShortcutBox.classList.remove('is-recording');
    window.removeEventListener('keydown', handleUploadShortcutCapture, true);
    return;
  }

  const parsed = parseKeyEventToAccelerator(e);
  if (!parsed || parsed.error) return;

  uploadSelectedShortcut = parsed.accelerator;
  uploadShortcutText.textContent = formatShortcutForDisplay(uploadSelectedShortcut);
  uploadClearShortcut.classList.remove('hidden');
  isRecordingUploadShortcut = false;
  uploadShortcutBox.classList.remove('is-recording');
  window.removeEventListener('keydown', handleUploadShortcutCapture, true);
}

// Submit Upload
uploadSubmitBtn.addEventListener('click', async () => {
  if (!uploadSelectedFilePath) return;

  const title = uploadTitleInput.value.trim() || 'Custom Sound';
  const category = uploadCategorySelect.value || 'Custom';

  const newSound = await window.soundboard.saveCustomSound({
    origPath: uploadSelectedFilePath,
    name: title,
    category: category,
    color: uploadSelectedColor,
    shortcut: uploadSelectedShortcut
  });

  if (newSound) {
    appConfig.sounds.push(newSound);
    await window.soundboard.saveConfig(appConfig);
    renderSounds();
    uploadModal.classList.add('hidden');
    showToast(`Uploaded "${title}" to your soundboard! 🚀`);
  }
});

// SHARING: EXPORT & IMPORT SOUNDBOARD PACK
btnExportPack.addEventListener('click', async () => {
  showToast('Exporting soundboard pack...');
  const res = await window.soundboard.exportPack();
  if (res.success) {
    showToast(`Exported ${res.count} sounds to pack! Share it with anyone. 📦`);
  } else if (!res.canceled) {
    showToast(`Export failed: ${res.error}`);
  }
});

btnImportPack.addEventListener('click', async () => {
  const res = await window.soundboard.importPack();
  if (res.success) {
    appConfig = await window.soundboard.loadConfig();
    renderSounds();
    showToast(`Successfully imported ${res.importedCount} sounds from pack! 🎉`);
  } else if (!res.canceled) {
    showToast(`Import failed: ${res.error}`);
  }
});

// Shortcut Modal Management (For existing cards)
function openShortcutModal(soundId) {
  const sound = appConfig.sounds.find(s => s.id === soundId);
  if (!sound) return;

  editingSoundId = soundId;
  pendingShortcut = sound.shortcut || '';
  pendingDisplay = formatShortcutForDisplay(pendingShortcut);

  modalSoundTitle.textContent = `Assign Shortcut: ${sound.name}`;
  keyErrorMsg.classList.add('hidden');

  if (pendingShortcut) {
    keyDisplayText.textContent = pendingDisplay;
    keyDisplayBox.classList.add('has-key');
    modalSaveBtn.disabled = false;
  } else {
    keyDisplayText.textContent = 'Press any key combination...';
    keyDisplayBox.classList.remove('has-key');
    modalSaveBtn.disabled = true;
  }

  keyRecordModal.classList.remove('hidden');
  window.addEventListener('keydown', handleShortcutKeyCapture, true);
}

function closeShortcutModal() {
  keyRecordModal.classList.add('hidden');
  editingSoundId = null;
  pendingShortcut = null;
  window.removeEventListener('keydown', handleShortcutKeyCapture, true);
}

function parseKeyEventToAccelerator(e) {
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) {
    return null;
  }

  const parts = [];
  if (e.metaKey) parts.push('CommandOrControl');
  if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  let keyPart = '';
  if (/^F\d+$/.test(e.key)) {
    keyPart = e.key;
  } else if (e.code.startsWith('Key')) {
    keyPart = e.code.replace('Key', '');
  } else if (e.code.startsWith('Digit')) {
    keyPart = e.code.replace('Digit', '');
  } else if (e.code.startsWith('Numpad')) {
    keyPart = 'num' + e.code.replace('Numpad', '').toLowerCase();
  } else {
    const map = {
      'Escape': 'Escape',
      'Space': 'Space',
      'Enter': 'Return',
      'Tab': 'Tab',
      'Backspace': 'Backspace',
      'Delete': 'Delete',
      'ArrowUp': 'Up',
      'ArrowDown': 'Down',
      'ArrowLeft': 'Left',
      'ArrowRight': 'Right',
      'Minus': '-',
      'Equal': '='
    };
    keyPart = map[e.code] || e.key.toUpperCase();
  }

  if (parts.length === 0 && !/^F\d+$/.test(keyPart)) {
    return {
      accelerator: null,
      error: 'Please include a modifier key (Option, Command, Control, or Shift) or use an F-key.'
    };
  }

  parts.push(keyPart);
  return {
    accelerator: parts.join('+'),
    error: null
  };
}

function handleShortcutKeyCapture(e) {
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape' && !e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey) {
    closeShortcutModal();
    return;
  }

  const parsed = parseKeyEventToAccelerator(e);
  if (!parsed) return;

  if (parsed.error) {
    keyErrorMsg.textContent = parsed.error;
    keyErrorMsg.classList.remove('hidden');
    return;
  }

  keyErrorMsg.classList.add('hidden');
  pendingShortcut = parsed.accelerator;
  pendingDisplay = formatShortcutForDisplay(pendingShortcut);

  keyDisplayText.textContent = pendingDisplay;
  keyDisplayBox.classList.add('has-key');
  modalSaveBtn.disabled = false;
}

modalCloseBtn.addEventListener('click', closeShortcutModal);

modalClearBtn.addEventListener('click', async () => {
  if (!editingSoundId) return;
  const sound = appConfig.sounds.find(s => s.id === editingSoundId);
  if (sound) {
    sound.shortcut = '';
    await window.soundboard.unregisterShortcut(sound.id);
    await window.soundboard.saveConfig(appConfig);
    renderSounds();
  }
  closeShortcutModal();
});

modalSaveBtn.addEventListener('click', async () => {
  if (!editingSoundId || !pendingShortcut) return;
  
  const result = await window.soundboard.registerShortcut(editingSoundId, pendingShortcut);
  if (!result.success) {
    keyErrorMsg.textContent = result.error || 'Failed to register shortcut.';
    keyErrorMsg.classList.remove('hidden');
    return;
  }

  const sound = appConfig.sounds.find(s => s.id === editingSoundId);
  if (sound) {
    sound.shortcut = pendingShortcut;
    await window.soundboard.saveConfig(appConfig);
    renderSounds();
  }
  closeShortcutModal();
});

// Master Volume & Mute
masterVolumeSlider.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  appConfig.masterVolume = val;
  masterVolumeLabel.textContent = `${Math.round(val * 100)}%`;
  isMuted = val === 0;
  updateVolumeIcon();
  saveConfigDebounced();
});

btnMute.addEventListener('click', () => {
  if (isMuted) {
    isMuted = false;
    const restoreVol = previousVolume > 0 ? previousVolume : 1.0;
    masterVolumeSlider.value = restoreVol;
    masterVolumeLabel.textContent = `${Math.round(restoreVol * 100)}%`;
    appConfig.masterVolume = restoreVol;
  } else {
    previousVolume = parseFloat(masterVolumeSlider.value);
    isMuted = true;
    masterVolumeSlider.value = 0;
    masterVolumeLabel.textContent = '0%';
    appConfig.masterVolume = 0;
  }
  updateVolumeIcon();
  saveConfigDebounced();
});

function updateVolumeIcon() {
  const icon = document.getElementById('icon-volume');
  if (isMuted || appConfig.masterVolume === 0) {
    icon.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <line x1="23" y1="9" x2="17" y2="15"></line>
      <line x1="17" y1="9" x2="23" y2="15"></line>
    `;
  } else {
    icon.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
    `;
  }
}

// Stop All Panic Button
btnPanic.addEventListener('click', stopAllSounds);

// Minimize to Menu Bar / Tray
btnMinimizeTray.addEventListener('click', () => {
  window.soundboard.hideToTray();
});

// Search Filter
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value.trim();
  if (currentView === 'my-sounds') {
    renderSounds();
  } else {
    renderPresets();
  }
});

// Category Filter Tabs
categoryTabs.addEventListener('click', (e) => {
  if (e.target.classList.contains('tab-btn')) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
    currentFilterCat = e.target.getAttribute('data-cat');
    if (currentView === 'my-sounds') {
      renderSounds();
    } else {
      renderPresets();
    }
  }
});

// Drag & Drop Handling (Audio files or .soundboard packs)
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dropOverlay.classList.remove('hidden');
});

window.addEventListener('dragover', (e) => {
  e.preventDefault();
});

dropOverlay.addEventListener('dragleave', (e) => {
  if (e.relatedTarget === null || e.target === dropOverlay) {
    dropOverlay.classList.add('hidden');
  }
});

dropOverlay.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropOverlay.classList.add('hidden');

  const files = Array.from(e.dataTransfer.files);
  
  // Check for .soundboard or .zip pack
  const packFile = files.find(f => /\.(soundboard|zip)$/i.test(f.name));
  if (packFile && packFile.path) {
    showToast('Importing soundboard pack...');
    const res = await window.soundboard.importPack(packFile.path);
    if (res.success) {
      appConfig = await window.soundboard.loadConfig();
      renderSounds();
      showToast(`Imported ${res.importedCount} sounds from pack! 🎉`);
    } else {
      showToast(`Import failed: ${res.error}`);
    }
    return;
  }

  // Audio files
  const audioFiles = files.filter(f => /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(f.name));
  for (const file of audioFiles) {
    if (file.path) {
      const imported = await window.soundboard.saveCustomSound({
        origPath: file.path,
        name: file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, ' '),
        category: 'Custom',
        color: '#6366f1',
        shortcut: ''
      });
      if (imported) {
        appConfig.sounds.push(imported);
      }
    }
  }

  if (audioFiles.length > 0) {
    await window.soundboard.saveConfig(appConfig);
    renderSounds();
    showToast(`Added ${audioFiles.length} sound${audioFiles.length > 1 ? 's' : ''} to soundboard!`);
  }
});

// Global Listeners from Main Process
window.soundboard.onSoundStatus(({ soundId, status }) => {
  if (status === 'playing') {
    incrementPlayingState(soundId);
  } else if (status === 'ended') {
    decrementPlayingState(soundId);
  }
});

window.soundboard.onStopAll(() => {
  playingCards.clear();
  document.querySelectorAll('.sound-card.is-playing, .preset-card.is-playing').forEach(el => {
    el.classList.remove('is-playing');
  });
});

// Cloud Presets Sync (Strategy 1: Audio Updates)
async function triggerCloudSync() {
  if (btnSyncCloud) {
    btnSyncCloud.classList.add('is-syncing');
    if (syncBtnText) syncBtnText.textContent = 'Checking...';
  }
  try {
    const res = await window.soundboard.syncCloudPresets();
    if (res && res.success) {
      if (res.catalog) presetsCatalog = res.catalog;
      renderPresets();
      showToast(`Cloud Sync: ${presetsCatalog.length} presets up to date! ☁️`);
    } else {
      showToast('Checked cloud: up to date with local presets');
    }
  } catch (e) {
    showToast('Could not reach GitHub for updates');
  } finally {
    if (btnSyncCloud) {
      btnSyncCloud.classList.remove('is-syncing');
      if (syncBtnText) syncBtnText.textContent = 'Check for New Sounds';
    }
  }
}

if (btnSyncCloud) {
  btnSyncCloud.addEventListener('click', triggerCloudSync);
}

// Settings Modal Handlers
if (btnOpenSettings) {
  btnOpenSettings.addEventListener('click', () => {
    if (appConfig.cloudRepo && settingsRepoInput) {
      settingsRepoInput.value = appConfig.cloudRepo;
    }
    settingsModal.classList.remove('hidden');
  });
}

if (settingsModalClose) {
  settingsModalClose.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });
}

if (settingsSaveBtn) {
  settingsSaveBtn.addEventListener('click', async () => {
    const repo = settingsRepoInput.value.trim();
    if (repo) {
      appConfig.cloudRepo = repo;
      await window.soundboard.saveConfig(appConfig);
      showToast(`Saved publisher repo: ${repo}`);
    }
    settingsModal.classList.add('hidden');
  });
}

if (settingsSyncNowBtn) {
  settingsSyncNowBtn.addEventListener('click', async () => {
    const repo = settingsRepoInput.value.trim();
    if (repo) {
      appConfig.cloudRepo = repo;
      await window.soundboard.saveConfig(appConfig);
    }
    await triggerCloudSync();
  });
}

window.soundboard.onCloudSyncStatus((status) => {
  if (status && status.success) {
    window.soundboard.getPresetsCatalog().then(cat => {
      presetsCatalog = cat;
      if (currentView === 'discover') renderPresets();
    });
  }
});

// App Initialization
async function initApp() {
  appConfig = await window.soundboard.loadConfig();
  presetsCatalog = await window.soundboard.getPresetsCatalog();

  if (appConfig.masterVolume !== undefined) {
    masterVolumeSlider.value = appConfig.masterVolume;
    masterVolumeLabel.textContent = `${Math.round(appConfig.masterVolume * 100)}%`;
  }

  if (appConfig.panicShortcut) {
    document.getElementById('panic-shortcut-badge').textContent = formatShortcutForDisplay(appConfig.panicShortcut);
  }

  renderSounds();
}

document.addEventListener('DOMContentLoaded', initApp);
