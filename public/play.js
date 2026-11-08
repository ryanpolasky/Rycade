(function (root) {
  const SYSTEM_BUTTONS = {
    ARCADE: [0, 8, 1],
    GENESIS: [1, 0, 8],
    SNES: [1, 0, 8],
    NES: [0, 8, null]
  };
  const PHYSICAL_BUTTONS = [0, 3, 1];
  const DIRECTION_IDS = { up: 4, down: 5, left: 6, right: 7 };

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

  function createInputMapper(simulateInput, { players, seat } = {}) {
    const flexible = Number.isInteger(players) && players >= 1 && players <= 2;
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
        const start = buttonDown(pad && pad.buttons && pad.buttons[6]);
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

  const api = { SYSTEM_BUTTONS, PHYSICAL_BUTTONS, orderPads, createInputMapper };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined') return;

  const params = new URLSearchParams(location.search);
  const file = params.get('file') || '';
  const core = params.get('core') || 'snes9x';
  const system = params.get('sys') || 'SNES';
  const pads = navigator.getGamepads.bind(navigator);
  navigator.getGamepads = () => [];
  let started = false;
  let manager = null;
  let mapper = null;
  let timeout;
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
  window.EJS_AdUrl = '';
  window.EJS_onGameStart = function () {
    started = true;
    clearTimeout(timeout);
    post('started');
    manager = window.EJS_emulator && window.EJS_emulator.gameManager;
    if (!manager || typeof manager.simulateInput !== 'function') return;
    mapper = createInputMapper((player, id, value) => manager.simulateInput(player, id, value), {
      players: Number(params.get('players')),
      seat: Number(params.get('seat'))
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
