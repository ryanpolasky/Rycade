(function (root) {
  const expandPads = typeof module !== 'undefined' && module.exports
    ? require('./padsplit.js').expandPads
    : root.rycadeExpandPads;
  const ACTIONS = [[0, '1'], [3, '2'], [1, '3'], [6, 'Enter']];
  const DIRECTIONS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

  function down(button) {
    return typeof button === 'number' ? button > 0.5 : !!button && (button.pressed || button.value > 0.5);
  }

  function createMenuPadDriver(getPads, dispatch, isLaunched) {
    const previousButtons = Array.from({ length: 4 }, () => new Map());
    const repeats = new Map(DIRECTIONS.map(key => [key, { held: false, sent: false, next: 0 }]));
    let lastSeat = null;
    function tick(now) {
      const active = new Set();
      const pads = getPads() || [];
      for (let player = 0; player < 4; player++) {
        const pad = pads[player];
        const axes = pad && pad.axes || [];
        const buttons = pad && pad.buttons || [];
        if (axes[1] < -0.5 || down(buttons[12])) active.add('ArrowUp');
        if (axes[1] > 0.5 || down(buttons[13])) active.add('ArrowDown');
        if (axes[0] < -0.5 || down(buttons[14])) active.add('ArrowLeft');
        if (axes[0] > 0.5 || down(buttons[15])) active.add('ArrowRight');
        const previous = previousButtons[player];
        for (const [index, key] of ACTIONS) {
          const pressed = down(buttons[index]);
          if (pressed && !previous.get(index) && !isLaunched()) {
            const match = typeof pad?.id === 'string' && pad.id.match(/Rycade P([1-4])\b/);
            lastSeat = match ? Number(match[1]) - 1 : player;
            dispatch('keydown', key, false);
            dispatch('keyup', key, false);
          }
          previous.set(index, pressed);
        }
      }
      for (const key of DIRECTIONS) {
        const state = repeats.get(key);
        const held = active.has(key);
        if (!held) {
          if (state.sent) dispatch('keyup', key, false);
          state.held = false;
          state.sent = false;
          continue;
        }
        if (!state.held) {
          state.held = true;
          state.sent = false;
          state.next = now + 350;
          if (!isLaunched()) {
            dispatch('keydown', key, false);
            state.sent = true;
          }
        } else if (now >= state.next) {
          state.next = now + 120;
          if (!isLaunched()) {
            dispatch('keydown', key, state.sent);
            state.sent = true;
          }
        }
      }
    }
    return { tick, lastSeat: () => lastSeat, clearSeat() { lastSeat = null; } };
  }

  const api = { ACTIONS, DIRECTIONS, createMenuPadDriver };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined') return;
  const driver = createMenuPadDriver(
    () => expandPads(navigator.getGamepads()),
    (type, key, repeat) => (document.activeElement || document.body).dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, repeat: !!repeat })),
    () => !!(window.rycadeMenuLaunched && window.rycadeMenuLaunched())
  );
  window.rycadeMenuPads = driver;
  window.addEventListener('keydown', event => {
    if (event.isTrusted) driver.clearSeat();
  }, true);
  const poll = now => {
    driver.tick(now);
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
})(typeof globalThis !== 'undefined' ? globalThis : window);
