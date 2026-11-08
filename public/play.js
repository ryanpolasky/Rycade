(function (root) {
  const SYSTEM_BUTTONS = {
    ARCADE: [0, 8, 1],
    GENESIS: [1, 0, 8],
    SNES: [1, 0, 8],
    NES: [0, 8, null]
  };
  const PHYSICAL_BUTTONS = [0, 3, 1];
  const DIRECTION_IDS = { up: 4, down: 5, left: 6, right: 7 };
  const INPUT_LAYOUTS = { smashtv: 'twin', robotron: 'twin' };
  const CORE_OPTIONS = {
    qbert: { 'mame2003-plus_four_way_emulation': 'enabled' }
  };
  const RETRO_REMAPS = {
    mblitz: ['input_libretro_device_p3 = "513"', 'input_libretro_device_p4 = "513"']
  };

  function buttonDown(button) {
    return typeof button === 'number' ? button > 0.5 : !!button && (button.pressed || button.value > 0.5);
  }

  function orderPads(pads) {
    const players = Array(4).fill(null);
    const unassigned = [];
    for (const pad of Array.from(pads || [])) {
      if (!pad || pad.connected === false) continue;
      const match = typeof pad.id === 'string' && pad.id.match(/Rycade P([1-4])\b/);
      if (match) {
        const player = Number(match[1]) - 1;
        if (!players[player]) players[player] = pad;
      } else {
        unassigned.push(pad);
      }
    }
    let next = 0;
    return players.map(pad => pad || unassigned[next++] || null);
  }

  function createInputMapper(simulateInput, { players, seat, layout } = {}) {
    const flexible = layout !== 'twin' && Number.isInteger(players) && players >= 1 && players <= 2;
    const seats = flexible
      ? [Number.isInteger(seat) && seat >= 0 && seat <= 3 ? seat : 0]
      : [];
    const seatStartHeld = Array(4).fill(false);
    const previous = Array.from({ length: 4 }, () => new Map());
    const starts = Array.from({ length: 4 }, () => ({ held: false, at: null }));
    function poll(pads, system, now) {
      const actions = SYSTEM_BUTTONS[system] || SYSTEM_BUTTONS.ARCADE;
      const playerPads = orderPads(pads);
      if (flexible) {
        for (let physicalSeat = 0; physicalSeat < 4; physicalSeat++) {
          const startDown = buttonDown(playerPads[physicalSeat]?.buttons?.[6]);
          if (seats.length < 2 && !seats.includes(physicalSeat) && startDown && !seatStartHeld[physicalSeat]) {
            seats.push(physicalSeat);
          }
          seatStartHeld[physicalSeat] = startDown;
        }
      }
      const routed = flexible
        ? [0, 1, 2, 3].map(player => seats[player] === undefined ? null : playerPads[seats[player]])
        : playerPads;
      for (let player = 0; player < 4; player++) {
        const pad = routed[player];
        const wanted = new Map();
        const axes = pad && pad.axes || [];
        if (axes[1] < -0.5) wanted.set(DIRECTION_IDS.up, 1);
        if (axes[1] > 0.5) wanted.set(DIRECTION_IDS.down, 1);
        if (axes[0] < -0.5) wanted.set(DIRECTION_IDS.left, 1);
        if (axes[0] > 0.5) wanted.set(DIRECTION_IDS.right, 1);
        PHYSICAL_BUTTONS.forEach((index, slot) => {
          const id = actions[slot];
          if (id !== null && buttonDown(pad && pad.buttons && pad.buttons[index])) wanted.set(id, 1);
        });
        const start = layout === 'twin'
          ? player < 2 && (
            buttonDown(playerPads[player * 2]?.buttons?.[6]) ||
            buttonDown(playerPads[player * 2 + 1]?.buttons?.[6])
          )
          : buttonDown(pad && pad.buttons && pad.buttons[6]);
        const startState = starts[player];
        if (system === 'ARCADE') {
          if (start && !startState.held) startState.at = now;
          startState.held = start;
          if (startState.at !== null && now < startState.at + 120) wanted.set(2, 1);
          if (startState.at !== null && now >= startState.at + 250 && now < startState.at + 370) wanted.set(3, 1);
        } else if (start) wanted.set(3, 1);
        const old = previous[player];
        for (const id of new Set([...old.keys(), ...wanted.keys()])) {
          const value = wanted.get(id) || 0;
          if ((old.get(id) || 0) !== value) simulateInput(player, id, value);
        }
        previous[player] = wanted;
      }
    }
    function release() {
      previous.forEach((state, player) => state.forEach((value, id) => value && simulateInput(player, id, 0)));
      previous.forEach(state => state.clear());
      starts.forEach(state => { state.held = false; state.at = null; });
    }
    return { poll, release };
  }

  const Profiles = typeof module !== 'undefined' && module.exports ? require('./profiles.js') : root.rycadeProfiles;

  function exists(FS, path) {
    return !!path && FS.analyzePath(path).exists;
  }

  function makeDirs(FS, dir) {
    let path = '';
    for (const part of dir.split('/').filter(Boolean)) {
      path += `/${part}`;
      if (!exists(FS, path)) FS.mkdir(path);
    }
  }

  function listFiles(FS, dir) {
    if (!exists(FS, dir)) return [];
    return FS.readdir(dir).filter(name => name !== '.' && name !== '..').flatMap(name => {
      const path = `${dir}/${name}`;
      return FS.isDir(FS.stat(path).mode) ? listFiles(FS, path) : [path];
    });
  }

  function copyFile(FS, from, to) {
    makeDirs(FS, to.slice(0, to.lastIndexOf('/')));
    FS.writeFile(to, FS.readFile(from));
  }

  function createProfileSaves(FS, { state, profileId, gameId, sharedPath }) {
    const own = Profiles.savePath(profileId, gameId);
    return {
      restore() {
        for (const file of Profiles.staleSaves(state, listFiles(FS, Profiles.SAVE_ROOT))) FS.unlink(file);
        if (!sharedPath) return;
        if (exists(FS, own)) copyFile(FS, own, sharedPath);
        else if (exists(FS, sharedPath)) FS.unlink(sharedPath);
      },
      keep(path) {
        if (!exists(FS, path)) return false;
        copyFile(FS, path, own);
        return true;
      }
    };
  }

  const api = { SYSTEM_BUTTONS, PHYSICAL_BUTTONS, INPUT_LAYOUTS, CORE_OPTIONS, RETRO_REMAPS, orderPads, createInputMapper, createProfileSaves };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined') return;

  const params = new URLSearchParams(location.search);
  const file = params.get('file') || '';
  const core = params.get('core') || 'snes9x';
  const system = params.get('sys') || 'SNES';
  const game = params.get('game') || '';
  const profileId = params.get('profile') || '';
  const pads = navigator.getGamepads.bind(navigator);
  navigator.getGamepads = () => [];
  let started = false;
  let manager = null;
  let mapper = null;
  let timeout;
  let saves = null;
  function post(state, message) {
    parent.postMessage({ type: 'rycade-play', state, ...(message ? { message } : {}) }, location.origin);
  }
  function fail(message) {
    if (started) return;
    post('error', message || 'Emulator failed to start');
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'F19' || event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      post('exit');
    } else {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener('keyup', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  window.addEventListener('error', event => fail(event.message), true);
  window.addEventListener('unhandledrejection', event => fail(String(event.reason || 'Emulator failed')));
  timeout = window.setTimeout(() => fail('Emulator timed out'), 60000);
  window.EJS_player = '#game';
  window.EJS_gameUrl = '/roms/' + file.split('/').map(encodeURIComponent).join('/');
  window.EJS_gameName = file.split('/').pop();
  window.EJS_core = core;
  window.EJS_pathtodata = '/vendor/emulatorjs/data/';
  window.EJS_startOnLoaded = true;
  window.EJS_fullscreenOnLoaded = false;
  window.EJS_defaultControls = { 0: {}, 1: {}, 2: {}, 3: {} };
  window.EJS_defaultOptions = { 'save-save-interval': '30', ...(core === 'mame2003_plus' && CORE_OPTIONS[game]) };
  if (profileId && Profiles) {
    window.EJS_ready = function () {
      const emulator = window.EJS_emulator;
      emulator.on('saveDatabaseLoaded', FS => {
        const paths = Profiles.read(localStorage, Profiles.SAVE_PATHS_KEY, {});
        saves = createProfileSaves(FS, { state: Profiles.load(), profileId, gameId: game, sharedPath: paths[game] });
        try {
          saves.restore();
        } catch (error) {
          console.warn('Rycade save restore failed', error);
        }
      });
      emulator.on('saveSaveFiles', () => {
        try {
          saves && manager && saves.keep(manager.getSaveFilePath());
        } catch (error) {
          console.warn('Rycade save keep failed', error);
        }
      });
    };
  }
  function flushSaves() {
    return new Promise(resolve => {
      if (!manager) return resolve();
      setTimeout(resolve, 1500);
      try {
        manager.saveSaveFiles();
        manager.FS.syncfs(false, () => resolve());
      } catch {
        resolve();
      }
    });
  }
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.data?.type !== 'rycade-save') return;
    flushSaves().then(() => post('saved'));
  });
  const remapLines = RETRO_REMAPS[game];
  if (remapLines) {
    let GameManager;
    Object.defineProperty(window, 'EJS_GameManager', {
      configurable: true,
      get() {
        return GameManager;
      },
      set(cls) {
        const writeConfigFile = cls.prototype.writeConfigFile;
        cls.prototype.writeConfigFile = function (...args) {
          const result = writeConfigFile.apply(this, args);
          this.writeFile(
            '/home/web_user/retroarch/userdata/config/remaps/FCEUmm/FCEUmm.rmp',
            remapLines.join('\n') + '\n'
          );
          return result;
        };
        GameManager = cls;
      }
    });
  }
  window.EJS_AdUrl = '';
  window.EJS_onGameStart = function () {
    started = true;
    clearTimeout(timeout);
    post('started');
    manager = window.EJS_emulator && window.EJS_emulator.gameManager;
    if (profileId && manager) {
      try {
        const paths = Profiles.read(localStorage, Profiles.SAVE_PATHS_KEY, {});
        paths[game] = manager.getSaveFilePath();
        localStorage.setItem(Profiles.SAVE_PATHS_KEY, JSON.stringify(paths));
      } catch {}
    }
    if (!manager || typeof manager.simulateInput !== 'function') return;
    mapper = createInputMapper((player, id, value) => manager.simulateInput(player, id, value), {
      players: Number(params.get('players')),
      seat: Number(params.get('seat')),
      layout: INPUT_LAYOUTS[game]
    });
    const poll = now => {
      if (!manager) return;
      mapper.poll(pads(), system, now);
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  };
  const script = document.createElement('script');
  script.src = window.EJS_pathtodata + 'loader.js';
  script.onerror = () => fail('Emulator loader unavailable');
  document.head.appendChild(script);
  window.addEventListener('pagehide', () => mapper && mapper.release());
})(typeof globalThis !== 'undefined' ? globalThis : window);
