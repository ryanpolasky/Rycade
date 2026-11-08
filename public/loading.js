(() => {
  const STYLES = ['Credit', 'Channel', 'Self Test', 'Demo'];
  const TESTS = ['PROGRAM ROM', 'GRAPHICS ROM', 'SOUND ROM', 'WORK RAM', 'CONTROLS', 'START UP'];
  const BLOCKS = 16;
  const MIN_MS = 900;
  const root = document.querySelector('#loading-screen');
  let raf = 0;
  let shownAt = 0;
  let last = 0;
  let value = 0;
  let boot = null;
  let fake = 0;
  let finishing = null;
  let tick = 0;

  const esc = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const players = game => game.players === 1 ? '1 PLAYER' : `1-${game.players} PLAYERS`;
  const channel = game => String(Math.max(0, GAMES.indexOf(game)) % 97 + 2).padStart(2, '0');
  const blocks = () => `<div class="ld-blocks">${'<i></i>'.repeat(BLOCKS)}</div>`;
  const logo = game => game.logo
    ? `<img class="ld-logo" src="${esc(game.logo)}" alt="">`
    : `<div class="ld-logo ld-name">${esc(game.title)}</div>`;

  function markup(game, style) {
    if (style === 'Channel') {
      return `<canvas class="ld-snow" width="160" height="120"></canvas>
        <div class="ld-osd">CH ${channel(game)}<small>${esc(game.title)}</small></div>
        <div class="ld-tune"><span>TUNING</span>${blocks()}</div>`;
    }
    if (style === 'Self Test') {
      return `<div class="ld-test"><h2>RYCADE SELF TEST / ${esc(game.id.toUpperCase())}</h2>
        ${TESTS.map(test => `<p><b>${test}</b><span></span></p>`).join('')}</div>
        <div class="ld-bars">${'<i></i>'.repeat(8)}</div>`;
    }
    if (style === 'Demo') {
      return `<img class="ld-video" src="${esc(game.snap || '')}" alt="">
        <div class="ld-band">${logo(game)}<div class="ld-progress">${blocks()}<p><b>WARMING UP</b><span>${players(game)}</span></p></div></div>`;
    }
    return `<div class="ld-credit">CREDIT 0<span>1</span></div>${logo(game)}
      <div class="ld-players">${players(game)}</div>
      <div class="ld-ready">GET READY</div>
      <div class="ld-copy">(C) ${game.year} ${esc(game.pub.toUpperCase())}</div>`;
  }

  function snow(canvas) {
    const context = canvas.getContext('2d');
    const image = context.createImageData(canvas.width, canvas.height);
    const data = new Uint32Array(image.data.buffer);
    for (let i = 0; i < data.length; i++) {
      const g = Math.random() * 210 | 0;
      data[i] = 0xff000000 | g << 16 | g << 8 | g;
    }
    context.putImageData(image, 0, 0);
  }

  function draw(stage, progress, done) {
    const lit = Math.round(progress * BLOCKS);
    stage.querySelectorAll('.ld-blocks i').forEach((block, index) => block.classList.toggle('on', index < lit));
    const rows = [...stage.querySelectorAll('.ld-test p')];
    let current = rows.findIndex((_, index) => index === rows.length - 1 ? !done : progress < (index + 1) / (rows.length - 1));
    rows.forEach((row, index) => {
      const state = current === -1 || index < current ? 'ok' : index === current ? 'wait' : '';
      row.className = state;
      row.querySelector('span').textContent = state === 'ok' ? 'OK' : state === 'wait' ? 'TESTING' : '';
    });
  }

  function build(target, game, style, still) {
    target.innerHTML = `<div class="ld-stage" style="--ld-acc:${esc(game.color || '#f04a3a')}" data-style="${STYLES.includes(style) ? style.replace(' ', '-').toLowerCase() : 'credit'}">${markup(game, STYLES.includes(style) ? style : 'Credit')}</div>`;
    const stage = target.firstElementChild;
    const canvas = stage.querySelector('.ld-snow');
    if (canvas) snow(canvas);
    if (still) return stage;
    const poster = stage.querySelector('.ld-video');
    if (poster) {
      const video = document.createElement('video');
      video.className = 'ld-video';
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.poster = game.snap || '';
      video.src = window.rycadeCab?.clip(game) || game.video || `/videos/${game.id}.mp4`;
      video.addEventListener('error', () => video.replaceWith(poster), { once: true });
      poster.replaceWith(video);
      video.play().catch(() => {});
    }
    return stage;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(100, now - last);
    last = now;
    const elapsed = now - shownAt;
    let target = boot === null ? .4 * (1 - Math.exp(-elapsed / 2500)) : .4 + .6 * boot;
    if (fake) target = Math.min(1, elapsed / fake);
    if (finishing) target = 1;
    value += (target - value) * Math.min(1, dt / (finishing ? 60 : 180));
    if (finishing && target - value < .004) value = 1;
    const stage = root.firstElementChild;
    if (!stage) return;
    draw(stage, value, finishing && value === 1);
    const canvas = stage.querySelector('.ld-snow');
    if (canvas && ++tick % 2) snow(canvas);
    const credit = stage.querySelector('.ld-credit span');
    if (credit) credit.textContent = elapsed > 450 ? '1' : '0';
    if (finishing && value === 1 && elapsed >= MIN_MS) {
      const resolve = finishing;
      finishing = null;
      resolve();
    }
  }

  function fit() {
    root.style.setProperty('--ld-scale', Math.min(root.clientWidth / 1280, root.clientHeight / 960) || 1);
  }

  function show(game, style, options = {}) {
    cancelAnimationFrame(raf);
    const crt = document.querySelector('.crt');
    root.classList.toggle('own-scanlines', !crt || getComputedStyle(crt).display === 'none');
    build(root, game, style);
    root.hidden = false;
    root.classList.add('visible');
    fit();
    value = 0;
    boot = null;
    fake = options.fake || 0;
    finishing?.();
    finishing = null;
    shownAt = last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function hide() {
    cancelAnimationFrame(raf);
    raf = 0;
    finishing?.();
    finishing = null;
    root.classList.remove('visible');
    root.hidden = true;
    root.replaceChildren();
  }

  function thumb(target, game, style) {
    const stage = build(target, game, style, true);
    draw(stage, .6, false);
  }

  window.rycadeLoading = {
    STYLES,
    show,
    hide,
    thumb,
    active: () => !root.hidden,
    boot: progress => { boot = Math.max(boot ?? 0, Math.min(1, progress)); },
    finish: () => root.hidden ? Promise.resolve() : new Promise(resolve => {
      finishing?.();
      finishing = resolve;
      setTimeout(() => finishing === resolve && (finishing = null, resolve()), 2500);
    })
  };

  window.addEventListener('resize', () => root.hidden || fit());
})();
