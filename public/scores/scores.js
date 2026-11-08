(function () {
  const STYLES = ['marquee', 'flyer', 'phosphor'];
  const style = new URLSearchParams(location.search).get('style');
  if (STYLES.includes(style)) document.body.dataset.style = style;

  const byId = new Map(GAMES.map(game => [game.id, game]));
  const RANKS = ['1ST', '2ND', '3RD'];
  const rank = i => RANKS[i] || `${i + 1}TH`;
  const date = at => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const status = document.getElementById('scores-status');
  const boards = document.getElementById('boards');

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function board(id, rows) {
    const game = byId.get(id);
    const card = el('article', 'board');
    card.style.setProperty('--accent', game.color);
    const head = el('header', 'board-head');
    const logo = el('img', 'board-logo');
    logo.src = '/' + game.logo;
    logo.alt = game.title;
    head.append(logo, el('h2', 'board-title', game.title), el('span', 'board-meta', `${game.pub} · ${game.year}`));
    const list = el('ol', 'board-rows');
    rows.forEach((row, i) => {
      const item = el('li', 'row');
      item.append(el('span', 'rank', rank(i)), el('span', 'score', row.score.toLocaleString('en-US')), el('span', 'name', row.initials), el('time', 'when', date(row.at)));
      list.append(item);
    });
    card.append(head, list);
    return card;
  }

  fetch('/api/scores')
    .then(response => response.json())
    .then(({ games = {} }) => {
      const ids = Object.keys(games).filter(id => byId.has(id))
        .sort((a, b) => Math.max(...games[b].map(r => r.at)) - Math.max(...games[a].map(r => r.at)));
      boards.replaceChildren(...ids.map(id => board(id, games[id])));
      status.textContent = ids.length ? '' : 'NO SCORES YET. GO PLAY.';
      status.hidden = !!ids.length;
    })
    .catch(() => { status.textContent = 'SCOREBOARD OFFLINE'; });
})();
