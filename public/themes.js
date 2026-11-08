const THEME_IDS = new Map([
  ['Cover Flow', 'cover-flow'],
  ['Shelf', 'shelf'],
  ['Studio', 'studio']
]);

const STUDIO_PORTRAITS = new Map(
  ['smw', 'dkc', 'smetroid', 'alttp', 'sbomber', 'contra3', 'tmnt4']
    .map(id => [id, `art/con_${id}_Portrait.png`])
);

const PALETTES = [
  { label: 'Classic', id: 'classic', colors: ['#ffd400', '#e4202a', '#6e070d'] },
  { label: 'Neon', id: 'neon', colors: ['#39f0ff', '#ff3fa4', '#5a0d3a'] },
  { label: 'Phosphor', id: 'phosphor', colors: ['#5cff7a', '#1f8a3a', '#0a3315'] },
  { label: 'Amber', id: 'amber', colors: ['#ffb000', '#d9480f', '#4a1a04'] },
  { label: 'Ice', id: 'ice', colors: ['#e8f2ff', '#2a6bff', '#0d2266'] },
  { label: 'Grape', id: 'grape', colors: ['#d6c2ff', '#7a3fe0', '#2a1052'] }
];

function applyRycadePalette(label) {
  document.body.dataset.palette = (PALETTES.find(palette => palette.label === label) || PALETTES[0]).id;
}

const THEME_DEFERS_DETAIL = new Set(['cover-flow', 'shelf']);
const THEME_SIDEWAYS = new Set(['cover-flow', 'shelf', 'studio']);
const CF_RANGE = 6;
const ARTWORK_PALETTES = new Map();
const SH_SPINE = 58;
const SH_GAP = 6;
const SH_FACE = 230;

function applyRycadeTheme(label) {
  const id = THEME_IDS.get(label) || 'cover-flow';
  document.body.dataset.theme = id;
  document.dispatchEvent(new CustomEvent('rycade-theme-change'));
}

function playersLabel(game) {
  return game.players > 1 ? `1-${game.players} PLAYERS` : '1 PLAYER';
}

function artworkLuminance(color) {
  const linear = color.map(channel => {
    const value = channel / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}

function readableArtworkPalette(primary, secondary) {
  primary = [...primary];
  secondary = [...secondary];
  while (artworkLuminance(primary) < .3) primary = primary.map(channel => channel + (255 - channel) * .08);
  while ((artworkLuminance(primary) + .05) / (artworkLuminance(secondary) + .05) < 4.5) {
    secondary = secondary.map(channel => channel * .85);
  }
  return [primary, secondary, secondary.map(channel => channel * .35)]
    .map(color => `rgb(${color.map(Math.round).join(', ')})`);
}

function extractArtworkPalette(image) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 48;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, 48, 48);
  const pixels = context.getImageData(0, 0, 48, 48).data;
  const buckets = new Map();
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const color = [...pixels.slice(offset, offset + 3)];
    const max = Math.max(...color);
    const min = Math.min(...color);
    if (pixels[offset + 3] < 128 || max < 32 || min > 235) continue;
    const key = color.map(channel => channel >> 5).join(',');
    const bucket = buckets.get(key) || { total: [0, 0, 0], count: 0 };
    bucket.total = bucket.total.map((channel, index) => channel + color[index]);
    bucket.count++;
    buckets.set(key, bucket);
  }
  const colors = [...buckets.values()].map(bucket => {
    const color = bucket.total.map(channel => channel / bucket.count);
    const saturation = (Math.max(...color) - Math.min(...color)) / Math.max(...color);
    return { color, score: bucket.count * (.25 + saturation) };
  }).sort((a, b) => b.score - a.score);
  if (!colors.length) return readableArtworkPalette([190, 190, 190], [70, 70, 70]);
  const primary = colors[0].color;
  const secondary = colors.find(candidate => Math.hypot(...candidate.color.map((channel, index) => channel - primary[index])) > 110);
  return readableArtworkPalette(primary, secondary?.color || primary);
}

function updateArtworkPalette(game, image) {
  const properties = ['--art-primary', '--art-secondary', '--art-dark'];
  if (!game) {
    properties.forEach(property => document.body.style.removeProperty(property));
    return;
  }
  const apply = palette => palette.forEach((color, index) => document.body.style.setProperty(properties[index], color));
  const cached = ARTWORK_PALETTES.get(game.box);
  apply(cached || readableArtworkPalette(game.spill, game.spill));
  if (cached || !image) return;
  const sample = () => {
    if (!image.naturalWidth) return;
    let palette;
    try {
      palette = extractArtworkPalette(image);
    } catch {
      palette = readableArtworkPalette(game.spill, game.spill);
    }
    ARTWORK_PALETTES.set(game.box, palette);
    if (document.body.dataset.theme === 'cover-flow' && document.querySelector('.cf-card.active')?.dataset.id === game.id) apply(palette);
  };
  if (image.complete) sample();
  else image.onload = sample;
}

function buildCoverFlow(surface) {
  surface.replaceChildren();
  const cf = document.createElement('div');
  cf.className = 'cf-carousel';
  cf.innerHTML = `
    <div class="cf-screen">
      <div class="cf-track"></div>
      <div class="cf-browse-meta">
        <h2 class="cf-stage-title"><span class="mq-txt"></span></h2>
        <p></p>
      </div>
    </div>
    <div class="cf-scrollbar">
      <span class="cf-count"></span>
      <div class="cf-rail"></div>
      <span class="cf-demo-hint">SHOOT DEMO</span>
      <span class="cf-coin">PRESS START</span>
    </div>
  `;
  surface.append(cf);
  return cf;
}

function syncCoverCards(cf, games) {
  const track = cf.querySelector('.cf-track');
  const key = games.map(game => game.id).join('|');
  if (track.dataset.key === key) return;
  track.dataset.key = key;
  track.replaceChildren(...games.map(item => {
    const card = document.createElement('div');
    card.className = 'cf-card';
    card.dataset.id = item.id;
    card.style.setProperty('--glow', `rgb(${item.spill.join(',')})`);
    card.innerHTML = `
      <div class="cf-sleeve">
        <img class="cf-art-blur" src="${item.box}" alt="">
        <img class="cf-art" src="${item.box}" alt="">
        <span class="cf-sys-pill">${item.sys}</span>
        <span class="cf-year">${item.year}</span>
        <span class="cf-fav">★</span>
      </div>
      <div class="cf-reflect"><img src="${item.box}" alt=""></div>
    `;
    card.addEventListener('click', event => {
      event.stopPropagation();
      document.querySelector(`#list .lr[data-index="${card.dataset.idx}"]`)?.click();
    });
    return card;
  }));
  const rail = cf.querySelector('.cf-rail');
  rail.replaceChildren(...games.map(() => document.createElement('i')));
}

function layout(index, game, games) {
  const theme = document.body.dataset.theme || 'cover-flow';
  const rows = [...document.querySelector('#list').children];
  rows.forEach((row, rowIndex) => {
    if (!row.textContent && games[rowIndex]) row.textContent = games[rowIndex].title;
  });

  const surface = document.querySelector('#theme-layout');
  surface.setAttribute('aria-hidden', String(theme !== 'studio'));
  if (theme === 'studio') {
    layoutStudio(surface, index, game, games);
    return;
  }
  if (theme === 'shelf') {
    layoutShelf(surface, index, game, games);
    return;
  }
  if (theme !== 'cover-flow') {
    surface.replaceChildren();
    return;
  }

  const cf = surface.querySelector('.cf-carousel') || buildCoverFlow(surface);
  syncCoverCards(cf, games);
  [...cf.querySelector('.cf-track').children].forEach((card, cardIndex) => {
    const offset = cardIndex - index;
    const abs = Math.abs(offset);
    card.dataset.idx = String(cardIndex);
    card.classList.toggle('fav', isFavorite(card.dataset.id));
    card.dataset.side = offset < 0 ? 'left' : offset > 0 ? 'right' : 'center';
    card.classList.toggle('active', offset === 0);
    card.classList.toggle('far', abs > CF_RANGE);
    card.style.setProperty('--off', String(Math.max(-CF_RANGE - 1, Math.min(CF_RANGE + 1, offset))));
    card.style.setProperty('--abs', String(Math.min(abs, CF_RANGE + 1)));
    card.style.zIndex = String(40 - Math.min(abs, 39));
  });
  updateArtworkPalette(game, cf.querySelector('.cf-card.active .cf-art'));

  const title = cf.querySelector('.cf-stage-title');
  title.classList.toggle('fav', Boolean(game && isFavorite(game.id)));
  title.querySelector('.mq-txt').textContent = game ? game.title : 'NO FAVORITES YET';
  cf.querySelector('.cf-browse-meta p').textContent = game
    ? `${game.pub.toUpperCase()} · ${game.sys} · ${game.year} · ${playersLabel(game)}`
    : 'PRESS F ON ANY GAME TO ADD IT HERE';
  cf.querySelector('.cf-count').textContent = `ROM ${String(index + 1).padStart(2, '0')}/${String(games.length).padStart(2, '0')}`;
  [...cf.querySelector('.cf-rail').children].forEach((pip, pipIndex) => {
    pip.className = pipIndex === index ? 'on' : pipIndex < index ? 'lit' : '';
  });
}

function layoutStudio(surface, index, game, games) {
  let wrap = surface.querySelector('.st-wrap');
  if (!wrap) {
    surface.replaceChildren();
    wrap = document.createElement('div');
    wrap.className = 'st-wrap';
    wrap.innerHTML = `
      <div class="st-heading">
        <h2></h2>
        <p class="st-meta"></p>
      </div>
      <div class="st-library-heading"><h3>Browse library</h3><span class="st-count"></span></div>
      <div class="st-gallery"><div class="st-track"></div></div>
      <div class="st-empty"><h3>No favorites yet</h3><p>Press PASS on a game to add it here.</p></div>
      <div class="st-footer"><span>HOLD &#8592; &#8594; to browse <b>SHOOT demo</b><b>START play</b></span></div>
    `;
    surface.append(wrap);
  }

  const track = wrap.querySelector('.st-track');
  const key = games.map(item => item.id).join('|');
  if (track.dataset.key !== key) {
    track.dataset.key = key;
    track.replaceChildren(...games.map((item, itemIndex) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'st-card';
      card.dataset.id = item.id;
      card.innerHTML = `
        <span class="st-art"><img src="${STUDIO_PORTRAITS.get(item.id) || item.box}" alt="" loading="lazy"><i aria-hidden="true">&#9829;</i></span>
        <strong></strong><small>${item.sys} / ${item.year}</small>
      `;
      card.querySelector('strong').textContent = item.title;
      card.setAttribute('aria-label', `Select ${item.title}`);
      card.addEventListener('click', event => {
        event.stopPropagation();
        document.querySelector(`#list .lr[data-index="${itemIndex}"]`)?.click();
      });
      return card;
    }));
  }
  const offset = Math.min(Math.max(0, index * 252 - 252), Math.max(0, games.length * 252 - 1172));
  track.style.transform = `translateX(${-offset}px)`;
  [...track.children].forEach((card, cardIndex) => {
    card.classList.toggle('active', cardIndex === index);
    card.classList.toggle('fav', isFavorite(card.dataset.id));
    card.setAttribute('aria-pressed', String(cardIndex === index));
    card.tabIndex = cardIndex === index ? 0 : -1;
  });
  wrap.querySelector('.st-heading h2').textContent = game ? game.title : 'Favorites';
  wrap.querySelector('.st-meta').textContent = game
    ? `${game.sys} / ${game.year} / ${game.pub} / ${game.players > 1 ? `1-${game.players} players` : '1 player'}`
    : '';
  wrap.querySelector('.st-count').textContent = games.length ? `${index + 1} of ${games.length} games` : '0 games';
}

function buildShelf(surface) {
  surface.replaceChildren();
  const wrap = document.createElement('div');
  wrap.className = 'sh-wrap';
  wrap.innerHTML = `
    <div class="sh-browse">
      <h2 class="sh-title"><span class="mq-txt"></span></h2>
      <p></p>
    </div>
    <div class="sh-shelf">
      <div class="sh-track"></div>
      <div class="sh-ledge">
        <span class="sh-count"></span>
        <span class="sh-demo-hint">SHOOT DEMO</span>
        <span class="sh-coin">PRESS START</span>
      </div>
    </div>
  `;
  surface.append(wrap);
  return wrap;
}

function syncShelfSlots(wrap, games) {
  const track = wrap.querySelector('.sh-track');
  const key = games.map(game => game.id).join('|');
  if (track.dataset.key === key) return;
  track.dataset.key = key;
  track.replaceChildren(...games.map(item => {
    const slot = document.createElement('div');
    slot.className = 'sh-slot';
    slot.dataset.id = item.id;
    slot.style.setProperty('--tone', item.color);
    slot.style.setProperty('--glow', `rgb(${item.spill.join(',')})`);
    slot.innerHTML = `
      <div class="sh-spine">
        <img src="${item.box}" alt="">
        <b>${item.sys}</b>
        <strong></strong>
        <em>'${String(item.year).slice(2)}</em>
      </div>
      <div class="sh-face">
        <img src="${item.box}" alt="">
        <span class="sh-players">${item.players > 1 ? `1-${item.players}` : '1'}P</span>
        <span class="sh-fav">★</span>
      </div>
    `;
    slot.querySelector('strong').textContent = item.title;
    slot.addEventListener('click', event => {
      event.stopPropagation();
      document.querySelector(`#list .lr[data-index="${slot.dataset.idx}"]`)?.click();
    });
    return slot;
  }));
}

function layoutShelf(surface, index, game, games) {
  const wrap = surface.querySelector('.sh-wrap') || buildShelf(surface);
  syncShelfSlots(wrap, games);
  const track = wrap.querySelector('.sh-track');
  track.style.transform = `translateX(${-(Math.max(index, 0) * (SH_SPINE + SH_GAP) + SH_FACE / 2)}px)`;
  [...track.children].forEach((slot, slotIndex) => {
    const x = slotIndex * (SH_SPINE + SH_GAP) + (slotIndex > index ? SH_FACE - SH_SPINE : 0);
    slot.dataset.idx = String(slotIndex);
    slot.classList.toggle('active', slotIndex === index);
    slot.classList.toggle('fav', isFavorite(slot.dataset.id));
    slot.style.setProperty('--x', `${x}px`);
    slot.style.setProperty('--abs', String(Math.min(Math.abs(slotIndex - index), 12)));
  });

  const title = wrap.querySelector('.sh-title');
  title.classList.toggle('fav', Boolean(game && isFavorite(game.id)));
  title.querySelector('.mq-txt').textContent = game ? game.title : 'NO FAVORITES YET';
  wrap.querySelector('.sh-browse p').textContent = game
    ? `${game.pub.toUpperCase()} · ${game.sys} · ${game.year} · ${playersLabel(game)}`
    : 'PRESS F ON ANY GAME TO ADD IT HERE';
  wrap.querySelector('.sh-count').textContent = `${String(index + 1).padStart(2, '0')} / ${String(games.length).padStart(2, '0')}`;
}
