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

test('the warning persists only while a present controller has neither link alive', () => {
  const pad = controller();
  let state = deckWarningState([pad], 0);
  assert.equal(state.show, false);
  assert.equal(deckWarningState([pad], 4999, state).show, false);
  state = deckWarningState([pad], 5000, state);
  assert.equal(state.show, true);

  pad.buttons[28].pressed = true;
  state = deckWarningState([pad], 5001, state);
  assert.equal(state.show, false);
  pad.buttons[28].pressed = false;
  pad.buttons[29].value = 1;
  assert.equal(deckWarningState([pad], 6000, state).show, false);
});
