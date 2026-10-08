import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { serve } from '@hono/node-server';
import { WebSocketServer, type WebSocket } from 'ws';
import { createApp, isBot, visitorKey, originAllowed, ipFrom, type AppOptions } from './app.ts';
import { sqliteStore } from './sqlite.ts';
import { Presence } from './presence.ts';

/** 服务端每隔多久 ping 一次；上一轮没回 pong 的连接当作已经断了 */
const SWEEP = 30_000;

/** Node + SQLite 版本（VPS 上用）。配置来自环境变量，见 bin/mori-comments.mjs */
export async function startNode(o: { dbPath: string; port: number } & Omit<AppOptions, 'store'>) {
  const store = sqliteStore(o.dbPath);
  await store.init();
  const presence = new Presence();
  const app = createApp({ ...o, store, online: async () => presence.count(), onView: (views) => presence.toWatchers({ views }) });
  const server = serve({ fetch: app.fetch, port: o.port, hostname: '0.0.0.0' });

  /* 在线访客：/online/ws 的升级请求不经过 Hono，直接在这里接 */
  const wss = new WebSocketServer({ noServer: true });
  const alive = new WeakMap<WebSocket, boolean>();
  server.on('upgrade', async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname !== '/online/ws') return refuse(socket, 404);
    const ua = req.headers['user-agent'] ?? '';
    // 只看人数的连接谁都能连（人数本来就公开）；算在线的要来自允许的站点，爬虫不算
    const watch = url.searchParams.has('watch') || isBot(ua);
    if (!watch && !originAllowed(o.allowOrigin, req.headers.origin)) return refuse(socket, 403);
    const header = (k: string) => { const v = req.headers[k]; return Array.isArray(v) ? v[0] : v; };
    const visitor = watch ? null : await visitorKey(o.salt ?? 'mori', url.searchParams.get('visitor'), ipFrom(header, req.socket.remoteAddress), ua);
    wss.handleUpgrade(req, socket, head, (ws) => {
      const peer = { send: (m: string) => ws.send(m) };
      alive.set(ws, true);
      ws.on('pong', () => alive.set(ws, true));
      ws.on('message', (d) => { alive.set(ws, true); if (String(d) === 'ping') ws.send('pong'); });
      ws.on('close', () => presence.leave(peer));
      ws.on('error', () => ws.terminate());
      presence.join(peer, visitor);
    });
  });
  const sweep = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) { ws.terminate(); continue; }
      alive.set(ws, false);
      ws.ping();
    }
  }, SWEEP);
  server.on('close', () => clearInterval(sweep));

  return { app, store, server, presence };
}

function refuse(socket: Duplex, status: 403 | 404) {
  socket.end(`HTTP/1.1 ${status} ${status === 403 ? 'Forbidden' : 'Not Found'}\r\nConnection: close\r\n\r\n`);
}
