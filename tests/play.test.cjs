const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  SYSTEM_BUTTONS,
  START_BUTTONS,
  INPUT_LAYOUTS,
  CORE_OPTIONS,
  BOOT_FRAMES,
  bootSkipFrames,
  clearSavedMute,
  RETRO_REMAPS,
  orderPads,
  createInputMapper
} = require('../public/play.js');

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

test('a combined Rycade gamepad expands into P1 through P4 before ordering', () => {
  const combined = {
    id: 'Rycade Controls',
    index: 0,
    axes: [0, 1, 2, 3, 4, 5, 6, 7],
    buttons: Array.from({ length: 28 }, (_, index) => ({ pressed: index % 7 === 0 }))
  };
  assert.deepEqual(orderPads([combined]).map(pad => pad.id), [
    'Rycade P1', 'Rycade P2', 'Rycade P3', 'Rycade P4'
  ]);
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

test('small games route the launcher seat to logical player one', () => {
  const inputs = [];
  const mapper = createInputMapper((...input) => inputs.push(input), { players: 2, seat: 2 });
  const p4 = pad([], 'Rycade P4');
  const p3 = pad([], 'Rycade P3');
  const p2 = pad([], 'Rycade P2');
  const p1 = pad([0], 'Rycade P1');
  mapper.poll([p4, p3, p2, p1], 'GENESIS', 0);
  assert.deepEqual(inputs, []);

  mapper.poll([p4, pad([0], 'Rycade P3'), p2, p1], 'GENESIS', 16);
  assert.deepEqual(inputs, [[0, 1, 1]]);
});

test('a different seat joins as logical player two and its Start press is mapped', () => {
  const inputs = [];
  const mapper = createInputMapper((...input) => inputs.push(input), { players: 2, seat: 2 });
  const p4 = pad([], 'Rycade P4');
  const p3 = pad([], 'Rycade P3');
  const p2 = pad([], 'Rycade P2');
  let p1 = pad([], 'Rycade P1');
  mapper.poll([p4, p3, p2, p1], 'GENESIS', 0);

  p1 = pad([6], 'Rycade P1');
  mapper.poll([p4, p3, p2, p1], 'GENESIS', 16);
  assert.deepEqual(inputs, [[1, 3, 1]]);

  p1 = pad([0, 6], 'Rycade P1');
  mapper.poll([p4, p3, p2, p1], 'GENESIS', 32);
  assert.deepEqual(inputs, [[1, 3, 1], [1, 1, 1]]);

  const beforeIgnoredStart = inputs.length;
  mapper.poll([pad([6], 'Rycade P4'), p3, p2, p1], 'GENESIS', 48);
  assert.equal(inputs.length, beforeIgnoredStart);
});

test('an arcade joiner Start press immediately triggers its coin pulse', () => {
  const inputs = [];
  const mapper = createInputMapper((...input) => inputs.push(input), { players: 2, seat: 2 });
  mapper.poll([
    pad([], 'Rycade P4'),
    pad([], 'Rycade P3'),
    pad([], 'Rycade P2'),
    pad([6], 'Rycade P1')
  ], 'ARCADE', 1000);
  assert.deepEqual(inputs, [[1, 2, 1]]);
});

test('the launcher Start press stays on logical player one and one-player games allow a joiner', () => {
  const inputs = [];
  const mapper = createInputMapper((...input) => inputs.push(input), { players: 1, seat: 2 });
  const p4 = pad([], 'Rycade P4');
  const p2 = pad([], 'Rycade P2');
  const p1 = pad([], 'Rycade P1');
  mapper.poll([p4, pad([6], 'Rycade P3'), p2, p1], 'GENESIS', 0);
  mapper.poll([p4, pad([], 'Rycade P3'), p2, p1], 'GENESIS', 16);
  mapper.poll([p4, pad([], 'Rycade P3'), p2, pad([6], 'Rycade P1')], 'GENESIS', 32);
  assert.deepEqual(inputs, [[0, 3, 1], [0, 3, 0], [1, 3, 1]]);
});

test('larger games keep fixed seat mapping', () => {
  const inputs = [];
  const mapper = createInputMapper((...input) => inputs.push(input), { players: 4, seat: 2 });
  mapper.poll([
    pad([], 'Rycade P4'),
    pad([0], 'Rycade P3'),
    pad([], 'Rycade P2'),
    pad([], 'Rycade P1')
  ], 'GENESIS', 0);
  assert.deepEqual(inputs, [[2, 1, 1]]);
});

test('invalid flexible launch seats default to physical seat zero', () => {
  for (const seat of [NaN, 7]) {
    const inputs = [];
    const mapper = createInputMapper((...input) => inputs.push(input), { players: 2, seat });
    mapper.poll([
      pad([], 'Rycade P4'),
      pad([], 'Rycade P3'),
      pad([], 'Rycade P2'),
      pad([0], 'Rycade P1')
    ], 'GENESIS', 0);
    assert.deepEqual(inputs, [[0, 1, 1]], `seat ${seat}`);
  }
});

test('physical face buttons map to libretro ids for each system', () => {
  assert.deepEqual(SYSTEM_BUTTONS, {
    ARCADE: [0, 8, 1],
    GENESIS: [1, 0, 8],
    SNES: [1, 0, 8],
    NES: [0, 8, null],
    GBA: [8, 10, 11]
  });
  for (const [system, expected] of Object.entries(SYSTEM_BUTTONS)) {
    const inputs = [];
    createInputMapper((...input) => inputs.push(input)).poll([pad([0, 1, 3])], system, 0);
    assert.deepEqual(inputs.map(input => input[1]).sort((a, b) => a - b), expected.filter(id => id !== null).sort((a, b) => a - b));
  }
});

test('GBA Start is held as B while console systems keep Start', () => {
  assert.deepEqual(START_BUTTONS, { GBA: 0 });
  for (const [system, id] of [['GBA', 0], ['SNES', 3]]) {
    const inputs = [];
    const mapper = createInputMapper((...input) => inputs.push(input));
    mapper.poll([pad([6])], system, 0);
    mapper.poll([pad([6])], system, 500);
    mapper.poll([pad()], system, 1000);
    assert.deepEqual(inputs, [[0, id, 1], [0, id, 0]], system);
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

test('twin layout routes directions from all four physical seats to matching ports', () => {
  const inputs = [];
  const mapper = createInputMapper((...input) => inputs.push(input), {
    players: 2,
    seat: 2,
    layout: 'twin'
  });
  const pads = [
    pad([], 'Rycade P4'),
    pad([], 'Rycade P3'),
    pad([], 'Rycade P2'),
    pad([], 'Rycade P1')
  ];
  for (const controller of pads) controller.axes[1] = -1;
  mapper.poll(pads, 'ARCADE', 0);
  assert.deepEqual(inputs, [[0, 4, 1], [1, 4, 1], [2, 4, 1], [3, 4, 1]]);
});

test('twin Start pairs pulse coin and Start on the corresponding game ports only', () => {
  const inputs = [];
  const mapper = createInputMapper((...input) => inputs.push(input), {
    players: 2,
    seat: 2,
    layout: 'twin'
  });
  const twinPads = startSeats => [1, 2, 3, 4].map(seat =>
    pad(startSeats.includes(seat) ? [6] : [], `Rycade P${seat}`)
  );

  mapper.poll(twinPads([2]), 'ARCADE', 0);
  assert.deepEqual(inputs, [[0, 2, 1]]);
  mapper.poll(twinPads([]), 'ARCADE', 120);
  assert.deepEqual(inputs.at(-1), [0, 2, 0]);
  mapper.poll(twinPads([]), 'ARCADE', 260);
  assert.deepEqual(inputs.at(-1), [0, 3, 1]);
  mapper.poll(twinPads([]), 'ARCADE', 370);
  assert.deepEqual(inputs.at(-1), [0, 3, 0]);

  mapper.poll(twinPads([4]), 'ARCADE', 400);
  assert.deepEqual(inputs.at(-1), [1, 2, 1]);
  mapper.poll(twinPads([]), 'ARCADE', 520);
  mapper.poll(twinPads([]), 'ARCADE', 650);
  assert.deepEqual(inputs.at(-1), [1, 3, 1]);
  mapper.poll(twinPads([]), 'ARCADE', 770);
  assert.deepEqual(inputs.at(-1), [1, 3, 0]);
  assert.ok(inputs.every(([port, id]) => port < 2 || (id !== 2 && id !== 3)));
});

test('twin layout release sends zero for every held input', () => {
  const inputs = [];
  const mapper = createInputMapper((...input) => inputs.push(input), {
    players: 2,
    seat: 2,
    layout: 'twin'
  });
  const pads = [1, 2, 3, 4].map(seat => {
    const controller = pad([0], `Rycade P${seat}`);
    controller.axes[1] = -1;
    return controller;
  });
  mapper.poll(pads, 'ARCADE', 0);
  mapper.release();
  assert.deepEqual(inputs, [
    [0, 4, 1], [0, 0, 1], [1, 4, 1], [1, 0, 1],
    [2, 4, 1], [2, 0, 1], [3, 4, 1], [3, 0, 1],
    [0, 4, 0], [0, 0, 0], [1, 4, 0], [1, 0, 0],
    [2, 4, 0], [2, 0, 0], [3, 4, 0], [3, 0, 0]
  ]);
});

test('twin input layouts and Q*bert core option are exported', () => {
  assert.deepEqual(INPUT_LAYOUTS, { smashtv: 'twin', robotron: 'twin' });
  assert.equal(CORE_OPTIONS.qbert['mame2003-plus_four_way_emulation'], 'enabled');
});

test('MAME games skip boot frames with per-game overrides', () => {
  assert.equal(bootSkipFrames('mame2003_plus', 'galaga'), 900);
  assert.equal(bootSkipFrames('mame2003_plus', 'sf2'), 900);
  assert.equal(bootSkipFrames('snes9x', 'smw'), 0);
  assert.equal(bootSkipFrames('fceumm', 'blitz'), 0);

  BOOT_FRAMES.galaga = 42;
  try {
    assert.equal(bootSkipFrames('mame2003_plus', 'galaga'), 42);
  } finally {
    delete BOOT_FRAMES.galaga;
  }
});

test('clearSavedMute clears only the saved mute flag', () => {
  let stored = '{"volume":0.5,"muted":true}';
  const storage = {
    getItem: key => key === 'ejs-settings' ? stored : null,
    setItem: (key, value) => {
      assert.equal(key, 'ejs-settings');
      stored = value;
    }
  };
  clearSavedMute(storage);
  assert.deepEqual(JSON.parse(stored), { volume: 0.5, muted: false });
});

test('clearSavedMute does not write settings that are already unmuted', () => {
  let writes = 0;
  clearSavedMute({
    getItem: () => '{"volume":0.3,"muted":false}',
    setItem: () => { writes += 1; }
  });
  assert.equal(writes, 0);
});

test('clearSavedMute ignores a missing saved settings key', () => {
  let writes = 0;
  assert.doesNotThrow(() => clearSavedMute({
    getItem: () => null,
    setItem: () => { writes += 1; }
  }));
  assert.equal(writes, 0);
});

test('clearSavedMute ignores invalid saved settings JSON', () => {
  let writes = 0;
  assert.doesNotThrow(() => clearSavedMute({
    getItem: () => '{oops',
    setItem: () => { writes += 1; }
  }));
  assert.equal(writes, 0);
});

test('clearSavedMute ignores storage read errors', () => {
  assert.doesNotThrow(() => clearSavedMute({
    getItem: () => { throw new Error('storage unavailable'); },
    setItem: () => assert.fail('setItem should not be called')
  }));
});

test('Marralhinha Blitz configures Four Score gamepads in the FCEUmm core remap', () => {
  assert.deepEqual(RETRO_REMAPS.mblitz, [
    'input_libretro_device_p3 = "513"',
    'input_libretro_device_p4 = "513"'
  ]);
  assert.deepEqual(Object.keys(RETRO_REMAPS), ['mblitz']);
});

test("Dragon's Lair DirkSimple engine runs attract mode, starts game, and processes rooms", () => {
  const { createDirkSimpleEngine, DLAIR_SCENES, DLAIR_ROWS } = require('../public/dlair.js');
  assert.equal(DLAIR_ROWS.length, 13);
  assert.ok(DLAIR_SCENES.the_dragons_lair);

  const clips = [];
  const sounds = [];
  const engine = createDirkSimpleEngine({
    startClip: ms => clips.push(ms),
    showSingleFrame: ms => clips.push(ms),
    playSound: name => sounds.push(name)
  });

  engine.tick(0, 0, { pressed: {}, held: {} });
  assert.equal(engine.getState().inAttractMode, true);
  assert.ok(clips.length > 0);

  engine.tick(100, 100, { pressed: { coinslot: true, start: true }, held: { start: true } });
  assert.equal(engine.getState().inAttractMode, false);
  assert.equal(engine.getState().sceneName, 'introduction');
  assert.equal(engine.getState().lives, 5);
  assert.ok(sounds.includes('coinslot'));
});
