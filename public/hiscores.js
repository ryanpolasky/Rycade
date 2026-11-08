(function (root) {
  const SENT_KEY = 'rycade.scoresSent';
  const QUEUE_KEY = 'rycade.scoreQueue';
  const bcd = bytes => Number(Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''));
  const text = (bytes, map = b => String.fromCharCode(b)) => Array.from(bytes, map).join('').trim();

  const namcoTile = b => b < 10 ? String(b) : b < 0x24 ? String.fromCharCode(55 + b) : b === 0x2a ? '.' : b === 0x24 ? ' ' : '<';

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
    },
    // nvram 0x2c4: ten rows of BCD score + 3 ASCII initials.
    qix: {
      size: 1024,
      defaults: Array.from({ length: 10 }, () => ['QIX', 30000]),
      decode: bytes => Array.from({ length: 10 }, (_, i) => {
        const row = bytes.slice(0x2c4 + i * 6, 0x2ca + i * 6);
        return { initials: text(row.slice(3)), score: bcd(row.slice(0, 3)) };
      })
    },
    // Five 6-digit scores (one tile per digit, units first), then five 3-tile names.
    galaga: {
      size: 51,
      defaults: ['N.N', 'A.A', 'M.M', 'C.C', 'O.O'].map(name => [name, 20000]),
      decode: bytes => Array.from({ length: 5 }, (_, i) => ({
        initials: text(bytes.slice(30 + i * 3, 33 + i * 3), namcoTile),
        score: Number(Array.from(bytes.slice(i * 6, i * 6 + 6)).reverse().map(d => d === 0x24 ? 0 : d).join(''))
      }))
    },
    // Five 16-byte rows: six score digits (tens), six ASCII name chars, 3 x 0xff, round.
    digdug2: {
      size: 90,
      defaults: ['KAZU', 'YAMA', 'SIGERU', 'JUNKO', 'MIYUKI'].map(name => [name, 20000]),
      decode: bytes => Array.from({ length: 5 }, (_, i) => {
        const row = bytes.slice(i * 16, i * 16 + 16);
        return { initials: text(row.slice(6, 12)), score: Number(Array.from(row.slice(0, 6)).join('')) * 10 };
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
