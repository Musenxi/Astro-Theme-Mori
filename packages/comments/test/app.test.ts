import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, LIMITS } from '../src/app.ts';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { sqliteStore } from '../src/sqlite.ts';
import { d1Store } from '../src/d1.ts';

/** 用 SQLite 冒充 D1：同样的 prepare().bind().all()/first()/run() 接口，让两种存储跑同一套测试 */
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
  };
}
const STORES: Array<[string, () => import('../src/store.ts').Store]> = [['SQLite', () => sqliteStore(':memory:')], ['D1', () => d1Store(fakeD1())]];


const ENTRY = 'posts/less-but-not-too-little';
const TOKEN = 'secret-token';

async function setupWith(makeStore: () => import('../src/store.ts').Store, opts: Record<string, unknown> = {}) {
  const store = makeStore();
  await store.init();
  let t = 1_000_000;
  const app = createApp({ store, adminToken: TOKEN, salt: 'test', now: () => t, ...opts });
  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.request(path, { method, headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.2.3.4', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const post = (body: Record<string, unknown>, headers?: Record<string, string>) => call('POST', '/comments', { entry: ENTRY, name: '读者', body: '写得好', ...body }, headers);
  const admin = (method: string, path: string, body?: unknown) => call(method, `/admin${path}`, body, { Authorization: `Bearer ${TOKEN}` });
  return { store, app, call, post, admin, tick: (ms: number) => { t += ms; } };
}

for (const [name, mk] of STORES) {
  // 每个用例绑定自己这一套存储（注册完才执行，不能用会被后面覆盖的全局变量）
  const setup = (opts: Record<string, unknown> = {}) => setupWith(mk, opts);
  test(`[${name}] 第一次留言先审后发；通过之后同一个人再发直接显示`, async () => {
    const { post, call, admin } = await setup();
    const r1 = await post({ email: 'a@b.co' });
    assert.equal(r1.status, 201);
    const j1: any = await r1.json();
    assert.equal(j1.status, 'pending');
    assert.equal(j1.comment, undefined);
    assert.deepEqual(((await (await call('GET', `/comments?entry=${ENTRY}`)).json()) as any).comments, []);

    const pending: any = await (await admin('GET', '/comments?status=pending')).json();
    assert.equal(pending.comments.length, 1);
    assert.equal((await admin('PATCH', `/comments/${pending.comments[0].id}`, { status: 'approved' })).status, 200);

    const j2: any = await (await post({ email: 'a@b.co', body: '再来一条' }, { 'cf-connecting-ip': '9.9.9.9' })).json();
    assert.equal(j2.status, 'approved');
    assert.equal(j2.comment.body, '再来一条');
    const list: any = await (await call('GET', `/comments?entry=${ENTRY}`)).json();
    assert.equal(list.comments.length, 2);
  });

  test(`[${name}] 对外的字段里没有邮箱、IP`, async () => {
    const { post, call } = await setup({ autoApprove: 'all' });
    await post({ email: 'x@y.zz' });
    const c: any = ((await (await call('GET', `/comments?entry=${ENTRY}`)).json()) as any).comments[0];
    assert.deepEqual(Object.keys(c).sort(), ['block', 'body', 'createdAt', 'end', 'id', 'name', 'parentId', 'prefix', 'quote', 'start', 'suffix']);
  });

  test(`[${name}] 划词引用评论：带位置和原文；位置不合法会被拒绝`, async () => {
    const { post, call } = await setup({ autoApprove: 'all' });
    const ok = await post({ block: 'b03', start: 4, end: 9, quote: '上图东观体', prefix: '正文和标题都用', suffix: '。它的字形' });
    assert.equal(ok.status, 201);
    const c: any = ((await (await call('GET', `/comments?entry=${ENTRY}`)).json()) as any).comments[0];
    assert.deepEqual([c.block, c.start, c.end, c.quote], ['b03', 4, 9, '上图东观体']);
    for (const bad of [{ block: 'b03', start: 9, end: 4, quote: 'x' }, { block: 'b03', start: 1, end: 2 }, { block: '../x', start: 1, end: 2, quote: 'x' }]) {
      assert.equal((await post(bad)).status, 400);
    }
  });

  test(`[${name}] 回复：挂到最上面那条下面；不能回复不存在或没通过的`, async () => {
    const { post, call, admin } = await setup({ autoApprove: 'all' });
    const root: any = await (await post({ body: '主评论' })).json();
    const reply: any = await (await post({ body: '回复', parentId: root.comment.id }, { 'cf-connecting-ip': '5.5.5.5' })).json();
    const reply2: any = await (await post({ body: '回复的回复', parentId: reply.comment.id }, { 'cf-connecting-ip': '6.6.6.6' })).json();
    assert.equal(reply2.comment.parentId, root.comment.id);
    assert.equal((await post({ parentId: 9999 })).status, 400);
    await admin('PATCH', `/comments/${root.comment.id}`, { status: 'hidden' });
    assert.equal((await post({ parentId: root.comment.id }, { 'cf-connecting-ip': '7.7.7.7' })).status, 400);
    // 删除主评论时回复一起删
    await admin('DELETE', `/comments/${root.comment.id}`);
    assert.deepEqual(((await (await call('GET', `/comments?entry=${ENTRY}`)).json()) as any).comments, []);
  });

  test(`[${name}] 限流：一分钟内超过上限会被拒绝，过了一分钟又可以`, async () => {
    const { post, tick } = await setup({ autoApprove: 'all' });
    for (let i = 0; i < LIMITS.perMinute; i++) assert.equal((await post({ body: `第 ${i} 条` })).status, 201);
    assert.equal((await post({ body: '太快了' })).status, 429);
    tick(61_000);
    assert.equal((await post({ body: '过了一分钟' })).status, 201);
  });

  test(`[${name}] 管理列表可以按状态和文章筛选`, async () => {
    const { post, admin } = await setup({ autoApprove: 'all' });
    await post({ body: 'a' });
    await post({ body: 'b', entry: 'posts/x' }, { 'cf-connecting-ip': '2.2.2.2' });
    const n = async (q: string) => ((await (await admin('GET', `/comments${q}`)).json()) as any).comments.length;
    assert.equal(await n(''), 2);
    assert.equal(await n(`?entry=${ENTRY}`), 1);
    assert.equal(await n('?entry=posts/x&status=approved'), 1);
    assert.equal(await n('?status=pending'), 0);
  });

  test(`[${name}] 蜜罐字段有内容：假装成功但不存`, async () => {
    const { post, admin } = await setup();
    const r = await post({ website: 'http://spam' });
    assert.equal(r.status, 201);
    assert.equal(((await (await admin('GET', '/stats')).json()) as any).pending, 0);
  });

  test(`[${name}] Turnstile：没带令牌或验证失败会被拒绝`, async () => {
    let ok = false;
    const fetchImpl = (async () => new Response(JSON.stringify({ success: ok }))) as typeof fetch;
    const { post } = await setup({ turnstileSecret: 's', fetchImpl, autoApprove: 'all' });
    assert.equal((await post({})).status, 403);
    assert.equal((await post({ turnstile: 'tok' })).status, 403);
    ok = true;
    assert.equal((await post({ turnstile: 'tok' })).status, 201);
  });

  test(`[${name}] 输入检查：空评论、没名字、坏邮箱、坏 entry`, async () => {
    const { post } = await setup();
    assert.equal((await post({ body: '   ' })).status, 400);
    assert.equal((await post({ name: '' })).status, 400);
    assert.equal((await post({ email: 'not-an-email' })).status, 400);
    assert.equal((await post({ entry: '../etc/passwd' })).status, 400);
  });

  test(`[${name}] 管理接口：没令牌 401、令牌不对 401、没设置令牌 503`, async () => {
    const { call } = await setup();
    assert.equal((await call('GET', '/admin/stats')).status, 401);
    assert.equal((await call('GET', '/admin/stats', undefined, { Authorization: 'Bearer wrong' })).status, 401);
    const off = await setup({ adminToken: undefined });
    assert.equal((await off.call('GET', '/admin/stats')).status, 503);
  });

  test(`[${name}] CORS：只允许配置的来源`, async () => {
    const { call } = await setup({ allowOrigin: 'https://mysite.com' });
    const good = await call('GET', `/comments?entry=${ENTRY}`, undefined, { Origin: 'https://mysite.com' });
    assert.equal(good.headers.get('access-control-allow-origin'), 'https://mysite.com');
    const bad = await call('GET', `/comments?entry=${ENTRY}`, undefined, { Origin: 'https://evil.com' });
    assert.notEqual(bad.headers.get('access-control-allow-origin'), 'https://evil.com');
  });

}
