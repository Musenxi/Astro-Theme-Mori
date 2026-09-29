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
