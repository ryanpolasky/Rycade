const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DECODERS, decode, createUploader } = require('../public/hiscores.js');
const { findHiscore } = require('../public/play.js');

DECODERS.testgame = {
  size: 4,
  defaults: [['AAA', 100]],
  decode: bytes => [
    { initials: 'AAA', score: bytes[0] * 100 },
    { initials: 'RYP', score: bytes[1] * 100 },
    { initials: 'BAD<', score: 5 },
    { initials: 'ZER', score: 0 }
  ]
};

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, String(value)) };
}

test('decode drops factory defaults, junk initials and zero scores', () => {
  assert.deepEqual(decode('testgame', [1, 2, 0, 0]), [{ initials: 'RYP', score: 200 }]);
});

test('decode ignores unknown games and wrong-sized files', () => {
  assert.deepEqual(decode('nope', [1, 2, 0, 0]), []);
  assert.deepEqual(decode('testgame', [1, 2]), []);
});

test('uploader sends new entries once and queues failed sends', async () => {
  const storage = memoryStorage();
  const sent = [];
  let online = false;
  const uploader = createUploader({ storage, send: async batch => online && sent.push(batch) > 0 });
  await uploader.submit('testgame', [1, 2, 0, 0]);
  assert.deepEqual(sent, []);
  online = true;
  await uploader.submit('testgame', [1, 2, 0, 0]);
  assert.deepEqual(sent, [{ game: 'testgame', entries: [{ initials: 'RYP', score: 200 }] }]);
  await uploader.submit('testgame', [1, 3, 0, 0]);
  assert.deepEqual(sent[1], { game: 'testgame', entries: [{ initials: 'RYP', score: 300 }] });
  assert.equal(sent.length, 2);
});

test('findHiscore walks the save tree for the set file', () => {
  const tree = { '/data/saves': ['.', '..', 'mame2003-plus'], '/data/saves/mame2003-plus': ['hi'], '/data/saves/mame2003-plus/hi': ['dkong3.hi'] };
  const fs = {
    readdir: dir => { if (!tree[dir]) throw new Error('ENOENT'); return tree[dir]; },
    stat: path => ({ mode: tree[path] ? 1 : 0 }),
    isDir: mode => mode === 1,
    readFile: path => path.endsWith('dkong3.hi') ? new Uint8Array([7]) : null
  };
  assert.deepEqual(findHiscore(fs, 'dkong3.hi'), new Uint8Array([7]));
  assert.equal(findHiscore(fs, 'galaga.hi'), null);
});

const DK3_FACTORY = 'f376e8e2e54040303132303030404057494e4040404040404040407f000020015376f576324e44404030303930303040404d41494040404040404040407f000090005576f776335244404030303830303040404f47414040404040404040407f000080005776f9763454484040303035343030404053555a4040404040404040407f000054005976fb7635544840403030333230304040594f554040404040404040407f000032005b76' + '00'.repeat(68) + '012000';

test('dkong3 factory table decodes to nothing new', () => {
  const bytes = Uint8Array.from(Buffer.from(DK3_FACTORY, 'hex'));
  assert.deepEqual(DECODERS.dkong3.decode(bytes).map(e => [e.initials, e.score]), DECODERS.dkong3.defaults);
  assert.deepEqual(decode('dkong3', bytes), []);
});

test('dkong3 picks up a player row', () => {
  const bytes = Uint8Array.from(Buffer.from(DK3_FACTORY, 'hex'));
  bytes.set(Buffer.from('RYAN@@@@@@@@', 'latin1'), 2 + 13);
  bytes.set([0x50, 0x34, 0x12], 2 + 27);
  assert.deepEqual(decode('dkong3', bytes), [{ initials: 'RYAN', score: 123450 }]);
});

const hex = h => Uint8Array.from(Buffer.from(h, 'hex'));

test('qix nvram factory table decodes to nothing new, real score comes through', () => {
  const bytes = new Uint8Array(1024);
  for (let i = 0; i < 10; i++) bytes.set([3, 0, 0, 0x51, 0x49, 0x58], 0x2c4 + i * 6);
  assert.deepEqual(decode('qix', bytes), []);
  bytes.set([0x12, 0x34, 0x50, 0x52, 0x59, 0x50], 0x2c4);
  assert.deepEqual(decode('qix', bytes), [{ initials: 'RYP', score: 123450 }]);
});

const GALAGA_FACTORY = '000000000224000000000224000000000224000000000224000000000224172a170a2a0a162a160c2a0c182a18000000000224';

test('galaga factory table decodes to nothing new, real score comes through', () => {
  const bytes = hex(GALAGA_FACTORY);
  assert.deepEqual(decode('galaga', bytes), []);
  bytes.set([0, 5, 4, 3, 2, 1], 0);
  bytes.set([0x1b, 0x22, 0x19], 30);
  assert.deepEqual(decode('galaga', bytes), [{ initials: 'RYP', score: 123450 }]);
});

const DIGDUG2_FACTORY = '000002000000204b415a5520ffffff050000020000002059414d4120ffffff04000002000000534947455255ffffff030000020000004a554e4b4f20ffffff020000020000004d4959554b49ffffff0100200030000000022020';

test('digdug2 factory table decodes to nothing new, real score comes through', () => {
  const bytes = hex(DIGDUG2_FACTORY);
  assert.deepEqual(decode('digdug2', bytes), []);
  bytes.set([0, 1, 2, 3, 4, 5, 0x52, 0x59, 0x41, 0x4e, 0x20, 0x20], 0);
  assert.deepEqual(decode('digdug2', bytes), [{ initials: 'RYAN', score: 123450 }]);
});
