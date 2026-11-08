(function (root) {
  const PROFILES_KEY = 'rycade.profiles';
  const SAVE_PATHS_KEY = 'rycade.savePaths';
  const SAVE_ROOT = '/data/saves/rycade';
  const SAVE_GAMES = new Set(['smw', 'dkc', 'smetroid', 'alttp', 'allstars', 'yoshi', 'zelda1', 'kirby', 'sonic3k']);
  const COLORS = ['#f2c214', '#3bbf2f', '#2f8fe6', '#e23b2e', '#c26bff', '#ff8a1f', '#22c7c7', '#f4f1ea'];
  const PICKER_ROWS = 3;

  function empty() {
    return { profiles: [], last: null };
  }

  function normalize(state) {
    if (!state || !Array.isArray(state.profiles)) return empty();
    return {
      profiles: state.profiles.filter(profile => profile && profile.id && profile.initials).map(profile => ({
        ...profile,
        games: profile.games && typeof profile.games === 'object' ? profile.games : {}
      })),
      last: state.last || null
    };
  }

  function cleanInitials(initials) {
    return String(initials || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  }

  function recent(profile) {
    return Math.max(profile.created || 0, ...Object.values(profile.games).map(entry => entry.last || 0));
  }

  function pickerProfiles(state, gameId, rows = PICKER_ROWS) {
    const played = profile => profile.games[gameId]?.last || 0;
    return [...state.profiles]
      .sort((a, b) => played(b) - played(a) || recent(b) - recent(a))
      .slice(0, rows);
  }

  function findProfile(state, initials) {
    const clean = cleanInitials(initials);
    return state.profiles.find(profile => profile.initials === clean) || null;
  }

  function createProfile(state, initials, now = Date.now()) {
    const clean = cleanInitials(initials);
    if (clean.length !== 3 || findProfile(state, clean)) return null;
    const used = new Set(state.profiles.map(profile => profile.color));
    const color = COLORS.find(value => !used.has(value)) || COLORS[state.profiles.length % COLORS.length];
    const profile = { id: `${clean}-${now.toString(36)}`, initials: clean, color, created: now, games: {} };
    state.profiles.push(profile);
    return profile;
  }

  function startGame(state, profileId, gameId, now = Date.now()) {
    const profile = state.profiles.find(item => item.id === profileId);
    if (!profile) return null;
    const entry = profile.games[gameId] || { ms: 0 };
    entry.last = now;
    profile.games[gameId] = entry;
    state.last = profile.id;
    return profile;
  }

  function addPlaytime(state, profileId, gameId, ms) {
    const entry = state.profiles.find(item => item.id === profileId)?.games[gameId];
    if (entry && ms > 0) entry.ms = (entry.ms || 0) + Math.round(ms);
  }

  function removeProfile(state, profileId) {
    state.profiles = state.profiles.filter(profile => profile.id !== profileId);
    if (state.last === profileId) state.last = null;
  }

  function removeGame(state, profileId, gameId) {
    const profile = state.profiles.find(item => item.id === profileId);
    if (profile) delete profile.games[gameId];
  }

  function savePath(profileId, gameId) {
    return `${SAVE_ROOT}/${profileId}/${gameId}.srm`;
  }

  function staleSaves(state, files) {
    const keep = new Set(state.profiles.flatMap(profile => Object.keys(profile.games).map(gameId => savePath(profile.id, gameId))));
    return files.filter(file => !keep.has(file));
  }

  function formatPlaytime(ms) {
    const minutes = Math.floor((ms || 0) / 60000);
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
  }

  function formatLast(time, now = Date.now()) {
    if (!time) return 'NO SAVE YET';
    const day = 86400000;
    const midnight = new Date(now).setHours(0, 0, 0, 0);
    if (time >= midnight) return 'TODAY';
    if (time >= midnight - day) return 'YESTERDAY';
    const days = Math.ceil((midnight - time) / day);
    if (days < 7) return `${days} DAYS AGO`;
    return new Date(time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  }

  function read(storage, key, fallback) {
    try {
      return JSON.parse(storage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function load(storage = root.localStorage) {
    return normalize(read(storage, PROFILES_KEY, null));
  }

  function store(state, storage = root.localStorage) {
    try {
      storage.setItem(PROFILES_KEY, JSON.stringify(state));
    } catch {}
  }

  function update(change, storage = root.localStorage) {
    const state = load(storage);
    const result = change(state);
    store(state, storage);
    return result;
  }

  const api = {
    PROFILES_KEY,
    SAVE_PATHS_KEY,
    SAVE_ROOT,
    SAVE_GAMES,
    PICKER_ROWS,
    usesSaves: gameId => SAVE_GAMES.has(gameId),
    cleanInitials,
    pickerProfiles,
    findProfile,
    createProfile,
    startGame,
    addPlaytime,
    removeProfile,
    removeGame,
    savePath,
    staleSaves,
    formatPlaytime,
    formatLast,
    read,
    load,
    store,
    update
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.rycadeProfiles = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
