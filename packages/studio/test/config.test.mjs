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
