const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createMenuPadDriver } = require('../public/pads.js');

function makePad({ x = 0, y = 0, buttons = [] } = {}) {
  return { axes: [x, y], buttons: Array.from({ length: 16 }, (_, index) => ({ pressed: !!buttons[index] })) };
}

test('menu pad directions pulse immediately, then repeat at 350 ms and 120 ms', () => {
  const events = [];
  let pads = [makePad({ y: -1 })];
  const driver = createMenuPadDriver(() => pads, (type, key) => events.push([type, key]), () => false);
  driver.tick(0);
  driver.tick(349);
  assert.equal(events.filter(([, key]) => key === 'ArrowUp').length, 2);
  driver.tick(350);
  driver.tick(469);
  driver.tick(470);
  assert.equal(events.filter(([, key]) => key === 'ArrowUp').length, 6);
  pads = [makePad()];
  driver.tick(471);
  driver.tick(1000);
  assert.equal(events.filter(([, key]) => key === 'ArrowUp').length, 6);
});

test('menu pad actions map buttons 1, 2, 3, and Start while launched input is paused', () => {
  const events = [];
  let launched = false;
  const pad = makePad({ buttons: { 0: true, 3: true, 1: true, 6: true } });
  const driver = createMenuPadDriver(() => [pad], (type, key) => events.push([type, key]), () => launched);
  driver.tick(0);
  assert.deepEqual(events.map(([, key]) => key), ['1', '1', '2', '2', '3', '3', 'Enter', 'Enter']);
  launched = true;
  driver.tick(500);
  assert.equal(events.length, 8);
});
