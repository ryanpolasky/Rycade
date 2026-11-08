const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SYSTEM_BUTTONS, createInputMapper } = require('../public/play.js');

function pad(buttons = []) {
  return {
    axes: [0, 0],
    buttons: Array.from({ length: 7 }, (_, index) => ({ pressed: buttons.includes(index) }))
  };
}

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
