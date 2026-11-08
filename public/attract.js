(() => {
  const overlay = document.querySelector('#attract-overlay');
  const video = overlay.querySelector('video');
  let lastInput = performance.now();
  let active = false;
  let current = null;
  let queue = [];
  let failures = 0;
  let loadTimer = 0;
  let clipSession = 0;
  let swallowPointer = false;
  const swallowedKeys = new Set();

  function reset() {
    lastInput = performance.now();
  }

  function stop(select = false) {
    active = false;
    clipSession++;
    clearTimeout(loadTimer);
    video.onended = null;
    video.onerror = null;
    video.onplaying = null;
    video.pause();
    video.removeAttribute('src');
    video.load();
    overlay.hidden = true;
    if (select && current) {
      if (barFocus) setBarFocus(false);
      tab = 0;
      build(current.id);
      renderDetail(current);
      settleNow();
    }
    reset();
  }

  function activity(select = false) {
    reset();
    if (!active) return false;
    stop(select);
    return true;
  }

  function next() {
    clearTimeout(loadTimer);
    if (!active) return;
    const session = ++clipSession;
    if (!queue.length) {
      queue = GAMES.filter(game => game.video !== false);
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }
      if (queue.length > 1 && queue[queue.length - 1].id === current?.id) {
        [queue[0], queue[queue.length - 1]] = [queue[queue.length - 1], queue[0]];
      }
    }
    current = queue.pop();
    if (!current) return stop();
    const logo = overlay.querySelector('.attract-logo');
    if (current.logo) logo.src = current.logo;
    else logo.removeAttribute('src');
    overlay.dataset.logo = current.logo ? 'true' : 'false';
    overlay.querySelector('.attract-still').src = current.snap;
    overlay.querySelector('.attract-title').textContent = current.title;
    overlay.querySelector('.attract-players').textContent = current.players === 1 ? '1 PLAYER' : `1–${current.players} PLAYERS`;
    const skip = () => {
      if (!active || session !== clipSession) return;
      if (++failures >= GAMES.length) stop();
      else next();
    };
    video.onplaying = () => {
      if (session !== clipSession) return;
      clearTimeout(loadTimer);
      failures = 0;
      loadTimer = setTimeout(skip, (Number.isFinite(video.duration) ? video.duration + 10 : 120) * 1000);
    };
    video.onerror = skip;
    video.onended = () => {
      if (active && session === clipSession) next();
    };
    video.muted = true;
    video.src = window.rycadeCab?.clip(current) || current.video || `/videos/${current.id}.mp4`;
    loadTimer = setTimeout(skip, 12000);
    video.play().catch(skip);
  }

  function input(event) {
    const key = event.code || event.key;
    if (event.type === 'keyup' && swallowedKeys.delete(key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      reset();
      return;
    }
    if (event.type === 'keydown' && swallowedKeys.has(key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      reset();
      return;
    }
    const pointer = ['pointerdown', 'pointerup', 'click'].includes(event.type);
    if (active || (pointer && swallowPointer)) {
      if (active && (event.type === 'pointermove' || event.type === 'touchstart')) swallowPointer = true;
      if (event.type === 'keydown') swallowedKeys.add(key);
      if (event.type === 'pointerdown') swallowPointer = true;
      if (event.type === 'click') swallowPointer = false;
      event.preventDefault();
      event.stopImmediatePropagation();
      activity(event.type === 'keydown' && event.key === CABINET_KEYS.start);
    } else {
      reset();
      if (event.type === 'pointerdown') swallowPointer = false;
    }
  }

  ['keydown', 'keyup', 'pointerdown', 'pointerup', 'pointermove', 'click', 'wheel', 'touchstart'].forEach(type => {
    window.addEventListener(type, input, { capture: true, passive: false });
  });

  function init() {
    setInterval(() => {
      const pads = navigator.getGamepads?.() || [];
      for (const pad of pads) {
        if (!pad) continue;
        if (pad.buttons.some(button => button.pressed) || pad.axes.some(axis => Math.abs(axis) > .35)) {
          activity(Boolean(pad.buttons[9]?.pressed));
        }
      }
      const blocked = settingsOpen || searchOpen || demoGame || launched || bootOpen || document.hidden || window.rycadeCab?.asleep;
      if (blocked) return reset();
      const minutes = settings.attractMinutes;
      if (!active && minutes > 0 && performance.now() - lastInput >= minutes * 60000) {
        release();
        active = true;
        failures = 0;
        overlay.hidden = false;
        next();
      }
    }, 100);
  }

  window.rycadeAttract = { init, reset, activity };
})();
