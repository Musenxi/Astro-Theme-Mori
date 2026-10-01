import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, cleanUrl } from '../src/app.ts';
import { md5 } from '../src/md5.ts';
import { sqliteStore } from '../src/sqlite.ts';

test('md5：标准测试向量（含多块、含中文）', () => {
  assert.equal(md5(''), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(md5('abc'), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(md5('The quick brown fox jumps over the lazy dog'), '9e107d9d372bb6826bd81d3542a419d6');
  assert.equal(md5('12345678901234567890123456789012345678901234567890123456789012345678901234567890'), '57edf4a22be3c955ac49da2e2107b67a');
});

test('网址：可以不写；只写域名会补 https；只收 http / https', () => {
  assert.equal(cleanUrl(undefined), '');
  assert.equal(cleanUrl('   '), '');
  assert.equal(cleanUrl('example.com'), 'https://example.com/');
  assert.equal(cleanUrl(' http://a.example.com/x?y=1 '), 'http://a.example.com/x?y=1');
  for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com', 'https://', 'not a url', 'localhost']) assert.equal(cleanUrl(bad), null, bad);
});

async function setup() {
  const store = sqliteStore(':memory:');
  await store.init();
  const app = createApp({ store, adminToken: 't', salt: 's', autoApprove: 'all', now: () => 1_000_000 });
  const post = (body: Record<string, unknown>, ip = '1.1.1.1') => app.request('/comments', { method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify({ entry: 'posts/a', body: '好', ...body }) });
  return { app, post };
}

test('留了邮箱：对外的头像哈希是小写邮箱的 MD5（Gravatar 认的），邮箱本身不出现', async () => {
  const { app, post } = await setup();
  const r = await post({ name: '读者', email: ' Reader@Example.COM ', url: 'https://blog.example.com' });
  assert.equal(r.status, 201);
  const c = ((await r.json()) as any).comment;
  assert.equal(c.avatar, md5('reader@example.com'));
  assert.equal(c.url, 'https://blog.example.com/');
  const text = JSON.stringify(await (await app.request('/comments?entry=posts/a')).json());
  assert.ok(!/reader@example/i.test(text));
});

test('昵称、邮箱必填：缺了会被拒绝，并说明缺什么；网址可以不写（存成 null）', async () => {
  const { post } = await setup();
  const noEmail = await post({ name: '小明', email: undefined }, '2.2.2.2');
  assert.equal(noEmail.status, 400);
  assert.match(((await noEmail.json()) as any).error, /邮箱/);
  const bad = await post({ name: '小明', email: 'not-an-email' }, '2.2.2.3');
  assert.equal(bad.status, 400);
  const noName = await post({ name: '', email: 'a@b.cc' }, '2.2.2.4');
  assert.equal(noName.status, 400);
  assert.match(((await noName.json()) as any).error, /名字/);
  const ok = ((await (await post({ name: '小明', email: 'a@b.cc' }, '2.2.2.5')).json()) as any).comment;
  assert.equal(ok.url, null);
});

test('网址不合法：拒绝，并说明原因', async () => {
  const { post } = await setup();
  const r = await post({ name: '读者', email: 'a@b.cc', url: 'javascript:alert(1)' });
  assert.equal(r.status, 400);
  assert.match(((await r.json()) as any).error, /网址/);
});

test('老数据库（没有头像、网址两列）启动时自动补上，旧评论照常读出', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mori-'));
  const path = join(dir, 'old.db');
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE comments (id INTEGER PRIMARY KEY AUTOINCREMENT, entry TEXT NOT NULL, block TEXT, start INTEGER, "end" INTEGER, quote TEXT, prefix TEXT, suffix TEXT, body TEXT NOT NULL, name TEXT NOT NULL, email_hash TEXT, ip_hash TEXT, created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', parent_id INTEGER);
    INSERT INTO comments (entry, body, name, created_at, status) VALUES ('posts/a', '旧评论', '老朋友', 1, 'approved');`);
  old.close();
  const store = sqliteStore(path);
  await store.init();
  await store.init(); // 重复启动不出错
  const rows = await store.listApproved('posts/a');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].avatarHash, null);
  assert.equal(rows[0].url, null);
});
