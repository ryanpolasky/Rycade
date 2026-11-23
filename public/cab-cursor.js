(() => {
  function hide(doc) {
    if (!doc?.head || doc.head.querySelector('style[data-rycade-cursor]')) return;
    const style = doc.createElement('style');
    style.setAttribute('data-rycade-cursor', '');
    style.textContent = ':root, *, *::before, *::after, *::backdrop { cursor: none !important; }';
    doc.head.append(style);
    doc.addEventListener('load', ({ target }) => {
      if (target.localName === 'iframe') hide(target.contentDocument);
    }, true);
    for (const frame of doc.querySelectorAll('iframe')) hide(frame.contentDocument);
  }

  if (location.pathname === '/play.html' || new URLSearchParams(location.search).has('cab')) hide(document);
})();
