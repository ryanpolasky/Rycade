const SYSTEMS = ['ALL', 'FAVORITES', '2P+', '4P', 'ARCADE', 'GENESIS', 'SNES', 'NES'];
const FAVORITES_KEY = 'rycade.favorites';
const LAST_PLAYED_KEY = 'rycade.lastPlayed';
const CONTROL_COLORS = ['#ffd21f', '#ff2a2a', '#2a7bff'];
const CABINET_KEYS = { start: 'Enter', shoot: '1', pass: '2', turbo: '3' };
const keyFor = title => title.replace(/^the /i, '').toUpperCase();
const letterOf = game => {
  const character = keyFor(game.title)[0];
  return /^[A-Z]$/.test(character) ? character : '#';
};
const stage = document.querySelector('#stage');
const roster = document.querySelector('#roster');
const list = document.querySelector('#list');
const tabs = document.querySelector('#tabs');
const monitor = document.querySelector('#monitor');
const nowPlaying = document.querySelector('#now-playing');
const letterOverlay = document.querySelector('#letter');
const demoOverlay = document.querySelector('#demo-overlay');
const demoVideo = document.querySelector('#demo-video');
let tab = 0;
let view = [];
let index = 0;
let holding = null;
let launched = false;
const cabMode = new URLSearchParams(location.search).get('cab') === '1';
let playSession = 0;
let playFrame = null;
let playExitTimer = 0;
let demoGame = null;
let demoSession = 0;
let demoFrameCallback = 0;
let statusTimer = 0;
let swipe = null;
let ignoreClick = false;
let settleTimer = 0;
let collapseTimer = 0;
let barFocus = false;
let barIndex = 0;
const favorites = new Set(readFavorites());

function readFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter(id => GAMES.some(game => game.id === id)) : [];
  } catch {
    return [];
  }
}

function lastPlayedId() {
  try {
    const id = localStorage.getItem(LAST_PLAYED_KEY);
    return GAMES.some(game => game.id === id) ? id : 'jamte';
  } catch {
    return 'jamte';
  }
}

function isFavorite(id) {
  return favorites.has(id);
}

function inSystem(game, system) {
  if (system === 'ALL') return true;
  if (system === 'FAVORITES') return favorites.has(game.id);
  if (system === '2P+') return game.players >= 2;
  if (system === '4P') return game.players >= 4;
  return game.sys === system;
}

function flashToast(text) {
  const toast = document.querySelector('#remote-toast');
  toast.textContent = text;
  toast.classList.add('visible');
  clearTimeout(flashToast.timer);
  flashToast.timer = setTimeout(() => toast.classList.remove('visible'), 1800);
}

function toggleFavorite() {
  const game = view[index];
  if (!game || launched || demoGame) return;
  if (favorites.has(game.id)) favorites.delete(game.id);
  else favorites.add(game.id);
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  } catch {}
  window.rycadeAudio?.play('toggle');
  flashToast(`${favorites.has(game.id) ? '★ ADDED TO' : 'REMOVED FROM'} FAVORITES · ${game.title.toUpperCase()}`);
  if (stage.dataset.detailId === game.id) stage.classList.toggle('is-fav', favorites.has(game.id));
  if (SYSTEMS[tab] === 'FAVORITES') {
    const neighbour = view[index + 1] || view[index - 1];
    build(favorites.has(game.id) ? game.id : neighbour?.id);
  } else {
    renderTabs();
    layout(index, game, view);
  }
}

function fit() {
  const scale = Math.min(innerWidth / 1280, innerHeight / 960);
  stage.style.transform = `translate(${(innerWidth - 1280 * scale) / 2}px, ${(innerHeight - 960 * scale) / 2}px) scale(${scale})`;
}

function renderTabs() {
  tabs.replaceChildren(...SYSTEMS.map((system, systemIndex) => {
    const count = GAMES.filter(game => inSystem(game, system)).length;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${systemIndex === tab ? 'on' : ''}${system === 'FAVORITES' ? ' fav-tab' : ''}`;
    button.innerHTML = `${system === 'FAVORITES' ? '★ FAVORITES' : system}<sup>${count}</sup>`;
    button.setAttribute('aria-label', `${system} ${count}`);
    button.addEventListener('click', () => changeTab(systemIndex));
    return button;
  }));
  paintBar();
}

function build(keepId) {
  const system = SYSTEMS[tab];
  view = GAMES
    .filter(game => inSystem(game, system))
    .sort((a, b) => keyFor(a.title) < keyFor(b.title) ? -1 : 1);
  const retainedIndex = keepId ? view.findIndex(game => game.id === keepId) : -1;
  index = retainedIndex >= 0 ? retainedIndex : 0;
  list.replaceChildren(...view.map((game, rowIndex) => {
    const row = document.createElement('div');
    row.className = 'lr';
    row.dataset.index = rowIndex;
    row.dataset.letter = letterOf(game);
    return row;
  }));
  renderTabs();
  place(true);
}

function changeTab(nextTab) {
  if (launched || demoGame || nextTab === tab) return;
  window.rycadeAudio?.play('tab');
  const selectedId = view[index] && view[index].id;
  tab = nextTab;
  build(selectedId);
}

function updatePair(id, source) {
  const pair = document.querySelector(`#${id}`);
  if (!source) return;
  const active = pair.querySelector('img.active');
  if (active.getAttribute('src') === source && active.complete && active.naturalWidth) {
    tagAspect(pair, active);
    return;
  }
  const next = [...pair.querySelectorAll('img')].find(image => image !== active);
  const token = (Number(pair.dataset.token) || 0) + 1;
  pair.dataset.token = token;
  next.onload = () => {
    if (Number(pair.dataset.token) !== token) return;
    tagAspect(pair, next);
    next.classList.add('active');
    active.classList.remove('active');
  };
  next.onerror = () => {
    if (Number(pair.dataset.token) === token) next.removeAttribute('src');
  };
  next.src = source;
  if (next.complete && next.naturalWidth) next.onload();
}

function tagAspect(pair, img) {
  const ratio = img.naturalWidth / (img.naturalHeight || 1);
  const kind = ratio < 0.88 ? 'portrait' : ratio > 1.38 ? 'wide' : 'standard';
  pair.dataset.aspect = kind;
  img.dataset.aspect = kind;
}

function renderControls(game) {
  const controls = document.querySelector('#controls');
  controls.replaceChildren(...game.ctl
    .map((action, controlIndex) => action ? { action, controlIndex } : null)
    .filter(Boolean)
    .map(({ action, controlIndex }) => {
      const item = document.createElement('span');
      const dot = document.createElement('i');
      dot.style.background = CONTROL_COLORS[controlIndex];
      const label = document.createElement('span');
      label.textContent = game.caps[controlIndex];
      const hint = document.createElement('em');
      hint.textContent = action.toLowerCase();
      item.append(dot, label, document.createTextNode(' '), hint);
      return item;
    }));
}

function place(instant = false) {
  const game = view[index];
  if (!game) {
    clearTimeout(settleTimer);
    stage.classList.remove('cf-settled');
    stage.classList.add('is-empty');
    layout(-1, null, view);
    return;
  }
  stage.classList.remove('is-empty');
  layout(index, game, view);
  const rows = [...list.children];
  rows.forEach((row, rowIndex) => {
    const distance = Math.min(Math.abs(rowIndex - index), 5);
    row.classList.toggle('on', rowIndex === index);
    row.style.setProperty('--row-op', [1, .72, .54, .4, .3, .22][distance]);
  });
  const totalHeight = rows.reduce((height, row) => height + row.offsetHeight, 0);
  const selectedCenter = rows.slice(0, index).reduce((height, row) => height + row.offsetHeight, 0) + rows[index].offsetHeight / 2;
  const maxOffset = Math.max(0, totalHeight - roster.clientHeight);
  const offset = Math.max(0, Math.min(maxOffset, selectedCenter - roster.clientHeight / 2));
  list.style.transition = instant ? 'none' : '';
  list.style.transform = `translateY(${-offset}px)`;

  stage.dataset.gameId = game.id;
  if (!THEME_DEFERS_DETAIL.has(document.body.dataset.theme)) renderDetail(game);
  scheduleSettle();
  requestAnimationFrame(syncMarquees);
}

function renderDetail(game) {
  if (!game || stage.dataset.detailId === game.id) return;
  stage.dataset.detailId = game.id;
  stage.classList.toggle('is-fav', favorites.has(game.id));
  stage.dataset.hasLogo = game.logo ? 'true' : 'false';
  stage.style.setProperty('--acc', game.color);
  stage.style.setProperty('--sp', `rgb(${game.spill.join(',')})`);
  stage.style.setProperty('--spa', `rgba(${game.spill.join(',')},.28)`);
  const titleEl = document.querySelector('#title');
  titleEl.innerHTML = `<span class="mq-txt">${game.title.toUpperCase()}</span>`;
  const seats = [1, 2, 3, 4].map(seat => `<b class="${seat <= game.players ? 'on' : ''}">P${seat}</b>`).join('');
  document.querySelector('#sub').innerHTML = [
    game.sys,
    game.year,
    game.pub.toUpperCase()
  ].map(part => `<span class="mi">${part}</span>`).join('') + `<span class="mi mi-seats">${seats}</span>`;

  const logo = document.querySelector('#mlogo');
  const fallback = document.querySelector('#mtext');
  if (game.logo) {
    logo.onload = () => {
      const r = logo.naturalWidth / (logo.naturalHeight || 1);
      logo.dataset.shape = r < 1.35 ? 'badge' : r > 3.2 ? 'banner' : 'standard';
    };
    logo.src = game.logo;
    if (logo.complete && logo.naturalWidth) logo.onload();
    logo.style.display = '';
    fallback.style.display = 'none';
  } else {
    logo.removeAttribute('src');
    logo.removeAttribute('data-shape');
    logo.style.display = 'none';
    fallback.innerHTML = `<span class="mq-txt">${game.title.toUpperCase()}</span>`;
    fallback.style.display = '';
  }

  updatePair('backdrop', game.box);
  updatePair('flyer', game.box);
  updatePair('screen', game.snap);
  renderControls(game);
  requestAnimationFrame(syncMarquees);
}

function scheduleSettle() {
  clearTimeout(settleTimer);
  if (stage.classList.contains('cf-settled')) {
    stage.classList.add('cf-collapsing');
    clearTimeout(collapseTimer);
    collapseTimer = setTimeout(() => stage.classList.remove('cf-collapsing'), 420);
  }
  stage.classList.remove('cf-settled');
  settleTimer = setTimeout(() => {
    if (holding) return;
    renderDetail(view[index]);
    stage.classList.add('cf-settled');
  }, 650);
}

function syncMarquees() {
  stage.querySelectorAll('.mq-txt').forEach(inner => {
    const host = inner.parentElement;
    if (!host) return;
    host.classList.remove('is-marquee');
    host.style.removeProperty('--mq-dist');
    host.style.removeProperty('--mq-dur');
    const overflow = inner.scrollWidth - host.clientWidth;
    if (overflow > 3) {
      const dist = overflow + 18;
      const dur = Math.max(4.2, Math.min(12, dist / 34));
      host.style.setProperty('--mq-dist', `${-dist}px`);
      host.style.setProperty('--mq-dur', `${dur.toFixed(2)}s`);
      host.classList.add('is-marquee');
    }
  });
}

function step(direction, pitchMultiplier = 1) {
  if (launched || demoGame) return;
  const nextIndex = Math.max(0, Math.min(view.length - 1, index + direction));
  if (nextIndex !== index) {
    if (window.__rycadeAudioDebug) window.__rycadeAudioDebug.stepsTaken++;
    window.rycadeAudio?.play('move', { pitchMultiplier });
    index = nextIndex;
    place();
  }
}

function letterJump(direction) {
  if (!view.length) return;
  const currentLetter = letterOf(view[index]);
  let nextIndex = index;
  if (direction > 0) {
    while (nextIndex < view.length - 1 && letterOf(view[nextIndex]) === currentLetter) nextIndex++;
  } else {
    while (nextIndex > 0 && letterOf(view[nextIndex - 1]) === currentLetter) nextIndex--;
    if (nextIndex === index && nextIndex > 0) {
      nextIndex--;
      const previousLetter = letterOf(view[nextIndex]);
      while (nextIndex > 0 && letterOf(view[nextIndex - 1]) === previousLetter) nextIndex--;
    }
  }
  index = nextIndex;
  window.rycadeAudio?.play('letter');
  place();
  letterOverlay.querySelector('b').textContent = letterOf(view[index]);
  letterOverlay.classList.add('on');
}

function hold(direction) {
  const settings = window.rycadeFeatures?.settings;
  const multiplier = ({ Slow: 1.5, Normal: 1, Fast: .6 })[settings?.controls?.skimSpeed] || 1;
  const letterJumpEnabled = settings?.controls?.letterJump !== false;
  const startedAt = performance.now();
  step(direction);
  const repeat = () => {
    if (!holding) return;
    const elapsed = performance.now() - startedAt;
    if (letterJumpEnabled && elapsed > 1700 * multiplier) {
      letterJump(direction);
      holding.timer = setTimeout(repeat, 320 * multiplier);
    } else {
      const repeatPitch = elapsed < 900 * multiplier ? 1.12 : 1.25;
      step(direction, repeatPitch);
      holding.timer = setTimeout(repeat, elapsed < 900 * multiplier ? 110 * multiplier : 55 * multiplier);
    }
  };
  holding = { direction, timer: setTimeout(repeat, 300 * multiplier) };
}

function release() {
  if (!holding) return;
  clearTimeout(holding.timer);
  holding = null;
  setTimeout(() => letterOverlay.classList.remove('on'), 220);
  place();
}

function openDemo() {
  window.rycadeAttract.reset();
  if (launched || demoGame || !view[index]) return;
  release();
  demoGame = view[index];
  const session = ++demoSession;
  const game = demoGame;
  const unavailable = () => {
    if (session !== demoSession) return;
    closeDemo();
    window.rycadeAudio?.play('error');
    flashToast(`DEMO VIDEO UNAVAILABLE: ${game.title.toUpperCase()}`);
  };
  demoOverlay.querySelector('.demo-title').textContent = game.title;
  demoOverlay.classList.remove('ready');
  demoOverlay.hidden = false;
  const reveal = () => {
    if (session !== demoSession) return;
    demoFrameCallback = 0;
    demoOverlay.classList.add('ready');
    demoOverlay.setAttribute('aria-hidden', 'false');
    demoOverlay.focus();
  };
  demoVideo.onplaying = () => {
    if (session !== demoSession || demoOverlay.classList.contains('ready')) return;
    if (demoVideo.requestVideoFrameCallback) demoFrameCallback = demoVideo.requestVideoFrameCallback(reveal);
    else requestAnimationFrame(reveal);
  };
  demoVideo.onerror = unavailable;
  const sound = window.rycadeFeatures?.settings.sound;
  demoVideo.muted = Boolean(sound?.muted);
  demoVideo.volume = (sound?.master ?? 70) / 100;
  demoVideo.src = window.rycadeCab?.clip(game) || game.video || `/videos/${game.id}.mp4`;
  demoVideo.play().catch(unavailable);
}

function closeDemo() {
  window.rycadeAttract.reset();
  if (!demoGame) return;
  demoGame = null;
  demoSession++;
  demoVideo.onplaying = null;
  demoVideo.onerror = null;
  if (demoFrameCallback) demoVideo.cancelVideoFrameCallback(demoFrameCallback);
  demoFrameCallback = 0;
  demoVideo.pause();
  demoVideo.removeAttribute('src');
  demoVideo.load();
  demoOverlay.hidden = true;
  demoOverlay.classList.remove('ready');
  demoOverlay.setAttribute('aria-hidden', 'true');
  demoOverlay.blur();
}

function launch() {
  window.rycadeAttract.reset();
  if (launched || !view[index]) return;
  try {
    localStorage.setItem(LAST_PLAYED_KEY, view[index].id);
  } catch {}
  closeDemo();
  release();
  if (barFocus) setBarFocus(false);
  renderDetail(view[index]);
  window.rycadeAudio?.play('launch');
  if (cabMode) {
    launchCabGame(view[index]);
    return;
  }
  launched = true;
  monitor.classList.add('live', 'show-status');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => monitor.classList.remove('show-status'), 2400);
}

async function launchCabGame(game) {
  launched = true;
  clearTimeout(playExitTimer);
  const session = ++playSession;
  monitor.classList.add('loading', 'show-status');
  nowPlaying.textContent = 'LOADING GAME';
  clearTimeout(statusTimer);
  try {
    const rom = await window.rycadeEmulation.resolveRom(game);
    if (session !== playSession || !launched) return;
    if (!rom || !rom.filename) {
      flashToast(`ROM not found: ${rom?.expected || game.title}`);
      launched = false;
      monitor.classList.remove('loading', 'show-status');
      monitor.focus();
      return;
    }
    const layer = document.querySelector('#play-layer');
    const params = new URLSearchParams({
      file: `${rom.dir}/${rom.filename}`,
      core: rom.core,
      sys: rom.sys
    });
    playFrame = document.createElement('iframe');
    playFrame.title = `${game.title} emulator`;
    playFrame.allow = 'autoplay; fullscreen; gamepad';
    playFrame.src = `/play.html?${params}`;
    layer.replaceChildren(playFrame);
  } catch {
    if (session !== playSession) return;
    flashToast(`ROM not found: ${game.title}`);
    launched = false;
    monitor.classList.remove('loading', 'show-status');
    monitor.focus();
  }
}

function exitGame() {
  window.rycadeAttract.reset();
  if (!launched) return;
  window.rycadeAudio?.play('back');
  if (cabMode) {
    ++playSession;
    launched = false;
    monitor.classList.remove('live', 'loading', 'show-status');
    nowPlaying.textContent = 'NOW PLAYING · ESC TO EXIT';
    clearTimeout(statusTimer);
    const layer = document.querySelector('#play-layer');
    layer.classList.remove('visible');
    clearTimeout(playExitTimer);
    playExitTimer = setTimeout(() => {
      layer.replaceChildren();
      playFrame = null;
      monitor.focus();
    }, 300);
    return;
  }
  launched = false;
  monitor.classList.remove('live', 'show-status');
  clearTimeout(statusTimer);
}

window.rycadeMenuLaunched = () => launched;
window.rycadePlay = { exit: exitGame };
window.addEventListener('message', event => {
  if (!cabMode || event.origin !== location.origin || !playFrame || event.source !== playFrame.contentWindow) return;
  const message = event.data;
  if (!message || message.type !== 'rycade-play') return;
  if (message.state === 'started') {
    monitor.classList.remove('loading');
    monitor.classList.add('live', 'show-status');
    nowPlaying.textContent = 'NOW PLAYING · F19 / ESC TO EXIT';
    document.querySelector('#play-layer').classList.add('visible');
  } else if (message.state === 'error') {
    flashToast(message.message || 'Emulator failed to start');
    exitGame();
  } else if (message.state === 'exit') {
    exitGame();
  }
});

function barItems() {
  return [document.querySelector('#search-open'), ...tabs.children, document.querySelector('#settings-open')];
}

function paintBar() {
  barItems().forEach((item, itemIndex) => item.classList.toggle('bar-focus', barFocus && itemIndex === barIndex));
}

function setBarFocus(on) {
  barFocus = on;
  if (on) barIndex = tab + 1;
  stage.classList.toggle('bar-active', on);
  window.rycadeAudio?.play(on ? 'open' : 'close');
  paintBar();
}

function moveBar(direction) {
  const items = barItems();
  const next = barIndex + direction;
  if (next < 0 || next >= items.length) return;
  barIndex = next;
  window.rycadeAudio?.play('move');
  paintBar();
}

function pressBar() {
  const tabIndex = barIndex - 1;
  if (tabIndex < 0 || tabIndex >= SYSTEMS.length) {
    barItems()[barIndex]?.click();
    return;
  }
  changeTab(tabIndex);
  setBarFocus(false);
}

function settleNow() {
  if (!view[index]) return;
  clearTimeout(settleTimer);
  renderDetail(view[index]);
  stage.classList.add('cf-settled');
}

function moveByGesture(delta) {
  const count = Math.max(1, Math.floor(Math.abs(delta) / 50));
  const direction = delta < 0 ? 1 : -1;
  for (let stepIndex = 0; stepIndex < count; stepIndex++) step(direction);
}

window.addEventListener('resize', fit);
document.addEventListener('rycade-theme-change', () => place(true));
window.addEventListener('keydown', event => {
  if (event.repeat) return;
  const pressed = event.key.toLowerCase();
  const start = event.key === CABINET_KEYS.start;
  const shoot = event.key === CABINET_KEYS.shoot;
  if (launched) {
    if (event.key === 'Escape' || (cabMode && event.key === 'F19')) {
      event.preventDefault();
      exitGame();
    }
    return;
  }
  if (demoGame) {
    event.preventDefault();
    if (start) launch();
    else if (shoot || event.key === 'Escape') {
      closeDemo();
      window.rycadeAudio?.play('back');
    }
    return;
  }
  const sideways = THEME_SIDEWAYS.has(document.body.dataset.theme);
  if (start) {
    event.preventDefault();
    launch();
    return;
  }
  if (pressed === 'f') {
    event.preventDefault();
    toggleFavorite();
    return;
  }
  if (barFocus) {
    event.preventDefault();
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') moveBar(event.key === 'ArrowRight' ? 1 : -1);
    else if (event.key === 'ArrowDown' || event.key === 'Escape') setBarFocus(false);
    else if (shoot) pressBar();
    return;
  }
  if (sideways && event.key === 'ArrowUp') {
    event.preventDefault();
    setBarFocus(true);
  } else if (sideways && event.key === 'ArrowDown') {
    event.preventDefault();
    settleNow();
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!holding) hold(event.key === 'ArrowDown' ? 1 : -1);
  } else if (sideways && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
    event.preventDefault();
    if (!holding) hold(event.key === 'ArrowRight' ? 1 : -1);
  } else if (event.key === 'ArrowRight' || pressed === 'c') {
    changeTab((tab + 1) % SYSTEMS.length);
  } else if (event.key === 'ArrowLeft' || pressed === 'z') {
    changeTab((tab + SYSTEMS.length - 1) % SYSTEMS.length);
  } else if (shoot) {
    event.preventDefault();
    openDemo();
  }
});
window.addEventListener('keyup', event => {
  if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) release();
});
window.addEventListener('blur', release);

roster.addEventListener('click', event => {
  const row = event.target.closest('.lr');
  if (!row || ignoreClick || launched || demoGame) {
    ignoreClick = false;
    return;
  }
  event.stopPropagation();
  const rowIndex = Number(row.dataset.index);
  if (rowIndex === index) launch();
  else {
    index = rowIndex;
    place();
  }
});
roster.addEventListener('wheel', event => {
  event.preventDefault();
  if (!launched) step(event.deltaY > 0 ? 1 : -1);
}, { passive: false });
roster.addEventListener('pointerdown', event => {
  swipe = { y: event.clientY };
});
window.addEventListener('pointerup', event => {
  if (!swipe) return;
  const delta = event.clientY - swipe.y;
  swipe = null;
  if (Math.abs(delta) > 24 && !launched) {
    moveByGesture(delta);
    ignoreClick = true;
    setTimeout(() => { ignoreClick = false; }, 300);
  }
});
monitor.addEventListener('click', event => {
  event.stopPropagation();
  if (launched) exitGame();
  else launch();
});
stage.addEventListener('click', () => {
  if (launched) exitGame();
});

fit();
build(lastPlayedId());
document.fonts.ready.then(() => {
  place(true);
  window.__ready = true;
});
