const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const gameContext = {};
vm.runInNewContext(
  `${fs.readFileSync(path.join(root, 'public/games.js'), 'utf8')}\nthis.catalogGames = GAMES;`,
  gameContext
);

const sectionSystems = {
  'ARCADE (MAME)': 'ARCADE',
  GENESIS: 'GENESIS',
  SNES: 'SNES',
  NES: 'NES'
};
const directories = { ARCADE: 'arcade', GENESIS: 'genesis', SNES: 'snes', NES: 'nes' };
const cores = {
  ARCADE: 'mame2003_plus',
  GENESIS: 'genesis_plus_gx',
  SNES: 'snes9x',
  NES: 'fceumm'
};

function normalizeTitle(value) {
  return value.replace(/\([^)]*\)/g, ' ').toLowerCase().replace(/[^a-z0-9]/g, '');
}

let section = '';
const rows = new Map();
for (const line of fs.readFileSync(path.join(root, 'SOURCING.md'), 'utf8').split(/\r?\n/)) {
  if (line.startsWith('## ')) {
    section = line.slice(3).trim();
    continue;
  }
  if (!line.startsWith('|') || /^\|\s*[-:| ]+\|/.test(line)) continue;
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
  if (cells.length < 4 || cells[0] === 'Title' || !sectionSystems[section]) continue;
  rows.set(`${sectionSystems[section]}:${normalizeTitle(cells[0])}`, cells);
}

const unmatched = [];
const catalog = {};
for (const game of gameContext.catalogGames) {
  const system = game.sys;
  const cells = rows.get(`${system}:${normalizeTitle(game.title)}`);
  const code = cells && cells[2].match(/`([^`]+)`/);
  const expected = code ? (system === 'ARCADE' ? `${code[1]}.zip` : code[1]) : null;
  const clone = system === 'ARCADE' && cells && cells[3].match(/clone of\s+`([^`]+)`/i);
  if (!cells || !expected) unmatched.push(`${game.id}: ${game.title}`);
  catalog[game.id] = {
    sys: system,
    dir: directories[system],
    expected,
    core: cores[system],
    parent: clone ? `${clone[1]}.zip` : null
  };
}

const output = `/* Generated from SOURCING.md and public/games.js by tools/generate-emulation.js. */
(function (root) {
  const ROM_CATALOG = ${JSON.stringify(catalog, null, 2)};
  const DEFAULT_CORES = ${JSON.stringify(cores)};
  const SYS_DIRS = ${JSON.stringify(directories)};

  function normalizeRomName(value) {
    return String(value || '')
      .replace(/\\.[^./]+$/, '')
      .replace(/\\([^)]*\\)/g, ' ')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function listingNames(data) {
    const items = Array.isArray(data) ? data : data && (data.items || data.files);
    if (!Array.isArray(items)) return [];
    return items
      .filter(item => typeof item === 'string' || item && !(item.is_dir || item.isDir || item.type === 'directory'))
      .map(item => typeof item === 'string' ? item : item.name)
      .filter(name => typeof name === 'string' && name && name !== '.' && name !== '..');
  }

  function findRom(entry, title, listing) {
    const names = listingNames(listing);
    const byName = new Map(names.map(name => [name.toLowerCase(), name]));
    const exact = entry.expected && byName.get(entry.expected.toLowerCase());
    if (exact) return exact;

    if (!entry.expected) return null;
    const extension = entry.expected.match(/\\.[^./]+$/);
    const base = extension ? entry.expected.slice(0, -extension[0].length) : entry.expected;
    const zipped = byName.get((base + '.zip').toLowerCase());
    if (zipped) return zipped;

    if (entry.parent) {
      const parent = byName.get(entry.parent.toLowerCase());
      if (parent) return parent;
    }

    const expectedTitle = normalizeRomName(base);
    const gameTitle = normalizeRomName(title);
    return names.find(name => {
      const normalized = normalizeRomName(name);
      return normalized && (normalized === expectedTitle || normalized === gameTitle);
    }) || null;
  }

  async function resolveRom(game, options = {}) {
    const entry = ROM_CATALOG[game && game.id];
    if (!entry) return null;
    const fetcher = options.fetch || root.fetch;
    const romsRoot = (options.romsRoot || '/roms').replace(/\\/$/, '');
    let listing;
    try {
      const response = await fetcher(\`\${romsRoot}/\${entry.dir}/\`, {
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) return { ...entry, filename: null, core: entry.core };
      listing = await response.json();
    } catch {
      return { ...entry, filename: null, core: entry.core };
    }

    const filename = findRom(entry, game.title, listing);
    if (!filename) return { ...entry, filename: null, core: entry.core };

    let overrides = {};
    try {
      const response = await fetcher(\`\${romsRoot}/overrides.json\`, {
        headers: { Accept: 'application/json' }
      });
      if (response.ok) overrides = await response.json();
    } catch {}
    const override = Object.entries(overrides || {}).find(([name]) => name.toLowerCase() === filename.toLowerCase());
    return {
      ...entry,
      filename,
      core: override ? override[1] : entry.core
    };
  }

  const api = { ROM_CATALOG, DEFAULT_CORES, SYS_DIRS, normalizeRomName, listingNames, findRom, resolveRom };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.rycadeEmulation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
`;

fs.writeFileSync(path.join(root, 'public/emulation.js'), output);
console.log(`Generated ROM mappings for ${Object.keys(catalog).length} catalog games.`);
console.log(unmatched.length ? `Unmatched: ${unmatched.join('; ')}` : 'All games matched SOURCING.md.');
