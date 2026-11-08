(() => {
  const P = window.rycadeProfiles;
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const BASE = { width: 544, height: 408 };
  const screen = document.querySelector('#screen');
  const root = document.createElement('div');
  root.id = 'save-pick';
  root.hidden = true;
  const frame = document.createElement('div');
  frame.className = 'sp-frame';
  root.append(frame);
  screen.append(root);
  let run = null;

  const sound = name => window.rycadeAudio?.play(name);
  const esc = text => String(text).replace(/[&<>"]/g, char => `&#${char.charCodeAt(0)};`);
  const ft = parts => `<div class="sp-ft">${parts.map(([key, label]) => `<b>${key}</b> ${label}`).join('  ')}</div>`;

  function meta(profile) {
    const entry = profile.games[run.game.id];
    if (!entry || !entry.ms) return '<span class="sp-mt"><b>NO SAVE YET</b></span>';
    return `<span class="sp-mt"><b>${P.formatPlaytime(entry.ms)}</b><br>${P.formatLast(entry.last)}</span>`;
  }

  function fit() {
    const scale = Math.min(screen.clientWidth / BASE.width, screen.clientHeight / BASE.height) || 1;
    frame.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }

  function renderPick() {
    frame.className = 'sp-frame sp-pick';
    const rows = run.rows.map((profile, slot) => {
      const on = slot === run.index ? ' on' : '';
      const label = `<span class="sp-cur">${on ? '▶' : ''}</span><span class="sp-n">FILE ${slot + 1}</span>`;
      if (!profile) return `<div class="sp-row${on}" data-slot="${slot}">${label}<span class="sp-in sp-blank">---</span><span class="sp-mt">NEW INITIALS</span></div>`;
      return `<div class="sp-row${on}" data-slot="${slot}">${label}<span class="sp-in">${esc(profile.initials)}</span><i class="sp-sw" style="background:${profile.color}"></i>${meta(profile)}</div>`;
    }).join('');
    frame.innerHTML = `<h2>WHOSE SAVE?</h2>${rows}${ft([['STICK', 'PICK'], ['SHOOT', 'PLAY'], ['PASS', 'BACK']])}`;
  }

  function renderEnter() {
    frame.className = 'sp-frame sp-enter';
    const boxes = run.letters.map((letter, slot) => {
      const state = slot === run.cursor ? ' on' : slot < run.cursor ? ' dn' : '';
      return `<div class="sp-l${state}" data-slot="${slot}"><span class="sp-ar">▲</span><span class="sp-ch"><span>${letter}</span></span><span class="sp-ar">▼</span></div>`;
    }).join('');
    const last = run.cursor === run.letters.length - 1;
    frame.innerHTML = `<h2>ENTER INITIALS</h2><div class="sp-ls">${boxes}</div><div class="sp-hn">STICK UP/DOWN CHANGES LETTER<br>LEFT/RIGHT MOVES</div>${ft([['SHOOT', last ? 'DONE' : 'NEXT'], ['PASS', 'BACK']])}`;
  }

  function renderClash() {
    frame.className = 'sp-frame sp-clash';
    const profile = run.clash;
    const saved = !!profile.games[run.game.id]?.ms;
    const options = ['YES, LOAD IT', 'NO, CHANGE INITIALS'].map((label, slot) => {
      const on = slot === run.index ? ' on' : '';
      return `<div class="sp-o${on}" data-slot="${slot}"><span class="sp-cur">${on ? '▶' : ''}</span>${saved || slot ? label : 'YES, THAT\'S ME'}</div>`;
    }).join('');
    frame.innerHTML = `<h2>${esc(profile.initials)} ${saved ? 'ALREADY HAS A SAVE' : 'IS TAKEN'}</h2><div class="sp-pf"><span class="sp-in">${esc(profile.initials)}</span><i class="sp-sw" style="background:${profile.color}"></i>${meta(profile)}</div><div class="sp-q">${saved ? 'IS THIS YOUR SAVE?' : 'IS THIS YOU?'}</div>${options}${ft([['SHOOT', 'PICK'], ['PASS', 'BACK']])}`;
  }

  function render() {
    if (run.mode === 'pick') renderPick();
    else if (run.mode === 'enter') renderEnter();
    else renderClash();
  }

  function enter(letters) {
    run.mode = 'enter';
    run.letters = letters || ['A', 'A', 'A'];
    run.cursor = letters ? letters.length - 1 : 0;
    render();
  }

  function finish(profile) {
    const picked = P.update(state => P.startGame(state, profile.id, run.game.id));
    const done = run.done;
    close();
    done(picked || profile);
  }

  function open(game, done, cancel) {
    const state = P.load();
    const profiles = P.pickerProfiles(state, game.id);
    run = { game, done, cancel, rows: [...profiles, null], index: 0, mode: 'pick' };
    run.index = Math.max(0, profiles.findIndex(profile => profile.id === state.last));
    root.hidden = false;
    screen.classList.add('save-picking');
    fit();
    if (profiles.length) render();
    else enter();
  }

  function close() {
    if (!run) return;
    run = null;
    root.hidden = true;
    screen.classList.remove('save-picking');
    frame.replaceChildren();
  }

  function back() {
    sound('back');
    const cancel = run.cancel;
    close();
    cancel?.();
  }

  function choose() {
    if (run.mode === 'pick') {
      const profile = run.rows[run.index];
      sound('confirm');
      if (profile) finish(profile);
      else enter();
    } else if (run.mode === 'enter') {
      if (run.cursor < run.letters.length - 1) {
        run.cursor++;
        sound('letter');
        render();
        return;
      }
      const initials = run.letters.join('');
      const existing = P.findProfile(P.load(), initials);
      if (existing) {
        sound('notification');
        run.mode = 'clash';
        run.clash = existing;
        run.index = 0;
        render();
        return;
      }
      sound('confirm');
      const profile = P.update(state => P.createProfile(state, initials));
      if (profile) finish(profile);
    } else if (run.index === 0) {
      sound('confirm');
      finish(run.clash);
    } else {
      sound('back');
      enter(run.letters);
    }
  }

  function key(event) {
    if (!run) return false;
    event.preventDefault();
    event.stopPropagation();
    window.rycadeAttract?.reset();
    const k = event.key;
    if (k === CABINET_KEYS.shoot || k === CABINET_KEYS.start) {
      if (run.mode === 'enter' && k === CABINET_KEYS.start) run.cursor = run.letters.length - 1;
      choose();
    } else if (k === CABINET_KEYS.pass || k === 'Escape') {
      if (run.mode === 'enter' && run.cursor > 0) {
        run.cursor--;
        sound('back');
        render();
      } else if (run.mode === 'enter' && run.rows.some(Boolean)) {
        sound('back');
        run.mode = 'pick';
        render();
      } else if (run.mode === 'clash') {
        sound('back');
        enter(run.letters);
      } else back();
    } else if (k === 'ArrowUp' || k === 'ArrowDown') {
      const step = k === 'ArrowDown' ? 1 : -1;
      if (run.mode === 'enter') {
        const at = LETTERS.indexOf(run.letters[run.cursor]);
        run.letters[run.cursor] = LETTERS[(at - step + LETTERS.length) % LETTERS.length];
        sound('letter');
      } else {
        const count = run.mode === 'pick' ? run.rows.length : 2;
        const next = Math.max(0, Math.min(count - 1, run.index + step));
        if (next === run.index) return true;
        run.index = next;
        sound('move');
      }
      render();
    } else if (run.mode === 'enter' && (k === 'ArrowLeft' || k === 'ArrowRight')) {
      const next = Math.max(0, Math.min(run.letters.length - 1, run.cursor + (k === 'ArrowRight' ? 1 : -1)));
      if (next === run.cursor) return true;
      run.cursor = next;
      sound('move');
      render();
    }
    return true;
  }

  root.addEventListener('click', event => {
    event.stopPropagation();
    if (!run) return;
    const target = event.target.closest('[data-slot]');
    if (!target) return;
    const slot = Number(target.dataset.slot);
    if (run.mode === 'enter') {
      run.cursor = slot;
      render();
      return;
    }
    run.index = slot;
    choose();
  });
  window.addEventListener('resize', () => run && fit());

  window.rycadeSavePick = { open, close, key, active: () => !!run };
})();
