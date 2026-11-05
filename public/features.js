const SETTINGS_KEY = 'rycade.settings';
const SOUND_SETTINGS_VERSION = 2;
const CODE_KEY = 'rycade.code';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SEARCH_KEYS = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'0123456789',
  'SPACE',
  'DEL',
  'DONE'
];
const SETTINGS_TABS = ['Display', 'Themes', 'Boot', 'Controls', 'Sound', 'Remote', 'About'];
const DEFAULT_SETTINGS = {
  display: { scanlines: true, backgroundArt: true, controls: true, clock: false },
  theme: 'Cover Flow',
  palette: 'Classic',
  boot: 'Insert Coin',
  controls: { skimSpeed: 'Normal', letterJump: true },
  sound: { master: 70, navigation: 50, confirm: 60, notifications: 60, muted: false },
  soundSet: 'cabinet',
  remote: { enabled: true }
};

function readSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {}
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  const soundSettingsCurrent = saved.soundVersion === SOUND_SETTINGS_VERSION;
  const next = {
    ...saved,
    display: { ...DEFAULT_SETTINGS.display, ...(saved.display || {}) },
    theme: THEME_IDS.has(saved.theme) ? saved.theme : DEFAULT_SETTINGS.theme,
    palette: PALETTES.some(palette => palette.label === saved.palette) ? saved.palette : DEFAULT_SETTINGS.palette,
    boot: saved.boot || DEFAULT_SETTINGS.boot,
    controls: { ...DEFAULT_SETTINGS.controls, ...(saved.controls || {}) },
    sound: soundSettingsCurrent
      ? { ...DEFAULT_SETTINGS.sound, ...(saved.sound || {}) }
      : { ...DEFAULT_SETTINGS.sound },
    soundSet: ['cabinet', 'chip', 'neo'].includes(saved.soundSet) ? saved.soundSet : DEFAULT_SETTINGS.soundSet,
    soundVersion: SOUND_SETTINGS_VERSION,
    remote: { ...DEFAULT_SETTINGS.remote, ...(saved.remote || {}) }
  };
  if (!soundSettingsCurrent) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {}
  }
  return next;
}

const settings = readSettings();
const searchOverlay = document.querySelector('#search-overlay');
const searchInput = document.querySelector('#search-query');
const searchKeyboard = document.querySelector('#search-keyboard');
const searchResults = document.querySelector('#search-results');
const settingsOverlay = document.querySelector('#settings-overlay');
const settingsNav = document.querySelector('#settings-nav');
const settingsContent = document.querySelector('#settings-content');
const toast = document.querySelector('#remote-toast');
const bootScreen = document.querySelector('#boot-screen');
let searchOpen = false;
let searchArea = 'results';
let searchResultIndex = 0;
let searchKeyIndex = 0;
let searchGames = [];
let settingsOpen = false;
let settingsTabIndex = 0;
let settingsArea = 'tabs';
let settingsActionIndex = 0;
let remoteSocket = null;
let remoteSocketGeneration = 0;
let reconnectTimer = 0;
let reconnectDelay = 1000;
let toastTimer = 0;
let bootOpen = false;
let bootDismissKey = null;
let bootReturnFocus = null;
let bootSession = 0;
const BOOT_SCENES = { 'Insert Coin': 'coin', 'Lights On': 'lights', 'CRT Power-on': 'crt' };

function getPairingCode() {
  let code = '';
  try {
    code = localStorage.getItem(CODE_KEY) || '';
  } catch {}
  if (/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code)) return code;
  const bytes = new Uint8Array(6);
  if (crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  code = [...bytes].map(byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
  try {
    localStorage.setItem(CODE_KEY, code);
  } catch {}
  return code;
}

function createPairingCode() {
  const bytes = new Uint8Array(6);
  if (crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  const code = [...bytes].map(byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
  try {
    localStorage.setItem(CODE_KEY, code);
  } catch {}
  return code;
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
  window.rycadeAudio?.setVolumes(settings.sound);
  window.rycadeAudio?.setSoundSet(settings.soundSet);
}

function applySettings() {
  stage.classList.toggle('no-scanlines', !settings.display.scanlines);
  stage.classList.toggle('no-bg-art', !settings.display.backgroundArt);
  stage.classList.toggle('hide-controls', !settings.display.controls);
  document.querySelector('#clock').hidden = !settings.display.clock;
  updateClock();
}

function updateClock() {
  const clock = document.querySelector('#clock');
  if (!settings.display.clock) return;
  clock.textContent = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date());
}

function closeOverlays() {
  closeSearch();
  closeSettings();
}

function openSearch() {
  if (launched || demoGame) return;
  window.rycadeAudio?.play('open');
  closeSettings();
  searchOpen = true;
  searchOverlay.classList.add('visible');
  searchOverlay.setAttribute('aria-hidden', 'false');
  searchArea = 'results';
  searchResultIndex = 0;
  searchInput.value = '';
  updateSearchResults();
  searchInput.focus();
}

function closeSearch() {
  if (searchOpen) window.rycadeAudio?.play('close');
  searchOpen = false;
  searchOverlay.classList.remove('visible');
  searchOverlay.setAttribute('aria-hidden', 'true');
}

function gameSearchKey(title) {
  return title.replace(/^the\s+/i, '').toLowerCase();
}

function updateSearchResults() {
  const query = searchInput.value.trim().toLowerCase();
  searchGames = GAMES.filter(game =>
    gameSearchKey(game.title).includes(query) ||
    game.sys.toLowerCase().includes(query)
  ).sort((a, b) => gameSearchKey(a.title).localeCompare(gameSearchKey(b.title)));
  searchResultIndex = Math.min(searchResultIndex, Math.max(0, searchGames.length - 1));
  searchResults.replaceChildren();
  if (!searchGames.length) {
    const empty = document.createElement('div');
    empty.className = 'search-empty';
    empty.textContent = 'NO MATCHING GAMES';
    searchResults.append(empty);
    return;
  }
  searchGames.forEach((game, index) => {
    const result = document.createElement('button');
    result.type = 'button';
    result.className = `search-result${index === searchResultIndex ? ' selected' : ''}`;
    result.innerHTML = `<img src="${game.box}" alt=""><span><strong></strong><small></small></span>`;
    result.querySelector('strong').textContent = game.title;
    result.querySelector('small').textContent = game.sys;
    result.addEventListener('click', () => selectGame(game.id));
    result.addEventListener('focus', () => {
      searchArea = 'results';
      searchResultIndex = index;
      updateSearchFocus();
    });
    searchResults.append(result);
  });
  updateSearchFocus();
}

function updateSearchFocus() {
  [...searchResults.querySelectorAll('.search-result')].forEach((result, index) => {
    result.classList.toggle('selected', index === searchResultIndex);
  });
  [...searchKeyboard.children].forEach((key, index) => {
    key.classList.toggle('focus', searchArea === 'keyboard' && index === searchKeyIndex);
  });
}

function selectGame(gameId) {
  const game = GAMES.find(item => item.id === gameId);
  if (!game) {
    window.rycadeAudio?.play('error');
    return;
  }
  window.rycadeAudio?.play('confirm');
  closeDemo();
  closeOverlays();
  tab = 0;
  build(game.id);
}

function buildSearchKeyboard() {
  searchKeyboard.replaceChildren(...SEARCH_KEYS.map((label, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `search-key${['SPACE', 'DEL', 'DONE'].includes(label) ? ' wide' : ''}${label === 'SPACE' ? ' space' : ''}`;
    button.textContent = label === 'SPACE' ? 'SPACE' : label;
    button.addEventListener('click', () => {
      searchArea = 'keyboard';
      searchKeyIndex = index;
      updateSearchFocus();
      pressSearchKey(label);
    });
    return button;
  }));
  updateSearchFocus();
}

function pressSearchKey(label) {
  window.rycadeAudio?.play('confirm');
  if (label === 'DONE') {
    closeSearch();
    return;
  }
  const value = searchInput.value;
  if (label === 'DEL') searchInput.value = value.slice(0, -1);
  else if (label === 'SPACE') searchInput.value = `${value} `;
  else searchInput.value = `${value}${label}`;
  searchResultIndex = 0;
  updateSearchResults();
}

function moveSearchResult(delta) {
  if (!searchGames.length) return;
  window.rycadeAudio?.play('move');
  searchResultIndex = (searchResultIndex + delta + searchGames.length) % searchGames.length;
  updateSearchFocus();
  searchResults.children[searchResultIndex]?.focus();
  searchResults.children[searchResultIndex]?.scrollIntoView({ block: 'nearest' });
}

function moveSearchKey(delta) {
  const next = searchKeyIndex + delta;
  if (next < 0 || next >= SEARCH_KEYS.length) return;
  window.rycadeAudio?.play('move');
  searchKeyIndex = next;
  updateSearchFocus();
  searchKeyboard.children[searchKeyIndex]?.focus();
}

function openSettings() {
  if (launched || demoGame) return;
  window.rycadeAudio?.play('open');
  closeSearch();
  settingsOpen = true;
  settingsOverlay.classList.add('visible');
  settingsOverlay.setAttribute('aria-hidden', 'false');
  settingsArea = 'tabs';
  renderSettings();
  settingsNav.children[settingsTabIndex]?.focus();
}

function closeSettings() {
  if (settingsOpen) window.rycadeAudio?.play('close');
  settingsOpen = false;
  settingsOverlay.classList.remove('visible');
  settingsOverlay.setAttribute('aria-hidden', 'true');
}

function settingsActions() {
  return [...settingsContent.querySelectorAll('.setting-action:not(:disabled), .boot-choice, .mixer-slider')];
}

function refreshSettingsFocus() {
  [...settingsNav.children].forEach((button, index) => {
    button.classList.toggle('focus', settingsArea === 'tabs' && index === settingsTabIndex);
  });
  const actions = settingsActions();
  settingsActionIndex = Math.min(settingsActionIndex, Math.max(0, actions.length - 1));
  actions.forEach((button, index) => button.classList.toggle('focus', settingsArea === 'options' && index === settingsActionIndex));
}

function renderSettings() {
  settingsNav.replaceChildren(...SETTINGS_TABS.map((label, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = index === settingsTabIndex ? 'active' : '';
    button.textContent = label;
    button.addEventListener('click', () => {
      window.rycadeAudio?.play('tab');
      settingsTabIndex = index;
      settingsArea = 'tabs';
      settingsActionIndex = 0;
      renderSettings();
      settingsNav.children[index]?.focus();
    });
    return button;
  }));

  if (settingsTabIndex === 0) renderDisplaySettings();
  else if (settingsTabIndex === 1) renderThemeSettings();
  else if (settingsTabIndex === 2) renderBootSettings();
  else if (settingsTabIndex === 3) renderControlsSettings();
  else if (settingsTabIndex === 4) renderSoundSettings();
  else if (settingsTabIndex === 5) renderRemoteSettings();
  else renderAboutSettings();
  refreshSettingsFocus();
}

function settingRow(label, value, action, description = '', sound = 'toggle') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'setting-action';
  button.setAttribute('aria-label', `${label}: ${value}${description ? `. ${description}` : ''}`);
  const copy = document.createElement('span');
  copy.className = 'setting-copy';
  const title = document.createElement('strong');
  title.textContent = label;
  copy.append(title);
  if (description) {
    const detail = document.createElement('small');
    detail.textContent = description;
    copy.append(detail);
  }
  button.append(copy);
  if (value === 'ON' || value === 'OFF') {
    button.setAttribute('aria-pressed', String(value === 'ON'));
    const toggle = document.createElement('span');
    toggle.className = `setting-toggle${value === 'ON' ? ' on' : ''}`;
    toggle.setAttribute('aria-hidden', 'true');
    const state = document.createElement('b');
    state.textContent = value;
    const track = document.createElement('i');
    toggle.append(state, track);
    button.append(toggle);
  } else if (label === 'Skim speed') {
    const segments = document.createElement('span');
    segments.className = 'setting-segments';
    ['Slow', 'Normal', 'Fast'].forEach(option => {
      const segment = document.createElement('i');
      segment.className = option === value ? 'selected' : '';
      segment.textContent = option;
      segments.append(segment);
    });
    segments.setAttribute('aria-hidden', 'true');
    button.append(segments);
  } else {
    const state = document.createElement('b');
    state.className = 'setting-state';
    state.textContent = value;
    button.append(state);
  }
  button.addEventListener('click', () => {
    if (sound) window.rycadeAudio?.play(sound);
    action();
  });
  return button;
}

function renderDisplaySettings() {
  settingsContent.innerHTML = '<h3 class="settings-section-title">DISPLAY</h3>';
  [
    ['CRT filter', 'scanlines', settings.theme === 'Cover Flow'
      ? 'Scanlines and a soft glass vignette across the whole screen.'
      : 'Adds a soft raster to the snap monitor.'],
    ['Background art', 'backgroundArt', 'Use the selected game flyer behind the cabinet.'],
    ['Show controls row', 'controls', 'Show controls available for the selected game.'],
    ['Clock in header', 'clock', 'Display the local time beside the wordmark.']
  ].forEach(([label, key, description]) => {
    const button = settingRow(label, settings.display[key] ? 'ON' : 'OFF', () => {
      settings.display[key] = !settings.display[key];
      saveSettings();
      applySettings();
      renderSettings();
    }, description);
    settingsContent.append(button);
  });
}

function renderThemeSettings() {
  settingsContent.innerHTML = '<h3 class="settings-section-title">THEMES</h3>';
  const themes = [
    { label: 'Cover Flow', id: 'cover-flow', colors: ['#ffd400', '#e4202a'] },
    { label: 'Shelf', id: 'shelf', colors: ['#ff6b6b', '#2d0711'] },
    { label: 'Studio', id: 'studio', colors: ['#161618', '#0a84ff'] }
  ];
  themes.forEach(theme => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `setting-action theme-choice${settings.theme === theme.label ? ' selected' : ''}`;
    button.setAttribute('aria-pressed', String(settings.theme === theme.label));
    const swatch = document.createElement('i');
    swatch.className = 'theme-swatch';
    swatch.style.setProperty('--swatch-a', theme.colors[0]);
    swatch.style.setProperty('--swatch-b', theme.colors[1]);
    const label = document.createElement('span');
    label.className = 'theme-copy';
    const name = document.createElement('strong');
    name.textContent = theme.label;
    const description = document.createElement('small');
    description.textContent = ({
      'cover-flow': 'Flyer carousel with colors drawn from the selected artwork',
      shelf: 'Row of game spines with the selected one face-out',
      studio: 'Dark gallery with unframed artwork'
    })[theme.id];
    label.append(name, description);
    const state = document.createElement('b');
    state.textContent = settings.theme === theme.label ? 'ACTIVE' : 'SELECT';
    button.append(swatch, label, state);
    button.addEventListener('click', () => {
      window.rycadeAudio?.play('confirm');
      settings.theme = theme.label;
      saveSettings();
      applyRycadeTheme(theme.label);
      renderSettings();
    });
    settingsContent.append(button);
  });

  if (settings.theme === 'Cover Flow') {
    const note = document.createElement('p');
    note.className = 'settings-note';
    note.textContent = 'Palette automatically follows the selected game artwork.';
    settingsContent.append(note);
    return;
  }

  const paletteTitle = document.createElement('h3');
  paletteTitle.className = 'settings-section-title';
  paletteTitle.textContent = 'PALETTE';
  settingsContent.append(paletteTitle);
  PALETTES.forEach(palette => {
    const active = settings.palette === palette.label;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `setting-action theme-choice${active ? ' selected' : ''}`;
    button.setAttribute('aria-pressed', String(active));
    const swatch = document.createElement('span');
    swatch.className = 'palette-swatch';
    const colors = settings.theme === 'Shelf' && palette.id === 'classic'
      ? ['#ff6b6b', '#620f20', '#2d0711']
      : palette.colors;
    colors.forEach(color => {
      const stripe = document.createElement('i');
      stripe.style.background = color;
      swatch.append(stripe);
    });
    const name = document.createElement('strong');
    name.className = 'theme-copy';
    name.textContent = palette.label;
    const state = document.createElement('b');
    state.textContent = active ? 'ACTIVE' : 'SELECT';
    button.append(swatch, name, state);
    button.addEventListener('click', () => {
      window.rycadeAudio?.play('confirm');
      settings.palette = palette.label;
      saveSettings();
      applyRycadePalette(palette.label);
      renderSettings();
    });
    settingsContent.append(button);
  });
}

function renderBootSettings() {
  settingsContent.innerHTML = '<h3 class="settings-section-title">BOOT ANIMATION</h3><p class="settings-intro">Choose what appears when the cabinet wakes.</p>';
  const choices = document.createElement('div');
  choices.className = 'boot-options';
  ['Insert Coin', 'Lights On', 'CRT Power-on', 'None'].forEach(label => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `boot-choice${settings.boot === label ? ' selected' : ''}`;
    button.setAttribute('aria-pressed', String(settings.boot === label));
    const scene = BOOT_SCENES[label];
    button.innerHTML = `${scene ? '<canvas width="320" height="240"></canvas>' : '<span class="no-preview">OFF</span>'}<span>${label}</span>`;
    if (scene) window.rycadeBoot?.thumb(button.querySelector('canvas'), scene);
    button.addEventListener('click', () => {
      window.rycadeAudio?.play('toggle');
      settings.boot = label;
      saveSettings();
      renderSettings();
    });
    choices.append(button);
  });
  settingsContent.append(choices);
  const play = settingRow('Play boot now', '▶', playBoot, 'Preview with boot audio; press any button to close.', 'confirm');
  play.disabled = settings.boot === 'None';
  if (play.disabled) play.classList.add('disabled');
  settingsContent.append(play);
}

function renderControlsSettings() {
  settingsContent.innerHTML = '<h3 class="settings-section-title">CONTROLS</h3>';
  const speeds = ['Slow', 'Normal', 'Fast'];
  settingsContent.append(settingRow('Skim speed', settings.controls.skimSpeed, () => {
    const current = speeds.indexOf(settings.controls.skimSpeed);
    settings.controls.skimSpeed = speeds[(current + 1) % speeds.length];
    saveSettings();
    renderSettings();
  }, 'Changes how quickly the list repeats while held.'));
  settingsContent.append(settingRow('Letter-jump after 1.7s', settings.controls.letterJump ? 'ON' : 'OFF', () => {
    settings.controls.letterJump = !settings.controls.letterJump;
    saveSettings();
    renderSettings();
  }, 'Long holds jump by the selected game’s first letter.'));
}

function renderSoundSettings() {
  settingsContent.innerHTML = '<h3 class="settings-section-title">SOUND</h3><p class="settings-intro">Levels apply when you release the control.</p>';
  const soundSets = ['cabinet', 'chip', 'neo'];
  const soundSetNames = { cabinet: 'Cabinet', chip: 'Chip', neo: 'Neo' };
  const soundSetInfo = { cabinet: 'soft console UI', chip: '8-bit NES', neo: 'FM arcade' };
  settingsContent.append(settingRow('Sound set', soundSetNames[settings.soundSet], () => {
    const nextIndex = (soundSets.indexOf(settings.soundSet) + 1) % soundSets.length;
    settings.soundSet = soundSets[nextIndex];
    saveSettings();
    renderSettings();
    window.rycadeAudio?.play('confirm');
  }, `${soundSetNames[settings.soundSet]}: ${soundSetInfo[settings.soundSet]}`, null));
  [
    ['Master', 'master', 'Overall cabinet output.'],
    ['Navigation', 'navigation', 'List movement, letters and tabs.'],
    ['Confirm / Back', 'confirm', 'Selection, launch and overlays.'],
    ['Notifications', 'notifications', 'Phone-remote arrival toast.']
  ].forEach(([label, key, description]) => {
    const row = document.createElement('label');
    row.className = 'sound-row';
    const copy = document.createElement('span');
    copy.className = 'setting-copy';
    copy.innerHTML = `<strong>${label}</strong><small>${description}</small>`;
    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'mixer-slider';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.value = settings.sound[key];
    input.dataset.key = key;
    input.setAttribute('aria-label', `${label} volume`);
    const value = document.createElement('b');
    value.className = 'mixer-value';
    value.textContent = `${input.value}%`;
    input.addEventListener('input', () => {
      input.dataset.pending = input.value;
      value.textContent = `${input.value}%`;
    });
    input.addEventListener('pointerup', () => commitMixer(input));
    input.addEventListener('pointercancel', () => {
      delete input.dataset.pending;
      input.value = settings.sound[key];
      value.textContent = `${input.value}%`;
    });
    row.append(copy, input, value);
    settingsContent.append(row);
  });
  settingsContent.append(settingRow('Mute all', settings.sound.muted ? 'ON' : 'OFF', () => {
    settings.sound.muted = !settings.sound.muted;
    saveSettings();
    renderSettings();
  }, 'Silence every cabinet sound.'));
}

function commitMixer(input) {
  if (!Object.prototype.hasOwnProperty.call(input.dataset, 'pending')) return;
  settings.sound[input.dataset.key] = Number(input.dataset.pending);
  delete input.dataset.pending;
  saveSettings();
  const preview = input.dataset.key === 'navigation' ? 'move' :
    input.dataset.key === 'notifications' ? 'notification' : 'confirm';
  window.rycadeAudio?.play(preview);
}

function renderRemoteSettings() {
  settingsContent.innerHTML = '<h3 class="settings-section-title">PHONE REMOTE</h3><div class="remote-settings"><div class="remote-details"></div><div id="pairing-qr" aria-label="QR code for phone remote"></div></div>';
  const details = settingsContent.querySelector('.remote-details');
  details.append(settingRow('Phone remote', settings.remote.enabled ? 'ON' : 'OFF', () => {
    settings.remote.enabled = !settings.remote.enabled;
    saveSettings();
    applyRemoteSetting();
    renderSettings();
  }, 'Allow paired phones to send a game to this cab.'));
  const codeLabel = document.createElement('span');
  codeLabel.className = 'pairing-label';
  codeLabel.textContent = 'PAIRING CODE';
  details.append(codeLabel);
  const code = document.createElement('div');
  code.className = 'pairing-code';
  code.textContent = getPairingCode();
  details.append(code);
  const newCode = settingRow('New code', '↻', () => {
    createPairingCode();
    applyRemoteSetting(true);
    renderSettings();
  }, 'Generate a new six-character pairing code.');
  details.append(newCode);
  const note = document.createElement('p');
  note.className = 'settings-note';
  note.textContent = settings.remote.enabled ? 'Scan to open this cab on your phone.' : 'Turn the remote on to pair a phone.';
  details.append(note);
  const qrHost = settingsContent.querySelector('#pairing-qr');
  if (settings.remote.enabled && window.qrcode) {
    const qr = qrcode(0, 'M');
    qr.addData(`https://arcade.ryanpolasky.com/remote?code=${encodeURIComponent(getPairingCode())}`);
    qr.make();
    qrHost.innerHTML = qr.createImgTag(4, 4);
    const image = qrHost.querySelector('img');
    image.alt = 'Pairing QR code';
    image.width = 164;
    image.height = 164;
  } else {
    qrHost.textContent = 'REMOTE OFF';
  }
}

function renderAboutSettings() {
  settingsContent.innerHTML = '<h3 class="settings-section-title">ABOUT</h3><p class="about-version">VERSION 1.2.0</p><p class="settings-note">Rycade web prototype</p>';
}

function playBoot() {
  const scene = BOOT_SCENES[settings.boot];
  if (!scene) return;
  release();
  if (!bootOpen) bootReturnFocus = document.activeElement;
  bootOpen = true;
  const session = ++bootSession;
  bootScreen.classList.add('visible');
  bootScreen.setAttribute('aria-hidden', 'false');
  bootScreen.focus();
  let origin = null;
  window.rycadeBoot.play(bootScreen.querySelector('.boot-canvas'), scene, {
    clock: () => origin === null ? null : performance.now() / 1000 - origin,
    still: matchMedia('(prefers-reduced-motion: reduce)').matches,
    scanlines: !(settings.theme === 'Cover Flow' && settings.display.scanlines)
  });
  const startClock = delay => {
    if (session === bootSession) origin = performance.now() / 1000 + (delay || 0);
  };
  Promise.resolve(window.rycadeAudio?.playBootAudio()).then(startClock, () => startClock(0));
}

function closeBoot() {
  if (!bootOpen) return;
  bootOpen = false;
  bootSession++;
  window.rycadeBoot.stop();
  window.rycadeAudio?.stopBootAudio();
  bootScreen.classList.remove('visible');
  bootScreen.setAttribute('aria-hidden', 'true');
  if (bootReturnFocus?.isConnected) bootReturnFocus.focus({ preventScroll: true });
  bootReturnFocus = null;
}

function activateSetting() {
  settingsActions()[settingsActionIndex]?.click();
}

function setToast(game) {
  clearTimeout(toastTimer);
  toast.textContent = `FROM YOUR PHONE · ${game.title} · START TO PLAY`;
  toast.classList.add('visible');
  window.rycadeAudio?.play('notification');
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 5000);
}

function handleRemoteMessage(data) {
  let message;
  try {
    message = JSON.parse(data);
  } catch {
    return;
  }
  if (message.type !== 'open') return;
  const game = GAMES.find(item => item.id === message.gameId);
  if (!game) return;
  closeDemo();
  closeOverlays();
  tab = 0;
  build(game.id);
  setToast(game);
}

function connectRemote() {
  if (!settings.remote.enabled || remoteSocket || !('WebSocket' in window)) return;
  const generation = remoteSocketGeneration;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}/api/ws?code=${encodeURIComponent(getPairingCode())}`);
  remoteSocket = socket;
  socket.addEventListener('open', () => {
    if (generation === remoteSocketGeneration) reconnectDelay = 1000;
  });
  socket.addEventListener('message', event => handleRemoteMessage(event.data));
  socket.addEventListener('close', () => {
    if (remoteSocket === socket) remoteSocket = null;
    if (!settings.remote.enabled || generation !== remoteSocketGeneration) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectRemote, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  });
  socket.addEventListener('error', () => socket.close());
}

function applyRemoteSetting(codeChanged = false) {
  if (codeChanged || !settings.remote.enabled) {
    remoteSocketGeneration += 1;
    clearTimeout(reconnectTimer);
    if (remoteSocket) remoteSocket.close();
    remoteSocket = null;
  }
  if (settings.remote.enabled) connectRemote();
}

function handleSearchKey(event) {
  event.stopPropagation();
  const key = event.key;
  const inputFocused = event.target === searchInput;
  if (key === 'Escape') {
    event.preventDefault();
    closeSearch();
  } else if (key === 'ArrowLeft') {
    event.preventDefault();
    if (searchArea === 'results') {
      searchArea = 'keyboard';
      updateSearchFocus();
      searchKeyboard.children[searchKeyIndex]?.focus();
    } else if (searchKeyIndex % 10 > 0) {
      moveSearchKey(-1);
    }
  } else if (key === 'ArrowRight') {
    event.preventDefault();
    if (searchArea === 'keyboard' && searchKeyIndex % 10 < 9 && searchKeyIndex + 1 < SEARCH_KEYS.length) {
      moveSearchKey(1);
    } else {
      searchArea = 'results';
      updateSearchFocus();
      searchResults.children[searchResultIndex]?.focus();
    }
  } else if (key === 'ArrowUp' || key === 'ArrowDown') {
    event.preventDefault();
    if (searchArea === 'keyboard') {
      moveSearchKey(key === 'ArrowDown' ? 10 : -10);
    } else {
      moveSearchResult(key === 'ArrowDown' ? 1 : -1);
    }
  } else if (key === CABINET_KEYS.start) {
    event.preventDefault();
    if (searchArea === 'keyboard') pressSearchKey(SEARCH_KEYS[searchKeyIndex]);
    else if (searchGames[searchResultIndex]) selectGame(searchGames[searchResultIndex].id);
  } else if (key === CABINET_KEYS.shoot && !inputFocused) {
    event.preventDefault();
    if (searchArea === 'keyboard') pressSearchKey(SEARCH_KEYS[searchKeyIndex]);
    else if (searchGames[searchResultIndex]) selectGame(searchGames[searchResultIndex].id);
  }
}

function handleSettingsKey(event) {
  event.stopPropagation();
  const key = event.key;
  if (event.target.matches?.('.mixer-slider') && (key === 'ArrowLeft' || key === 'ArrowRight')) {
    event.preventDefault();
    const input = event.target;
    const current = Number(input.dataset.pending ?? input.value);
    const next = Math.max(0, Math.min(100, current + (key === 'ArrowRight' ? 10 : -10)));
    input.value = String(next);
    input.dataset.pending = String(next);
    input.closest('.sound-row').querySelector('.mixer-value').textContent = `${next}%`;
    return;
  }
  if (key === 'Escape') {
    event.preventDefault();
    closeSettings();
  } else if (key === 'ArrowUp' || key === 'ArrowDown') {
    event.preventDefault();
    if (settingsArea === 'tabs') {
      window.rycadeAudio?.play('tab');
      const step = key === 'ArrowDown' ? 1 : -1;
      settingsTabIndex = (settingsTabIndex + step + SETTINGS_TABS.length) % SETTINGS_TABS.length;
      settingsActionIndex = 0;
      renderSettings();
      settingsNav.children[settingsTabIndex]?.focus();
    } else {
      const actions = settingsActions();
      if (actions.length) {
        const step = key === 'ArrowDown' ? 1 : -1;
        settingsActionIndex = (settingsActionIndex + step + actions.length) % actions.length;
        refreshSettingsFocus();
        actions[settingsActionIndex]?.focus();
        actions[settingsActionIndex]?.scrollIntoView({ block: 'nearest' });
      }
    }
  } else if (key === 'ArrowRight' && settingsArea === 'tabs') {
    event.preventDefault();
    window.rycadeAudio?.play('tab');
    settingsArea = 'options';
    settingsActionIndex = 0;
    refreshSettingsFocus();
    settingsActions()[0]?.focus();
  } else if (key === 'ArrowLeft' && settingsArea === 'tabs') {
    event.preventDefault();
    closeSettings();
  } else if (key === 'ArrowLeft' && settingsArea === 'options') {
    event.preventDefault();
    window.rycadeAudio?.play('tab');
    settingsArea = 'tabs';
    refreshSettingsFocus();
    settingsNav.children[settingsTabIndex]?.focus();
  } else if (key === CABINET_KEYS.start || key === CABINET_KEYS.shoot) {
    event.preventDefault();
    if (settingsArea === 'tabs') {
      settingsArea = 'options';
      settingsActionIndex = 0;
      refreshSettingsFocus();
      settingsActions()[0]?.focus();
    } else {
      activateSetting();
    }
  }
}

window.addEventListener('keyup', event => {
  if (settingsOpen && event.target.matches?.('.mixer-slider') && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    commitMixer(event.target);
  }
});

applyRycadeTheme(settings.theme);
applyRycadePalette(settings.palette);

window.addEventListener('keydown', event => {
  const code = event.code || event.key;
  if (code === bootDismissKey || bootOpen) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (bootOpen && !event.repeat) {
      bootDismissKey = code;
      closeBoot();
    }
    return;
  }
  if (searchOpen) {
    handleSearchKey(event);
    return;
  }
  if (settingsOpen) {
    handleSettingsKey(event);
    return;
  }
  if (event.repeat || launched || demoGame) return;
  const key = event.key.toLowerCase();
  if (event.key === '/' || key === 's') {
    event.preventDefault();
    event.stopPropagation();
    openSearch();
  } else if (key === 'm') {
    event.preventDefault();
    event.stopPropagation();
    openSettings();
  }
}, true);

window.addEventListener('keyup', event => {
  if ((event.code || event.key) !== bootDismissKey) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  bootDismissKey = null;
}, true);
window.addEventListener('blur', () => { bootDismissKey = null; });
bootScreen.addEventListener('click', event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  closeBoot();
});

document.querySelector('#search-open').addEventListener('click', openSearch);
document.querySelector('#settings-open').addEventListener('click', openSettings);
document.querySelector('#search-close').addEventListener('click', closeSearch);
searchInput.addEventListener('input', () => {
  searchResultIndex = 0;
  updateSearchResults();
});
searchOverlay.addEventListener('click', event => {
  if (event.target === searchOverlay) closeSearch();
});
settingsOverlay.addEventListener('click', event => {
  if (event.target === settingsOverlay) closeSettings();
});

applySettings();
window.rycadeAudio?.setVolumes(settings.sound);
window.rycadeAudio?.setSoundSet(settings.soundSet);
getPairingCode();
buildSearchKeyboard();
updateSearchResults();
setInterval(updateClock, 15000);
applyRemoteSetting();
window.rycadeFeatures = {
  openSearch,
  openSettings,
  closeOverlays,
  get settings() {
    return settings;
  }
};
