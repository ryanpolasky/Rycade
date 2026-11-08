const assert = require('node:assert/strict');
const { test } = require('node:test');
const { expandPads } = require('../public/padsplit.js');

test('a combined pad expands into four virtual pads with each player slice', () => {
  const buttons = Array.from({ length: 28 }, (_, index) => ({ pressed: index % 7 === 0 }));
  const combined = {
    id: 'Rycade Controls (Vendor: cafe)',
    index: 2,
    connected: true,
    timestamp: 42,
    mapping: 'standard',
    axes: [0, 1, 2, 3, 4, 5, 6, 7],
    buttons
  };

  const expanded = expandPads([combined]);

  assert.equal(expanded.length, 4);
  assert.deepEqual(expanded, Array.from({ length: 4 }, (_, player) => ({
    id: `Rycade P${player + 1}`,
    index: 8 + player,
    connected: true,
    timestamp: 42,
    mapping: '',
    axes: [2 * player, 2 * player + 1],
    buttons: buttons.slice(player * 7, player * 7 + 7)
  })));
});

test('non-Rycade pads pass through unchanged', () => {
  const pad = { id: 'Other Controller', axes: Array(8).fill(0), buttons: [] };
  assert.deepEqual(expandPads([pad]), [pad]);
  assert.equal(expandPads([pad])[0], pad);
});

test('a Rycade pad with fewer than eight axes passes through unchanged', () => {
  const pad = { id: 'Rycade Controls', axes: [0, 0], buttons: [] };
  assert.equal(expandPads([pad])[0], pad);
});

test('null entries are preserved', () => {
  assert.deepEqual(expandPads([null, undefined]), [null, undefined]);
});
