import { GAME_IDS } from './games-ids.js';

const CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' }
});

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
