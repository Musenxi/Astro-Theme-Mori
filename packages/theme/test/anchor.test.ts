import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locate, contextOf } from '../src/lib/anchor-text.ts';

const text = '正文和标题都用上图东观体。它的字形来自宋刻本，横细竖粗。同一套字从标题用到正文。';
const pick = (q: string) => { const start = text.indexOf(q), end = start + q.length; return { start, end, quote: q, ...contextOf(text, start, end, 6) }; };

test('文章没改：按原位置直接找到', () => {
  const a = pick('上图东观体');
  assert.deepEqual(locate(text, a), { start: a.start, end: a.end });
});

test('前面加了字，位置偏了：按原文找回', () => {
  const a = pick('横细竖粗');
  const edited = '【新增的一句话。】' + text;
  const r = locate(edited, a)!;
  assert.equal(edited.slice(r.start, r.end), '横细竖粗');
});

test('原文出现多次：靠前后文选对那一处', () => {
  const t = '标题用东观体。正文也用东观体。页脚还是东观体。';
  const start = t.indexOf('东观体', 8), end = start + 3; // 第二处
  const a = { start, end, quote: '东观体', ...contextOf(t, start, end, 4) };
  const edited = '开头多了一段。' + t;
  const r = locate(edited, a)!;
  assert.equal(edited.slice(r.start - 4, r.start), '正文也用');
});

test('原文被改掉了：找不到，返回 null', () => {
  const a = pick('横细竖粗');
  assert.equal(locate(text.replace('横细竖粗', '笔画有粗有细'), a), null);
  assert.equal(locate(text, { ...a, quote: '' }), null);
});

test('上下文取选区前后各几个字，越界不报错', () => {
  assert.deepEqual(contextOf('abcdef', 0, 2, 3), { prefix: '', suffix: 'cde' });
  assert.deepEqual(contextOf('abcdef', 4, 6, 3), { prefix: 'bcd', suffix: '' });
});
