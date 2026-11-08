const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const { expandPads } = require('../public/padsplit.js');

const source = readFileSync(`${__dirname}/../public/attract.js`, 'utf8');

function cabinet(games = ['one', 'two', 'three']) {
  let now = 0;
  let tick;
  let timerId = 0;
  const timers = new Map();
  const listeners = {};
  const nodes = {};
  const video = { play: () => Promise.resolve(), pause() {}, load() {}, removeAttribute() {}, duration: 25 };
  const overlay = { hidden: true, dataset: {}, style: { setProperty() {} }, querySelector: selector => selector === 'video' ? video : (nodes[selector] ||= {}) };
  const state = {
    performance: { now: () => now },
    document: { hidden: false, querySelector: () => overlay },
    window: {
      addEventListener: (type, listener) => { listeners[type] = listener; },
      rycadeExpandPads: expandPads
    },
    navigator: { getGamepads: () => [] },
    setInterval: callback => { tick = callback; },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
    GAMES: games.map(id => ({ id, title: id, box: `${id}.png`, snap: `${id}-snap.png`, players: 4 })),
    settings: { attractMinutes: 2 },
    settingsOpen: false, searchOpen: false, demoGame: null, launched: false, bootOpen: false,
    CABINET_KEYS: { start: 'Enter' },
    release() {}, build: id => { state.selected = id; }, renderDetail() {}, settleNow() {},
    tab: 3, barFocus: true, setBarFocus: on => { state.barFocus = on; }
  };
  runInNewContext(source, state);
  state.window.rycadeAttract.init();
  return {
    state, video, overlay, nodes, timers,
    advance: milliseconds => { now += milliseconds; tick(); },
    input(type, key = '') {
      const event = { type, key, code: key, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
      listeners[type](event);
      return event;
    }
  };
}

test('default delay, shuffled cycle without repeats, and START selection without launch', () => {
  const c = cabinet();
  c.advance(119999);
  assert.equal(c.overlay.hidden, true);
  c.advance(1);
  const seen = [];
  for (let i = 0; i < 3; i++) {
    seen.push(c.video.src);
    assert.equal(c.overlay.hidden, false);
    assert.equal(c.video.muted, true);
    c.video.onplaying();
    if (i < 2) c.video.onended();
  }
  assert.equal(new Set(seen).size, 3);
  const last = c.video.src;
  c.video.onended();
  assert.notEqual(c.video.src, last);
  const shown = c.video.src.split('/').pop().replace('.mp4', '');
  assert.equal(c.input('keydown', 'Enter').stopped, true);
  assert.equal(c.state.selected, shown);
  assert.equal(c.state.launched, false);
  assert.equal(c.state.barFocus, false);
  assert.equal(c.input('keyup', 'Enter').stopped, true);
  assert.equal(c.overlay.hidden, true);
});

test('all blocking surfaces reset the idle countdown', () => {
  for (const blocker of ['settingsOpen', 'searchOpen', 'demoGame', 'launched', 'bootOpen']) {
    const c = cabinet();
    c.state[blocker] = true;
    c.advance(300000);
    assert.equal(c.overlay.hidden, true, blocker);
    c.state[blocker] = false;
    c.advance(119999);
    assert.equal(c.overlay.hidden, true, blocker);
    c.advance(1);
    assert.equal(c.overlay.hidden, false, blocker);
  }
});

test('Off and activity prevent entry; other input preserves selection and consumes click sequence', () => {
  const c = cabinet();
  c.state.settings.attractMinutes = 0;
  c.advance(900000);
  assert.equal(c.overlay.hidden, true);
  c.state.settings.attractMinutes = 1;
  c.input('pointermove');
  c.advance(59999);
  assert.equal(c.overlay.hidden, true);
  c.advance(1);
  assert.equal(c.input('pointermove').stopped, true);
  for (const type of ['pointerdown', 'pointerup', 'click']) assert.equal(c.input(type).stopped, true);
  assert.equal(c.overlay.hidden, true);
  assert.equal(c.state.selected, undefined);
  assert.equal(c.state.tab, 3);
  c.advance(60000);
  assert.equal(c.input('keydown', 'm').stopped, true);
  assert.equal(c.input('keydown', 'm').stopped, true);
  assert.equal(c.input('keyup', 'm').stopped, true);
});

test('remote activity exits without selecting; standard gamepad START selects', () => {
  const c = cabinet();
  c.advance(120000);
  assert.equal(c.state.window.rycadeAttract.activity(), true);
  assert.equal(c.state.selected, undefined);
  c.advance(120000);
  c.state.navigator.getGamepads = () => [{ buttons: Array.from({ length: 10 }, (_, index) => ({ pressed: index === 9 })), axes: [] }];
  c.advance(100);
  assert.ok(c.state.selected);
  assert.equal(c.overlay.hidden, true);
});

test('load errors and timeouts skip, stale callbacks are ignored, exhausted failures stop', () => {
  const c = cabinet();
  c.advance(120000);
  const staleError = c.video.onerror;
  const first = c.video.src;
  staleError();
  assert.notEqual(c.video.src, first);
  const second = c.video.src;
  staleError();
  assert.equal(c.video.src, second);
  [...c.timers.values()][0]();
  assert.notEqual(c.video.src, second);
  c.video.onerror();
  assert.equal(c.overlay.hidden, true);
});

test('empty clip candidates return safely to browsing', () => {
  const c = cabinet([]);
  c.advance(120000);
  assert.equal(c.overlay.hidden, true);
});
