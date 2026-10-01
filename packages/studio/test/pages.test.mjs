import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkFriends, writeFriends, readFriends, setNav, setActions, listPages } from '../src/project.mjs';
import { parseSiteHtml, isPrivateAddress } from '../src/probe.mjs';

test('友人帐：整理并校验（补 id、去重、网址规范化、order 按先后）', () => {
  const list = checkFriends([
    { name: '某某的花园', url: 'https://example.com', desc: ' 种花 ' },
    { name: '某某的花园', url: 'http://example.org/a', avatar: 'https://example.org/i.png' },
    { id: 'x', name: 'X', url: 'https://x.dev' },
  ]);
  assert.deepEqual(list.map((f) => f.id), ['某某的花园', '某某的花园-2', 'x']);
  assert.equal(list[0].url, 'https://example.com/');
  assert.equal(list[0].desc, '种花');
  assert.deepEqual(list.map((f) => f.order), [0, 1, 2]);
  assert.equal(list[1].avatar, 'https://example.org/i.png');
  assert.ok(!('avatar' in list[0]));
  assert.throws(() => checkFriends([{ name: '', url: 'https://a.b' }]), /名字/);
  assert.throws(() => checkFriends([{ name: 'A', url: 'not a url' }]), /网址不对/);
  assert.throws(() => checkFriends([{ name: 'A', url: 'javascript:alert(1)' }]), /http/);
});

test('友人帐：写盘再读回', () => {
  const root = mkdtempSync(join(tmpdir(), 'mori-'));
  assert.deepEqual(readFriends(root), []);
  writeFriends(root, [{ name: 'A', url: 'https://a.io' }]);
  assert.equal(readFriends(root)[0].name, 'A');
});

const cfg = () => {
  const f = join(mkdtempSync(join(tmpdir(), 'mori-')), 'mori.config.ts');
  writeFileSync(f, `export default defineMoriConfig({\n  title: 'a',\n  categories: [],\n});\n`);
  return f;
};

test('页头入口：新增、替换、恢复默认；校验', () => {
  const f = cfg();
  setNav(f, [{ label: '文章', href: '/posts/' }, { label: '关于', href: '/about/' }]);
  let s = readFileSync(f, 'utf8');
  assert.match(s, /nav: \[\n    \{ label: '文章', href: '\/posts\/' \},\n    \{ label: '关于', href: '\/about\/' \},\n  \],\n  title/);
  setNav(f, [{ label: '友人帐', href: '/friends/' }]);
  s = readFileSync(f, 'utf8');
  assert.equal(s.match(/nav:/g).length, 1);
  assert.match(s, /友人帐/);
  setNav(f, null);
  s = readFileSync(f, 'utf8');
  assert.doesNotMatch(s, /nav:/);
  assert.match(s, /categories: \[\],/);
  assert.throws(() => setNav(f, [{ label: '', href: '/x/' }]), /名字/);
  assert.throws(() => setNav(f, [{ label: 'x', href: 'javascript:1' }]), /地址/);
});

test('页头入口：图标和昼夜切换', () => {
  const f = cfg();
  setNav(f, [{ label: '文章', href: '/posts/', icon: 'book-open' }, { label: '归档', href: '/archive/' }]);
  let s = readFileSync(f, 'utf8');
  assert.match(s, /\{ label: '文章', href: '\/posts\/', icon: 'book-open' \},\n    \{ label: '归档', href: '\/archive\/' \},/);
  assert.throws(() => setNav(f, [{ label: 'x', href: '/x/', icon: "a'b" }]), /图标/);
});

test('页头右侧的操作', () => {
  const f = cfg();
  setActions(f, [{ type: 'link', label: '搜索', href: '/search/', icon: 'search' }, { type: 'theme', style: 'icon' }]);
  let s = readFileSync(f, 'utf8');
  assert.match(s, /actions: \[\n    \{ type: 'link', label: '搜索', href: '\/search\/', icon: 'search' \},\n    \{ type: 'theme', style: 'icon' \},\n  \],\n  title/);
  setActions(f, [{ type: 'theme' }]);
  s = readFileSync(f, 'utf8');
  assert.equal(s.match(/actions:/g).length, 1);
  assert.match(s, /\{ type: 'theme' \},/);
  setActions(f, []);
  assert.match(readFileSync(f, 'utf8'), /actions: \[\],/);
  setActions(f, null);
  assert.doesNotMatch(readFileSync(f, 'utf8'), /actions/);
  assert.throws(() => setActions(f, [{ type: 'theme' }, { type: 'theme' }]), /只能有一个/);
  assert.throws(() => setActions(f, [{ type: 'x' }]), /类型/);
  assert.throws(() => setActions(f, [{ type: 'link', label: '', href: '/' }]), /名字/);
});

test('页面列表', () => {
  const root = mkdtempSync(join(tmpdir(), 'mori-'));
  mkdirSync(join(root, 'src/content/pages'), { recursive: true });
  writeFileSync(join(root, 'src/content/pages/about.json'), JSON.stringify({ title: '关于', blocks: [{ id: 'b1', type: 'p', text: '一二三' }] }));
  writeFileSync(join(root, 'src/content/pages/bad.json'), '{');
  const list = listPages(root);
  assert.deepEqual(list.map((p) => [p.id, p.title, p.words, !!p.broken]), [['about', '关于', 3, false], ['bad', 'bad（JSON 有语法错误）', 0, true]]);
});

test('抓站点信息：站名、简介、图标（相对地址补全）', () => {
  const html = `<html><head><title> 慢车 &amp; 旅途 </title><meta name="description" content="记录坐过的&quot;每一趟&quot;慢车"><link rel="icon" href="/i/f.png"><link rel="apple-touch-icon" href="a.png"></head></html>`;
  assert.deepEqual(parseSiteHtml(html, 'https://slow.example/blog/'), { name: '慢车 & 旅途', desc: '记录坐过的"每一趟"慢车', avatar: 'https://slow.example/blog/a.png' });
  const og = `<meta property="og:site_name" content="OG 站名"><title>别的</title>`;
  assert.equal(parseSiteHtml(og, 'https://a.b/').name, 'OG 站名');
  assert.equal(parseSiteHtml('<p>x</p>', 'https://a.b/x').avatar, 'https://a.b/favicon.ico');
});

test('内网地址判断', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.16.5.5', '169.254.1.1', '::1', 'fd00::1']) assert.ok(isPrivateAddress(ip), ip);
  for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1']) assert.ok(!isPrivateAddress(ip), ip);
});

import { assetUsage, trashAsset } from '../src/project.mjs';
import { existsSync } from 'node:fs';

test('文件：谁在引用一张图片；删除是移进回收站', () => {
  const root = mkdtempSync(join(tmpdir(), 'mori-'));
  for (const d of ['src/assets', 'src/content/posts', 'src/content/pages']) mkdirSync(join(root, d), { recursive: true });
  for (const n of ['a.jpg', 'b.jpg', 'c.png']) writeFileSync(join(root, 'src/assets', n), 'x');
  writeFileSync(join(root, 'src/content/posts/p1.json'), JSON.stringify({ title: 'P1', cover: '../../assets/a.jpg', blocks: [] }));
  writeFileSync(join(root, 'src/content/posts/t1.json'), JSON.stringify({ title: 'T1', stops: [], blocks: [{ src: '../../assets/a.jpg' }] }));
  writeFileSync(join(root, 'src/content/pages/about.json'), JSON.stringify({ title: '关于', blocks: [{ src: '../../assets/b.jpg' }] }));
  writeFileSync(join(root, 'src/content/friends.json'), JSON.stringify([{ id: 'x', name: 'X', url: 'https://x.io', avatar: '../assets/c.png' }]));
  const u = Object.fromEntries(assetUsage(root).map((a) => [a.name, a.usedBy.map((r) => `${r.kind}:${r.id}`)]));
  assert.deepEqual(u['a.jpg'].sort(), ['post:p1', 'travel:t1']);
  assert.deepEqual(u['b.jpg'], ['page:about']);
  assert.deepEqual(u['c.png'], ['friends:friends']);
  trashAsset(root, 'c.png');
  assert.ok(!existsSync(join(root, 'src/assets/c.png')));
  assert.throws(() => trashAsset(root, '../evil.jpg'), /不合法/);
  assert.throws(() => trashAsset(root, 'nope.jpg'), /没有这张/);
});
