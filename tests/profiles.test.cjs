const assert = require('node:assert/strict');
const { test } = require('node:test');
const P = require('../public/profiles.js');
const { createProfileSaves } = require('../public/play.js');

function state(...profiles) {
  return { profiles, last: null };
}

function profile(initials, games = {}, created = 1) {
  return { id: `${initials}-1`, initials, color: '#fff', created, games };
}

function memoryFs(files = {}) {
  const store = new Map(Object.entries(files).map(([path, bytes]) => [path, Uint8Array.from(bytes)]));
  const dirs = new Set(['/']);
  for (const path of store.keys()) {
    const parts = path.split('/').slice(1, -1);
    parts.forEach((_, i) => dirs.add('/' + parts.slice(0, i + 1).join('/')));
  }
  return {
    store,
    analyzePath: path => ({ exists: store.has(path) || dirs.has(path) }),
    mkdir: path => dirs.add(path),
    readdir: dir => ['.', '..', ...new Set([...store.keys(), ...dirs].filter(path => path !== dir && path.startsWith(dir + '/')).map(path => path.slice(dir.length + 1).split('/')[0]))],
    stat: path => ({ mode: dirs.has(path) ? 1 : 0 }),
    isDir: mode => mode === 1,
    readFile: path => store.get(path),
    writeFile: (path, bytes) => store.set(path, Uint8Array.from(bytes)),
    unlink: path => store.delete(path)
  };
}

test('picker shows the three most recent players of this game first, then other recent profiles', () => {
  const s = state(
    profile('AAA', { yoshi: { ms: 1, last: 10 } }),
    profile('BBB', { yoshi: { ms: 1, last: 30 } }),
    profile('CCC', { smw: { ms: 1, last: 99 } }),
    profile('DDD', { yoshi: { ms: 1, last: 20 } }),
    profile('EEE', {}, 50)
  );
  assert.deepEqual(P.pickerProfiles(s, 'yoshi').map(p => p.initials), ['BBB', 'DDD', 'AAA']);
  assert.deepEqual(P.pickerProfiles(s, 'alttp').map(p => p.initials), ['CCC', 'EEE', 'BBB']);
});

test('initials are cleaned and an existing set collides instead of duplicating', () => {
  const s = state(profile('RYN'));
  assert.equal(P.cleanInitials('r-y n!'), 'RYN');
  assert.equal(P.findProfile(s, 'ryn').id, 'RYN-1');
  assert.equal(P.createProfile(s, 'RYN'), null);
  assert.equal(P.createProfile(s, 'AB'), null);
  const created = P.createProfile(s, 'adm', 1000);
  assert.equal(created.initials, 'ADM');
  assert.notEqual(created.color, s.profiles[0].color);
  assert.equal(s.profiles.length, 2);
});

test('starting and playing a game records last profile and playtime', () => {
  const s = state(profile('RYN'));
  P.startGame(s, 'RYN-1', 'yoshi', 500);
  P.addPlaytime(s, 'RYN-1', 'yoshi', 90000);
  P.addPlaytime(s, 'RYN-1', 'yoshi', 30000);
  assert.equal(s.last, 'RYN-1');
  assert.deepEqual(s.profiles[0].games.yoshi, { ms: 120000, last: 500 });
  assert.equal(P.formatPlaytime(s.profiles[0].games.yoshi.ms), '0:02');
});

test('deleted profiles and erased games are reported as stale save files', () => {
  const s = state(profile('RYN', { yoshi: { ms: 1, last: 1 }, smw: { ms: 1, last: 1 } }));
  P.removeGame(s, 'RYN-1', 'smw');
  const files = [P.savePath('RYN-1', 'yoshi'), P.savePath('RYN-1', 'smw'), P.savePath('OLD-1', 'yoshi')];
  assert.deepEqual(P.staleSaves(s, files), [P.savePath('RYN-1', 'smw'), P.savePath('OLD-1', 'yoshi')]);
});

test('profile saves swap into the shared emulator slot and back out', () => {
  const shared = '/data/saves/Snes9x/Yoshi.srm';
  const s = state(profile('AAA', { yoshi: { ms: 1, last: 1 } }), profile('BBB', { yoshi: { ms: 1, last: 1 } }));
  const fs = memoryFs({ [shared]: [9], [P.savePath('AAA-1', 'yoshi')]: [1], [P.savePath('GONE-1', 'yoshi')]: [7] });

  createProfileSaves(fs, { state: s, profileId: 'AAA-1', gameId: 'yoshi', sharedPath: shared }).restore();
  assert.deepEqual([...fs.readFile(shared)], [1]);
  assert.equal(fs.store.has(P.savePath('GONE-1', 'yoshi')), false);

  const bbb = createProfileSaves(fs, { state: s, profileId: 'BBB-1', gameId: 'yoshi', sharedPath: shared });
  bbb.restore();
  assert.equal(fs.store.has(shared), false);
  fs.writeFile(shared, [5]);
  assert.equal(bbb.keep(shared), true);
  assert.deepEqual([...fs.readFile(P.savePath('BBB-1', 'yoshi'))], [5]);
  assert.deepEqual([...fs.readFile(P.savePath('AAA-1', 'yoshi'))], [1]);
});

test('first launch with an unknown slot path adopts the existing save', () => {
  const shared = '/data/saves/FCEUmm/Zelda.srm';
  const s = state(profile('RYN', { zelda1: { ms: 0, last: 1 } }));
  const fs = memoryFs({ [shared]: [3] });
  const saves = createProfileSaves(fs, { state: s, profileId: 'RYN-1', gameId: 'zelda1' });
  saves.restore();
  assert.deepEqual([...fs.readFile(shared)], [3]);
  saves.keep(shared);
  assert.deepEqual([...fs.readFile(P.savePath('RYN-1', 'zelda1'))], [3]);
});
