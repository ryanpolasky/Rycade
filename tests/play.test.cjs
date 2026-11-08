const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SYSTEM_BUTTONS, orderPads, createInputMapper } = require('../public/play.js');

function pad(buttons = [], id = '') {
  return {
    id,
    axes: [0, 0],
    buttons: Array.from({ length: 7 }, (_, index) => ({ pressed: buttons.includes(index) }))
  };
}

test('Rycade pad IDs order reversed player indexes and leave extra pads unused', () => {
  const p4 = pad([], 'Rycade P4 (Vendor: cafe)');
  const p3 = pad([], 'Rycade P3 (Vendor: cafe)');
  const p2 = pad([], 'Rycade P2 (Vendor: cafe)');
  const p1 = pad([], 'Rycade P1 (Vendor: cafe)');
  const stadia = pad([], 'Stadia Controller rev. A');
  assert.deepEqual(orderPads([p4, p3, p2, p1, stadia]), [p1, p2, p3, p4]);
});

test('non-Rycade pads fill player slots left empty by a missing Rycade pad', () => {
  const p4 = pad([], 'Rycade P4');
  const p3 = pad([], 'Rycade P3');
  const p1 = pad([], 'Rycade P1');
  const stadia = pad([], 'Stadia Controller rev. A');
  assert.deepEqual(orderPads([p4, p3, p1, stadia]), [p1, stadia, p3, p4]);
});

test('all non-Rycade pads fill slots in index order', () => {
  const stadia = pad([], 'Stadia Controller rev. A');
  const other = pad([], 'Other Controller');
  assert.deepEqual(orderPads([stadia, null, other]), [stadia, other, null, null]);
});

test('null and disconnected entries are skipped', () => {
  const p1 = pad([], 'Rycade P1');
  const disconnected = { id: 'Rycade P2', connected: false };
  const p4 = pad([], 'Rycade P4');
  assert.deepEqual(orderPads([null, disconnected, p1, null, p4]), [p1, null, null, p4]);
});

test('input mapping re-resolves player order after controller indexes change', () => {
  const inputs = [];
  const mapper = createInputMapper((...input) => inputs.push(input));
  const p1 = pad([0], 'Rycade P1');
  const p2 = pad([], 'Rycade P2');
  mapper.poll([p1, p2], 'GENESIS', 0);
  mapper.poll([p2, p1], 'GENESIS', 16);
  assert.deepEqual(inputs, [[0, 1, 1]]);
});

test('physical face buttons map to libretro ids for each system', () => {
  assert.deepEqual(SYSTEM_BUTTONS, {
    ARCADE: [0, 8, 1],
    GENESIS: [1, 0, 8],
    SNES: [1, 0, 8],
    NES: [0, 8, null]
  });
  for (const [system, expected] of Object.entries(SYSTEM_BUTTONS)) {
    const inputs = [];
    createInputMapper((...input) => inputs.push(input)).poll([pad([0, 1, 3])], system, 0);
    assert.deepEqual(inputs.map(input => input[1]).sort((a, b) => a - b), expected.filter(id => id !== null).sort((a, b) => a - b));
  }
});

test('arcade Start pulses coin immediately and Start 250 ms later for 120 ms', () => {
  const inputs = [];
  const mapper = createInputMapper((player, id, value) => inputs.push([player, id, value]));
  const started = pad([6]);
  mapper.poll([started], 'ARCADE', 1000);
  assert.deepEqual(inputs, [[0, 2, 1]]);
  mapper.poll([started], 'ARCADE', 1119);
  mapper.poll([pad()], 'ARCADE', 1120);
  assert.deepEqual(inputs.at(-1), [0, 2, 0]);
  mapper.poll([pad()], 'ARCADE', 1249);
  mapper.poll([pad()], 'ARCADE', 1250);
  assert.deepEqual(inputs.at(-1), [0, 3, 1]);
  mapper.poll([pad()], 'ARCADE', 1370);
  assert.deepEqual(inputs.at(-1), [0, 3, 0]);
});
