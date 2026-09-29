import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMarkdown, fromMarkdown, similarity } from '../ui/mdsync.js';

const doc = () => ({
  title: '标题', date: '2025-01-01', category: 'essays', excerpt: 'x',
  notes: { n1: { text: [{ t: '旁注正文' }] } },
  blocks: [
    { id: 'b01', type: 'p', text: [{ t: '今年是 ' }, { t: '2025', marks: [{ type: 'tcy' }] }, { t: ' 年。' }] },
    { id: 'b02', type: 'h', level: 2, text: [{ t: '小节' }] },
    { id: 'b03', type: 'p', text: [{ t: '这里有一个' }, { t: '旁注', marks: [{ type: 'note', ref: 'n1' }] }, { t: '。' }] },
    { id: 'b04', type: 'quote', writing: 'v', text: [{ t: '一句引文' }], cite: '某人' },
    { id: 'b05', type: 'image', src: '../../assets/a.jpg', alt: '图', layout: 'inline' },
  ],
});

test('不动就不变：id、tcy、旁注类型、引文竖排、图片布局都原样保留', () => {
  const d = doc();
  const back = fromMarkdown(toMarkdown(d), d);
  assert.deepEqual(back.blocks, d.blocks);
  assert.deepEqual(back.notes, d.notes);
  assert.equal(back.title, '标题');
});

test('图片路径在文本里只有文件名', () => assert.match(toMarkdown(doc()), /!\[图\]\(a\.jpg\)/));

test('改几个字的段落沿用 id；新插入的段落取新 id；删掉的块消失', () => {
  const d = doc();
  let t = toMarkdown(d).replace('这里有一个', '这里有另一个');
  t = t.replace('## 小节\n', '## 小节\n\n刚写的新段落，和别的都不像。\n');
  const back = fromMarkdown(t, d);
  const byText = (s) => back.blocks.find((b) => JSON.stringify(b).includes(s));
  assert.equal(byText('另一个').id, 'b03');
  assert.equal(byText('刚写的').id, 'b06');
  assert.equal(new Set(back.blocks.map((b) => b.id)).size, back.blocks.length);
  const gone = fromMarkdown(t.replace(/> 一句引文\n> —— 某人\n\n/, ''), d);
  assert.ok(!gone.blocks.some((b) => b.id === 'b04'));
});

test('改成完全不同的一段：不沿用旧 id', () => {
  const d = doc();
  const back = fromMarkdown(toMarkdown(d).replace(/今年是 2025 年。/, '完全没有关系的另一件事情'), d);
  assert.ok(!back.blocks.some((b) => b.id === 'b01'));
});

test('改标题行改的是 title；删掉标题行则保留原标题', () => {
  const d = doc();
  assert.equal(fromMarkdown(toMarkdown(d).replace('# 标题', '# 新标题'), d).title, '新标题');
  assert.equal(fromMarkdown(toMarkdown(d).replace('# 标题\n\n', ''), d).title, '标题');
});

test('相似度', () => {
  assert.equal(similarity('abc', 'abc'), 1);
  assert.ok(similarity('今天天气不错', '今天天气很好') > 0.4);
  assert.ok(similarity('今天天气不错', '完全无关的话') < 0.2);
});

test('手写 JSON 里的裸字符串文字也能转，且不动就不变', () => {
  const d = { title: 'T', blocks: [{ id: 'b01', type: 'p', text: '一段裸字符串。' }, { id: 'b02', type: 'list', items: ['甲', '乙'] }], notes: { n1: { text: '注' } } };
  const md = toMarkdown(d);
  assert.match(md, /一段裸字符串。/);
  assert.deepEqual(fromMarkdown(md, d).blocks, d.blocks);
});

test('旁注：没改的原样保留（裸字符串不变成数组），改过的才更新', () => {
  const d = { title: 'T', blocks: [{ id: 'b01', type: 'p', text: [{ t: '甲', marks: [{ type: 'note', ref: 'n1' }] }] }], notes: { n1: { text: '裸字符串旁注' }, n2: { text: [{ t: '数组旁注' }] } } };
  const md = toMarkdown(d);
  assert.deepEqual(fromMarkdown(md, d).notes, d.notes);
  const edited = fromMarkdown(md.replace('裸字符串旁注', '改过的旁注'), d);
  assert.deepEqual(edited.notes.n2, d.notes.n2);
  assert.match(JSON.stringify(edited.notes.n1), /改过的旁注/);
});
