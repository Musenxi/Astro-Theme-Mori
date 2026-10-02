import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startStudio } from '../src/server.mjs';

/** 端到端：真的起一个 Studio 服务，对着一个临时项目走一遍主要接口 */
let s, base, root;
const call = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'mori-api-'));
  writeFileSync(join(root, 'mori.config.ts'), `export default {\n  title: 'T',\n  categories: [{ id: 'a', zh: 'A', en: 'A' }, { id: 'b', zh: 'B', en: 'B' }],\n};\n`);
  for (const d of ['src/content/posts', 'src/content/pages', 'src/assets']) mkdirSync(join(root, d), { recursive: true });
  s = await startStudio({ root, port: 0 });
  base = `http://127.0.0.1:${s.server.address().port}`;
});
after(() => s.stop());

test('新建文章：出现在项目信息里；重复地址名 409', async () => {
  assert.equal((await call('POST', '/api/entry/post', { id: 'hello', title: '你好', category: 'a' })).status, 200);
  const d = JSON.parse(readFileSync(join(root, 'src/content/posts/hello.json'), 'utf8'));
  assert.equal(d.kind, undefined);
  assert.equal(d.title, '你好');
  assert.equal((await call('POST', '/api/entry/post', { id: 'hello', title: 'x' })).status, 409);
  const p = (await call('GET', '/api/project')).body;
  assert.deepEqual(p.entries.map((e) => [e.id, e.kind]), [['hello', 'post']]);
  assert.equal(p.dev, false);
});

test('游记并进文章：旧的 travel 接口新建出来的也是普通结构，和文章同在 posts 目录', async () => {
  assert.equal((await call('POST', '/api/entry/travel', { id: 'trip', title: '一次旅行', category: 'b' })).status, 200);
  const d = JSON.parse(readFileSync(join(root, 'src/content/posts/trip.json'), 'utf8'));
  assert.equal(d.stops, undefined);
  assert.equal(d.blocks[0].type, 'p');
  const p = (await call('GET', '/api/project')).body;
  assert.equal(p.entries.find((e) => e.id === 'trip').kind, 'post');
});

test('保存：校验不过也写盘，并返回问题；改好后问题消失', async () => {
  const doc = (await call('GET', '/api/entry/post/hello')).body;
  const bad = await call('PUT', '/api/entry/post/hello', { ...doc, blocks: [{ id: 'b01', type: 'p' }] });
  assert.equal(bad.status, 200);
  assert.equal(bad.body.saved, true);
  assert.ok(bad.body.errors.length > 0);
  const ok = await call('PUT', '/api/entry/post/hello', { ...doc, excerpt: '摘要', tags: ['甲'], blocks: [{ id: 'b01', type: 'p', text: '正文' }] });
  assert.deepEqual(ok.body.errors, []);
  assert.deepEqual((await call('GET', '/api/project')).body.entries.find((e) => e.id === 'hello').tags, ['甲']);
});

test('页面：新建、保留名被拒、出现在项目信息里', async () => {
  assert.equal((await call('POST', '/api/entry/page', { id: 'about', title: '关于' })).status, 200);
  assert.equal((await call('POST', '/api/entry/page', { id: 'posts', title: 'x' })).status, 400);
  const p = (await call('GET', '/api/project')).body;
  assert.deepEqual(p.pages.map((x) => x.id), ['about']);
  assert.equal((await call('PUT', '/api/entry/page/about', { title: '关于', template: 'weird' })).body.errors.length > 0, true);
});

test('友人帐：保存整理后读回；坏网址 400', async () => {
  const r = await call('PUT', '/api/friends', { friends: [{ name: 'A', url: 'https://a.io' }, { name: 'B', url: 'http://b.org/x' }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.friends.map((f) => [f.id, f.order]), [['a', 0], ['b', 1]]);
  assert.equal((await call('GET', '/api/friends')).body.friends.length, 2);
  assert.equal((await call('PUT', '/api/friends', { friends: [{ name: 'X', url: 'nope' }] })).status, 400);
  assert.equal((await call('POST', '/api/friends/probe', { url: 'http://127.0.0.1:1/' })).status, 400); // 内网地址被拒
});

test('页头入口：写进配置、null 恢复默认', async () => {
  assert.equal((await call('PUT', '/api/nav', { nav: [{ label: '文章', href: '/posts/' }, { label: '关于', href: '/about/' }] })).status, 200);
  assert.match(readFileSync(join(root, 'mori.config.ts'), 'utf8'), /nav: \[/);
  assert.deepEqual((await call('GET', '/api/project')).body.config.nav.map((n) => n.href), ['/posts/', '/about/']);
  assert.equal((await call('PUT', '/api/nav', { nav: [{ label: '', href: '/x/' }] })).status, 400);
  await call('PUT', '/api/nav', { nav: null });
  assert.equal((await call('GET', '/api/project')).body.config.nav, null);
});

test('分类与标签：改地址名同步文章；标签合并', async () => {
  await call('PUT', '/api/categories', { categories: [{ id: 'a2', zh: 'A', en: 'A' }, { id: 'b', zh: 'B', en: 'B' }], renames: { a: 'a2' } });
  assert.equal(JSON.parse(readFileSync(join(root, 'src/content/posts/hello.json'), 'utf8')).category, 'a2');
  const r = await call('POST', '/api/tags/rename', { from: '甲', to: '乙' });
  assert.equal(r.body.changed, 1);
});

test('统计与文件', async () => {
  const st = (await call('GET', '/api/stats')).body;
  assert.equal(st.pages, 1);
  assert.equal(st.categories, 2);
  assert.equal(st.comments, null);
  assert.deepEqual((await call('GET', '/api/assets')).body.assets, []);
});

test('删除文章：移进回收站', async () => {
  assert.equal((await call('DELETE', '/api/entry/post/trip')).status, 200);
  assert.ok(!existsSync(join(root, 'src/content/posts/trip.json')));
  assert.ok(readdirSync(join(root, '.mori-trash')).some((f) => f.endsWith('post-trip.json')));
  assert.equal((await call('GET', '/api/entry/post/trip')).status, 404);
});

test('界面：没构建时给出提示；路径穿越被拒', async () => {
  const r = await fetch(`${base}/..%2f..%2fpackage.json`);
  assert.ok([403, 404].includes(r.status));
  const idx = await fetch(`${base}/posts/hello`);
  assert.ok([200, 503].includes(idx.status));
});

import { request } from 'node:http';
import { requestAllowed } from '../src/server.mjs';

test('来源校验：别的网站的写请求、被重绑定的域名都被拒；本机页面照常', async () => {
  const req = (headers, method = 'PUT') => ({ method, headers });
  assert.equal(requestAllowed(req({ host: '127.0.0.1:4400', origin: 'http://127.0.0.1:4400' })), true);
  assert.equal(requestAllowed(req({ host: 'localhost:5173', origin: 'http://localhost:5173' })), true); // Vite 开发界面
  assert.equal(requestAllowed(req({ host: '127.0.0.1:4400' })), true);                                  // 没有 Origin（命令行、同源 GET）
  assert.equal(requestAllowed(req({ host: '127.0.0.1:4400', origin: 'https://evil.example' })), false);
  assert.equal(requestAllowed(req({ host: 'evil.example:4400' })), false);                              // 域名被解析到 127.0.0.1
  assert.equal(requestAllowed(req({ host: '127.0.0.1:4400', origin: 'null' })), false);
  assert.equal(requestAllowed(req({ host: '127.0.0.1:4400', origin: 'null' }, 'GET')), true);
  // 真的走一遍 HTTP
  const status = (headers) => new Promise((ok) => { const r = request({ host: '127.0.0.1', port: s.server.address().port, path: '/api/stats', method: 'GET', headers }, (res) => { res.resume(); ok(res.statusCode); }); r.end(); });
  assert.equal(await status({ Host: 'evil.example' }), 403);
  assert.equal(await status({ Origin: 'https://evil.example', Host: '127.0.0.1' }), 403);
  assert.equal(await status({}), 200);
});
