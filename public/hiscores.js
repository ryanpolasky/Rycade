(function (root) {
  const SENT_KEY = 'rycade.scoresSent';
  const QUEUE_KEY = 'rycade.scoreQueue';
  const bcd = bytes => Number(Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''));
  const text = (bytes, map = b => String.fromCharCode(b)) => Array.from(bytes, map).join('').trim();

  const DECODERS = {
    // 0x6b00: five 34-byte rows of "1ST  012000  NAME........" + 0x7f + score as little-endian BCD.
    dkong3: {
      size: 241,
      defaults: [['WIN', 12000], ['MAI', 9000], ['OGA', 8000], ['SUZ', 5400], ['YOU', 3200]],
      decode: bytes => Array.from({ length: 5 }, (_, i) => {
        const row = bytes.subarray(2 + i * 34, 36 + i * 34);
        return {
          initials: text(row.subarray(13, 25), b => b === 0x40 ? ' ' : String.fromCharCode(b)),
          score: bcd(row.slice(27, 30).reverse())
        };
      })
    }
  };

  function decode(game, bytes) {
    const decoder = DECODERS[game];
    if (!decoder || !bytes || bytes.length !== decoder.size) return [];
    const defaults = new Set((decoder.defaults || []).map(([initials, score]) => `${initials}|${score}`));
    return decoder.decode(bytes).filter(entry =>
      /^[A-Z0-9 .!?-]{1,12}$/.test(entry.initials) &&
      Number.isSafeInteger(entry.score) && entry.score > 0 &&
      !defaults.has(`${entry.initials}|${entry.score}`));
  }

  function createUploader({ storage, send }) {
    const read = (key, fallback) => {
      try { return JSON.parse(storage.getItem(key)) || fallback; } catch { return fallback; }
    };
    let flushing = null;
    async function flush() {
      if (flushing) return flushing;
      flushing = (async () => {
        const queue = read(QUEUE_KEY, []);
        while (queue.length) {
          if (!(await send(queue[0]))) break;
          queue.shift();
          storage.setItem(QUEUE_KEY, JSON.stringify(queue));
        }
      })().finally(() => { flushing = null; });
      return flushing;
    }
    function submit(game, bytes) {
      const sent = new Set(read(SENT_KEY, []));
      const entries = decode(game, bytes).filter(({ initials, score }) => !sent.has(`${game}|${initials}|${score}`));
      if (!entries.length) return flush();
      entries.forEach(({ initials, score }) => sent.add(`${game}|${initials}|${score}`));
      storage.setItem(SENT_KEY, JSON.stringify([...sent]));
      storage.setItem(QUEUE_KEY, JSON.stringify([...read(QUEUE_KEY, []), { game, entries }]));
      return flush();
    }
    return { submit, flush };
  }

  const api = { DECODERS, decode, createUploader };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined' || !new URLSearchParams(location.search).has('cab')) return;

  const uploader = createUploader({
    storage: localStorage,
    send: async batch => {
      try {
        const response = await fetch('/api/scores', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(batch)
        });
        return response.ok || response.status === 400;
      } catch {
        return false;
      }
    }
  });
  root.rycadeHiscores = uploader;
  uploader.flush();
  setInterval(() => uploader.flush(), 5 * 60 * 1000);
})(typeof globalThis !== 'undefined' ? globalThis : window);
