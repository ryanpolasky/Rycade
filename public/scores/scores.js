(function () {
  const STYLES = ['attract', 'select'];
  const style = new URLSearchParams(location.search).get('style');
  if (STYLES.includes(style)) document.body.dataset.style = style;
  const attract = document.body.dataset.style === 'attract';

  const PX = '"Press Start 2P", monospace';
  const PALETTE = ['#fff6a8', '#ffe14a', '#ffc21a', '#ff9a1f', '#ff6a1f', '#ff9a1f', '#ffc21a', '#ffe14a'];
  const ROW_COLORS = ['#ffe14a', '#ff2f45', '#3f7bff', '#2fdc6a', '#ff9a1f', '#e14aff', '#4af2ff', '#ffffff', '#ffffff', '#ffffff'];
  const CYCLE = 9000;
  const byId = new Map(GAMES.map(game => [game.id, game]));
  const $ = id => document.getElementById(id);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const ordinal = i => ['1ST', '2ND', '3RD'][i] || `${i + 1}TH`;

  function tinted(source, color) {
    const out = document.createElement('canvas');
    out.width = source.width;
    out.height = source.height;
    const g = out.getContext('2d');
    g.drawImage(source, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, out.width, out.height);
    return out;
  }

  async function logo() {
    await document.fonts?.load(`32px ${PX}`).catch(() => {});
    const canvas = $('logo');
    const g = canvas.getContext('2d');
    const mask = document.createElement('canvas');
    mask.width = 200;
    mask.height = 40;
    const mg = mask.getContext('2d');
    mg.font = `32px ${PX}`;
    mg.textBaseline = 'top';
    mg.fillStyle = '#fff';
    mg.fillText('RYCADE', 0, 4);
    const red = tinted(mask, '#e8213a');
    const blue = tinted(mask, '#2a4cff');
    const face = document.createElement('canvas');
    face.width = 200;
    face.height = 40;
    const fg = face.getContext('2d');
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = t => {
      const shift = Math.floor(t / 125);
      fg.globalCompositeOperation = 'source-over';
      for (let row = 0; row < 40; row += 2) {
        fg.fillStyle = PALETTE[(row / 2 + shift) % PALETTE.length];
        fg.fillRect(0, row, 200, 2);
      }
      fg.globalCompositeOperation = 'destination-in';
      fg.drawImage(mask, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.drawImage(blue, 4, 4);
      g.drawImage(red, 2, 2);
      g.drawImage(face, 0, 0);
      if (!still) requestAnimationFrame(draw);
    };
    draw(0);
  }

  let boards = {};
  let ids = [];
  let index = 0;
  let timer = null;

  function table(id) {
    const game = byId.get(id);
    const rows = boards[id] || [];
    const board = $('board');
    board.style.setProperty('--accent', game.color);
    const head = el('header', 'board-head');
    const art = el('img', 'board-logo');
    art.src = '/' + game.logo;
    art.alt = game.title;
    head.append(art, el('h1', 'board-title', game.title.toUpperCase()), el('p', 'board-meta', `${game.pub.toUpperCase()} ${game.year}`));
    const list = el('ol', 'rows');
    if (rows.length) {
      list.append(Object.assign(el('li', 'row row-head'), { ariaHidden: 'true' }));
      list.lastChild.append(el('span', 'rank', 'RANK'), el('span', 'score', 'SCORE'), el('span', 'name', 'NAME'));
      rows.forEach((row, i) => {
        const item = el('li', 'row');
        item.style.color = ROW_COLORS[i];
        item.title = new Date(row.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        item.append(el('span', 'rank', ordinal(i)), el('span', 'score', String(row.score)), el('span', 'name', row.initials));
        list.append(item);
      });
    } else {
      list.append(el('li', 'empty', 'NO SCORES YET'), el('li', 'empty blink', 'BE THE FIRST'));
    }
    board.replaceChildren(head, list);
    board.classList.remove('flip');
    void board.offsetWidth;
    board.classList.add('flip');
  }

  function show(next, { user = false } = {}) {
    if (!ids.length) return;
    index = (next + ids.length) % ids.length;
    const id = ids[index];
    table(id);
    history.replaceState(null, '', '#' + id);
    document.querySelectorAll('[data-game]').forEach(node => {
      const on = node.dataset.game === id;
      node.classList.toggle('on', on);
      node.setAttribute('aria-selected', on);
      if (on && user) node.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    });
    $('hint').textContent = `◀ ${index + 1}/${ids.length} ▶`;
    clearTimeout(timer);
    if (attract) timer = setTimeout(() => show(index + 1), user ? CYCLE * 3 : CYCLE);
  }

  function build() {
    const menu = $('menu');
    const panel = $('panel');
    menu.replaceChildren();
    panel.replaceChildren();
    ids.forEach((id, i) => {
      const game = byId.get(id);
      const item = el('button', 'menu-item', game.title.toUpperCase());
      const tile = el('button', 'tile');
      const art = el('img');
      art.src = '/' + game.logo;
      art.alt = game.title;
      tile.append(art);
      for (const node of [item, tile]) {
        node.type = 'button';
        node.dataset.game = id;
        node.setAttribute('role', 'option');
        node.addEventListener('click', () => show(i, { user: true }));
      }
      tile.style.setProperty('--accent', game.color);
      menu.append(item);
      panel.append(tile);
    });
  }

  addEventListener('keydown', event => {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    if (!step || event.altKey || event.metaKey) return;
    event.preventDefault();
    show(index + step, { user: true });
  });
  let touch = null;
  $('crt').addEventListener('touchstart', event => { touch = event.touches[0].clientX; }, { passive: true });
  $('crt').addEventListener('touchend', event => {
    const dx = event.changedTouches[0].clientX - touch;
    if (Math.abs(dx) > 40) show(index + (dx < 0 ? 1 : -1), { user: true });
  });

  logo();
  fetch('/api/scores')
    .then(response => response.json())
    .then(({ games = {} }) => {
      boards = games;
      const latest = id => Math.max(0, ...(games[id] || []).map(row => row.at));
      const supported = Object.keys(globalThis.rycadeDecoders || {});
      ids = [...new Set([...Object.keys(games), ...supported])].filter(id => byId.has(id))
        .sort((a, b) => latest(b) - latest(a));
      build();
      const start = ids.indexOf(location.hash.slice(1));
      show(start < 0 ? 0 : start);
    })
    .catch(() => {
      $('board').replaceChildren(el('p', 'empty', 'SCOREBOARD OFFLINE'));
    });
})();
