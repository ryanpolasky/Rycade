(() => {
  if (!new URLSearchParams(location.search).has('cab')) return;
  document.documentElement.style.cursor = 'none';
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
    ...['smw', 'dkc', 'smetroid', 'alttp', 'sbomber', 'contra3', 'tmnt4'].map(id => `art/con_${id}_Portrait.png`),
    'boot/lights_screens.png', 'boot/boot_coin.gif', 'boot/boot_lights.gif', 'boot/boot_crt.gif'
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
    if (typeof closeDemo === 'function') closeDemo();
  }

  function wake() {
    if (!cab.asleep) return;
    cab.asleep = false;
    booted = true;
    window.rycadeFeatures?.playBoot();
  }

  function boot() {
    if (booted || document.readyState !== 'complete') return;
    booted = true;
    if (!cab.asleep) window.rycadeFeatures?.playBoot();
  }

  const power = new EventSource('/power/events');
  power.onmessage = event => {
    known = true;
    if (event.data === 'sleep') sleep();
    else if (event.data === 'wake') wake();
    boot();
  };
  addEventListener('load', () => known ? boot() : setTimeout(boot, 3000), { once: true });
})();
