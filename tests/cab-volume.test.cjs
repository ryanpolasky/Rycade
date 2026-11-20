const assert = require('node:assert/strict');
const { test } = require('node:test');
const { cabFactor, clampCabFactor, clampCabLevel, parseCabLevel, scaleVolume } = require('../public/cab-volume.js');

test('cab volume levels parse as bounded integer strings with full volume as the fallback', () => {
  assert.equal(parseCabLevel('0'), 0);
  assert.equal(parseCabLevel('7'), 7);
  assert.equal(parseCabLevel(null), 10);
  assert.equal(parseCabLevel('11'), 10);
  assert.equal(parseCabLevel('3x'), 10);
});

test('cab volume helpers clamp levels and scale media volume', () => {
  assert.equal(clampCabLevel(-2), 0);
  assert.equal(clampCabLevel(12), 10);
  assert.equal(cabFactor(5), 0.5);
  assert.equal(clampCabFactor(1.5), 1);
  assert.equal(scaleVolume(0.7, 0.5), 0.35);
});
