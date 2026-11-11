const assert = require('node:assert/strict');
const { existsSync, readdirSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const root = resolve(__dirname, '..');
const gamesCtx = {};
runInNewContext(`${readFileSync(`${root}/public/games.js`, 'utf8')}; this.GAMES = GAMES;`, gamesCtx);
const GAMES = gamesCtx.GAMES;

function makeElement() {
  const listeners = {};
  const node = {
    value: '',
    textContent: '',
    innerHTML: '',
    hidden: false,
    disabled: false,
    dataset: {},
    style: { setProperty() {}, removeProperty() {} },
    children: [],
    classList: {
      set: new Set(),
      add(...names) { names.forEach(n => this.set.add(n)); },
      remove(...names) { names.forEach(n => this.set.delete(n)); },
      toggle(name, force) {
        const on = force === undefined ? !this.set.has(name) : Boolean(force);
        if (on) this.set.add(name);
        else this.set.delete(name);
        return on;
      },
      contains(name) { return this.set.has(name); }
    },
    replaceChildren(...items) { this.children = [...items]; },
    append(...items) { this.children.push(...items); },
    setAttribute() {},
    focus() { node._focused = true; },
    scrollIntoView() {},
    click() { (listeners.click || []).forEach(fn => fn({ target: node, preventDefault() {}, stopPropagation() {} })); },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    querySelector() { return makeElement(); },
    querySelectorAll() { return this.children; }
  };
  return node;
}

function createFeaturesHarness() {
  const elements = new Map();
  const getEl = selector => {
    if (!elements.has(selector)) elements.set(selector, makeElement());
    return elements.get(selector);
  };
  const winListeners = {};
  let attractActive = false;
  let rouletteClosed = 0;
  const ctx = {
    GAMES,
    CABINET_KEYS: { start: 'Enter', shoot: '1', pass: '2', turbo: '3' },
    THEME_IDS: new Map([['Cover Flow', 'cover-flow'], ['Shelf', 'shelf'], ['Studio', 'studio']]),
    PALETTES: [{ label: 'Classic', id: 'classic', colors: ['#000'] }],
    applyRycadeTheme() {},
    applyRycadePalette() {},
    localStorage: { getItem: () => null, setItem() {} },
    crypto: { getRandomValues: arr => arr.fill(0) },
    location: { protocol: 'https:', host: 'arcade.ryanpolasky.com', origin: 'https://arcade.ryanpolasky.com' },
    matchMedia: () => ({ matches: false }),
    setInterval() { return 1; },
    setTimeout() { return 1; },
    clearTimeout() {},
    Intl,
    Date,
    Object,
    Number,
    Boolean,
    String,
    Math,
    JSON,
    Uint8Array,
    Promise,
    encodeURIComponent,
    stage: getEl('#stage'),
    launched: false,
    demoGame: null,
    barFocus: false,
    tab: 3,
    selectedId: null,
    toasts: [],
    releaseCount: 0,
    exited: false,
    get rouletteClosed() { return rouletteClosed; },
    release() { ctx.releaseCount++; },
    closeDemo() { ctx.demoGame = null; },
    exitGame() { ctx.launched = false; ctx.exited = true; },
    setBarFocus(on) { ctx.barFocus = on; },
    build(id) { ctx.selectedId = id; },
    flashToast(text, starred, duration) { ctx.toasts.push({ text, starred, duration }); },
    document: {
      activeElement: null,
      fonts: [],
      createElement: () => makeElement(),
      querySelector: getEl
    },
    window: {
      rycadeAudio: { play() {}, setVolumes() {}, setSoundSet() {} },
      rycadeBoot: { play() {}, stop() {}, thumb() {} },
      rycadeRoulette: { close() { rouletteClosed++; } },
      rycadeAttract: {
        init() {},
        reset() {},
        setActive(on) { attractActive = on; },
        activity() {
          const was = attractActive;
          attractActive = false;
          return was;
        }
      },
      addEventListener(type, fn) { (winListeners[type] ||= []).push(fn); }
    }
  };
  ctx.window.rycadeFeatures = null;
  runInNewContext(
    `${readFileSync(`${root}/public/features.js`, 'utf8')};
     this.__test = {
       matchesSearch,
       handleRemoteMessage,
       getSearchKey: () => SEARCH_KEYS[searchKeyIndex],
       getSearchArea: () => searchArea
     };`,
    ctx
  );
  return {
    ctx,
    keydown(key, target = {}) {
      const event = {
        key,
        code: key,
        repeat: false,
        target,
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() {}
      };
      (winListeners.keydown || []).forEach(fn => fn(event));
    }
  };
}

test('catalog, worker IDs, media files, and non-firmware docs have no orphans or em/en dashes', () => {
  const workerIdsSrc = readFileSync(`${root}/src/games-ids.js`, 'utf8');
  const workerIds = new Set(JSON.parse(workerIdsSrc.match(/\[.*\]/)[0]));
  const gameIds = GAMES.map(g => g.id);
  assert.equal(new Set(gameIds).size, GAMES.length);
  assert.deepEqual([...workerIds].sort(), [...gameIds].sort());

  const videoSources = new Set(JSON.parse(readFileSync(`${root}/public/videos/sources.json`, 'utf8')).videos.map(v => v.id));
  const referencedArt = new Set();

  for (const game of GAMES) {
    for (const field of ['box', 'snap', 'logo']) {
      if (game[field]) {
        assert.equal(existsSync(`${root}/public/${game[field]}`), true, `${game.id} missing ${field}`);
        referencedArt.add(game[field].replace(/^art\//, ''));
      }
    }
    if (game.video !== false) {
      const videoPath = game.video ? game.video.replace(/^\//, '') : `videos/${game.id}.mp4`;
      assert.equal(existsSync(`${root}/public/${videoPath}`), true, `${game.id} missing video`);
      assert.equal(videoSources.has(game.id), true, `${game.id} missing from videos/sources.json`);
    }
  }

  const extraArt = readdirSync(`${root}/public/art`).filter(f => f.endsWith('.png') && !referencedArt.has(f));
  assert.deepEqual(extraArt, []);

  for (const rel of [
    'README.md',
    'SOURCING.md',
    'docs/TECHNICAL.md',
    'docs/nba-jam-joystick-board.md',
    'public/app.js',
    'public/attract.js',
    'public/audio.js',
    'public/boot.js',
    'public/cab.js',
    'public/features.js',
    'public/games.js',
    'public/loading.js',
    'public/roulette.js',
    'public/savepick.js',
    'public/themes.js',
    'public/index.html',
    'public/remote/index.html',
    'public/remote/remote.js',
    'public/scores/scores.js',
    'src/worker.js'
  ]) {
    const content = readFileSync(`${root}/${rel}`, 'utf8');
    assert.equal(/[\u2014\u2013]/.test(content), false, `em/en dash found in ${rel}`);
  }
});

test('search matches punctuated titles and leading "The" queries', () => {
  const { ctx } = createFeaturesHarness();
  const cases = [
    ['THE SIMPSONS', 'simpsons'],
    ['THE LEGEND', 'alttp'],
    ['PAC MAN', 'pacman'],
    ['PACMAN', 'pacman'],
    ['MS PAC MAN', 'mspacman'],
    ['X MEN', 'xmen'],
    ['XMEN', 'xmen'],
    ['QBERT', 'qbert'],
    ['Q BERT', 'qbert'],
    ['DR MARIO', 'drmario'],
    ['MR DO', 'mrdo'],
    ['GI JOE', 'gijoe'],
    ['SPIDER MAN', 'spidman'],
    ['PUNCH OUT', 'punchout'],
    ['TRACK AND FIELD', 'trackfld'],
    ['POCKY AND ROCKY', 'pocky'],
    ['WARIOWARE', 'wario'],
    ['CHIP N DALE', 'chipdale']
  ];
  for (const [query, expectedId] of cases) {
    const hits = GAMES.filter(game => ctx.__test.matchesSearch(game, query)).map(g => g.id);
    assert.equal(hits.includes(expectedId), true, `${query} should match ${expectedId}`);
  }
});

test('on-screen search keyboard stick navigation handles wide SPACE, DEL, and DONE keys', () => {
  const h = createFeaturesHarness();
  h.ctx.window.rycadeFeatures.openSearch();
  assert.equal(h.ctx.releaseCount, 1);

  h.keydown('ArrowLeft');
  assert.equal(h.ctx.__test.getSearchArea(), 'keyboard');
  assert.equal(h.ctx.__test.getSearchKey(), 'A');

  h.keydown('ArrowDown');
  h.keydown('ArrowDown');
  h.keydown('ArrowDown');
  assert.equal(h.ctx.__test.getSearchKey(), '4');

  h.keydown('ArrowDown');
  assert.equal(h.ctx.__test.getSearchKey(), 'DEL');

  h.keydown('ArrowLeft');
  assert.equal(h.ctx.__test.getSearchKey(), 'DEL');

  h.keydown('ArrowRight');
  assert.equal(h.ctx.__test.getSearchKey(), 'DONE');

  h.keydown('ArrowRight');
  assert.equal(h.ctx.__test.getSearchArea(), 'results');

  h.keydown('ArrowLeft');
  assert.equal(h.ctx.__test.getSearchKey(), 'DONE');
  h.keydown('ArrowUp');
  assert.equal(h.ctx.__test.getSearchKey(), '6');

  for (let i = 0; i < 4; i++) h.keydown('ArrowRight');
  assert.equal(h.ctx.__test.getSearchKey(), 'SPACE');
  h.keydown('ArrowRight');
  assert.equal(h.ctx.__test.getSearchArea(), 'results');
});

test('phone remote wakes attract mode, closes overlays/roulette, and selects the sent game', () => {
  const h = createFeaturesHarness();
  h.ctx.window.rycadeAttract.setActive(true);
  h.ctx.launched = true;
  h.ctx.barFocus = true;

  h.ctx.__test.handleRemoteMessage(JSON.stringify({ type: 'open', gameId: 'balatro' }));

  assert.equal(h.ctx.exited, true);
  assert.equal(h.ctx.rouletteClosed, 1);
  assert.equal(h.ctx.barFocus, false);
  assert.equal(h.ctx.tab, 0);
  assert.equal(h.ctx.selectedId, 'balatro');
  assert.equal(h.ctx.toasts.length, 1);
  assert.match(h.ctx.toasts[0].text, /Balatro/);
});
