(() => {
  const CARD = 176;
  const COUNT = 64;
  const WIN_AT = 54;
  const SPIN_MS = 6800;
  const WIDTH = 1280;
  const stage = document.querySelector('#stage');
  const root = document.createElement('section');
  root.id = 'roulette';
  root.className = 'roulette';
  root.hidden = true;
  root.setAttribute('aria-label', 'Random game');
  root.innerHTML = '<p class="roulette-sub"></p><div class="roulette-window"><div class="roulette-strip"></div><i class="roulette-marker"></i></div><div class="roulette-result" aria-live="polite"></div>';
  stage.append(root);
  const sub = root.querySelector('.roulette-sub');
  const strip = root.querySelector('.roulette-strip');
  const result = root.querySelector('.roulette-result');
  let run = null;
  const clock = () => (window.__rouletteClock ? window.__rouletteClock() : performance.now());
  const sound = (name, options) => window.rycadeAudio?.play(name, options);
  const esc = text => String(text).replace(/[&<>"]/g, char => `&#${char.charCodeAt(0)};`);
  const pick = games => games[Math.floor(Math.random() * games.length)];
  const ease = t => 1 - Math.pow(1 - t, 4.2);

  function card(game) {
    const item = document.createElement('div');
    item.className = 'roulette-card';
    item.innerHTML = `<img src="${game.box}" alt="">`;
    return item;
  }

  function spin() {
    const { games } = run;
    const winner = pick(games);
    const reel = Array.from({ length: COUNT }, (_, slot) => slot === WIN_AT ? winner : pick(games));
    strip.replaceChildren(...reel.map(card));
    root.classList.remove('landed');
    result.innerHTML = '';
    const jitter = (Math.random() - .5) * CARD * .8;
    run.from = WIDTH / 2 - (3 * CARD + CARD / 2);
    run.to = WIDTH / 2 - (WIN_AT * CARD + CARD / 2 + jitter);
    run.winner = winner;
    run.start = clock();
    run.duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : SPIN_MS;
    run.lastSlot = -1;
    run.lastTick = 0;
    run.spinning = true;
    sound('open');
    frame();
  }

  function frame() {
    if (!run || !run.spinning) return;
    const now = clock();
    const t = run.duration ? Math.min(1, (now - run.start) / run.duration) : 1;
    const x = run.from + (run.to - run.from) * ease(t);
    strip.style.transform = `translate3d(${x}px, 0, 0)`;
    const slot = Math.floor((WIDTH / 2 - x) / CARD);
    if (slot !== run.lastSlot && now - run.lastTick > 28) {
      run.lastSlot = slot;
      run.lastTick = now;
      sound('move', { pitchMultiplier: 1 + .25 * (1 - t) });
    }
    if (t < 1) run.raf = requestAnimationFrame(frame);
    else land();
  }

  function land() {
    run.spinning = false;
    const { winner } = run;
    strip.children[WIN_AT].classList.add('win');
    root.classList.add('landed');
    result.innerHTML = `<div class="roulette-name">${esc(winner.title)}</div><div class="roulette-meta">${esc(winner.sys)} · ${esc(winner.year)} · ${esc(winner.players)}P</div><div class="roulette-keys"><span><b>START</b> PLAY</span><span><b>TURBO</b> SPIN AGAIN</span><span><b>PASS</b> BACK</span></div>`;
    sound('confirm');
    run.onLand?.(winner);
  }

  function open({ games, label, onLand, onPlay, onClose }) {
    if (!games.length) return false;
    run = { games, onLand, onPlay, onClose };
    sub.textContent = `${label} · ${games.length} GAME${games.length === 1 ? '' : 'S'}`;
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add('visible'));
    spin();
    return true;
  }

  function close(play) {
    if (!run) return;
    cancelAnimationFrame(run.raf);
    const { onPlay, onClose } = run;
    run = null;
    root.classList.remove('visible', 'landed');
    root.hidden = true;
    strip.replaceChildren();
    if (play) onPlay?.();
    else {
      sound('back');
      onClose?.();
    }
  }

  window.addEventListener('keydown', event => {
    if (!run) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.rycadeAttract?.reset();
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === 'escape' || key === 'f19' || key === '2') close(false);
    else if (run.spinning) return;
    else if (key === 'enter' || key === '1') close(true);
    else if (key === '3' || key === 'r') spin();
  }, true);

  window.rycadeRoulette = { open, active: () => !!run, tick: frame };
})();
