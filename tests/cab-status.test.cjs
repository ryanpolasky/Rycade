const assert = require('node:assert/strict');
const { test } = require('node:test');
const { deckWarningState } = require('../public/cab-status.js');

function controller({ linkA = false, linkB = false } = {}) {
  const buttons = Array.from({ length: 30 }, () => ({ pressed: false, value: 0 }));
  buttons[28].pressed = linkA;
  buttons[29].pressed = linkB;
  return { id: 'Rycade Controls', buttons };
}

test('missing Rycade Controls shows the warning after five seconds', () => {
  let state = deckWarningState([], 0);
  assert.equal(state.show, false);
  assert.equal(deckWarningState([], 4999, state).show, false);
  state = deckWarningState([], 5000, state);
  assert.equal(state.show, true);
});

test('a status bit held steadily pressed does not count as an alive link', () => {
  const pad = controller({ linkA: true });
  let state = deckWarningState([pad], 0);
  assert.equal(state.linkValues[0], true);
  assert.equal(state.linkChangedAt[0], null);
  assert.equal(deckWarningState([pad], 6000, state).show, true);
});

test('a link that toggles every 250 ms remains alive', () => {
  const pad = controller();
  let state = deckWarningState([pad], 0);
  for (let now = 250; now <= 6000; now += 250) {
    pad.buttons[28].pressed = !pad.buttons[28].pressed;
    state = deckWarningState([pad], now, state);
  }
  assert.equal(state.show, false);
});

test('stopped heartbeat warns five seconds after its 1000 ms alive window expires', () => {
  const pad = controller();
  let state = deckWarningState([pad], 0);
  for (let now = 250; now <= 1250; now += 250) {
    pad.buttons[28].pressed = !pad.buttons[28].pressed;
    state = deckWarningState([pad], now, state);
  }
  assert.equal(state.linkChangedAt[0], 1250);
  state = deckWarningState([pad], 2249, state);
  assert.equal(state.noLinksSince, null);
  state = deckWarningState([pad], 2250, state);
  assert.equal(state.show, false);
  assert.equal(state.noLinksSince, 2250);
  assert.equal(deckWarningState([pad], 7249, state).show, false);
  assert.equal(deckWarningState([pad], 7250, state).show, true);
});

test('one toggling link keeps the controller alive while the other is steady', () => {
  const pad = controller({ linkB: true });
  let state = deckWarningState([pad], 0);
  for (let now = 250; now <= 6000; now += 250) {
    pad.buttons[28].pressed = !pad.buttons[28].pressed;
    state = deckWarningState([pad], now, state);
  }
  assert.equal(state.show, false);
});
