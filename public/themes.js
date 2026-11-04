const THEME_IDS = new Map([
  ['Lightbox', 'lightbox'],
  ['Rycade TV', 'rycade-tv'],
  ['Neo Gold', 'neo-gold'],
  ['Vector Phosphor', 'vector-phosphor']
]);

function applyRycadeTheme(label) {
  const id = THEME_IDS.get(label) || 'lightbox';
  document.body.dataset.theme = id;
  document.dispatchEvent(new CustomEvent('rycade-theme-change'));
}

function layout(index, game, games) {
  const theme = document.body.dataset.theme || 'lightbox';
  const list = document.querySelector('#list');
  const rows = [...list.children];
  rows.forEach((row, rowIndex) => {
    const item = games[rowIndex];
    row.replaceChildren();
    if (theme === 'rycade-tv') {
      const channel = document.createElement('span');
      channel.className = 'tv-row-channel';
      channel.textContent = `CH ${String(rowIndex + 1).padStart(2, '0')}`;
      const title = document.createElement('strong');
      title.textContent = item.title;
      const system = document.createElement('span');
      system.className = 'tv-row-system';
      system.textContent = item.sys;
      const players = document.createElement('span');
      players.className = 'tv-row-players';
      players.textContent = `${item.players}P`;
      row.append(channel, title, system, players);
    } else if (theme === 'neo-gold') {
      const logo = document.createElement('img');
      logo.src = item.box;
      logo.alt = '';
      const title = document.createElement('strong');
      title.textContent = item.title;
      const system = document.createElement('span');
      system.textContent = `${item.sys} · ${item.year}`;
      row.append(logo, title, system);
    } else if (theme === 'vector-phosphor') {
      const number = document.createElement('span');
      number.className = 'vector-row-number';
      number.textContent = String(rowIndex + 1).padStart(2, '0');
      const title = document.createElement('strong');
      title.textContent = item.title;
      row.append(number, title);
    } else {
      row.textContent = item.title;
    }
  });

  const surface = document.querySelector('#theme-layout');
  surface.replaceChildren();
  if (theme === 'rycade-tv') {
    const input = document.createElement('div');
    input.className = 'tv-input';
    input.innerHTML = '<b>INPUT</b><span>ALL</span><span>ARCADE</span><span>GENESIS</span><span>SNES</span><span>NES</span>';
    const channel = document.createElement('div');
    channel.className = 'tv-channel';
    channel.innerHTML = `<small>CHANNEL</small><strong>${String(index + 1).padStart(2, '0')}</strong>`;
    const guide = document.createElement('div');
    guide.className = 'tv-guide-title';
    guide.innerHTML = '<strong>RYCADE CABLE GUIDE</strong><span>LOCAL ARCADE NETWORK · 24 HOUR PLAY</span>';
    const now = document.createElement('div');
    now.className = 'tv-now';
    const title = document.createElement('strong');
    title.textContent = game.title.toUpperCase();
    const info = document.createElement('span');
    info.textContent = `${game.sys} · ${game.year} · ${game.players} PLAYER`;
    now.append(title, info);
    surface.append(input, channel, guide, now);
  } else if (theme === 'neo-gold') {
    const header = document.createElement('div');
    header.className = 'neo-hardware';
    header.innerHTML = '<span>MVS · GAME SELECT</span><b>INSERT COIN</b><span>1P 00</span>';
    const score = document.createElement('div');
    score.className = 'neo-score';
    score.textContent = `PLAYER 1   000000   ·   ${game.sys}   ·   ${game.year}`;
    surface.append(header, score);
  } else if (theme === 'vector-phosphor') {
    const ship = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ship.classList.add('vector-ship');
    ship.setAttribute('viewBox', '0 0 40 40');
    ship.innerHTML = '<path d="M20 3 6 35 20 28 34 35 20 3Z M16 28h8" fill="none" stroke="currentColor" stroke-width="1.5"/>';
    surface.append(ship);
  }

  if (theme === 'vector-phosphor') {
    const ship = surface.querySelector('.vector-ship');
    const row = rows[index];
    if (ship && row) {
      const stageTop = document.querySelector('#stage').getBoundingClientRect().top;
      ship.style.transform = `translateY(${row.getBoundingClientRect().top - stageTop + row.offsetHeight / 2 - 20}px)`;
    }
  }
}
