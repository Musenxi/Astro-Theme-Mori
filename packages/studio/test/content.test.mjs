import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wordCount, setCategories, renameTag, renameCategoryInEntries, listEntries } from '../src/project.mjs';

test('字数：中文按字、西文按词，代码块不计', () => {
  const doc = {
    blocks: [
      { id: 'b1', type: 'p', text: '今天天气不错。' },
      { id: 'b2', type: 'p', text: [{ t: 'Hello ' }, { t: 'world', marks: [{ type: 'em' }] }, { t: '，你好' }] },
      { id: 'b3', type: 'code', code: 'const a = 1; // 不该计入' },
      { id: 'b4', type: 'list', items: ['一', [{ t: '二三' }]] },
    ],
    notes: { n1: { text: '旁注' } },
  };
  assert.equal(wordCount(doc), 6 + 2 + 2 + 1 + 2 + 2);
});

const cfg = () => {
  const f = join(mkdtempSync(join(tmpdir(), 'mori-')), 'mori.config.ts');
  writeFileSync(f, `export default defineMoriConfig({\n  title: 'a',\n  categories: [\n    { id: 'essays', zh: '随笔', en: 'Essays' }, // [注释里的括号]\n    { id: 'tech', zh: '技术', en: 'Tech', empty: "没有" },\n  ],\n  home: { style: 'quote' },\n});\n`);
  return f;
};

test('分类：整个数组重写，数组外不动；校验 id 与中文名', () => {
  const f = cfg();
  setCategories(f, [{ id: 'tech', zh: '技术', en: 'Tech' }, { id: 'life', zh: "生活's", en: 'Life', empty: '没写' }]);
  const s = readFileSync(f, 'utf8');
  assert.match(s, /categories: \[\n    \{ id: 'tech', zh: '技术', en: 'Tech' \},\n    \{ id: 'life', zh: '生活\\'s', en: 'Life', empty: '没写' \},\n  \],\n  home:/);
  assert.match(s, /title: 'a'/);
  assert.throws(() => setCategories(f, []), /至少/);
  assert.throws(() => setCategories(f, [{ id: 'a b', zh: 'x' }]), /只能用/);
  assert.throws(() => setCategories(f, [{ id: 'a', zh: 'x' }, { id: 'a', zh: 'y' }]), /重复/);
  assert.throws(() => setCategories(f, [{ id: 'a', zh: '' }]), /中文名/);
});

const project = () => {
  const root = mkdtempSync(join(tmpdir(), 'mori-'));
  mkdirSync(join(root, 'src/content/posts'), { recursive: true });
  const put = (id, d) => writeFileSync(join(root, `src/content/posts/${id}.json`), JSON.stringify({ title: id, date: '2025-01-01', category: 'essays', excerpt: '', blocks: [], ...d }));
  put('a', { tags: ['旅行', '摄影'] });
  put('b', { tags: ['旅行'] });
  put('c', {});
  return root;
};

test('标签：改名、合并（去重）、删除', () => {
  const root = project();
  assert.equal(renameTag(root, '旅行', '游记'), 2);
  assert.deepEqual(listEntries(root).find((e) => e.id === 'a').tags, ['游记', '摄影']);
  assert.equal(renameTag(root, '摄影', '游记'), 1); // 合并到已有的
  assert.deepEqual(listEntries(root).find((e) => e.id === 'a').tags, ['游记']);
  assert.equal(renameTag(root, '游记', null), 2);   // 删除
  assert.deepEqual(listEntries(root).find((e) => e.id === 'b').tags, []);
});

test('分类 id 改名时文章一起改', () => {
  const root = project();
  assert.equal(renameCategoryInEntries(root, 'essays', 'notes'), 3);
  assert.ok(listEntries(root).every((e) => e.category === 'notes'));
});

import { setPublish, checkPublish } from '../src/project.mjs';

test('发布设置：新增、替换、清除，配置里其余内容不动', () => {
  const f = cfg();
  setPublish(f, { target: 'rsync', dest: 'me@host:/var/www/site/' });
  let s = readFileSync(f, 'utf8');
  assert.match(s, /defineMoriConfig\(\{\n  publish: \{ target: 'rsync', dest: 'me@host:\/var\/www\/site\/' \},\n  title: 'a'/);
  setPublish(f, { target: 'cloudflare-pages', project: 'my-site', branch: 'main' });
  s = readFileSync(f, 'utf8');
  assert.equal(s.match(/publish:/g).length, 1);
  assert.match(s, /publish: \{ target: 'cloudflare-pages', project: 'my-site', branch: 'main' \},\n  title/);
  setPublish(f, null);
  s = readFileSync(f, 'utf8');
  assert.doesNotMatch(s, /publish/);
  assert.match(s, /categories: \[/);
  assert.match(s, /home: \{ style: 'quote' \},\n\}\);/);
});

test('发布设置：不合法的输入被拒绝', () => {
  assert.throws(() => checkPublish({ target: 'rsync', dest: '-e evil' }), /不能/);
  assert.throws(() => checkPublish({ target: 'rsync', dest: '' }), /服务器路径/);
  assert.throws(() => checkPublish({ target: 'cloudflare-pages', project: 'a b' }), /项目名/);
  assert.throws(() => checkPublish({ target: 'ftp' }), /发布方式/);
  assert.deepEqual(checkPublish({ target: 'cloudflare-pages', project: 'x', branch: ' ' }), { target: 'cloudflare-pages', project: 'x' });
});
