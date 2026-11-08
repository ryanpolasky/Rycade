import { GAME_IDS } from './games-ids.js';

const CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const INITIALS_PATTERN = /^[A-Z0-9 .!?\-]{1,3}$/;
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
});

function validScores(payload) {
  const { game, entries } = payload || {};
  if (typeof game !== 'string' || !GAME_IDS.has(game)) return null;
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 20) return null;
  const clean = [];
  for (const entry of entries) {
    const initials = typeof entry?.initials === 'string' ? entry.initials.toUpperCase().trim() : '';
    const score = entry?.score;
    if (!INITIALS_PATTERN.test(initials) || !Number.isSafeInteger(score) || score < 1 || score > 999999999) return null;
    clean.push({ initials, score });
  }
  return { game, entries: clean };
}

async function sameKey(given, expected) {
  if (!given || !expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([given, expected].map(v => crypto.subtle.digest('SHA-256', enc.encode(v))));
  return crypto.subtle.timingSafeEqual(a, b);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/ws') {
      const code = url.searchParams.get('code') || '';
      if (request.method !== 'GET' || !CODE_PATTERN.test(code)) {
        return new Response('Invalid pairing code', { status: 400 });
      }
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('WebSocket upgrade required', { status: 426 });
      }
      const room = env.ROOMS.get(env.ROOMS.idFromName(code));
      return room.fetch(request);
    }
    if (url.pathname === '/api/send') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      let payload;
      try {
        payload = await request.json();
      } catch {
        return json({ ok: false, error: 'Invalid JSON' }, 400);
      }
      const { code, gameId } = payload || {};
      if (typeof code !== 'string' || !CODE_PATTERN.test(code)) {
        return json({ ok: false, error: 'Invalid pairing code' }, 400);
      }
      if (typeof gameId !== 'string' || !GAME_IDS.has(gameId)) {
        return json({ ok: false, error: 'Invalid game' }, 400);
      }
      const room = env.ROOMS.get(env.ROOMS.idFromName(code));
      const response = await room.fetch('https://room/broadcast', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gameId })
      });
      if (!response.ok) return json({ ok: false, error: 'Unable to contact cab' }, 502);
      return json(await response.json());
    }
    if (url.pathname === '/api/scores') {
      const board = env.SCORES.get(env.SCORES.idFromName('all'));
      if (request.method === 'GET') {
        const game = url.searchParams.get('game');
        if (game !== null && !GAME_IDS.has(game)) return json({ ok: false, error: 'Invalid game' }, 400);
        const response = await board.fetch(`https://scores/list${game ? `?game=${encodeURIComponent(game)}` : ''}`);
        return json(await response.json(), 200, { 'cache-control': 'public, max-age=30' });
      }
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      const auth = request.headers.get('Authorization') || '';
      if (!(await sameKey(auth.replace(/^Bearer /, ''), env.SCORE_KEY))) return json({ ok: false, error: 'Unauthorized' }, 401);
      let payload;
      try {
        payload = validScores(await request.json());
      } catch {}
      if (!payload) return json({ ok: false, error: 'Invalid scores' }, 400);
      const response = await board.fetch('https://scores/add', { method: 'POST', body: JSON.stringify(payload) });
      return json(await response.json());
    }
    if (url.pathname === '/scores' && request.method === 'GET') {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = '/scores/index.html';
      return env.ASSETS.fetch(new Request(assetUrl, request));
    }
    if (url.pathname === '/remote' && request.method === 'GET') {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = '/remote/index.html';
      return env.ASSETS.fetch(new Request(assetUrl, request));
    }
    return env.ASSETS.fetch(request);
  }
};

export class Room {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/api/ws') {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return json({ ok: false, error: 'Invalid JSON' }, 400);
      }
      if (typeof payload?.gameId !== 'string' || !GAME_IDS.has(payload.gameId)) {
        return json({ ok: false, error: 'Invalid game' }, 400);
      }
      const message = JSON.stringify({ type: 'open', gameId: payload.gameId });
      let delivered = 0;
      for (const socket of this.state.getWebSockets()) {
        try {
          socket.send(message);
          delivered += 1;
        } catch {}
      }
      return json({ ok: true, delivered });
    }
    return new Response('Not found', { status: 404 });
  }

  webSocketMessage() {}

  webSocketClose() {}

  webSocketError() {}
}

export class Scores {
  constructor(ctx) {
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS scores (
      game TEXT NOT NULL,
      initials TEXT NOT NULL,
      score INTEGER NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY (game, initials, score)
    )`);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/add' && request.method === 'POST') {
      const { game, entries } = await request.json();
      const at = Date.now();
      let added = 0;
      for (const { initials, score } of entries) {
        added += this.sql.exec('INSERT OR IGNORE INTO scores (game, initials, score, at) VALUES (?, ?, ?, ?) RETURNING 1', game, initials, score, at).toArray().length;
      }
      return json({ ok: true, added });
    }
    if (url.pathname === '/list') {
      const game = url.searchParams.get('game');
      const rows = game
        ? this.sql.exec('SELECT game, initials, score, at FROM scores WHERE game = ? ORDER BY score DESC, at ASC LIMIT 10', game).toArray()
        : this.sql.exec(`SELECT game, initials, score, at FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY game ORDER BY score DESC, at ASC) AS rank FROM scores
          ) WHERE rank <= 10 ORDER BY game, score DESC, at ASC`).toArray();
      const games = {};
      for (const row of rows) (games[row.game] ||= []).push({ initials: row.initials, score: row.score, at: row.at });
      return json({ ok: true, games });
    }
    return new Response('Not found', { status: 404 });
  }
}
