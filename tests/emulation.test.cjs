const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  ROM_CATALOG,
  findRom,
  normalizeRomName,
  resolveRom
} = require('../public/emulation.js');

function fakeFetch(listing, overrides = {}, missingOverrides = false) {
  return async (url, options) => {
    if (url.endsWith('/overrides.json')) {
      return { ok: !missingOverrides, json: async () => overrides };
    }
    assert.match(url, /^\/roms\/(arcade|genesis|snes|nes)\/$/);
    assert.equal(options.headers.Accept, 'application/json');
    return { ok: true, json: async () => listing };
  };
}

async function resolve(id, title, listing, overrides) {
  return resolveRom({ id, title }, { fetch: fakeFetch(listing, overrides) });
}

test('catalog maps every sourced title, including Marralhinha Blitz', () => {
  assert.equal(Object.keys(ROM_CATALOG).length, 170);
  assert.equal(ROM_CATALOG.yoshi.expected, "Super Mario World 2 - Yoshi's Island (USA).sfc");
  assert.equal(ROM_CATALOG.sonic2.expected, 'Sonic The Hedgehog 2 (World).md');
  assert.equal(ROM_CATALOG.crimfghtu.parent, 'crimfght.zip');
  assert.equal(ROM_CATALOG.mblitz.expected, 'Marralhinha Blitz.nes');
});

test('exact and case-insensitive filename matching', async () => {
  assert.equal((await resolve('19xx', '19XX: The War Against Destiny', [{ name: '19xx.zip' }])).filename, '19xx.zip');
  assert.equal((await resolve('smb1', 'Super Mario Bros.', [{ name: 'SUPER MARIO BROS. (WORLD).NES' }])).filename,
    'SUPER MARIO BROS. (WORLD).NES');
  assert.equal(findRom(ROM_CATALOG.mblitz, 'Marralhinha Blitz', ['Marralhinha Blitz.nes']), 'Marralhinha Blitz.nes');
});

test('console ZIP fallback and normalized No-Intro region/revision matching', async () => {
  assert.equal((await resolve('sonic2', 'Sonic the Hedgehog 2', [{ name: 'Sonic The Hedgehog 2 (World).zip' }])).filename,
    'Sonic The Hedgehog 2 (World).zip');
  assert.equal((await resolve('yoshi', "Yoshi's Island", [
    { name: "Super Mario World 2 - Yoshi's Island (U) (V1.1).zip" }
  ])).filename, "Super Mario World 2 - Yoshi's Island (U) (V1.1).zip");
  assert.equal(normalizeRomName('Yoshi (USA) (V1.1).sfc'), 'yoshi');
});

test('arcade clones fall back to the parent archive and local overrides change the core', async () => {
  const crime = await resolve('crimfghtu', 'Crime Fighters', [{ name: 'crimfght.zip' }]);
  assert.equal(crime.filename, 'crimfght.zip');
  assert.equal(crime.core, 'mame2003_plus');
  const nineteen = await resolve('19xx', '19XX: The War Against Destiny', [{ name: '19xx.zip' }], {
    '19xx.zip': 'fbalpha2012_cps2'
  });
  assert.equal(nineteen.core, 'fbalpha2012_cps2');
});

test('missing ROMs stay unresolved instead of guessing filenames', async () => {
  assert.equal((await resolve('19xx', '19XX: The War Against Destiny', [])).filename, null);
  assert.equal((await resolve('mblitz', 'Marralhinha Blitz', [{ name: 'mblitz.zip' }])).filename, null);
});
