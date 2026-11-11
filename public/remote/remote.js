const CODE_STORAGE = 'rycade.remote.code';
const CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const codeInput = document.querySelector('#cab-code');
const searchInput = document.querySelector('#remote-search');
const results = document.querySelector('#remote-results');
const status = document.querySelector('#remote-status');
const params = new URLSearchParams(location.search);

function normalizeCode(value) {
  return value.toUpperCase().replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g, '').slice(0, 6);
}

function savedCode() {
  try {
    return localStorage.getItem(CODE_STORAGE) || '';
  } catch {
    return '';
  }
}

function setStatus(message, success = false) {
  status.textContent = message;
  status.classList.toggle('success', success);
}

function normalizeSearch(value) {
  const spaced = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const withAnd = value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  return {
    spaced,
    withAnd,
    compact: spaced.replace(/ /g, ''),
    sortKey: spaced.replace(/^the /, '')
  };
}

function matchesSearch(game, rawQuery) {
  if (!rawQuery.trim()) return true;
  const query = normalizeSearch(rawQuery);
  if (!query.compact) return false;
  const title = normalizeSearch(game.title);
  const sys = game.sys.toLowerCase();
  return title.spaced.includes(query.spaced) ||
    title.withAnd.includes(query.withAnd) ||
    title.sortKey.includes(query.sortKey || query.spaced) ||
    title.compact.includes(query.compact) ||
    sys.includes(query.spaced);
}

function renderGames() {
  const rawQuery = searchInput.value;
  const matches = GAMES
    .filter(game => matchesSearch(game, rawQuery))
    .sort((a, b) => normalizeSearch(a.title).sortKey.localeCompare(normalizeSearch(b.title).sortKey));
  results.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement('div');
    empty.className = 'remote-empty';
    empty.textContent = 'NO MATCHING GAMES';
    results.append(empty);
    return;
  }
  matches.forEach(game => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'remote-game';
    button.innerHTML = `<img src="/${game.box}" alt="" loading="lazy" decoding="async"><span class="game-copy"><strong></strong><small></small></span><span class="send-mark" aria-hidden="true">›</span>`;
    button.querySelector('strong').textContent = game.title;
    button.querySelector('small').textContent = game.sys;
    button.addEventListener('click', () => sendGame(game));
    results.append(button);
  });
}

async function sendGame(game) {
  const code = normalizeCode(codeInput.value);
  if (!CODE_PATTERN.test(code)) {
    setStatus('ENTER A VALID SIX-CHARACTER CAB CODE');
    codeInput.focus();
    return;
  }
  try {
    localStorage.setItem(CODE_STORAGE, code);
  } catch {}
  setStatus('SENDING TO CAB…');
  try {
    const response = await fetch('/api/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, gameId: game.id })
    });
    const result = await response.json();
    if (response.ok && result.ok && result.delivered > 0) {
      setStatus('Sent to cab ✓', true);
    } else {
      setStatus('Cab not connected');
    }
  } catch {
    setStatus('Cab not connected');
  }
}

const initialCode = normalizeCode(params.get('code') || savedCode());
codeInput.value = initialCode;
if (initialCode) {
  try {
    localStorage.setItem(CODE_STORAGE, initialCode);
  } catch {}
}
codeInput.addEventListener('input', () => {
  const code = normalizeCode(codeInput.value);
  codeInput.value = code;
  try {
    localStorage.setItem(CODE_STORAGE, code);
  } catch {}
});
searchInput.addEventListener('input', renderGames);
renderGames();
