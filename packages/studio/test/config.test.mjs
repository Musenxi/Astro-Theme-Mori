import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setConfigValue } from '../src/project.mjs';

const make = () => {
  const f = join(mkdtempSync(join(tmpdir(), 'mori-')), 'mori.config.ts');
  writeFileSync(f, `import { defineMoriConfig } from 'astro-mori';\n\nexport default defineMoriConfig({\n  title: 'MORI', // 刊名\n  accent: '#002fa7',\n  home: {\n    editorNote: '这一期"没有"主题。',\n  },\n});\n`);
  return f;
};

test('替换已有的值，保留行尾注释和其余排版', () => {
  const f = make();
  setConfigValue(f, 'accent', '#b0442b');
  setConfigValue(f, 'title', "It's 刊名");
  const s = readFileSync(f, 'utf8');
  assert.match(s, /accent: '#b0442b',/);
  assert.match(s, /title: 'It\\'s 刊名', \/\/ 刊名/);
  assert.equal(s.match(/title:/g).length, 1);
});

test('没有的顶层 key 插到开头；null 删除', () => {
  const f = make();
  setConfigValue(f, 'accentDark', '#ff8866');
  assert.match(readFileSync(f, 'utf8'), /defineMoriConfig\(\{\n  accentDark: '#ff8866',\n/);
  setConfigValue(f, 'accentDark', null);
  assert.doesNotMatch(readFileSync(f, 'utf8'), /accentDark/);
});

test('嵌套的 editorNote 可改；不认识的 key 和缺失的 editorNote 报错', () => {
  const f = make();
  setConfigValue(f, 'editorNote', '新的 编者按');
  assert.match(readFileSync(f, 'utf8'), /editorNote: '新的 编者按',/);
  assert.throws(() => setConfigValue(f, 'categories', 'x'), /不支持/);
  const g = join(mkdtempSync(join(tmpdir(), 'mori-')), 'c.ts');
  writeFileSync(g, `export default defineMoriConfig({\n  title: 'a',\n});\n`);
  assert.throws(() => setConfigValue(g, 'editorNote', 'x'), /editorNote/);
});

test('home / archive 块里的取值：只改各自块里的，同名 key 互不影响；缺了就加；整块缺了就建', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'mori-')), 'c.ts');
  const src = `export default defineMoriConfig({\n  title: 'a',\n  home: {\n    direction: 'h',\n    editorNote: 'x',\n  },\n  archive: { direction: 'h' },\n});\n`;
  writeFileSync(f, src);
  setConfigValue(f, 'home.direction', 'v');
  let s = readFileSync(f, 'utf8');
  assert.match(s, /home: \{\n    direction: 'v',/);
  assert.match(s, /archive: \{ direction: 'h' \}/); // archive 里的没动
  setConfigValue(f, 'home.style', 'cover');       // 多行块里没有：加在开头
  assert.match(readFileSync(f, 'utf8'), /home: \{\n    style: 'cover',\n    direction: 'v',/);
  setConfigValue(f, 'home.style', 'quote');       // 已有：替换
  assert.equal(readFileSync(f, 'utf8').match(/style:/g).length, 1);
  setConfigValue(f, 'archive.direction', 'v');    // 单行块里改值
  assert.match(readFileSync(f, 'utf8'), /archive: \{ direction: 'v' \}/);
  setConfigValue(f, 'home.tocDirection', 'v');    // 目次排法：和 direction 各改各的
  setConfigValue(f, 'home.direction', 'h');
  assert.match(readFileSync(f, 'utf8'), /tocDirection: 'v',/);
  assert.match(readFileSync(f, 'utf8'), /\n    direction: 'h',/);
  assert.throws(() => setConfigValue(f, 'home.style', 'grid'), /只能是/);

  const g = join(mkdtempSync(join(tmpdir(), 'mori-')), 'c.ts');
  writeFileSync(g, `export default defineMoriConfig({\n  title: 'a',\n});\n`);
  setConfigValue(g, 'home.style', 'cover');       // 整个 home 块都没有
  assert.match(readFileSync(g, 'utf8'), /defineMoriConfig\(\{\n  home: \{ style: 'cover' \},\n  title/);
  const h = join(mkdtempSync(join(tmpdir(), 'mori-')), 'c.ts');
  writeFileSync(h, `export default defineMoriConfig({\n  home: { editorNote: 'x' },\n});\n`);
  setConfigValue(h, 'home.style', 'cover');       // 单行块里没有：加在 { 后面
  assert.match(readFileSync(h, 'utf8'), /home: \{ style: 'cover', editorNote: 'x' \}/);
});

test('home.count：数字不带引号，已有就替换，只接受 1–8 的整数', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'mori-')), 'c.ts');
  writeFileSync(f, `export default defineMoriConfig({\n  home: {\n    style: 'list',\n  },\n});\n`);
  setConfigValue(f, 'home.count', '5');
  assert.match(readFileSync(f, 'utf8'), /home: \{\n    count: 5,\n    style: 'list',/);
  setConfigValue(f, 'home.count', '2');
  assert.equal(readFileSync(f, 'utf8').match(/count/g).length, 1);
  assert.match(readFileSync(f, 'utf8'), /count: 2,/);
  assert.throws(() => setConfigValue(f, 'home.count', '9'), /1–8/);
  assert.throws(() => setConfigValue(f, 'home.count', 'x'), /1–8/);
  setConfigValue(f, 'home.style', 'quote');       // 改字符串不受数字行影响
  assert.match(readFileSync(f, 'utf8'), /style: 'quote'/);
});

test('feed.content：没有 feed 块时新建，有就只改取值；只接受 excerpt / full', () => {
  const f = make();
  setConfigValue(f, 'feed.content', 'full');
  let s = readFileSync(f, 'utf8');
  assert.match(s, /defineMoriConfig\(\{\n  feed: \{ content: 'full' \},\n/);
  setConfigValue(f, 'feed.content', 'excerpt');
  s = readFileSync(f, 'utf8');
  assert.equal(s.match(/feed:/g).length, 1);
  assert.match(s, /feed: \{ content: 'excerpt' \}/);
  assert.match(s, /home: \{\n    editorNote/);
  assert.throws(() => setConfigValue(f, 'feed.content', 'all'), /excerpt/);
});

test('comments.avatar：只改评论块里的头像服务；没有启用自建评论时不凭空新建一个 comments；只接受 cravatar / gravatar / none', () => {
  const f = make();
  assert.throws(() => setConfigValue(f, 'comments.avatar', 'gravatar'), /启用自建评论/);
  assert.doesNotMatch(readFileSync(f, 'utf8'), /comments/);
  const g = join(mkdtempSync(join(tmpdir(), 'mori-')), 'mori.config.ts');
  writeFileSync(g, `export default defineMoriConfig({\n  title: 'x',\n  comments: { provider: 'mori', endpoint: 'https://c.example.com' },\n});\n`);
  setConfigValue(g, 'comments.avatar', 'gravatar');
  assert.match(readFileSync(g, 'utf8'), /comments: \{ avatar: 'gravatar', provider: 'mori', endpoint: 'https:\/\/c\.example\.com' \},/);
  setConfigValue(g, 'comments.avatar', 'none');
  assert.equal(readFileSync(g, 'utf8').match(/avatar/g).length, 1);
  assert.throws(() => setConfigValue(g, 'comments.avatar', 'https://x.example/{hash}'), /只能是/);
});

test('comments.status：只接受 on / readonly / off，写进评论块里', () => {
  const g = join(mkdtempSync(join(tmpdir(), 'mori-')), 'mori.config.ts');
  writeFileSync(g, `export default defineMoriConfig({\n  comments: { provider: 'mori', endpoint: 'https://c.example.com' },\n});\n`);
  setConfigValue(g, 'comments.status', 'readonly');
  assert.match(readFileSync(g, 'utf8'), /comments: \{ status: 'readonly', provider: 'mori'/);
  setConfigValue(g, 'comments.status', 'off');
  assert.equal(readFileSync(g, 'utf8').match(/status/g).length, 1);
  assert.match(readFileSync(g, 'utf8'), /status: 'off'/);
  assert.throws(() => setConfigValue(g, 'comments.status', 'closed'), /只能是/);
});
