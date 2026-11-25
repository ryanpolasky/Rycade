(() => {
  if (!new URLSearchParams(location.search).has('cab')) return;
  const VOLUME_KEY = 'rycade.cabVolume';
  const Volume = window.rycadeVolume;
  let initialVolumeLevel = 10;
  try { initialVolumeLevel = Volume.parseCabLevel(localStorage.getItem(VOLUME_KEY)); } catch {}
  const pinned = [];
  const clips = new Map();
  const clipUrl = game => game.video || `/videos/${game.id}.mp4`;

  async function pin(src) {
    const image = new Image();
    image.src = src;
    try {
      await image.decode();
      pinned.push(image);
    } catch {}
  }

  async function hold(url) {
    try {
      const response = await fetch(url);
      if (response.ok) clips.set(url, URL.createObjectURL(await response.blob()));
    } catch {}
  }

  async function pool(items, size, work) {
    const queue = [...new Set(items)];
    await Promise.all(Array.from({ length: size }, async () => {
      while (queue.length) await work(queue.shift());
    }));
  }

  const art = [
    ...GAMES.flatMap(game => [game.box, game.logo, game.snap]),
    'boot/lights_screens.png'
  ].filter(Boolean);
  const ready = pool(art, 6, pin).then(() => pool(GAMES.map(clipUrl), 4, hold));

  const cab = {
    asleep: false,
    volume: Volume.cabFactor(initialVolumeLevel),
    ready,
    sleep: () => fetch('/power/sleep', { method: 'POST' }).catch(() => {}),
    clip: game => clips.get(clipUrl(game))
  };
  window.rycadeCab = cab;

  let booted = false, known = false;

  function sleep() {
    window.rycadePlay?.exit();
    cab.asleep = true;
    volumeBar.classList.remove('visible');
    window.rycadeAttract?.activity();
    window.rycadeFeatures?.closeBoot();
    window.rycadeFeatures?.closeOverlays();
    window.rycadeRoulette?.close();
    if (typeof closeDemo === 'function') closeDemo();
  }

  function wake() {
    if (!cab.asleep) return;
    cab.asleep = false;
    booted = true;
    window.rycadeFeatures?.playBoot();
    heal(4000);
  }

  function boot() {
    if (booted || document.readyState !== 'complete') return;
    booted = true;
    if (!cab.asleep) window.rycadeFeatures?.playBoot();
  }

  const fullscreen = () => innerWidth >= screen.width && innerHeight >= screen.height;
  const inGame = () => typeof launched !== 'undefined' && launched;
  const kiosk = query => fetch(`/power/kiosk${query}`, { method: 'POST' }).catch(() => {});
  let healTimer = null, liveHold = null, lastReset = 0;

  async function restartKiosk(query) {
    if (typeof exiting !== 'undefined') await exiting;
    if (!cab.asleep && !inGame() && !fullscreen()) kiosk(query);
  }

  function heal(delay) {
    clearTimeout(healTimer);
    healTimer = setTimeout(() => restartKiosk('?restart&auto'), delay);
  }

  function resetKiosk() {
    if (inGame() || Date.now() - lastReset < 3000) return;
    lastReset = Date.now();
    window.rycadeFeatures?.closeOverlays();
    if (typeof closeDemo === 'function') closeDemo();
    window.rycadeAudio?.play('toggle');
    restartKiosk('?restart');
  }

  addEventListener('keydown', event => {
    if (event.key !== 'F19' || event.repeat || cab.asleep || inGame()) return;
    clearTimeout(liveHold);
    liveHold = setTimeout(resetKiosk, 1500);
  }, true);
  addEventListener('keyup', event => {
    if (event.key === 'F19') clearTimeout(liveHold);
  }, true);
  addEventListener('blur', () => clearTimeout(liveHold));
  addEventListener('resize', () => heal(3000));

  const VOLUME_SPEAKER = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z"/><path class="wave" d="M11 5.5q2 2.5 0 5"/></svg>';

  function volumeElement(style, level) {
    const element = document.createElement('div');
    element.className = 'cab-volume';
    element.innerHTML = `${VOLUME_SPEAKER}<b>VOLUME</b><i></i><span></span><s><em></em></s>`;
    element.querySelector('span').append(...Array.from({ length: 10 }, (_, index) => {
      const tick = document.createElement('u');
      tick.style.setProperty('--i', index);
      return tick;
    }));
    paintVolume(element, style, level);
    return element;
  }

  function paintVolume(element, style, level) {
    element.dataset.style = String(style || 'Meter').toLowerCase();
    element.style.setProperty('--sp', getComputedStyle(document.querySelector('#stage') || document.body).getPropertyValue('--sp') || '#f3eee6');
    element.style.setProperty('--level', level / 10);
    element.querySelectorAll('u').forEach((tick, index) => tick.classList.toggle('on', index < level));
    element.querySelector('i').textContent = level ? String(level) : 'MUTE';
  }

  const volumeBar = volumeElement('Meter', 10);
  let volumeTimer = null;

  function showVolume(value) {
    paintVolume(volumeBar, window.rycadeFeatures?.settings.volumeStyle, Volume.parseCabLevel(value));
    if (!volumeBar.isConnected) document.body.append(volumeBar);
    volumeBar.classList.add('visible');
    clearTimeout(volumeTimer);
    volumeTimer = setTimeout(() => volumeBar.classList.remove('visible'), 1600);
  }

  cab.volumeThumb = style => volumeElement(style, 7);
  cab.previewVolume = () => showVolume(String(Math.round(cab.volume * 10)));

  function setVolumeLevel(value, show) {
    const level = Volume.parseCabLevel(value);
    cab.volume = Volume.cabFactor(level);
    try { localStorage.setItem(VOLUME_KEY, String(level)); } catch {}
    window.dispatchEvent(new CustomEvent('rycade-volume', { detail: cab.volume }));
    const message = { type: 'rycade-volume', volume: cab.volume };
    document.querySelectorAll('iframe').forEach(frame => {
      try { frame.contentWindow?.postMessage(message, location.origin); } catch {}
    });
    if (show && !cab.asleep) showVolume(level);
  }

  function connectPower() {
    const power = new EventSource('/power/events');
    power.onmessage = event => {
      if (event.data.startsWith('level:')) {
        setVolumeLevel(event.data.slice(6), false);
        return;
      }
      if (event.data.startsWith('volume:')) {
        setVolumeLevel(event.data.slice(7), true);
        return;
      }
      if (event.data === 'kiosk-reset') {
        if (!cab.asleep) resetKiosk();
        return;
      }
      known = true;
      if (event.data === 'sleep') sleep();
      else if (event.data === 'wake') wake();
      boot();
    };
    power.onerror = () => {
      if (power.readyState !== EventSource.CLOSED) return;
      power.close();
      setTimeout(connectPower, 2000);
    };
  }
  connectPower();
  addEventListener('load', () => {
    known ? boot() : setTimeout(boot, 3000);
    heal(10000);
  }, { once: true });
})();
