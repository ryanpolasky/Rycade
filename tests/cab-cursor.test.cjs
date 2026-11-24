const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const script = readFileSync(require.resolve('../public/cab-cursor.js'), 'utf8');

function documentWith(frames = []) {
  const styles = [];
  const listeners = [];
  return {
    styles,
    head: {
      querySelector: () => styles[0],
      append: style => styles.push(style),
    },
    createElement: () => ({ setAttribute() {} }),
    querySelectorAll: () => frames,
    addEventListener(type, listener, capture) {
      assert.equal(type, 'load');
      assert.equal(capture, true);
      listeners.push(listener);
    },
    load: target => listeners.forEach(listener => listener({ target })),
  };
}

const iframe = contentDocument => ({ localName: 'iframe', contentDocument });
const start = (document, pathname, search = '') =>
  runInNewContext(script, { document, location: { pathname, search }, URLSearchParams });

test('cabinet cursor hiding includes existing and later nested iframe documents', () => {
  const nested = documentWith();
  const game = documentWith([iframe(nested), iframe(null)]);
  const wrapper = documentWith([iframe(game)]);
  const menu = documentWith();
  start(menu, '/', '?cab=1');
  start(wrapper, '/play.html');
  menu.load(iframe(wrapper));
  for (const doc of [menu, wrapper, game, nested]) {
    assert.equal(doc.styles.length, 1);
    assert.match(doc.styles[0].textContent, /cursor: none !important/);
  }

  const loaded = documentWith();
  game.load(iframe(loaded));
  assert.equal(loaded.styles.length, 1);
});

test('the regular library does not hide the cursor', () => {
  const menu = documentWith();
  start(menu, '/');
  assert.equal(menu.styles.length, 0);
});
