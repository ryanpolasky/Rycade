const SETTINGS_KEY = 'rycade.settings';
const CODE_KEY = 'rycade.code';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SEARCH_KEYS = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'0123456789',
  'SPACE',
  'DEL',
  'DONE'
];
const SETTINGS_TABS = ['Display', 'Themes', 'Boot', 'Controls', 'Remote', 'About'];
const DEFAULT_SETTINGS = {
  display: { scanlines: true, backgroundArt: true, controls: true, clock: false },
  theme: 'Lightbox',
  boot: 'Insert Coin',
  controls: { skimSpeed: 'Normal', letterJump: true },
  remote: { enabled: true }
};

function readSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {}
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  return {
    display: { ...DEFAULT_SETTINGS.display, ...(saved.display || {}) },
    theme: saved.theme || DEFAULT_SETTINGS.theme,
    boot: saved.boot || DEFAULT_SETTINGS.boot,
    controls: { ...DEFAULT_SETTINGS.controls, ...(saved.controls || {}) },
    remote: { ...DEFAULT_SETTINGS.remote, ...(saved.remote || {}) }
  };
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
let bootTimer = 0;

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
  if (launched) return;
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
  if (!game) return;
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
  searchResultIndex = (searchResultIndex + delta + searchGames.length) % searchGames.length;
  updateSearchFocus();
  searchResults.children[searchResultIndex]?.focus();
  searchResults.children[searchResultIndex]?.scrollIntoView({ block: 'nearest' });
}

function moveSearchKey(delta) {
  const next = searchKeyIndex + delta;
  if (next < 0 || next >= SEARCH_KEYS.length) return;
  searchKeyIndex = next;
  updateSearchFocus();
  searchKeyboard.children[searchKeyIndex]?.focus();
}

function openSettings() {
  if (launched) return;
  closeSearch();
  settingsOpen = true;
  settingsOverlay.classList.add('visible');
  settingsOverlay.setAttribute('aria-hidden', 'false');
  settingsArea = 'tabs';
  renderSettings();
  settingsNav.children[settingsTabIndex]?.focus();
}

function closeSettings() {
  settingsOpen = false;
  settingsOverlay.classList.remove('visible');
  settingsOverlay.setAttribute('aria-hidden', 'true');
}

function settingsActions() {
  return [...settingsContent.querySelectorAll('.setting-action:not(:disabled), .boot-choice')];
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
  else if (settingsTabIndex === 4) renderRemoteSettings();
  else renderAboutSettings();
  refreshSettingsFocus();
}

function settingRow(label, value, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'setting-action';
  button.innerHTML = `<span>${label}</span><b>${value}</b>`;
  button.addEventListener('click', action);
  return button;
}

function renderDisplaySettings() {
  settingsContent.innerHTML = '<h3 class="settings-section-title">DISPLAY</h3>';
  [
    ['Scanlines on CRT', 'scanlines'],
    ['Background art', 'backgroundArt'],
    ['Show controls row', 'controls'],
    ['Clock in header', 'clock']
  ].forEach(([label, key]) => {
    const button = settingRow(label, settings.display[key] ? 'ON' : 'OFF', () => {
      settings.display[key] = !settings.display[key];
      saveSettings();
      applySettings();
      renderSettings();
    });
    settingsContent.append(button);
  });
}

function renderThemeSettings() {
  settingsContent.innerHTML = '<h3 class="settings-section-title">THEME</h3>';
  settingsContent.append(settingRow('Lightbox', 'ACTIVE', () => {
    settings.theme = 'Lightbox';
    saveSettings();
    renderSettings();
  }));
  ['Rycade TV', 'Neo Gold', 'Vector'].forEach(label => {
    const row = document.createElement('div');
    row.className = 'setting-action disabled';
    row.innerHTML = `<span>${label}</span><b>COMING SOON</b>`;
    settingsContent.append(row);
  });
}

function bootAsset(name) {
  return ({
    'Insert Coin': '/boot/boot_coin.gif',
    'Lights On': '/boot/boot_lights.gif',
    'CRT Power-on': '/boot/boot_crt.gif'
  })[name];
}

function renderBootSettings() {
  settingsContent.innerHTML = '<h3 class="settings-section-title">BOOT ANIMATION</h3>';
  const choices = document.createElement('div');
  choices.className = 'boot-options';
  ['Insert Coin', 'Lights On', 'CRT Power-on', 'None'].forEach(label => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `boot-choice${settings.boot === label ? ' selected' : ''}`;
    const asset = bootAsset(label);
    button.innerHTML = `${asset ? `<img src="${asset}" alt="">` : '<span class="no-preview">—</span>'}<span>${label}</span>`;
    button.addEventListener('click', () => {
      settings.boot = label;
      saveSettings();
      renderSettings();
    });
    choices.append(button);
  });
  settingsContent.append(choices);
  const play = settingRow('Play boot now', '▶', playBoot);
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
  }));
  settingsContent.append(settingRow('Letter-jump after 1.7s', settings.controls.letterJump ? 'ON' : 'OFF', () => {
    settings.controls.letterJump = !settings.controls.letterJump;
    saveSettings();
    renderSettings();
  }));
}

function renderRemoteSettings() {
  settingsContent.innerHTML = '<h3 class="settings-section-title">PHONE REMOTE</h3><div class="remote-settings"><div class="remote-details"></div><div id="pairing-qr" aria-label="QR code for phone remote"></div></div>';
  const details = settingsContent.querySelector('.remote-details');
  details.append(settingRow('Phone remote', settings.remote.enabled ? 'ON' : 'OFF', () => {
    settings.remote.enabled = !settings.remote.enabled;
    saveSettings();
    applyRemoteSetting();
    renderSettings();
  }));
  const code = document.createElement('div');
  code.className = 'pairing-code';
  code.textContent = getPairingCode();
  details.append(code);
  const newCode = settingRow('New code', '↻', () => {
    createPairingCode();
    applyRemoteSetting(true);
    renderSettings();
  });
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
  settingsContent.innerHTML = '<h3 class="settings-section-title">ABOUT</h3><p class="about-version">VERSION 1.1.0</p><p class="settings-note">Rycade web prototype</p>';
}

function playBoot() {
  const asset = bootAsset(settings.boot);
  if (!asset) return;
  clearTimeout(bootTimer);
  const image = bootScreen.querySelector('img');
  image.src = `${asset}?play=${Date.now()}`;
  bootScreen.classList.add('visible');
  bootScreen.setAttribute('aria-hidden', 'false');
  bootTimer = setTimeout(() => {
    bootScreen.classList.remove('visible');
    bootScreen.setAttribute('aria-hidden', 'true');
  }, 5000);
}

function activateSetting() {
  settingsActions()[settingsActionIndex]?.click();
}

function setToast(game) {
  clearTimeout(toastTimer);
  toast.textContent = `FROM YOUR PHONE · ${game.title} · SHOOT TO PLAY`;
  toast.classList.add('visible');
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
  } else if (key === 'Enter') {
    event.preventDefault();
    if (searchArea === 'keyboard') pressSearchKey(SEARCH_KEYS[searchKeyIndex]);
    else if (searchGames[searchResultIndex]) selectGame(searchGames[searchResultIndex].id);
  } else if ((key === 'x' || key === 'X') && !inputFocused) {
    event.preventDefault();
    if (searchArea === 'keyboard') pressSearchKey(SEARCH_KEYS[searchKeyIndex]);
    else if (searchGames[searchResultIndex]) selectGame(searchGames[searchResultIndex].id);
  }
}

function handleSettingsKey(event) {
  event.stopPropagation();
  const key = event.key;
  if (key === 'Escape') {
    event.preventDefault();
    closeSettings();
  } else if (key === 'ArrowUp' || key === 'ArrowDown') {
    event.preventDefault();
    if (settingsArea === 'tabs') {
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
    settingsArea = 'options';
    settingsActionIndex = 0;
    refreshSettingsFocus();
    settingsActions()[0]?.focus();
  } else if (key === 'ArrowLeft' && settingsArea === 'options') {
    event.preventDefault();
    settingsArea = 'tabs';
    refreshSettingsFocus();
    settingsNav.children[settingsTabIndex]?.focus();
  } else if (key === 'Enter' || key.toLowerCase() === 'x') {
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

window.addEventListener('keydown', event => {
  if (searchOpen) {
    handleSearchKey(event);
    return;
  }
  if (settingsOpen) {
    handleSettingsKey(event);
    return;
  }
  if (event.repeat || launched) return;
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

document.querySelector('#search-open').addEventListener('click', openSearch);
document.querySelector('#settings-open').addEventListener('click', openSettings);
document.querySelector('#search-close').addEventListener('click', closeSearch);
document.querySelector('#settings-close').addEventListener('click', closeSettings);
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
