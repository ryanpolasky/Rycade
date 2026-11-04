const SYSTEMS = ['ALL', 'ARCADE', 'GENESIS', 'SNES', 'NES'];
const CONTROL_COLORS = ['#ffd21f', '#ff2a2a', '#2a7bff'];
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
const letterOverlay = document.querySelector('#letter');
let tab = 0;
let view = [];
let index = 0;
let holding = null;
let launched = false;
let statusTimer = 0;
let swipe = null;
let ignoreClick = false;
let tvStaticTimer = 0;

function fit() {
  const scale = Math.min(innerWidth / 1280, innerHeight / 960);
  stage.style.transform = `translate(${(innerWidth - 1280 * scale) / 2}px, ${(innerHeight - 960 * scale) / 2}px) scale(${scale})`;
}

function renderTabs() {
  tabs.replaceChildren(...SYSTEMS.map((system, systemIndex) => {
    const count = systemIndex === 0 ? GAMES.length : GAMES.filter(game => game.sys === system).length;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = systemIndex === tab ? 'on' : '';
    button.innerHTML = `${system}<sup>${count}</sup>`;
    button.addEventListener('click', () => changeTab(systemIndex));
    return button;
  }));
}

function build(keepId) {
  const system = SYSTEMS[tab];
  view = GAMES
    .filter(game => system === 'ALL' || game.sys === system)
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
  if (launched || nextTab === tab) return;
  window.rycadeAudio?.play('tab');
  const selectedId = view[index] && view[index].id;
  const selectedGame = GAMES.find(game => game.id === selectedId);
  if (document.body.dataset.theme === 'rycade-tv' && selectedGame &&
      (nextTab === 0 || selectedGame.sys === SYSTEMS[nextTab])) flashTvStatic();
  tab = nextTab;
  build(selectedId);
}

function flashTvStatic() {
  stage.classList.remove('channel-static');
  void stage.offsetWidth;
  stage.classList.add('channel-static');
  clearTimeout(tvStaticTimer);
  tvStaticTimer = setTimeout(() => stage.classList.remove('channel-static'), 120);
}

function updatePair(id, source) {
  const pair = document.querySelector(`#${id}`);
  if (!source) return;
  const active = pair.querySelector('img.active');
  if (active.getAttribute('src') === source) return;
  const next = [...pair.querySelectorAll('img')].find(image => image !== active);
  const token = (Number(pair.dataset.token) || 0) + 1;
  pair.dataset.token = token;
  next.onload = () => {
    if (Number(pair.dataset.token) !== token) return;
    next.classList.add('active');
    active.classList.remove('active');
  };
  next.onerror = () => {
    if (Number(pair.dataset.token) === token) next.removeAttribute('src');
  };
  next.src = source;
  if (next.complete && next.naturalWidth) next.onload();
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
  if (!game) return;
  layout(index, game, view);
  const rows = [...list.children];
  rows.forEach((row, rowIndex) => {
    const distance = Math.min(Math.abs(rowIndex - index), 5);
    row.classList.toggle('on', rowIndex === index);
    row.style.opacity = [1, .62, .42, .3, .2, .13][distance];
  });
  const totalHeight = rows.reduce((height, row) => height + row.offsetHeight, 0);
  const selectedCenter = rows.slice(0, index).reduce((height, row) => height + row.offsetHeight, 0) + rows[index].offsetHeight / 2;
  const maxOffset = Math.max(0, totalHeight - roster.clientHeight);
  const offset = Math.max(0, Math.min(maxOffset, selectedCenter - roster.clientHeight / 2));
  list.style.transition = instant ? 'none' : '';
  list.style.transform = `translateY(${-offset}px)`;

  const previousId = stage.dataset.gameId;
  if (previousId && previousId !== game.id && document.body.dataset.theme === 'rycade-tv') {
    flashTvStatic();
  }
  stage.dataset.gameId = game.id;
  stage.style.setProperty('--acc', game.color);
  stage.style.setProperty('--sp', `rgb(${game.spill.join(',')})`);
  stage.style.setProperty('--spa', `rgba(${game.spill.join(',')},.28)`);
  document.querySelector('#title').textContent = game.title.toUpperCase();
  document.querySelector('#sub').innerHTML = `${game.pub.toUpperCase()} · ${game.year} · 1–${game.players} PLAYERS`;

  const logo = document.querySelector('#mlogo');
  const fallback = document.querySelector('#mtext');
  if (game.logo) {
    logo.src = game.logo;
    logo.style.display = '';
    fallback.style.display = 'none';
  } else {
    logo.removeAttribute('src');
    logo.style.display = 'none';
    fallback.textContent = game.title.toUpperCase();
    fallback.style.display = '';
  }

  updatePair('backdrop', game.box);
  updatePair('flyer', game.box);
  updatePair('screen', game.snap);
  renderControls(game);
  layout(index, game, view);
}

function step(direction, playSound = true) {
  const nextIndex = Math.max(0, Math.min(view.length - 1, index + direction));
  if (nextIndex !== index) {
    if (playSound) window.rycadeAudio?.play('move');
    index = nextIndex;
    place();
  }
}

function letterJump(direction) {
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
      step(direction, false);
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

function launch() {
  if (launched) return;
  window.rycadeAudio?.play('launch');
  launched = true;
  monitor.classList.add('live', 'show-status');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => monitor.classList.remove('show-status'), 2400);
}

function exitGame() {
  if (!launched) return;
  window.rycadeAudio?.play('back');
  launched = false;
  monitor.classList.remove('live', 'show-status');
  clearTimeout(statusTimer);
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
  if (launched) {
    if (event.key === 'Escape' || event.key === 'Enter') exitGame();
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!holding) hold(event.key === 'ArrowDown' ? 1 : -1);
  } else if (event.key === 'ArrowRight' || pressed === 'c') {
    changeTab((tab + 1) % SYSTEMS.length);
  } else if (event.key === 'ArrowLeft' || pressed === 'z') {
    changeTab((tab + SYSTEMS.length - 1) % SYSTEMS.length);
  } else if (pressed === 'x' || event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    launch();
  }
});
window.addEventListener('keyup', event => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') release();
});
window.addEventListener('blur', release);

roster.addEventListener('click', event => {
  const row = event.target.closest('.lr');
  if (!row || ignoreClick || launched) {
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
build('jamte');
document.fonts.ready.then(() => {
  place(true);
  window.__ready = true;
});
