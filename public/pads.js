(function (root) {
  const ACTIONS = [[0, '1'], [3, '2'], [1, '3'], [6, 'Enter']];
  const DIRECTIONS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

  function down(button) {
    return typeof button === 'number' ? button > 0.5 : !!button && (button.pressed || button.value > 0.5);
  }

  function createMenuPadDriver(getPads, dispatch, isLaunched) {
    const previousButtons = Array.from({ length: 4 }, () => new Map());
    const repeats = new Map(DIRECTIONS.map(key => [key, { held: false, next: 0 }]));
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
            dispatch('keydown', key);
            dispatch('keyup', key);
          }
          previous.set(index, pressed);
        }
      }
      for (const key of DIRECTIONS) {
        const state = repeats.get(key);
        const held = active.has(key);
        if (!held) {
          state.held = false;
          continue;
        }
        if (!state.held) {
          state.held = true;
          state.next = now + 350;
          if (!isLaunched()) {
            dispatch('keydown', key);
            dispatch('keyup', key);
          }
        } else if (now >= state.next) {
          state.next = now + 120;
          if (!isLaunched()) {
            dispatch('keydown', key);
            dispatch('keyup', key);
          }
        }
      }
    }
    return { tick };
  }

  const api = { ACTIONS, DIRECTIONS, createMenuPadDriver };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined') return;
  const driver = createMenuPadDriver(
    () => navigator.getGamepads(),
    (type, key) => (document.activeElement || document.body).dispatchEvent(new KeyboardEvent(type, { key, bubbles: true })),
    () => !!(window.rycadeMenuLaunched && window.rycadeMenuLaunched())
  );
  const poll = now => {
    driver.tick(now);
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
})(typeof globalThis !== 'undefined' ? globalThis : window);
