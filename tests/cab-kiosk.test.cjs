const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const script = readFileSync(require.resolve('../public/cab.js'), 'utf8');

function cabinet() {
  const requests = [];
  const events = new Map();
  let timer;
  let power;
  const context = {
    window: { rycadeVolume: { cabFactor: () => 1 } },
    location: { search: '?cab=1' },
    URLSearchParams,
    GAMES: [],
    Image: class { async decode() {} },
    document: {
      querySelector: () => null,
      createElement: () => ({
        dataset: {},
        style: { setProperty() {} },
        querySelector: () => ({ append() {} }),
        querySelectorAll: () => []
      })
    },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    EventSource: class { constructor() { power = this; } },
    addEventListener: (event, fn) => events.set(event, fn),
    setTimeout: fn => { timer = fn; },
    clearTimeout() {},
    fetch: async path => requests.push(path),
    screen: { width: 1920, height: 1080 },
    innerWidth: 1280,
    innerHeight: 720,
    launched: false,
    exiting: Promise.resolve()
  };
  runInNewContext(script, context);
  return {
    context,
    requests,
    live: () => power.onmessage({ data: 'kiosk-reset' }),
    resize: () => { events.get('resize')(); return timer(); }
  };
}

test('kiosk repair does not restart an active game', async () => {
  const cab = cabinet();
  cab.context.launched = true;
  cab.live();
  await cab.resize();
  assert.deepEqual(cab.requests, []);
});

test('kiosk repair waits for game saves before restarting a windowed menu', async () => {
  const cab = cabinet();
  let saved;
  cab.context.exiting = new Promise(resolve => { saved = resolve; });
  cab.live();
  const auto = cab.resize();
  await Promise.resolve();
  assert.deepEqual(cab.requests, []);
  saved();
  await auto;
  assert.deepEqual(cab.requests, ['/power/kiosk?restart', '/power/kiosk?restart&auto']);
});
