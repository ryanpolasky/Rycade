(() => {
  if (!new URLSearchParams(location.search).has('cab')) return;
  document.head.insertAdjacentHTML('beforeend', '<style>*, ::before, ::after { cursor: none !important; }</style>');
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
    ready,
    sleep: () => fetch('/power/sleep', { method: 'POST' }).catch(() => {}),
    clip: game => clips.get(clipUrl(game))
  };
  window.rycadeCab = cab;

  let booted = false, known = false;

  function sleep() {
    window.rycadePlay?.exit();
    cab.asleep = true;
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
  let liveHold = null, healTimer = null;

  function heal(delay) {
    clearTimeout(healTimer);
    healTimer = setTimeout(() => {
      if (!cab.asleep && !inGame() && !fullscreen()) kiosk('?restart&auto');
    }, delay);
  }

  function resetKiosk() {
    window.rycadeFeatures?.closeOverlays();
    if (typeof closeDemo === 'function') closeDemo();
    window.rycadeAudio?.play('toggle');
    kiosk(fullscreen() ? '' : '?restart');
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

  const power = new EventSource('/power/events');
  power.onmessage = event => {
    known = true;
    if (event.data === 'sleep') sleep();
    else if (event.data === 'wake') wake();
    boot();
  };
  addEventListener('load', () => {
    known ? boot() : setTimeout(boot, 3000);
    heal(10000);
  }, { once: true });
})();
