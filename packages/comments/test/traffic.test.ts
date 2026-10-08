import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createApp, VIEW_WINDOW } from '../src/app.ts';
import { sqliteStore } from '../src/sqlite.ts';
import { d1Store } from '../src/d1.ts';
import type { Store } from '../src/store.ts';
import { Presence } from '../src/presence.ts';
import { OnlinePresence } from '../src/presence-do.ts';
import { startNode } from '../src/node.ts';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import WS from 'ws';

/** 用 SQLite 冒充 D1（带 batch） */
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  return {
    prepare: (sql: string) => ({
      bind: (...a: any[]) => ({
        all: async () => ({ results: db.prepare(sql).all(...a) as any[] }),
        first: async () => (db.prepare(sql).get(...a) as any) ?? null,
        run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
      }),
    }),
    batch: async (stmts: Array<{ run(): Promise<unknown> }>) => { for (const s of stmts) await s.run(); },
  };
}
const STORES: Array<[string, () => Store]> = [['SQLite', () => sqliteStore(':memory:')], ['D1', () => d1Store(fakeD1())]];

const A = 'a'.repeat(20), B = 'b'.repeat(20);
const UA = 'Mozilla/5.0 (Macintosh) Safari/605.1.15';

async function setup(mk: () => Store) {
  const store = mk();
  await store.init();
  let t = 1_000_000;
  const app = createApp({ store, adminToken: 't', salt: 's', now: () => t });
  // 页面发的是不带 Content-Type 的字符串正文
  const send = async (path: string, body: unknown, headers: Record<string, string> = {}): Promise<any> =>
    (await app.request(path, { method: 'POST', headers: { 'user-agent': UA, 'cf-connecting-ip': '1.2.3.4', ...headers }, body: JSON.stringify(body) })).json();
  const get = async (path: string, headers: Record<string, string> = {}): Promise<any> => (await app.request(path, { headers })).json();
  return { send, get, tick: (ms: number) => { t += ms; } };
}

for (const [name, mk] of STORES) {
  test(`[${name}] 阅读量：同一位读者半小时内重复打开只算一次，不同读者各算一次`, async () => {
    const { send, get, tick } = await setup(mk);
    assert.deepEqual(await send('/views', { entry: 'posts/x', visitor: A }), { views: 1 });
    assert.deepEqual(await send('/views', { entry: 'posts/x', visitor: A }), { views: 1 });
    assert.deepEqual(await send('/views', { entry: 'posts/x', visitor: B }), { views: 2 });
    assert.deepEqual(await send('/views', { entry: 'posts/y', visitor: A }), { views: 1 });
    tick(VIEW_WINDOW + 1);
    assert.deepEqual(await send('/views', { entry: 'posts/x', visitor: A }), { views: 3 });
    assert.deepEqual(await get('/views?entry=posts/x'), { views: 3 });
    assert.deepEqual(await get('/views?entry=posts/none'), { views: 0 });
  });

  test(`[${name}] 阅读量：没带读者 id 就按 IP + UA 认人；爬虫不计；entry 要合法`, async () => {
    const { send } = await setup(mk);
    assert.deepEqual(await send('/views', { entry: 'posts/x' }), { views: 1 });
    assert.deepEqual(await send('/views', { entry: 'posts/x', visitor: 'short' }), { views: 1 });
    assert.deepEqual(await send('/views', { entry: 'posts/x' }, { 'cf-connecting-ip': '5.6.7.8' }), { views: 2 });
    assert.deepEqual(await send('/views', { entry: 'posts/x', visitor: B }, { 'user-agent': 'Googlebot/2.1' }), { views: 2 });
    assert.ok((await send('/views', { entry: '../etc' })).error);
  });

  test(`[${name}] 管理：总阅读量、每篇阅读量；没有在线名单时在线人数是 null；要令牌`, async () => {
    const { send, get } = await setup(mk);
    await send('/views', { entry: 'posts/x', visitor: A });
    await send('/views', { entry: 'posts/x', visitor: B });
    await send('/views', { entry: 'pages/about', visitor: A });
    assert.deepEqual(await get('/admin/traffic', { Authorization: 'Bearer t' }), {
      views: 3, online: null, entries: [{ entry: 'posts/x', views: 2 }, { entry: 'pages/about', views: 1 }],
    });
    assert.ok((await get('/admin/traffic')).error);
  });
}

test('在线名单：同一位读者开几个页面只算一个；只看人数的不算；人数变了才推', () => {
  const p = new Presence();
  const peer = () => { const got: number[] = []; return { got, send: (m: string) => got.push(JSON.parse(m).online) }; };
  const watcher = peer(), a1 = peer(), a2 = peer(), b = peer();
  p.join(watcher, null);
  p.join(a1, 'a');
  p.join(a2, 'a');
  p.join(b, 'b');
  assert.equal(p.count(), 2);
  assert.deepEqual(watcher.got, [0, 1, 2]);
  assert.deepEqual(a2.got, [1, 2]); // 进来时人数没变，只告诉它自己
  p.leave(a1);
  assert.equal(p.count(), 2);
  p.leave(a2);
  assert.deepEqual(watcher.got, [0, 1, 2, 1]);
  assert.deepEqual(b.got, [2, 1]);
});

test('Node：连上 /online/ws 就算在线，断开就不算；来源不对的不收；只看的谁都能连，还会收到阅读量', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mori-online-'));
  const { server } = await startNode({ dbPath: join(dir, 'c.db'), port: 0, allowOrigin: 'https://site.example', adminToken: 't' });
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  const ws = (q: string, origin = 'https://site.example') => new WS(`ws://127.0.0.1:${port}/online/ws?${q}`, { headers: { origin, 'user-agent': UA } });
  const next = (s: WS) => new Promise<number>((ok) => s.once('message', (d) => ok(JSON.parse(String(d)).online)));
  const http = async (path: string) => (await fetch(`http://127.0.0.1:${port}${path}`, { headers: { Authorization: 'Bearer t' } })).json() as Promise<any>;
  try {
    const watch = ws('watch=1', 'http://127.0.0.1:4400');
    assert.equal(await next(watch), 0);
    const pushed = next(watch);
    const a = ws(`visitor=${A}`);
    assert.equal(await next(a), 1);
    assert.equal(await pushed, 1);
    assert.deepEqual(await http('/online'), { online: 1 });
    assert.equal((await http('/admin/traffic')).online, 1);

    const bad = ws(`visitor=${B}`, 'https://evil.example');
    await assert.rejects(new Promise((ok, fail) => { bad.once('open', ok); bad.once('error', fail); }));

    // 记了一次阅读：只看的连接收到全站阅读量，读者那边不收
    const views = new Promise<any>((ok) => watch.once('message', (d) => ok(JSON.parse(String(d)))));
    let readerGot = false;
    a.once('message', () => { readerGot = true; });
    await fetch(`http://127.0.0.1:${port}/views`, { method: 'POST', headers: { 'user-agent': UA }, body: JSON.stringify({ entry: 'posts/x', visitor: A }) });
    assert.deepEqual(await views, { views: 1 });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(readerGot, false);

    const dropped = next(watch);
    a.close();
    assert.equal(await dropped, 0);
    watch.close();
  } finally {
    server.close();
  }
});

test('Workers 的 Durable Object：计数、关闭时推送（用假的 state）', async () => {
  const sock = (visitor: string | null) => { const got: number[] = []; return { got, send: (m: string) => got.push(JSON.parse(m).online), deserializeAttachment: () => ({ visitor }) }; };
  const watch = sock(null), a1 = sock('a'), a2 = sock('a'), b = sock('b');
  const list = [watch, a1, a2, b];
  const dobj = new OnlinePresence({ getWebSockets: () => list });
  assert.deepEqual(await (await dobj.fetch(new Request('https://online/count'))).json(), { online: 2 });
  dobj.webSocketClose(b); // 关闭事件里它还在列表中，要排除
  list.splice(list.indexOf(b), 1);
  assert.deepEqual(watch.got, [1]);
  assert.deepEqual(b.got, []);
  dobj.webSocketClose(a1);
  assert.deepEqual(watch.got, [1]); // a 还开着另一个页面，人数没变
});
